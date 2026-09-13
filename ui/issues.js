// ui/issues.js -- issues controller, L9 (C11). machines/issues.json is the
// machine; handlers + view are pure; mountIssues only hands the already-
// rendered screens/issues element to ui/machine.js.
//
// One tree sub-controller (ui/tree.js) rides on status.data.master -- same
// driver, own slice, talks via triggers + emit.
//
// status.data = { allIssues, master: treeStatus, filterText, detail: null |
//                  issue, detailLoading, editing, editText, saveError, error }
//   `master` groups issues by lifecycle status (STATUSES order); `detail` is
//   the full record of the selected issue, fetched on select. `allIssues` is
//   the raw, unfiltered list.loaded payload -- `master.rows` is always
//   RE-DERIVED from it (buildMaster below) so a filter keystroke never needs
//   a re-fetch. `filterText` matches a title OR body substring
//   (case-insensitive) -- the real backend's list_issues already sends
//   `body` along with every summary for exactly this (see its own docstring:
//   "the list view is the only place a client-side filter can search
//   without an N-request detail fetch per issue").
import issuesMachine from '../machines/issues.json' with { type: 'json' };
import { mountMachine } from './machine.js';
import { treeInit, treeHandlers, treeView } from './tree.js';

export { issuesMachine };

export const STATUSES = ['in-progress', 'open', 'ready', 'blocked', 'done', 'archived'];   // lifecycle order
export const MASTER = { name: 'master', groupKey: 'status', groupOrder: STATUSES, labelKey: 'title', rowKey: 'id' };
// `updateBody: null` (this repo's own fixture demo has no writable backend) ->
// Save mutates status.data locally instead of firing a fetch -- same
// "no urls -> local-optimistic" convention ui/browse.js's saveFile established.
export const FIXTURE_URLS = { detail: (id) => `/content/issues/${id}.json`, status: null, updateBody: null };

const NAV = ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'browse', 'query', 'annotate', 'profile'];
const OPEN_STATUSES = ['open', 'in-progress'];

// Pure. Re-derives the master tree's `rows` from the raw list + filter text,
// carrying the PREVIOUS `open`/`sel` forward (only `rows` changes) -- a
// filter keystroke must not collapse an expanded group or drop the current
// selection, same "don't reset UI state a repaint didn't touch" rule
// ui/dashboard.js's carryClientHeight already follows for its own tables.
// A `has_sketch` row (the real backend already sends this per summary) gets
// a small glyph prepended to its DISPLAY title only -- filtering itself
// still matches the row's real title/body, decoration happens after.
function buildMaster(allIssues, filterText, prevTree) {
  const q = (filterText || '').trim().toLowerCase();
  const filtered = q
    ? allIssues.filter(r => (r.title || '').toLowerCase().includes(q) || (r.body || '').toLowerCase().includes(q))
    : allIssues;
  const rows = filtered.map(r => r.has_sketch ? { ...r, title: '📷 ' + r.title } : r);
  return { rows, open: prevTree ? prevTree.open : {}, sel: prevTree ? prevTree.sel : null };
}

// Pure. Best-effort parse of `context.recent_actions` / `context.marked_elements`
// -- the real backend stores these as a Python repr'd list (of dicts / plain
// strings), not JSON, so this is a pattern match, not a real Python-literal
// parser (an action string that itself embeds an apostrophe could in
// principle confuse it) -- good enough to turn "[{'ts': '...', 'action':
// '...'}, ...]" into a readable timeline instead of showing that raw text.
function parsePyList(str) {
  if (typeof str !== 'string') return null;
  const dictRe = /\{\s*'ts':\s*'([^']*)'\s*,\s*'action':\s*'(.*?)'\s*\}/g;
  const dicts = [];
  let m;
  while ((m = dictRe.exec(str))) dicts.push({ ts: m[1], action: m[2] });
  if (dicts.length) return dicts;
  const items = [];
  const strRe = /'([^']*)'/g;
  while ((m = strRe.exec(str))) items.push(m[1]);
  return items.length ? items : null;
}

