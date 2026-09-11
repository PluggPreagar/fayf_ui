import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { init, step, validateMachine } from '../../ui/machine.js';
import { windowOf } from '../../ui/table.js';
import { listMachine, handlers, makeHandlers, view, initialData, PIPELINES, RUNS } from '../../ui/list.js';

// The list (pipelines) flow as JSON in, JSON out (C11): machines/list.json +
// pure handlers + pure view, on the shipped fixtures (reused from dashboard,
// not new fixture files). No DOM.
const fixture = (n) => JSON.parse(readFileSync(new URL(`../../content/dashboard/${n}.json`, import.meta.url), 'utf-8'));
const PIPES_FX = fixture('pipelines'), RUNS_FX = fixture('runs');
const M = listMachine;
const FETCHES = [
  { fetch: '/content/dashboard/pipelines.json', ok: 'pipelines.loaded', err: 'pipelines.failed' },
  { fetch: '/content/dashboard/runs.json', ok: 'runs.loaded', err: 'runs.failed' },
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
// loading -> ready on the fixtures; the second `loaded` sends flow.ready.
const loadAll = () => {
  let s = start().status;
  s = go(s, 'pipelines.loaded', PIPES_FX).status;
  return drive(s, 'runs.loaded', RUNS_FX);
};
const click = (name, ...path) => ({ name, event: 'click', target: path[0], path: [...path, name, 'content', 'body', 'root'] });
const scroll = (name, clientHeight) => ({ name, event: 'scroll', target: name, path: [name, 'content', 'body', 'root'], scrollTop: 0, clientHeight });
const rowsOf = (v, name) => v[name].content.slice(2, -1);

test('machines/list.json validates; JSON round-trip identical', () => {
  assert.equal(validateMachine(M), M);
  assert.deepEqual(JSON.parse(JSON.stringify(M)), M);
  assert.deepEqual(JSON.parse(readFileSync(new URL('../../machines/list.json', import.meta.url), 'utf-8')), M);
});

test('reused dashboard fixtures still shape-valid (pipelines: strings; runs: run_id/pipeline/status/started_at)', () => {
  assert.ok(PIPES_FX.every(p => typeof p === 'string'));
  assert.ok(RUNS_FX.length >= 60, `runs ${RUNS_FX.length}`);
  for (const r of RUNS_FX) assert.deepEqual(Object.keys(r).sort(), ['pipeline', 'run_id', 'started_at', 'status']);
});

test('init -> loading with 2 fetch effects (pipelines, runs); data empty, nothing loaded', () => {
  const { status, effects } = start();
  assert.equal(status.state, 'loading');
  assert.deepEqual(effects, FETCHES);
  assert.deepEqual(status.data.loaded, { pipelines: false, runs: false });
  assert.equal(status.data.pipelineFilter, null);
  assert.equal(status.data.error, null);
  assert.deepEqual(status.data.allRuns, []);
  assert.deepEqual(status.data[PIPELINES.name].rows, []);
  assert.deepEqual(status.data[RUNS.name].rows, []);
});

test('view in loading: status-text "loading…", both tables empty + loading token', () => {
  const v = view(start().status);
  assert.equal(v['status-text'], 'loading…');
  assert.equal(v['crumb-page'], 'Pipelines');
  assert.equal(v['detail-title'], 'Pipelines');
  assert.deepEqual(v['detail-body'], [{ box: 'row, gap:2, between, hug', children: [{ box: 'hug', content: 'Total runs' }, { box: 'hug', content: '0' }] }]);
  assert.deepEqual(v[PIPELINES.name], { content: [], state: 'loading' });
  assert.deepEqual(v[RUNS.name], { content: [], state: 'loading' });
});

test('loaded x2 (any order): flags set, self-transition = stay, second sends flow.ready -> ready', () => {
  let r = go(start().status, 'runs.loaded', RUNS_FX);
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, [], 'self-transition = stay: no re-entry, the other fetch keeps collecting');
  assert.deepEqual(r.status.data.loaded, { pipelines: false, runs: true });
  r = go(r.status, 'pipelines.loaded', PIPES_FX);
  assert.deepEqual(r.status.data.loaded, { pipelines: true, runs: true });
  assert.deepEqual(r.effects[0], { send: 'flow.ready' }, 'second load sends flow.ready first');
  assert.deepEqual(r.status.data[RUNS.name].sort, { key: 'started_at', dir: 'desc' }, 'runs newest first');
  assert.deepEqual(r.status.data[PIPELINES.name].rows, PIPES_FX.map(name => ({ name })), 'pipelines mapped to row objects');
  const s = go(r.status, 'flow.ready').status;
  assert.equal(s.state, 'ready');
  const d = loadAll();
  assert.equal(d.status.state, 'ready');
  assert.deepEqual(d.effects, [], 'drive() consumed the send; no other effects');
});

