// ui/dashboard.js -- dashboard controller, L9 (C11). machines/dashboard.json
// is the machine; handlers + view are pure; mountDashboard only hands the
// already-rendered screens/dashboard element to ui/machine.js.
//
// Two table sub-controllers (ui/table.js) ride on status.data['recent-runs']
// and status.data.issues -- same driver, own slice, talk via triggers + emit.
//
// status.data = { runs, pipelines, loaded: { runs, pipelines, issues }, error,
//                 sel: null | { kind: 'run' | 'issue', row },
//                 'recent-runs': tableStatus, issues: tableStatus }
//   One name per thing (C2): the ISSUES table slice is keyed by its spec name
//   `issues`, so the raw issue list is that slice's rows (data.issues.rows) --
//   no second key for the same array. counts() reads it from there (and
//   accepts a plain array at data.issues too).
import dashboardMachine from '../machines/dashboard.json' with { type: 'json' };
import { mountMachine } from './machine.js';
import { tableInit, tableHandlers, tableView } from './table.js';

export { dashboardMachine };

export const RUNS = { name: 'recent-runs', rowKey: 'run_id', columns: [
  { key: 'run_id', label: 'Run', w: 90 }, { key: 'pipeline', label: 'Pipeline', w: 180 },
  { key: 'status', label: 'Status', w: 90 }, { key: 'started_at', label: 'Started' } ] };
export const ISSUES = { name: 'issues', rowKey: 'id', columns: [
  { key: 'number', label: '#', w: 50 }, { key: 'title', label: 'Title', w: 260 },
  { key: 'status', label: 'Status', w: 100 }, { key: 'page', label: 'Page' } ] };

const NAV = ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'settings'];
const ISSUE_OPEN = ['open', 'in-progress'];
const TEST_DEPLOY = /^e2e-deploy-/;
const NO_LOADED = { runs: false, pipelines: false, issues: false };

// Pure. status.data at mount: nothing loaded, both table slices empty.
export function initialData() {
  return { runs: [], pipelines: [], loaded: { ...NO_LOADED }, error: null, sel: null,
    [RUNS.name]: tableInit(RUNS, []), [ISSUES.name]: tableInit(ISSUES, []) };
}

// Pure. The four headline numbers. `d` = status.data.
export const counts = (d) => ({
  running:   (d.runs || []).filter(r => r.status === 'running').length,
  failed:    (d.runs || []).filter(r => r.status === 'failed').length,
  pipelines: (d.pipelines || []).filter(n => !TEST_DEPLOY.test(n)).length,
  issues:    issueRows(d).filter(i => ISSUE_OPEN.includes(i.status)).length,
});
const issueRows = (d) => Array.isArray(d.issues) ? d.issues : (d.issues && d.issues.rows) || [];

const withData = (s, patch) => ({ ...s, data: { ...s.data, ...patch } });
const flag = (s, key) => ({ ...s.data.loaded, [key]: true });
const allLoaded = (loaded) => loaded.runs && loaded.pipelines && loaded.issues;
const ready = (s) => allLoaded(s.data.loaded) ? [{ send: 'flow.ready' }] : [];
const reset = (s) => ({ status: withData(s, { loaded: { ...NO_LOADED }, error: null }) });
const asList = (p) => Array.isArray(p) ? p : [];

// Table handlers, wrapped: the table handler keeps its own slice + `emit`
// <name>.select; the wrapper ALSO sets data.sel from that emit's payload
// (the row). The emit stays -- a parent (onEmit) still hears the selection.
function selecting(spec, kind) {
  const h = tableHandlers(spec);
  const click = h[`${spec.name}.click`];
  return {
    ...h,
    [`${spec.name}.click`]: (s, p) => {
      const r = click(s, p);
      const e = (r.effects || []).find(x => x.emit === `${spec.name}.select`);
      return e ? { ...r, status: withData(r.status, { sel: { kind, row: e.payload } }) } : r;
    },
  };
}

