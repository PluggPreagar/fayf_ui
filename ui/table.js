// ui/table.js -- table controller, L9 (C11). Pure: no DOM, no fetch, no timers.
// Composed with ui/machine.js as "the same driver on a sub-status": the
// consumer keeps this table's status under status.data[spec.name], spreads
// tableHandlers(spec) into its handlers, lists `<name>.click` + `<name>.scroll`
// as self-transitions in its machine JSON, and merges tableView(spec, t) into
// its view result. The scroll container (`stack, scroll, fixed, h:...`) is the
// consumer's screen JSON, named spec.name; the table only fills it.
//
// spec   = { name, columns: [{ key, label, w? }], rowKey = 'id',
//            filterable?, exportable?, exportName?, paging?: 'pages', pageSize? }
//          w = px column width; a column without w is `fill` (usually the last).
//          The last four are opt-in (default: no filter box, no export
//          buttons, virtual-scroll windowing) -- ground-truth parity for a
//          results table that used to have all three (fayf_processor's old
//          DataTable widget: filterable/export/paging props) and lost them
//          in the migration to this engine. A consumer that doesn't set them
//          gets byte-identical behaviour to before this was added.
// t      = status.data[spec.name] = { rows, sort, sel, window, filter?, page? }
//          sort   = null | { key, dir: 'asc' | 'desc' }
//          sel    = null | row[rowKey] of the selected row
//          window = { scrollTop, clientHeight } of the scroll container (px)
//          filter = current filter text (only present when spec.filterable)
//          page   = current 1-based page (only present when spec.paging === 'pages')
// in     : `<name>.click` (header cell -> sort cycle; body row -> select)
//          `<name>.scroll` (payload scrollTop + clientHeight -> t.window)
//          `<name>-filter.input` (spec.filterable only -> t.filter, resets paging to page 1)
//          `<name>-tools.click` (spec.exportable only -> CSV/JSON export)
//          `<name>-pager.click` (spec.paging === 'pages' only -> prev/next page)
// out    : emit `<name>.select` with the row object
//          emit `<name>.export` with { format, filename, mime, text } (spec.exportable
//          only) -- the actual browser download (Blob/createObjectURL/<a>.click(), no
//          different from any other DOM side effect) is the consumer's job via its own
//          onEmit, same boundary nav.go/theme.toggle already cross today; this
//          controller only ever builds the (pure, testable) text to download.
// view   : header row + top spacer + visible rows + bottom spacer (virtual scroll), or
//          header + exactly one page of rows (spec.paging === 'pages', no spacers --
//          <name>-pager carries the prev/next + range instead). Every body row is
//          `fixed, h:ROW_H`. A `<name>-tools` row (filter box + match count + export
//          buttons) patches ABOVE the table when filterable/exportable is set, and a
//          `<name>-pager` row (range + prev/next) BELOW it when paging is 'pages' --
//          both are separate named nodes the consumer's screen JSON must declare next
//          to `<name>` itself (siblings, not children -- so they never scroll away with
//          the table body); tableView only ever patches names that exist, so a consumer
//          that doesn't opt into a feature never needs to declare its node at all.

export const ROW_H = 28;   // px, outer height of one body row (box-sizing: border-box)

// Pure. Which rows to paint for a scroll position: the viewport plus
// `overscan` rows above and below. clientHeight 0 (not yet measured) ->
// one viewport row + overscan.
export function windowOf({ scrollTop = 0, clientHeight = 0 } = {}, total, rowH = ROW_H, overscan = 4) {
  const start = Math.max(0, Math.floor(scrollTop / rowH) - overscan);
  const viewport = Math.max(1, Math.ceil(clientHeight / rowH));
  const count = Math.max(0, Math.min(total - start, viewport + 2 * overscan));
  return { start, count };
}