// Pure. The reporter-visible body, with the sketch/attachment markdown refs
// create_issue appended stripped back off -- mirrors update_issue_body's own
// strip-then-reappend (a plain textarea has no reason to expose or require
// preserving that implementation detail). Order matters: attachment was
// appended LAST, so it's stripped first.
function editableBody(detail) {
  let body = detail.body || '';
  const stripSuffix = (s, suffix) => s.endsWith(suffix) ? s.slice(0, -suffix.length) : s;
  if (detail.attachment) body = stripSuffix(body, `\n\n![attachment](${detail.attachment})`);
  if (detail.sketch) body = stripSuffix(body, `\n\n![screen sketch](${detail.sketch})`);
  return body;
}

// Pure. status.data at mount: nothing loaded, master tree empty.
export function initialData() {
  return { allIssues: [], [MASTER.name]: treeInit(MASTER, []), filterText: '',
    detail: null, detailLoading: false, editing: false, editText: '', saveError: null, error: null };
}

const withData = (s, patch) => ({ ...s, data: { ...s.data, ...patch } });
const asList = (p) => Array.isArray(p) ? p : [];
const reset = (s) => ({ status: withData(s, { error: null }) });

// Tree handlers, wrapped: the tree handler keeps its own slice + `emit`
// master.select; the wrapper ALSO starts the detail fetch for the selected
// row (data.detail = null, data.detailLoading = true), same shape as
// ui/dashboard.js's `selecting()` wrapper around tableHandlers.
function selectingMaster(urls) {
  const h = treeHandlers(MASTER);
  const click = h[`${MASTER.name}.click`];
  return {
    ...h,
    [`${MASTER.name}.click`]: (s, p) => {
      const r = click(s, p);
      const e = (r.effects || []).find(x => x.emit === `${MASTER.name}.select`);
      if (!e) return r;
      const next = withData(r.status, { detail: null, detailLoading: true });
      return { status: next, effects: [...r.effects, { fetch: urls.detail(e.payload.id), ok: 'detail.loaded', err: 'detail.failed' }] };
    },
  };
}

