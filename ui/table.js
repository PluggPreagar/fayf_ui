// ui/table.js -- table controller, L9 (C11). Pure: no DOM, no fetch, no timers.
// Composed with ui/machine.js as "the same driver on a sub-status": the
// consumer keeps this table's status under status.data[spec.name], spreads
// tableHandlers(spec) into its handlers, lists `<name>.click` + `<name>.scroll`
// as self-transitions in its machine JSON, and merges tableView(spec, t) into
// its view result. The scroll container (`stack, scroll, fixed, h:...`) is the
// consumer's screen JSON, named spec.name; the table only fills it.
//
// spec   = { name, columns: [{ key, label, w? }], rowKey = 'id' }
//          w = px column width; a column without w is `fill` (usually the last).
// t      = status.data[spec.name] = { rows, sort, sel, window }
//          sort   = null | { key, dir: 'asc' | 'desc' }
//          sel    = null | row[rowKey] of the selected row
//          window = { scrollTop, clientHeight } of the scroll container (px)
// in     : `<name>.click` (header cell -> sort cycle; body row -> select)
//          `<name>.scroll` (payload scrollTop + clientHeight -> t.window)
// out    : emit `<name>.select` with the row object
// view   : header row + top spacer + visible rows + bottom spacer. Every body
//          row is `fixed, h:ROW_H`, so windowing is arithmetic (windowOf).

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
export function tableInit(spec, rows = []) {
  checkSpec(spec);
  return { rows, sort: null, sel: null, window: { scrollTop: 0, clientHeight: 0 } };
}

// Pure. Handlers keyed by trigger, to spread into the consumer's handlers.
// They read/write status.data[spec.name] only and return new objects.
export function tableHandlers(spec) {
  const { name } = checkSpec(spec);
  const rowKey = spec.rowKey ?? 'id';
  const colPrefix = `${name}-col-`, rowPrefix = `${name}-row-`;
  const get = (s) => {
    const t = s.data && s.data[name];
    if (!t) throw new Error(`table '${name}': status.data.${name} missing (tableInit)`);
    return t;
  };
  const put = (s, t) => ({ ...s, data: { ...s.data, [name]: t } });
  return {
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
}

// `fixed, w:<w>` for a sized column, `fill` for one without w. `clip` (overflow
// dial) keeps long cell text inside its cell; `clamp` is a size token and
// would collide with fixed/fill (one dial, one token -- C8).
const cellSize = (c) => c.w == null ? 'fill' : `fixed, w:${c.w}`;

// Pure. Patches to merge into the consumer's view result.
export function tableView(spec, t) {
  const { name, columns } = checkSpec(spec);
  const rowKey = spec.rowKey ?? 'id';
  const total = t.rows.length;
  const { start, count } = windowOf(t.window, total);
  const visible = sortRows(t.rows, t.sort).slice(start, start + count);
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

  const patches = { [name]: { content: [head, spacer(start), ...rows, spacer(total - start - count)], state: '' } };
  for (const c of columns) patches[`${name}-col-${c.key}`] = { state: 'actionable' };
  for (const row of visible) {
    const k = row[rowKey];
    patches[`${name}-row-${k}`] = { state: 'actionable' + (t.sel != null && String(k) === String(t.sel) ? ', selected' : '') };
  }
  return patches;
}
