import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { init, step, validateMachine } from '../../ui/machine.js';
import { ROW_H, windowOf } from '../../ui/table.js';
import { dashboardMachine, handlers, view, counts, initialData, RUNS, ISSUES } from '../../ui/dashboard.js';

// The dashboard flow as JSON in, JSON out (C11): machines/dashboard.json +
// pure handlers + pure view, on the shipped fixtures. No DOM.
const fixture = (n) => JSON.parse(readFileSync(new URL(`../../content/dashboard/${n}.json`, import.meta.url), 'utf-8'));
const RUNS_FX = fixture('runs'), PIPES_FX = fixture('pipelines'), ISSUES_FX = fixture('issues');
const M = dashboardMachine;
const FETCHES = [
  { fetch: '/content/dashboard/runs.json', ok: 'runs.loaded', err: 'runs.failed' },
  { fetch: '/content/dashboard/pipelines.json', ok: 'pipelines.loaded', err: 'pipelines.failed' },
  { fetch: '/content/dashboard/issues.json', ok: 'issues.loaded', err: 'issues.failed' },
];
const go = (s, trigger, payload) => step(M, s, trigger, payload, handlers);
// Run a step and any `send` effects it produced, like the controller does.
const drive = (s, trigger, payload) => {
  let r = go(s, trigger, payload), effects = [];
  for (;;) {
    const sends = r.effects.filter(e => 'send' in e);
    effects = effects.concat(r.effects.filter(e => !('send' in e)));
    if (!sends.length) return { status: r.status, effects };
    r = go(r.status, sends[0].send, sends[0].payload);
  }
};
const start = () => init(M, initialData());
// loading -> ready on the fixtures; the third `loaded` sends flow.ready.
const loadAll = () => {
  let s = start().status;
  s = go(s, 'runs.loaded', RUNS_FX).status;
  s = go(s, 'pipelines.loaded', PIPES_FX).status;
  return drive(s, 'issues.loaded', ISSUES_FX);
};
const click = (name, ...path) => ({ name, event: 'click', target: path[0], path: [...path, name, 'content', 'body', 'root'] });
const scroll = (name, clientHeight) => ({ name, event: 'scroll', target: name, path: [name, 'content', 'body', 'root'], scrollTop: 0, clientHeight });
const rowsOf = (v, name) => v[name].content.slice(2, -1);

test('machines/dashboard.json validates; JSON round-trip identical', () => {
  assert.equal(validateMachine(M), M);
  assert.deepEqual(JSON.parse(JSON.stringify(M)), M);
  assert.deepEqual(JSON.parse(readFileSync(new URL('../../machines/dashboard.json', import.meta.url), 'utf-8')), M);
});

test('fixtures: API shapes (fayf_processor list_runs / pipelines / issues meta)', () => {
  assert.ok(RUNS_FX.length >= 60, `runs ${RUNS_FX.length}`);
  for (const r of RUNS_FX) {
    assert.deepEqual(Object.keys(r).sort(), ['pipeline', 'run_id', 'started_at', 'status']);
    assert.match(r.run_id, /^r-\d{4}$/);
    assert.ok(['pending', 'running', 'done', 'failed', 'canceled', 'paused'].includes(r.status), r.status);
    assert.match(r.started_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  }
  assert.equal(new Set(RUNS_FX.map(r => r.run_id)).size, RUNS_FX.length, 'run_id unique');
  assert.ok(PIPES_FX.every(p => typeof p === 'string'));
  assert.equal(PIPES_FX.filter(p => /^e2e-deploy-/.test(p)).length, 2, 'two throwaway pipelines');
  assert.ok(ISSUES_FX.length >= 40, `issues ${ISSUES_FX.length}`);
  for (const i of ISSUES_FX) {
    assert.deepEqual(Object.keys(i).sort(), ['created', 'id', 'number', 'page', 'status', 'title']);
    assert.ok(['open', 'in-progress', 'ready', 'blocked', 'done', 'archived'].includes(i.status), i.status);
    assert.equal(typeof i.number, 'number');
  }
  assert.equal(new Set(ISSUES_FX.map(i => i.id)).size, ISSUES_FX.length, 'issue id unique');
});

test('init -> loading with 3 fetch effects; data empty, nothing loaded', () => {
  const { status, effects } = start();
  assert.equal(status.state, 'loading');
  assert.deepEqual(effects, FETCHES);
  assert.deepEqual(status.data.loaded, { runs: false, pipelines: false, issues: false });
  assert.equal(status.data.sel, null);
  assert.equal(status.data.error, null);
  assert.deepEqual(status.data[RUNS.name].rows, []);
  assert.deepEqual(status.data[ISSUES.name].rows, []);
});

test('view in loading: stats "–", status-text "loading…", tables empty + loading token', () => {
  const v = view(start().status);
  for (const n of ['stat-running', 'stat-failed', 'stat-pipelines', 'stat-issues']) assert.equal(v[n], '–');
  assert.equal(v['status-text'], 'loading…');
  assert.equal(v['crumb-page'], 'Dashboard');
  assert.equal(v['detail-title'], 'Detail');
  assert.equal(v['detail-body'], 'Select a run or an issue');
  assert.deepEqual(v[RUNS.name], { content: [], state: 'loading' });
  assert.deepEqual(v[ISSUES.name], { content: [], state: 'loading' });
});

test('loaded x3 (any order): flags set, stays loading until the third, then send flow.ready -> ready', () => {
  let r = go(start().status, 'pipelines.loaded', PIPES_FX);
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, [], 'self-transition = stay: no re-entry, the other two fetches keep collecting');
  assert.deepEqual(r.status.data.loaded, { runs: false, pipelines: true, issues: false });
  r = go(r.status, 'issues.loaded', ISSUES_FX);
  assert.equal(r.status.data.loaded.issues, true);
  assert.equal(r.status.data[ISSUES.name].rows, ISSUES_FX, 'issues table slice rebuilt from payload');
  r = go(r.status, 'runs.loaded', RUNS_FX);
  assert.deepEqual(r.status.data.loaded, { runs: true, pipelines: true, issues: true });
  assert.deepEqual(r.effects[0], { send: 'flow.ready' }, 'third load sends flow.ready first');
  assert.deepEqual(r.status.data[RUNS.name].sort, { key: 'started_at', dir: 'desc' }, 'runs newest first');
  const s = go(r.status, 'flow.ready').status;
  assert.equal(s.state, 'ready');
  const d = loadAll();
  assert.equal(d.status.state, 'ready');
  assert.deepEqual(d.effects, [], 'drive() consumed the send; no other effects');
});