// The URL a status-write POSTs to is per-issue and per-target-status,
// dynamic -- unlike dashboard's static per-state fetch URLs, so it's
// parametrized like table.js's `spec` rather than baked into the machine
// JSON. Keeps this file reusable verbatim by a consumer that swaps in real
// API URLs, exactly like ui/dashboard.js / ui/table.js are reused today.
export function makeHandlers(urls = FIXTURE_URLS) {
  return {
    'list.loaded': (s, p) => {
      const allIssues = asList(p);
      return { status: withData(s, { allIssues, [MASTER.name]: buildMaster(allIssues, s.data.filterText, s.data[MASTER.name]) }) };
    },
    'list.failed': (s, p) => ({ status: withData(s, { error: p && p.error }) }),
    'filter-issues.input': (s, p) => {
      const filterText = (p && p.value) ?? '';
      return { status: withData(s, { filterText, [MASTER.name]: buildMaster(s.data.allIssues, filterText, s.data[MASTER.name]) }) };
    },
    ...selectingMaster(urls),
    'detail.loaded': (s, p) => ({ status: withData(s, { detail: p, detailLoading: false, editing: false, editText: '', saveError: null }) }),
    'detail.failed': (s, p) => ({ status: withData(s, { detailLoading: false, error: p && p.error }) }),
    'btn-edit.click': (s) => {
      const d = s.data.detail;
      if (!d || d.status !== 'open') return { status: s };
      return { status: withData(s, { editing: true, editText: editableBody(d), saveError: null }) };
    },
    'detail-editor.input': (s, p) => ({ status: withData(s, { editText: (p && p.value) ?? '' }) }),
    'btn-cancel-edit.click': (s) => ({ status: withData(s, { editing: false, editText: '', saveError: null }) }),
    'btn-save-edit.click': (s) => {
      const d = s.data.detail;
      if (!d) return { status: s };
      const text = s.data.editText;
      if (!urls.updateBody) {
        // No backend configured -- same local-optimistic convention as
        // ui/browse.js's own saveFile: mutate status.data directly, no fetch.
        return { status: withData(s, { detail: { ...d, body: text }, editing: false, saveError: null }) };
      }
      return {
        status: withData(s, { saving: true }),
        effects: [{ fetch: urls.updateBody(d.id), init: { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text }) }, ok: 'save-body.ok', err: 'save-body.err' }],
      };
    },
    'save-body.ok': (s, p) => {
      const d = s.data.detail;
      return { status: withData(s, { detail: { ...d, body: (p && p.body) ?? s.data.editText }, editing: false, saving: false, saveError: null }) };
    },
    'save-body.err': (s, p) => ({ status: withData(s, {
      saving: false, saveError: (p && p.body && p.body.error) || (p && p.error) || 'save failed',
    }) }),
    ...Object.fromEntries(STATUSES.map(v => [`detail-status-${v}.click`, (s) => {
      const d = s.data.detail;
      if (!d || d.status === v) return { status: s };
      if (!urls.status) return { status: withData(s, { detail: { ...d, status: v } }) };
      return {
        status: withData(s, { detail: { ...d, saving: true, pendingStatus: v } }),
        effects: [{ fetch: urls.status(d.id, v),
          init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: v }) },
          ok: 'status.saved', err: 'status.failed' }],
      };
    }])),
    'status.saved': (s) => {
      const d = s.data.detail;
      return { status: withData(s, { detail: { ...d, status: d.pendingStatus, saving: false, pendingStatus: null } }) };
    },
    'status.failed': (s, p) => {
      const d = s.data.detail;
      return { status: withData(s, { detail: { ...d, saving: false, pendingStatus: null }, error: p && p.error }) };
    },
    'btn-refresh.click': reset,
    'btn-retry.click': reset,
    'btn-theme.click': (s) => ({ status: s, effects: [{ emit: 'theme.toggle' }] }),
    ...Object.fromEntries(NAV.map(to => [`nav-${to}.click`, (s) => ({ status: s, effects: [{ emit: 'nav.go', payload: { to } }] })])),
    'brand.click': (s) => ({ status: s, effects: [{ emit: 'nav.go', payload: { to: 'dashboard' } }] }),
  };
}

export const handlers = makeHandlers(FIXTURE_URLS);   // this repo's own default export

const RETRY = { name: 'btn-retry', box: 'row, mid, packed, pad:2, solid, rounded', content: 'Retry' };
const fieldRow = (label, value) => ({ box: 'row, gap:2, between, hug',
  children: [{ box: 'hug', content: label }, { box: 'hug', content: String(value ?? '') }] });

// Pure. `detail` -> the content array for detail-body.
function detailBody(detail) {
  const rows = [
    // spec said `wrap` here -- not a real vocabulary token (ui/vocabulary.json
    // has no flex-wrap dial, C2 would throw "unknown value"). `scroll`
    // (existing overflow token, same mechanism table.js's row container
    // uses) keeps the 6 chips reachable without overflowing the 280px
    // detail panel (C10) and needs no new primitive.
    { name: 'detail-status', box: 'row, mid, gap:1, scroll',
      children: STATUSES.map(v => ({ name: `detail-status-${v}`, extends: 'atom/chip', content: v })) },
    { box: 'stack, gap:1, clamp', content: detail.body || '' },
    fieldRow('Created', detail.created),
    fieldRow('Page', detail.page),
  ];
  if (detail.url) rows.push(fieldRow('URL', detail.url));
  const ctx = detail.context || {};
  for (const [k, v] of Object.entries(ctx)) {
    // recent_actions / marked_elements (the real backend's Python repr'd
    // shape): a readable one-line-per-entry list instead of the raw text.
    // Falls through to the plain fieldRow when parsing finds nothing (an
    // empty/malformed value, or a future differently-shaped field).
    if (k === 'recent_actions' || k === 'marked_elements') {
      const parsed = parsePyList(v);
      if (parsed && parsed.length) {
        rows.push({ box: 'hug', content: k });
        for (const entry of parsed) rows.push({ box: 'hug', content: typeof entry === 'string' ? entry : `${entry.ts}  ${entry.action}` });
        continue;
      }
    }
    rows.push(fieldRow(k, String(v)));
  }
  const errs = detail.console_errors || [];
  for (const entry of errs) rows.push({ box: 'hug', content: `${entry.ts ? entry.ts + '  ' : ''}${entry.message}` });
  return rows;
}

