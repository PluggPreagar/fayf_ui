import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { init, step, validateMachine } from '../../ui/machine.js';
import { runMachine, handlers, makeHandlers, view, initialData, STEPS, FIXTURE_URLS, FIXTURE_RUN_ID } from '../../ui/run.js';

// The run (live watch view) flow as JSON in, JSON out (C11): machines/run.json
// + pure handlers + pure view, on the shipped fixtures. No DOM, no real
// EventSource -- `run.event`/`run.streamFailed` are dispatched directly with
// synthetic payloads, exactly like a real stream message would arrive
// (ui/machine.js's own stream effect already JSON.parses each SSE message
// before handing it to the trigger). Mirrors test/node/records_machine_test.js.
const fixture = (rel) => JSON.parse(readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf-8'));
const SNAPSHOT_FX = fixture('content/run/snapshot.json');
const EVENTS_FX = fixture('content/run/events.json');
const M = runMachine;
const SNAPSHOT_FETCH = { fetch: '/content/run/snapshot.json', ok: 'run.loaded', err: 'run.failed' };
const STREAM_EFFECT = { stream: '/content/run/events.json', ok: 'run.event', err: 'run.streamFailed' };
const go = (s, trigger, payload) => step(M, s, trigger, payload, handlers);
const start = () => init(M, initialData(FIXTURE_RUN_ID));
const loaded = () => go(start().status, 'run.loaded', SNAPSHOT_FX).status;

test('machines/run.json validates; JSON round-trip identical', () => {
  assert.equal(validateMachine(M), M);
  assert.deepEqual(JSON.parse(JSON.stringify(M)), M);
  assert.deepEqual(JSON.parse(readFileSync(new URL('../../machines/run.json', import.meta.url), 'utf-8')), M);
});

test('fixtures: snapshot.json shape -- 3 steps; events.json shape -- 4-6 scripted events, run_started..run_finished', () => {
  assert.equal(SNAPSHOT_FX.run.run_id, FIXTURE_RUN_ID);
  assert.equal(Object.keys(SNAPSHOT_FX.steps).length, 3);
  assert.ok(EVENTS_FX.length >= 4 && EVENTS_FX.length <= 6, `events.json has ${EVENTS_FX.length} events`);
  assert.equal(EVENTS_FX[0].type, 'run_started');
  assert.equal(EVENTS_FX.at(-1).type, 'run_finished');
});

test('init -> loading with 1 fetch effect (snapshot); steps table + log empty', () => {
  const { status, effects } = start();
  assert.equal(status.state, 'loading');
  assert.deepEqual(effects, [SNAPSHOT_FETCH]);
  assert.deepEqual(status.data[STEPS.name].rows, []);
  assert.equal(status.data.pipeline, null);
  assert.equal(status.data.status, null);
  assert.deepEqual(status.data.log, []);
  assert.equal(status.data.actioning, null);
  assert.equal(status.data.error, null);
  assert.equal(status.data.runId, FIXTURE_RUN_ID);
});

test('view in loading: status-text "loading…", steps table empty + loading token', () => {
  const v = view(start().status);
  assert.equal(v['status-text'], 'loading…');
  assert.equal(v['crumb-page'], 'Run');
  assert.deepEqual(v[STEPS.name], { content: [], state: 'loading' });
  assert.deepEqual(v['event-log'], []);
});

test('run.loaded: one row per step (mirrors ground truth fillSteps -- records = Object.keys(records).length or records_total or 0); transitions to ready, opens the stream', () => {
  const r = go(start().status, 'run.loaded', SNAPSHOT_FX);
  assert.equal(r.status.state, 'ready');
  assert.deepEqual(r.effects, [STREAM_EFFECT]);
  const rows = r.status.data[STEPS.name].rows;
  assert.deepEqual(rows.map(x => x.step).sort(), ['index', 'ingest', 'nlp-parse']);
  const ingest = rows.find(x => x.step === 'ingest');
  assert.equal(ingest.records, '1', 'records: {21_67:1} -> 1 key');
  assert.equal(ingest.status, '—', 'no explicit status field in the fixture');
  const nlp = rows.find(x => x.step === 'nlp-parse');
  assert.equal(nlp.records, '0', 'records_total: 0');
  const idx = rows.find(x => x.step === 'index');
  assert.equal(idx.records, '0', 'no records/records_total at all -> 0');
  assert.equal(r.status.data.pipeline, SNAPSHOT_FX.run.pipeline);
  assert.equal(r.status.data.status, SNAPSHOT_FX.run.status);
});

test('view in ready: status-text shows pipeline/run/status; pause/resume/cancel reflect the current status (running)', () => {
  const v = view(loaded());
  assert.ok(v['status-text'].includes(SNAPSHOT_FX.run.pipeline), v['status-text']);
  assert.ok(v['status-text'].includes(FIXTURE_RUN_ID), v['status-text']);
  assert.ok(v['status-text'].includes('running'), v['status-text']);
  assert.equal(v['btn-pause'].state, '', 'pause enabled while running');
  assert.equal(v['btn-resume'].state, 'disabled', 'resume disabled while running');
  assert.equal(v['btn-cancel'].state, '', 'cancel enabled while running');
});

test('view button-state guard: paused -> resume/cancel enabled, pause disabled', () => {
  const s = go(loaded(), 'run.event', { type: 'run_paused' }).status;
  const v = view(s);
  assert.equal(v['btn-pause'].state, 'disabled');
  assert.equal(v['btn-resume'].state, '');
  assert.equal(v['btn-cancel'].state, '');
});

test('view button-state guard: any other status (e.g. done) -- all three disabled', () => {
  const s = go(loaded(), 'run.event', { status: 'done' }).status;
  const v = view(s);
  assert.equal(v['btn-pause'].state, 'disabled');
  assert.equal(v['btn-resume'].state, 'disabled');
  assert.equal(v['btn-cancel'].state, 'disabled');
});

test('stream run.event: status updated via EVENT_STATUS_BY_TYPE map, raw JSON appended to the log, stays in ready with no effects', () => {
  const r = go(loaded(), 'run.event', { type: 'run_paused' });
  assert.equal(r.status.state, 'ready');
  assert.equal(r.status.data.status, 'paused');
  assert.deepEqual(r.status.data.log, [JSON.stringify({ type: 'run_paused' })]);
  assert.deepEqual(r.effects, []);
});

test('stream run.event: an explicit payload.status wins over the type map', () => {
  const r = go(loaded(), 'run.event', { status: 'weird-custom', type: 'run_started' });
  assert.equal(r.status.data.status, 'weird-custom');
});

test('stream run.event: neither status nor a known type present -- status left unchanged', () => {
  const s0 = loaded();
  const r = go(s0, 'run.event', { message: 'ingest 1/1' });
  assert.equal(r.status.data.status, s0.data.status);
  assert.deepEqual(r.status.data.log, [JSON.stringify({ message: 'ingest 1/1' })]);
});

test('stream run.event: run_finished adds a snapshot re-fetch effect (urls.snapshot(runId)), stays in ready (self-transition)', () => {
  const r = go(loaded(), 'run.event', { type: 'run_finished' });
  assert.equal(r.status.state, 'ready');
  assert.deepEqual(r.effects, [{ fetch: FIXTURE_URLS.snapshot(FIXTURE_RUN_ID), ok: 'run.loaded', err: 'run.failed' }]);
});

test('run.loaded dispatched again while already in ready (the run_finished re-fetch landing) rebuilds the steps table, no re-opened stream', () => {
  const changed = { run: { pipeline: 'bundestag-unified', status: 'done' }, steps: { ingest: { records_total: 2 } } };
  const r = go(loaded(), 'run.loaded', changed);
  assert.equal(r.status.state, 'ready');
  assert.deepEqual(r.effects, [], 'self-transition -- no re-entry, stream not reopened');
  assert.deepEqual(r.status.data[STEPS.name].rows, [{ step: 'ingest', status: '—', records: '2' }]);
  assert.equal(r.status.data.status, 'done');
});

test('log capped at 200 -- 210 synthetic events pushed through the handler directly, oldest dropped', () => {
  let s = loaded();
  for (let i = 0; i < 210; i++) s = go(s, 'run.event', { n: i }).status;
  assert.equal(s.data.log.length, 200);
  assert.deepEqual(JSON.parse(s.data.log[0]), { n: 10 }, 'oldest 10 entries dropped');
  assert.deepEqual(JSON.parse(s.data.log.at(-1)), { n: 209 });
});

test('run.streamFailed: appends an error line, does not touch status', () => {
  const s0 = loaded();
  const r = go(s0, 'run.streamFailed', { error: 'stream error' });
  assert.equal(r.status.data.status, s0.data.status);
  assert.equal(r.status.data.log.at(-1), '[error] event stream error');
});

test('pause/resume/cancel: each issues the right POST url+init; no-op while another action is in flight', () => {
  const urls = FIXTURE_URLS;
  const h = makeHandlers(urls);
  const goH = (s, trigger, payload) => step(M, s, trigger, payload, h);
  const s = loaded();
  const r1 = goH(s, 'btn-pause.click');
  assert.equal(r1.status.data.actioning, 'pause');
  assert.deepEqual(r1.effects, [{ fetch: urls.action(FIXTURE_RUN_ID, 'pause'), init: { method: 'POST' }, ok: 'action.done', err: 'action.failed' }]);
  assert.deepEqual(goH(r1.status, 'btn-resume.click'), { status: r1.status, effects: [] }, 'no-op: pause already in flight');
  assert.deepEqual(goH(r1.status, 'btn-cancel.click'), { status: r1.status, effects: [] }, 'no-op: pause already in flight');
  const r2 = goH(s, 'btn-resume.click');
  assert.deepEqual(r2.effects, [{ fetch: urls.action(FIXTURE_RUN_ID, 'resume'), init: { method: 'POST' }, ok: 'action.done', err: 'action.failed' }]);
  const r3 = goH(s, 'btn-cancel.click');
  assert.deepEqual(r3.effects, [{ fetch: urls.action(FIXTURE_RUN_ID, 'cancel'), init: { method: 'POST' }, ok: 'action.done', err: 'action.failed' }]);
});

test('action.done: clears actioning, appends "[action] <name>" to the log', () => {
  let s = go(loaded(), 'btn-pause.click').status;
  assert.equal(s.data.actioning, 'pause');
  const r = go(s, 'action.done', { ok: true });
  assert.equal(r.status.data.actioning, null);
  assert.equal(r.status.data.log.at(-1), '[action] pause');
});

test('action.failed: clears actioning, sets error', () => {
  const s = go(loaded(), 'btn-cancel.click').status;
  const r = go(s, 'action.failed', { error: 'HTTP 500' });
  assert.equal(r.status.data.actioning, null);
  assert.equal(r.status.data.error, 'HTTP 500');
});

test('steps table row click: emits steps.select AND records.open with {run_id, step_id}', () => {
  const s = loaded();
  const rowName = `${STEPS.name}-row-ingest`;
  const r = go(s, 'steps.click', { name: STEPS.name, event: 'click', target: rowName, path: [rowName, STEPS.name, 'content', 'body', 'root'] });
  const ingestRow = r.status.data[STEPS.name].rows.find(x => x.step === 'ingest');
  assert.deepEqual(r.effects, [
    { emit: 'steps.select', payload: ingestRow },
    { emit: 'records.open', payload: { run_id: FIXTURE_RUN_ID, step_id: 'ingest' } },
  ]);
  assert.equal(r.status.data[STEPS.name].sel, 'ingest');
});

test('head buttons: btn-view-records emits records.open {run_id}; btn-view-graph emits graph.open {run}', () => {
  const s = loaded();
  assert.deepEqual(go(s, 'btn-view-records.click').effects, [{ emit: 'records.open', payload: { run_id: FIXTURE_RUN_ID } }]);
  assert.deepEqual(go(s, 'btn-view-graph.click').effects, [{ emit: 'graph.open', payload: { run: FIXTURE_RUN_ID } }]);
});

test('nav click emits nav.go with the target; theme click emits theme.toggle', () => {
  const s = loaded();
  for (const to of ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'settings']) {
    const r = go(s, `nav-${to}.click`);
    assert.equal(r.status.state, 'ready');
    assert.deepEqual(r.effects, [{ emit: 'nav.go', payload: { to } }]);
  }
  assert.deepEqual(go(s, 'btn-theme.click').effects, [{ emit: 'theme.toggle' }]);
});