// Pure. New array; input untouched. Stable. Numbers numeric, everything else
// localeCompare on String(). null/undefined last in either direction.
export function sortRows(rows, sort) {
  if (!sort) return [...rows];
  const { key, dir } = sort;
  if (dir !== 'asc' && dir !== 'desc') throw new Error(`table: sort dir '${dir}' not asc|desc`);
  const sign = dir === 'desc' ? -1 : 1;
  return rows.map((row, i) => ({ row, i }))
    .sort((a, b) => compare(a.row[key], b.row[key], sign) || a.i - b.i)
    .map(x => x.row);
}
function compare(a, b, sign) {
  const an = a == null, bn = b == null;
  if (an || bn) return an === bn ? 0 : an ? 1 : -1;
  const c = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
  return c * sign;
}

function checkSpec(spec) {
  if (!spec || typeof spec.name !== 'string' || !spec.name) throw new Error('table: spec.name missing');
  if (!Array.isArray(spec.columns) || !spec.columns.length) throw new Error('table: spec.columns missing');
  for (const c of spec.columns) if (typeof c.key !== 'string') throw new Error(`table '${spec.name}': column without key`);
  return spec;
}

// Pure. The sub-status the consumer stores under status.data[spec.name].
// `filter`/`page` are only present when the consumer's spec actually opts
// into that feature -- a spec that doesn't set filterable/paging gets the
// exact old shape (table_test.js's own `tableInit: shape` deepEqual pins this).
export function tableInit(spec, rows = []) {
  checkSpec(spec);
  const t = { rows, sort: null, sel: null, window: { scrollTop: 0, clientHeight: 0 } };
  if (spec.filterable) t.filter = '';
  if (spec.paging === 'pages') t.page = 1;
  return t;
}