test('view in ready: status-text counts, both table heads, windowed rows', () => {
  let s = loadAll().status;
  s = go(s, 'pipelines.scroll', scroll('pipelines', 140)).status;
  s = go(s, 'runs.scroll', scroll('runs', 320)).status;
  const v = view(s);
  assert.equal(v['status-text'], `${RUNS_FX.length} runs · ${PIPES_FX.length} pipelines`);
  assert.equal(v[PIPELINES.name].content[0].name, 'pipelines-head');
  assert.equal(v[RUNS.name].content[0].name, 'runs-head');
  const pipeRows = rowsOf(v, PIPELINES.name), runRows = rowsOf(v, RUNS.name);
  assert.equal(pipeRows.length, windowOf({ scrollTop: 0, clientHeight: 140 }, PIPES_FX.length).count);
  assert.ok(runRows.length > 0 && runRows.length <= 20, `runs painted ${runRows.length}`);
  const newest = [...RUNS_FX].sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  assert.equal(runRows[0].name, `runs-row-${newest.run_id}`, 'newest run first');
  // paint order: content-level slots before table row patches
  const keys = Object.keys(v);
  const firstRow = keys.findIndex(k => /-row-/.test(k));
  for (const k of ['crumb-page', 'status-text', 'detail-title', 'detail-body', PIPELINES.name, RUNS.name])
    assert.ok(keys.indexOf(k) < firstRow, `${k} painted before row patches`);
});

test('pipeline select toggles filter; runs table re-derived to only that pipeline; same click again clears it', () => {
  const s0 = loadAll().status;
  const targetPipeline = PIPES_FX[0];
  const expectedFiltered = RUNS_FX.filter(r => r.pipeline === targetPipeline);
  const r1 = go(s0, 'pipelines.click', click('pipelines', `pipelines-row-${targetPipeline}`));
  assert.equal(r1.status.data.pipelineFilter, targetPipeline);
  assert.equal(r1.status.data[PIPELINES.name].sel, targetPipeline);
  assert.deepEqual(r1.status.data[RUNS.name].rows, expectedFiltered);
  assert.deepEqual(r1.effects, [{ emit: 'pipelines.select', payload: { name: targetPipeline } }]);
  const v1 = view(r1.status);
  assert.equal(v1['detail-title'], `Pipeline: ${targetPipeline}`);
  assert.ok(v1['status-text'].includes(`filtered: ${targetPipeline}`), v1['status-text']);
  assert.equal(v1['detail-body'][0].children[1].content, String(expectedFiltered.length));

  // same pipeline clicked again -> filter clears, runs table back to full list
  const r2 = go(r1.status, 'pipelines.click', click('pipelines', `pipelines-row-${targetPipeline}`));
  assert.equal(r2.status.data.pipelineFilter, null);
  assert.equal(r2.status.data[PIPELINES.name].sel, null);
  assert.equal(r2.status.data[RUNS.name].rows.length, RUNS_FX.length);
  const v2 = view(r2.status);
  assert.equal(v2['detail-title'], 'Pipelines');
  assert.ok(!v2['status-text'].includes('filtered:'), v2['status-text']);

  // a different pipeline clicked -> filter switches directly, no clear step
  const other = PIPES_FX[1];
  const r3 = go(r1.status, 'pipelines.click', click('pipelines', `pipelines-row-${other}`));
  assert.equal(r3.status.data.pipelineFilter, other);
  assert.deepEqual(r3.status.data[RUNS.name].rows, RUNS_FX.filter(r => r.pipeline === other));
});

test('start a run: needs a pipeline selected AND a record id, else no-op', () => {
  const s0 = loadAll().status;
  assert.deepEqual(go(s0, 'btn-start-run.click'), { status: s0, effects: [] }, 'no pipeline selected');
  const selected = go(s0, 'pipelines.click', click('pipelines', `pipelines-row-${PIPES_FX[0]}`)).status;
  assert.deepEqual(go(selected, 'btn-start-run.click'), { status: selected, effects: [] }, 'no record id typed yet');
  const typed = go(selected, 'start-record-id.input', { value: '  ' }).status;   // blank after trim
  assert.deepEqual(go(typed, 'btn-start-run.click'), { status: typed, effects: [] }, 'blank record id');
});

test('start a run, local-optimistic (urls.startRun null): emits run.open, resets the field', () => {
  const s0 = loadAll().status;
  let s = go(s0, 'pipelines.click', click('pipelines', `pipelines-row-${PIPES_FX[0]}`)).status;
  s = go(s, 'start-record-id.input', { value: '21_67' }).status;
  assert.equal(s.data.recordId, '21_67');
  const r = go(s, 'btn-start-run.click');
  assert.deepEqual(r.effects, [{ emit: 'run.open', payload: { run_id: `${PIPES_FX[0]}-21_67` } }]);
  assert.equal(r.status.data.recordId, '', 'field cleared');
  assert.equal(r.status.data.starting, false);
});