test('refresh from ready -> loading, re-issues the snapshot fetch; error cleared', () => {
  const r = go(loaded(), 'btn-refresh.click');
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, [SNAPSHOT_FETCH]);
  assert.equal(r.status.data.error, null);
});

test('run.failed from loading -> error; retry re-issues the snapshot fetch', () => {
  let r = go(start().status, 'run.failed', { error: 'HTTP 500' });
  assert.equal(r.status.state, 'error');
  assert.equal(r.status.data.error, 'HTTP 500');
  const v = view(r.status);
  assert.equal(v['status-text'], 'failed: HTTP 500');
  assert.deepEqual(v[STEPS.name], { content: [{ name: 'btn-retry', box: 'row, mid, packed, pad:2, solid, rounded', content: 'Retry' }], state: '' });
  assert.deepEqual(v['btn-retry'], { state: 'error' });
  r = go(r.status, 'btn-retry.click');
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, [SNAPSHOT_FETCH]);
  assert.equal(r.status.data.error, null);
});

test('run.failed dispatched while already in ready (a run_finished re-fetch failure) -- stays ready, only data.error set', () => {
  const s0 = loaded();
  const r = go(s0, 'run.failed', { error: 'HTTP 404' });
  assert.equal(r.status.state, 'ready', 'never demoted to the top-level error state');
  assert.equal(r.status.data.error, 'HTTP 404');
  assert.deepEqual(r.status.data[STEPS.name], s0.data[STEPS.name], 'steps table left undisturbed');
});

test('unknown trigger throws (C2); steps handler keyed by steps.click', () => {
  assert.throws(() => go(loaded(), 'nope.click'), /unknown trigger/);
  assert.equal(typeof handlers['steps.click'], 'function');
});