// Pure. `text` -> the content array for detail-body while editing (issue
// "allow edit on issue": open issues only, enforced both by hiding btn-edit
// outside 'open' in view() and server-side by update_issue_body).
function detailEditor(text) {
  return [
    { name: 'detail-editor', box: 'fill, pad:2, solid, rounded', field: 'textarea', content: text },
    { name: 'edit-actions', box: 'row, mid, gap:2, hug',
      children: [
        { name: 'btn-save-edit', extends: 'atom/button.primary', content: 'Save' },
        { name: 'btn-cancel-edit', extends: 'atom/button', content: 'Cancel' } ] },
  ];
}

// Pure. status -> { name: patch }. Object.entries order = paint order:
// content-level slots first, tree row patches last.
export function view(s) {
  const d = s.data;
  const t = d[MASTER.name];
  const rows = t ? t.rows : [];
  const openCount = rows.filter(r => OPEN_STATUSES.includes(r.status)).length;
  const loading = s.state === 'loading';
  const canEdit = !!(d.detail && d.detail.status === 'open');
  const patches = {
    'crumb-page': 'Issues',
    'status-text': loading ? 'loading…' : s.state === 'error' ? `failed: ${d.error}` : `${rows.length} issues · ${openCount} open`,
    // filter-issues is built here, not in screens/issues.json, same reason
    // ui/query.js's own `fql` field is: a real field:'text' node can only be
    // introduced via a content-array patch (morphChildren renders it fresh),
    // never declared on a static screen node directly (parts_validate_test's
    // reserved-keys walk only covers the STATIC registry).
    'filter-row': { content: [{ name: 'filter-issues', box: 'fill, pad:1, solid, rounded', field: 'text', content: d.filterText }] },
    'detail-title': d.detail ? (d.detail.number ? `#${d.detail.number} ` : '') + d.detail.title : 'Detail',
    'detail-body': d.detail ? (d.editing ? detailEditor(d.editText) : detailBody(d.detail)) : 'Select an issue',
    'btn-edit': { state: canEdit && !d.editing ? 'actionable' : 'disabled' },
    'save-error': d.saveError || '',
  };
  if (loading) {
    patches[MASTER.name] = { content: [], state: 'loading' };
  } else if (s.state === 'error') {
    patches[MASTER.name] = { content: [RETRY], state: '' };
    patches['btn-retry'] = { state: 'error' };
  } else {
    const tv = treeView(MASTER, t);
    patches[MASTER.name] = tv[MASTER.name];
    Object.assign(patches, tv);
  }
  // The status chips are part of detailBody()'s own rows -- while editing,
  // detail-body shows detailEditor()'s textarea+buttons instead, so those
  // named slots don't exist in the current render at all; patching them
  // anyway throws ("view names slot ... not in screen") in ui/machine.js's
  // own name-checked morph. Found live (issue #81's own edit-flow testing).
  if (d.detail && !d.editing) for (const v of STATUSES) patches[`detail-status-${v}`] = { state: v === d.detail.status ? 'selected' : 'actionable' };
  return patches;
}

// Browser. `root` = the already-rendered screens/issues element.
export function mountIssues(root, reg, opts = {}) {
  return mountMachine(root, root, issuesMachine, makeHandlers(opts.urls || FIXTURE_URLS), { reg, view, data: initialData(), ...opts });
}