test('counts on the fixture files', () => {
  const s = loadAll().status;
  const c = counts(s.data);
  assert.deepEqual(c, {
    running: RUNS_FX.filter(r => r.status === 'running').length,
    failed: RUNS_FX.filter(r => r.status === 'failed').length,
    pipelines: PIPES_FX.filter(p => !/^e2e-deploy-/.test(p)).length,
    issues: ISSUES_FX.filter(i => ['open', 'in-progress'].includes(i.status)).length,
  });
  assert.ok(c.running > 0 && c.failed > 0 && c.issues > 0);
  assert.equal(c.pipelines, PIPES_FX.length - 2);
  assert.deepEqual(counts({ runs: RUNS_FX, pipelines: PIPES_FX, issues: ISSUES_FX }), c, 'plain arrays accepted too');
  assert.deepEqual(counts(initialData()), { running: 0, failed: 0, pipelines: 0, issues: 0 });
});

test('view in ready: stat values, status-text, both table heads, <= 20 rows per table at clientHeight 240', () => {
  let s = loadAll().status;
  s = go(s, 'recent-runs.scroll', scroll('recent-runs', 240)).status;
  s = go(s, 'issues.scroll', scroll('issues', 240)).status;
  const c = counts(s.data);
  const v = view(s);
  assert.equal(v['stat-running'], String(c.running));
  assert.equal(v['stat-failed'], String(c.failed));
  assert.equal(v['stat-pipelines'], String(c.pipelines));
  assert.equal(v['stat-issues'], String(c.issues));
  assert.equal(v['status-text'], `${RUNS_FX.length} runs · ${c.pipelines} pipelines`);
  assert.equal(v[RUNS.name].content[0].name, 'recent-runs-head');
  assert.equal(v[ISSUES.name].content[0].name, 'issues-head');
  assert.deepEqual(v[RUNS.name].content[0].children.map(h => h.name), ['recent-runs-col-run_id', 'recent-runs-col-pipeline', 'recent-runs-col-status', 'recent-runs-col-started_at']);
  assert.deepEqual(v[ISSUES.name].content[0].children.map(h => h.children[0]), ['#', 'Title', 'Status', 'Page']);
  const runRows = rowsOf(v, RUNS.name), issueRows = rowsOf(v, ISSUES.name);
  assert.ok(runRows.length <= 20 && runRows.length > 0, `runs painted ${runRows.length}`);
  assert.ok(issueRows.length <= 20 && issueRows.length > 0, `issues painted ${issueRows.length}`);
  assert.equal(runRows.length, windowOf({ scrollTop: 0, clientHeight: 240 }, RUNS_FX.length).count);
  const newest = [...RUNS_FX].sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  assert.equal(runRows[0].name, `recent-runs-row-${newest.run_id}`, 'newest run first');
  assert.equal(v[RUNS.name].content[0].children[3].children[1], '▼', 'sort mark on Started');
  assert.equal(runRows[0].box, `row, mid, gap:2, clip, pad:1, bare, fixed, h:${ROW_H}`);
  // paint order: content-level slots before table row patches (Object.entries = paint order)
  const keys = Object.keys(v);
  const firstRow = keys.findIndex(k => /-row-/.test(k));
  for (const k of ['crumb-page', 'stat-running', 'status-text', 'detail-title', 'detail-body', RUNS.name, ISSUES.name])
    assert.ok(keys.indexOf(k) < firstRow, `${k} painted before row patches`);
});