test('start a run, real backend (urls.startRun configured): POST fetch, then start.saved emits run.open', () => {
  const urls = { startRun: (pipeline) => `/api/pipelines/${pipeline}/runs` };
  const h = makeHandlers(urls);
  const goH = (s, trigger, payload) => step(M, s, trigger, payload, h);
  const s0 = loadAll().status;
  let s = goH(s0, 'pipelines.click', click('pipelines', `pipelines-row-${PIPES_FX[0]}`)).status;
  s = goH(s, 'start-record-id.input', { value: '21_67' }).status;
  const r1 = goH(s, 'btn-start-run.click');
  assert.equal(r1.status.data.starting, true);
  assert.deepEqual(r1.effects, [{
    fetch: `/api/pipelines/${PIPES_FX[0]}/runs`,
    init: { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record_ids: ['21_67'], initial_inputs: {} }) },
    ok: 'start.saved', err: 'start.failed',
  }]);
  assert.deepEqual(goH(r1.status, 'btn-start-run.click'), { status: r1.status, effects: [] }, 'already starting -- no double POST');
  const r2 = goH(r1.status, 'start.saved', { run_id: 'r-999' });
  assert.deepEqual(r2.effects, [{ emit: 'run.open', payload: { run_id: 'r-999' } }]);
  assert.equal(r2.status.data.starting, false);
  assert.equal(r2.status.data.recordId, '');
  const r3 = goH(r1.status, 'start.failed', { error: 'HTTP 500' });
  assert.equal(r3.status.data.starting, false);
  assert.equal(r3.status.data.startError, 'HTTP 500');
});

test('runs table row click: effects include emit runs.select AND emit run.open with the run_id, no local sel/detail state added', () => {
  const s0 = loadAll().status;
  const target = RUNS_FX[0];
  const r = go(s0, 'runs.click', click('runs', `runs-row-${target.run_id}`));
  assert.equal(r.status.state, 'ready');
  assert.deepEqual(r.effects, [
    { emit: 'runs.select', payload: target },
    { emit: 'run.open', payload: { run_id: target.run_id } },
  ]);
  // table's own sel still updates (highlight), but no dashboard-style data.sel exists on this screen
  assert.equal(r.status.data[RUNS.name].sel, target.run_id);
  assert.equal(r.status.data.sel, undefined);
});

test('failed -> error: status-text, Retry in pipelines, runs empty; retry re-issues 2 fetches', () => {
  let r = go(start().status, 'runs.loaded', RUNS_FX);
  r = go(r.status, 'pipelines.failed', { error: 'HTTP 500' });
  assert.equal(r.status.state, 'error');
  assert.equal(r.status.data.error, 'HTTP 500');
  assert.deepEqual(r.effects, []);
  const v = view(r.status);
  assert.equal(v['status-text'], 'failed: HTTP 500');
  assert.deepEqual(v[PIPELINES.name], { content: [{ name: 'btn-retry', box: 'row, mid, packed, pad:2, solid, rounded', content: 'Retry' }], state: '' });
  assert.deepEqual(v['btn-retry'], { state: 'error' });
  assert.deepEqual(v[RUNS.name], { content: [], state: '' });
  assert.deepEqual(go(r.status, 'pipelines.loaded', PIPES_FX), { status: r.status, effects: [] }, 'late result inert in error');
  r = go(r.status, 'btn-retry.click');
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, FETCHES);
  assert.deepEqual(r.status.data.loaded, { pipelines: false, runs: false });
  assert.equal(r.status.data.error, null);
  assert.equal(view(r.status)['status-text'], 'loading…');
});

test('refresh from ready -> loading with 2 fetches, flags reset, pipelineFilter kept', () => {
  let s = go(loadAll().status, 'pipelines.click', click('pipelines', `pipelines-row-${PIPES_FX[0]}`)).status;
  const r = go(s, 'btn-refresh.click');
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, FETCHES);
  assert.deepEqual(r.status.data.loaded, { pipelines: false, runs: false });
  assert.equal(r.status.data.error, null);
  assert.equal(r.status.data.pipelineFilter, PIPES_FX[0], 'filter survives a refresh');
  const back = drive(go(r.status, 'pipelines.loaded', PIPES_FX).status, 'runs.loaded', RUNS_FX);
  assert.equal(back.status.state, 'ready');
  // filter re-applied to the freshly loaded runs
  assert.deepEqual(back.status.data[RUNS.name].rows, RUNS_FX.filter(x => x.pipeline === PIPES_FX[0]));
});

test('nav click emits nav.go with the target; theme click emits theme.toggle; both stay ready', () => {
  const s = loadAll().status;
  for (const to of ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'settings']) {
    const r = go(s, `nav-${to}.click`, click(`nav-${to}`));
    assert.equal(r.status.state, 'ready');
    assert.deepEqual(r.effects, [{ emit: 'nav.go', payload: { to } }]);
  }
  assert.deepEqual(go(s, 'btn-theme.click').effects, [{ emit: 'theme.toggle' }]);
  assert.deepEqual(go(start().status, 'nav-pipelines.click'), { status: start().status, effects: [] }, 'inert while loading');
});

test('unknown trigger throws (C2); table handlers keyed by spec names', () => {
  assert.throws(() => go(loadAll().status, 'btn-primary.click'), /unknown trigger/);
  for (const k of ['pipelines.click', 'pipelines.scroll', 'runs.click', 'runs.scroll']) assert.equal(typeof handlers[k], 'function', k);
});