// Pure. rows whose ANY column value contains `text` (case-insensitive
// substring) -- mirrors fayf_processor's old DataTable widget's own opt-in
// global filter (TODO-169: "a match in ANY column keeps the row").
export function filterRows(rows, columns, text) {
  const q = String(text || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(r => columns.some(c => String(r[c.key] ?? '').toLowerCase().includes(q)));
}

// Pure. RFC4180-ish: quote a cell iff it holds a comma/quote/newline/semicolon
// (semicolon too -- some locales' spreadsheet apps treat it as the list
// separator; same quoting rule the old DataTable widget used, ported
// verbatim for parity).
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Pure. columns + rows (already filtered/sorted by the caller) -> CSV text,
// header row first.
export function toCSV(columns, rows) {
  const header = columns.map(c => csvCell(c.label ?? c.key)).join(',');
  const body = rows.map(r => columns.map(c => csvCell(r[c.key])).join(','));
  return [header, ...body].join('\n');
}

// Pure. The filtered + sorted (not yet paged/windowed) row list -- the same
// set an export downloads and a pager counts against.
function visibleRows(spec, t) {
  const filtered = spec.filterable ? filterRows(t.rows, spec.columns, t.filter) : t.rows;
  return sortRows(filtered, t.sort);
}

// Pure. Handlers keyed by trigger, to spread into the consumer's handlers.
// They read/write status.data[spec.name] only and return new objects.
export function tableHandlers(spec) {
  const { name, columns } = checkSpec(spec);
  const rowKey = spec.rowKey ?? 'id';
  const colPrefix = `${name}-col-`, rowPrefix = `${name}-row-`;
  const pageSize = spec.pageSize ?? 25;
  const get = (s) => {
    const t = s.data && s.data[name];
    if (!t) throw new Error(`table '${name}': status.data.${name} missing (tableInit)`);
    return t;
  };
  const put = (s, t) => ({ ...s, data: { ...s.data, [name]: t } });
  const handlers = {
    [`${name}.click`]: (s, p) => {
      const t = get(s);
      for (const n of (p && p.path) || []) {
        if (n.startsWith(colPrefix)) {
          const key = n.slice(colPrefix.length);
          if (!spec.columns.some(c => c.key === key)) return { status: s };
          const cur = t.sort && t.sort.key === key ? t.sort.dir : null;
          const sort = cur === null ? { key, dir: 'asc' } : cur === 'asc' ? { key, dir: 'desc' } : null;
          return { status: put(s, { ...t, sort }) };
        }
        if (n.startsWith(rowPrefix)) {
          const k = n.slice(rowPrefix.length);
          const row = t.rows.find(r => String(r[rowKey]) === k);
          if (!row) return { status: s };
          return { status: put(s, { ...t, sel: row[rowKey] }), effects: [{ emit: `${name}.select`, payload: row }] };
        }
      }
      return { status: s };
    },
    [`${name}.scroll`]: (s, p) => {
      const t = get(s);
      const scrollTop = Number((p && p.scrollTop) || 0), clientHeight = Number((p && p.clientHeight) || 0);
      return { status: put(s, { ...t, window: { scrollTop, clientHeight } }) };
    },
  };

  // Opt-in (spec.filterable/exportable/paging) -- omitted entirely from the
  // returned object rather than merely inert, so a consumer spreading these
  // into its own handlers never lists a trigger its machine JSON doesn't
  // also declare (C2: an undeclared trigger is a typo, not a no-op).
  if (spec.filterable) {
    handlers[`${name}-filter.input`] = (s, p) => {
      const t = get(s);
      const patch = { ...t, filter: (p && p.value) ?? '' };
      if (spec.paging === 'pages') patch.page = 1;   // a new filter restarts paging, ground-truth parity
      return { status: put(s, patch) };
    };
  }
  if (spec.exportable) {
    handlers[`${name}-tools.click`] = (s, p) => {
      const t = get(s);
      for (const n of (p && p.path) || []) {
        if (n === `${name}-export-csv` || n === `${name}-export-json`) {
          const view = visibleRows(spec, t);   // filtered + sorted, ALL pages -- matches ground truth
          const base = spec.exportName || name;
          const csv = n === `${name}-export-csv`;
          return {
            status: s,
            effects: [{ emit: `${name}.export`, payload: csv
              ? { format: 'csv', filename: `${base}.csv`, mime: 'text/csv', text: toCSV(columns, view) }
              : { format: 'json', filename: `${base}.json`, mime: 'application/json', text: JSON.stringify(view, null, 2) } }],
          };
        }
      }
      return { status: s };
    };
  }
  if (spec.paging === 'pages') {
    handlers[`${name}-pager.click`] = (s, p) => {
      const t = get(s);
      const last = Math.max(1, Math.ceil(visibleRows(spec, t).length / pageSize));
      for (const n of (p && p.path) || []) {
        if (n === `${name}-page-prev`) return { status: put(s, { ...t, page: Math.max(1, (t.page || 1) - 1) }) };
        if (n === `${name}-page-next`) return { status: put(s, { ...t, page: Math.min(last, (t.page || 1) + 1) }) };
      }
      return { status: s };
    };
  }
  return handlers;
}

// `fixed, w:<w>` for a sized column, `fill` for one without w. `clip` (overflow
// dial) keeps long cell text inside its cell; `clamp` is a size token and
// would collide with fixed/fill (one dial, one token -- C8).
const cellSize = (c) => c.w == null ? 'fill' : `fixed, w:${c.w}`;

// Pure. Patches to merge into the consumer's view result.
export function tableView(spec, t) {
  const { name, columns } = checkSpec(spec);
  const rowKey = spec.rowKey ?? 'id';
  const usePages = spec.paging === 'pages';
  const pageSize = spec.pageSize ?? 25;
  const sorted = visibleRows(spec, t);   // filtered (if spec.filterable) + sorted
  const total = sorted.length;

  let start, count, page = 1, lastPage = 1;
  if (usePages) {
    lastPage = Math.max(1, Math.ceil(total / pageSize));
    page = Math.min(Math.max(1, t.page || 1), lastPage);
    start = (page - 1) * pageSize;
    count = Math.min(pageSize, total - start);
  } else {
    ({ start, count } = windowOf(t.window, total));
  }
  const visible = sorted.slice(start, start + count);
  const mark = (key) => !t.sort || t.sort.key !== key ? '' : t.sort.dir === 'asc' ? '▲' : '▼';

  const head = {
    name: `${name}-head`, box: 'row, mid, gap:2, clamp, pad:1, hairline, tint1',
    children: columns.map(c => ({
      name: `${name}-col-${c.key}`, box: `row, mid, between, ${cellSize(c)}, h:20, clip, bare`,
      children: [c.label ?? c.key, mark(c.key)],
    })),
  };
  const rows = visible.map(row => ({
    name: `${name}-row-${row[rowKey]}`, box: `row, mid, gap:2, clip, pad:1, bare, fixed, h:${ROW_H}`,
    children: columns.map(c => ({ box: `${cellSize(c)}, clip, bare`, content: String(row[c.key] ?? '') })),
  }));
  const spacer = (n) => ({ box: `fixed, h:${n * ROW_H}, bare` });
  // Paged mode needs no spacers (exactly one page's worth of `fixed, h:ROW_H`
  // rows) -- <name>-pager below carries the prev/next + range instead of a
  // scrollbar, so there's nothing to reserve space for either side of it.
  const content = usePages ? [head, ...rows] : [head, spacer(start), ...rows, spacer(total - start - count)];

  const patches = { [name]: { content, state: '' } };
  for (const c of columns) patches[`${name}-col-${c.key}`] = { state: 'actionable' };
  for (const row of visible) {
    const k = row[rowKey];
    patches[`${name}-row-${k}`] = { state: 'actionable' + (t.sel != null && String(k) === String(t.sel) ? ', selected' : '') };
  }

  // Opt-in tools row (filter box + match count + CSV/JSON export) -- a
  // sibling of `<name>` in the consumer's screen JSON, patched only when the
  // consumer declared it (spec.filterable or spec.exportable), same
  // C2-closed-vocabulary discipline as everywhere else: an unused feature
  // means the node simply doesn't exist, never an unreachable dead patch.
  if (spec.filterable || spec.exportable) {
    const tools = [];
    if (spec.filterable) tools.push({ name: `${name}-filter`, box: 'fill, pad:1, solid, rounded', field: 'text', content: t.filter || '' });
    tools.push({ box: 'fill' });
    if (spec.filterable && t.filter) tools.push({ box: 'hug', content: `${total} of ${t.rows.length}` });
    if (spec.exportable) {
      tools.push({ name: `${name}-export-csv`, extends: 'atom/button', content: 'CSV' });
      tools.push({ name: `${name}-export-json`, extends: 'atom/button', content: 'JSON' });
    }
    patches[`${name}-tools`] = { content: tools };
    if (spec.exportable) {
      patches[`${name}-export-csv`] = { state: 'actionable' };
      patches[`${name}-export-json`] = { state: 'actionable' };
    }
  }

  // Opt-in pager row (range + prev/next) -- another sibling, only for
  // spec.paging === 'pages' (virtual scroll's own scrollbar already IS its
  // "pager", no row needed).
  if (usePages) {
    const from = total ? start + 1 : 0, to = start + count;
    patches[`${name}-pager`] = { content: [
      { box: 'hug', content: `${from}–${to} of ${total}` },
      { box: 'fill' },
      { name: `${name}-page-prev`, extends: 'atom/button', content: '‹ Prev' },
      { name: `${name}-page-next`, extends: 'atom/button', content: 'Next ›' },
    ] };
    patches[`${name}-page-prev`] = { state: page > 1 ? 'actionable' : 'disabled' };
    patches[`${name}-page-next`] = { state: page < lastPage ? 'actionable' : 'disabled' };
  }
  return patches;
}
