// ui/issues.js -- issues controller, L9 (C11). machines/issues.json is the
// machine; handlers + view are pure; mountIssues only hands the already-
// rendered screens/issues element to ui/machine.js.
//
// One tree sub-controller (ui/tree.js) rides on status.data.master -- same
// driver, own slice, talks via triggers + emit.
//
// status.data = { master: treeStatus, detail: null | issue, detailLoading,
//                  error }
//   `master` groups issues by lifecycle status (STATUSES order); `detail` is
//   the full record of the selected issue, fetched on select.
import issuesMachine from '../machines/issues.json' with { type: 'json' };
import { mountMachine } from './machine.js';
import { treeInit, treeHandlers, treeView } from './tree.js';

export { issuesMachine };

export const STATUSES = ['in-progress', 'open', 'ready', 'blocked', 'done', 'archived'];   // lifecycle order
export const MASTER = { name: 'master', groupKey: 'status', groupOrder: STATUSES, labelKey: 'title', rowKey: 'id' };
export const FIXTURE_URLS = { detail: (id) => `/content/issues/${id}.json`, status: null };   // status:null = demo has no backend write

const NAV = ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'settings'];
const OPEN_STATUSES = ['open', 'in-progress'];

// Pure. status.data at mount: nothing loaded, master tree empty.
export function initialData() {
  return { [MASTER.name]: treeInit(MASTER, []), detail: null, detailLoading: false, error: null };
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
    'list.loaded': (s, p) => ({ status: withData(s, { [MASTER.name]: treeInit(MASTER, asList(p)) }) }),
    'list.failed': (s, p) => ({ status: withData(s, { error: p && p.error }) }),
    ...selectingMaster(urls),
    'detail.loaded': (s, p) => ({ status: withData(s, { detail: p, detailLoading: false }) }),
    'detail.failed': (s, p) => ({ status: withData(s, { detailLoading: false, error: p && p.error }) }),
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
    { box: 'stack, gap:1, fill', content: detail.body || '' },
    fieldRow('Created', detail.created),
    fieldRow('Page', detail.page),
  ];
  if (detail.url) rows.push(fieldRow('URL', detail.url));
  const ctx = detail.context || {};
  for (const [k, v] of Object.entries(ctx)) rows.push(fieldRow(k, String(v)));
  const errs = detail.console_errors || [];
  for (const entry of errs) rows.push({ box: 'hug', content: `${entry.ts ? entry.ts + '  ' : ''}${entry.message}` });
  return rows;
}

// Pure. status -> { name: patch }. Object.entries order = paint order:
// content-level slots first, tree row patches last.
export function view(s) {
  const d = s.data;
  const t = d[MASTER.name];
  const rows = t ? t.rows : [];
  const openCount = rows.filter(r => OPEN_STATUSES.includes(r.status)).length;
  const loading = s.state === 'loading';
  const patches = {
    'crumb-page': 'Issues',
    'status-text': loading ? 'loading…' : s.state === 'error' ? `failed: ${d.error}` : `${rows.length} issues · ${openCount} open`,
    'detail-title': d.detail ? (d.detail.number ? `#${d.detail.number} ` : '') + d.detail.title : 'Detail',
    'detail-body': d.detail ? detailBody(d.detail) : 'Select an issue',
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
  if (d.detail) for (const v of STATUSES) patches[`detail-status-${v}`] = { state: v === d.detail.status ? 'selected' : 'actionable' };
  return patches;
}

// Browser. `root` = the already-rendered screens/issues element.
export function mountIssues(root, reg, opts = {}) {
  return mountMachine(root, root, issuesMachine, makeHandlers(opts.urls || FIXTURE_URLS), { reg, view, data: initialData(), ...opts });
}