// Pure. (status, payload) -> { status, effects? }
export const handlers = {
  'runs.loaded': (s, p) => {
    const runs = asList(p);
    const loaded = flag(s, 'runs');
    const t = { ...tableInit(RUNS, runs), sort: { key: 'started_at', dir: 'desc' } };
    const next = withData(s, { runs, loaded, [RUNS.name]: t });
    return { status: next, effects: ready(next) };
  },
  'pipelines.loaded': (s, p) => {
    const next = withData(s, { pipelines: asList(p), loaded: flag(s, 'pipelines') });
    return { status: next, effects: ready(next) };
  },
  'issues.loaded': (s, p) => {
    const next = withData(s, { loaded: flag(s, 'issues'), [ISSUES.name]: tableInit(ISSUES, asList(p)) });
    return { status: next, effects: ready(next) };
  },
  'runs.failed':      (s, p) => ({ status: withData(s, { error: p && p.error }) }),
  'pipelines.failed': (s, p) => ({ status: withData(s, { error: p && p.error }) }),
  'issues.failed':    (s, p) => ({ status: withData(s, { error: p && p.error }) }),
  'btn-refresh.click': reset,
  'btn-retry.click':   reset,
  'btn-theme.click': (s) => ({ status: s, effects: [{ emit: 'theme.toggle' }] }),
  ...Object.fromEntries(NAV.map(to => [`nav-${to}.click`, (s) => ({ status: s, effects: [{ emit: 'nav.go', payload: { to } }] })])),
  ...selecting(RUNS, 'run'),
  ...selecting(ISSUES, 'issue'),
};

const RETRY = { name: 'btn-retry', box: 'row, mid, packed, pad:2, solid, rounded', content: 'Retry' };
const fieldRow = (label, value) => ({ box: 'row, gap:2, between, hug',
  children: [{ box: 'hug', content: label }, { box: 'hug', content: String(value ?? '') }] });

// Pure. status -> { name: patch }. Object.entries order = paint order:
// content-level slots first, table row patches last.
export function view(s) {
  const d = s.data;
  const c = counts(d);
  const loading = s.state === 'loading';
  const stat = (n) => loading ? '–' : String(n);
  const patches = {
    'crumb-page': 'Dashboard',
    'stat-running': stat(c.running),
    'stat-failed': stat(c.failed),
    'stat-pipelines': stat(c.pipelines),
    'stat-issues': stat(c.issues),
    'status-text': loading ? 'loading…' : s.state === 'error' ? `failed: ${d.error}` : `${d.runs.length} runs · ${c.pipelines} pipelines`,
    'detail-title': d.sel ? (d.sel.kind === 'run' ? `Run ${d.sel.row.run_id}` : `Issue #${d.sel.row.number}`) : 'Detail',
    'detail-body': d.sel ? Object.entries(d.sel.row).map(([k, v]) => fieldRow(k, v)) : 'Select a run or an issue',
  };
  if (loading) {
    patches[RUNS.name] = { content: [], state: 'loading' };
    patches[ISSUES.name] = { content: [], state: 'loading' };
  } else if (s.state === 'error') {
    patches[RUNS.name] = { content: [RETRY], state: '' };
    patches['btn-retry'] = { state: 'error' };
    patches[ISSUES.name] = { content: [], state: '' };
  } else {
    const runs = tableView(RUNS, d[RUNS.name]), issues = tableView(ISSUES, d[ISSUES.name]);
    // both slot patches before any row/col patch (re-assigning keeps a key's position)
    patches[RUNS.name] = runs[RUNS.name];
    patches[ISSUES.name] = issues[ISSUES.name];
    Object.assign(patches, runs, issues);
  }
  return patches;
}

// Browser. `root` = the already-rendered screens/dashboard element.
export function mountDashboard(root, reg, opts = {}) {
  return mountMachine(root, root, dashboardMachine, handlers, { reg, view, data: initialData(), ...opts });
}