test('run row click: table sel + data.sel + emit recent-runs.select; detail shows the run', () => {
  const s0 = loadAll().status;
  const r = go(s0, 'recent-runs.click', click('recent-runs', 'recent-runs-row-r-0001'));
  assert.equal(r.status.state, 'ready');
  const row = RUNS_FX.find(x => x.run_id === 'r-0001');
  assert.equal(r.status.data[RUNS.name].sel, 'r-0001');
  assert.deepEqual(r.status.data.sel, { kind: 'run', row });
  assert.deepEqual(r.effects, [{ emit: 'recent-runs.select', payload: row }], 'emit kept for the parent');
  const v = view(r.status);
  assert.equal(v['detail-title'], 'Run r-0001');
  assert.deepEqual(v['detail-body'].map(n => n.children.map(c => c.content)),
    [['run_id', 'r-0001'], ['pipeline', row.pipeline], ['status', row.status], ['started_at', row.started_at]]);
  assert.equal(s0.data.sel, null, 'input status untouched');
});

test('issue row click: sel kind issue, detail "Issue #<number>"', () => {
  const s = go(loadAll().status, 'issues.scroll', scroll('issues', 240)).status;
  const target = ISSUES_FX[3];
  const r = go(s, 'issues.click', click('issues', `issues-row-${target.id}`));
  assert.deepEqual(r.status.data.sel, { kind: 'issue', row: target });
  assert.deepEqual(r.effects, [{ emit: 'issues.select', payload: target }]);
  const v = view(r.status);
  assert.equal(v['detail-title'], `Issue #${target.number}`);
  assert.equal(v[`issues-row-${target.id}`].state, 'actionable, selected');
  assert.equal(v['detail-body'].length, 6);
  // a header click sorts, leaves sel alone
  const r2 = go(r.status, 'issues.click', click('issues', 'issues-col-status', 'issues-head'));
  assert.deepEqual(r2.status.data[ISSUES.name].sort, { key: 'status', dir: 'asc' });
  assert.deepEqual(r2.status.data.sel, { kind: 'issue', row: target });
  assert.deepEqual(r2.effects, []);
});

test('failed -> error: status-text, Retry in recent-runs, issues empty; retry re-issues 3 fetches', () => {
  let r = go(start().status, 'runs.loaded', RUNS_FX);
  r = go(r.status, 'pipelines.failed', { error: 'HTTP 500' });
  assert.equal(r.status.state, 'error');
  assert.equal(r.status.data.error, 'HTTP 500');
  assert.deepEqual(r.effects, []);
  const v = view(r.status);
  assert.equal(v['status-text'], 'failed: HTTP 500');
  assert.deepEqual(v[RUNS.name], { content: [{ name: 'btn-retry', box: 'row, mid, packed, pad:2, solid, rounded', content: 'Retry' }], state: '' });
  assert.deepEqual(v['btn-retry'], { state: 'error' });
  assert.deepEqual(v[ISSUES.name], { content: [], state: '' });
  assert.equal(v['stat-running'], String(RUNS_FX.filter(x => x.status === 'running').length), 'what did load still counts');
  assert.deepEqual(go(r.status, 'runs.loaded', RUNS_FX), { status: r.status, effects: [] }, 'late result inert in error');
  r = go(r.status, 'btn-retry.click');
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, FETCHES);
  assert.deepEqual(r.status.data.loaded, { runs: false, pipelines: false, issues: false });
  assert.equal(r.status.data.error, null);
  assert.equal(view(r.status)['status-text'], 'loading…');
});

test('refresh from ready -> loading with 3 fetches, flags reset, sel kept', () => {
  let s = go(loadAll().status, 'recent-runs.click', click('recent-runs', 'recent-runs-row-r-0002')).status;
  const r = go(s, 'btn-refresh.click');
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, FETCHES);
  assert.deepEqual(r.status.data.loaded, { runs: false, pipelines: false, issues: false });
  assert.equal(r.status.data.error, null);
  assert.equal(r.status.data.sel.kind, 'run', 'selection survives a refresh');
  assert.equal(view(r.status)['stat-running'], '–');
  const back = drive(go(go(r.status, 'runs.loaded', RUNS_FX).status, 'pipelines.loaded', PIPES_FX).status, 'issues.loaded', ISSUES_FX);
  assert.equal(back.status.state, 'ready');
});

test('nav click emits nav.go with the target; theme click emits theme.toggle; both stay ready', () => {
  const s = loadAll().status;
  for (const to of ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'settings']) {
    const r = go(s, `nav-${to}.click`, click(`nav-${to}`));
    assert.equal(r.status.state, 'ready');
    assert.deepEqual(r.effects, [{ emit: 'nav.go', payload: { to } }]);
  }
  assert.deepEqual(go(s, 'btn-theme.click').effects, [{ emit: 'theme.toggle' }]);
  assert.deepEqual(go(start().status, 'nav-issues.click'), { status: start().status, effects: [] }, 'inert while loading');
});

test('unknown trigger throws (C2); table handlers keyed by spec names', () => {
  assert.throws(() => go(loadAll().status, 'tile-running.click'), /unknown trigger/);
  for (const k of ['recent-runs.click', 'recent-runs.scroll', 'issues.click', 'issues.scroll']) assert.equal(typeof handlers[k], 'function', k);
});
