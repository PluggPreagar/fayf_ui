import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { init, step, validateMachine } from '../../ui/machine.js';
import {
  queryMachine, handlers, makeHandlers, view, initialData, deriveColumns, cellText,
  EXAMPLES, RUN_PICKER, FIXTURE_URLS,
} from '../../ui/query.js';

// The query (raw FQL) flow as JSON in, JSON out (C11): machines/query.json +
// pure handlers + pure view, on the shipped fixtures. No DOM. ONE machine
// state (`ready`) -- no loading/error split, mirrors the ground truth's own
// tolerance (a failed runs fetch just keeps the page usable; a query error
// is data, not a page mode).
const fixture = (rel) => JSON.parse(readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf-8'));
const RUNS_FX = fixture('content/query/runs.json');
const GROUPED_FX = fixture('content/query/result-0.json');   // EXAMPLES[0] "reactions by party"
const FLAT_FX = fixture('content/query/result-2.json');       // EXAMPLES[2] "who heckled"
const M = queryMachine;
const RUNS_FETCH = { fetch: '/content/query/runs.json', ok: 'runs.loaded', err: 'runs.failed' };
const go = (s, trigger, payload) => step(M, s, trigger, payload, handlers);
const start = () => init(M, initialData());
const loaded = () => go(start().status, 'runs.loaded', RUNS_FX).status;
const click = (name, ...path) => ({ name, event: 'click', target: path[0] ?? name, path: [...path, name, 'content', 'body', 'root'] });
const pickRun = (s, runId) => go(s, `${RUN_PICKER}.click`, click(RUN_PICKER, `${RUN_PICKER}-${runId}`)).status;
const clickExample = (s, i) => go(s, 'example.click', click('example', `example-${i}`));

test('machines/query.json validates; JSON round-trip identical', () => {
  assert.equal(validateMachine(M), M);
  assert.deepEqual(JSON.parse(JSON.stringify(M)), M);
  assert.deepEqual(JSON.parse(readFileSync(new URL('../../machines/query.json', import.meta.url), 'utf-8')), M);
  assert.equal(M.initial, 'ready', 'one state only -- no loading/error split (ground truth parity)');
  assert.equal(Object.keys(M.states).length, 1);
});

test('runs fixture shape: run_id/pipeline/status', () => {
  for (const r of RUNS_FX) assert.deepEqual(Object.keys(r).sort(), ['pipeline', 'run_id', 'status']);
  assert.ok(RUNS_FX.length >= 5, `runs ${RUNS_FX.length}`);
});

test('init -> ready with 1 fetch effect (runs); q seeded to first example, nothing run yet', () => {
  const { status, effects } = start();
  assert.equal(status.state, 'ready');
  assert.deepEqual(effects, [RUNS_FETCH]);
  assert.deepEqual(status.data.runs, []);
  assert.equal(status.data.run, '');
  assert.equal(status.data.q, EXAMPLES[0].q);
  assert.equal(status.data.running, false);
  assert.equal(status.data.error, null);
  assert.equal(status.data.result, null);
  assert.equal(status.data.resultsSpec, null);
  assert.equal(status.data.results, null);
});

test('view before any query: prompt string, run-picker/examples chips, btn-run enabled', () => {
  const v = view(start().status);
  assert.equal(v['crumb-page'], 'Query');
  assert.equal(v['status-text'], 'Enter an FQL query and run it.');
  assert.equal(v['fql-row'].content[0].name, 'fql');
  assert.equal(v['fql-row'].content[0].content, EXAMPLES[0].q);
  assert.equal(v['btn-run'].content, 'Run query');
  assert.equal(v['btn-run'].state, 'actionable');
  assert.equal(v['results'], 'No query run yet.');
  assert.equal(v['example'].content.length, EXAMPLES.length);
  assert.deepEqual(v['example-0'], { state: 'selected' }, 'q === EXAMPLES[0].q by default');
  assert.deepEqual(v['example-1'], { state: 'actionable' });
});

test('runs.loaded stores the array; runs.failed tolerated silently -- no page-level error, stays ready', () => {
  const ok = go(start().status, 'runs.loaded', RUNS_FX);
  assert.equal(ok.status.state, 'ready');
  assert.deepEqual(ok.status.data.runs, RUNS_FX);
  const failed = go(start().status, 'runs.failed', { error: 'HTTP 500' });
  assert.equal(failed.status.state, 'ready');
  assert.deepEqual(failed.status.data.runs, []);
  assert.equal(failed.status.data.error, null, 'a runs-list failure is NOT a page-level error (ground truth parity)');
  assert.deepEqual(failed.effects, []);
});

test('run-picker: single-select -- clicking a run selects it, clicking it again clears, clicking another replaces', () => {
  const s0 = loaded();
  const [a, b] = RUNS_FX;
  const s1 = pickRun(s0, a.run_id);
  assert.equal(s1.data.run, a.run_id);
  assert.deepEqual(view(s1)[`${RUN_PICKER}-${a.run_id}`], { state: 'selected' });
  assert.deepEqual(view(s1)[`${RUN_PICKER}-${b.run_id}`], { state: 'actionable' });
  const s2 = pickRun(s1, a.run_id);
  assert.equal(s2.data.run, '', 'clicking the selected run again clears it');
  const s3 = pickRun(pickRun(s0, a.run_id), b.run_id);
  assert.equal(s3.data.run, b.run_id, 'clicking a different run replaces, not adds');
  assert.deepEqual(go(s0, `${RUN_PICKER}.click`, click(RUN_PICKER)), { status: s0, effects: [] }, 'no run-picker-<id> in path -- no-op');
});

test('example click: sets data.q to that example AND issues exactly one query fetch (ground truth parity)', () => {
  const s0 = loaded();
  const r = clickExample(s0, 2);
  assert.equal(r.status.data.q, EXAMPLES[2].q);
  assert.equal(r.status.data.running, true);
  assert.deepEqual(r.effects, [{ fetch: FIXTURE_URLS.query(EXAMPLES[2].q, ''), ok: 'query.loaded', err: 'query.failed' }]);
  assert.deepEqual(view(r.status)['example-2'], { state: 'selected' });
  assert.deepEqual(view(r.status)['example-0'], { state: 'actionable' });
  assert.deepEqual(clickExample(s0, 99), { status: s0, effects: [] }, 'unknown example index -- no-op');
});

test('fql.input: updates data.q only, no fetch, no state change', () => {
  const s0 = loaded();
  const r = go(s0, 'fql.input', { value: 'claims[subject] > subject' });
  assert.equal(r.status.data.q, 'claims[subject] > subject');
  assert.deepEqual(r.effects, []);
  assert.equal(r.status.state, 'ready');
});

test('btn-run: blank query (incl. whitespace-only) no-ops, no fetch', () => {
  const s0 = go(loaded(), 'fql.input', { value: '   ' }).status;
  assert.deepEqual(go(s0, 'btn-run.click'), { status: s0, effects: [] });
  const empty = go(loaded(), 'fql.input', { value: '' }).status;
  assert.deepEqual(go(empty, 'btn-run.click'), { status: empty, effects: [] });
});

test('btn-run: issues the right fetch URL -- q always, run only when one is picked', () => {
  const urls = { runs: '/content/query/runs.json',
    query: (q, run) => '/api/query?q=' + encodeURIComponent(q) + (run ? '&run=' + encodeURIComponent(run) : '') };
  const h = makeHandlers(urls);
  const goH = (s, trigger, payload) => step(M, s, trigger, payload, h);
  const s0 = loaded();
  const r1 = goH(s0, 'btn-run.click');
  assert.equal(r1.status.data.running, true);
  assert.deepEqual(r1.effects, [{ fetch: `/api/query?q=${encodeURIComponent(EXAMPLES[0].q)}`, ok: 'query.loaded', err: 'query.failed' }]);
  assert.deepEqual(goH(r1.status, 'btn-run.click'), { status: r1.status, effects: [] }, 'already running -- no double fetch');

  const withRun = pickRun(s0, RUNS_FX[0].run_id);
  const r2 = goH(withRun, 'btn-run.click');
  assert.deepEqual(r2.effects, [{
    fetch: `/api/query?q=${encodeURIComponent(EXAMPLES[0].q)}&run=${encodeURIComponent(RUNS_FX[0].run_id)}`,
    ok: 'query.loaded', err: 'query.failed',
  }]);
});

test('query.loaded (grouped result): builds a dynamic table spec + synthetic-__i rows, running cleared', () => {
  const s0 = go(loaded(), 'btn-run.click').status;
  const r = go(s0, 'query.loaded', GROUPED_FX);
  assert.equal(r.status.data.running, false);
  assert.equal(r.status.data.error, null);
  assert.deepEqual(r.status.data.result, GROUPED_FX);
  assert.deepEqual(r.status.data.resultsSpec, {
    name: 'results', rowKey: '__i',
    columns: GROUPED_FX.columns.map(c => ({ key: c, label: c })),
  });
  assert.deepEqual(r.status.data.results.rows, GROUPED_FX.rows.map((row, i) => ({ __i: i, party: row.party, count: cellText(row.count) })));
  const v = view(r.status);
  assert.equal(v['status-text'], `${GROUPED_FX.rows.length} groups · ${GROUPED_FX.total} rows`);
  assert.equal(v['results'].content[0].name, 'results-head');
});

test('query.loaded (flat result, no explicit columns): deriveColumns from row keys; a wide text column renders as any other', () => {
  const noColumns = { rows: FLAT_FX.rows, total: FLAT_FX.total };   // strip columns to exercise deriveColumns
  const r = go(go(loaded(), 'btn-run.click').status, 'query.loaded', noColumns);
  assert.deepEqual(r.status.data.resultsSpec.columns.map(c => c.key), deriveColumns(FLAT_FX.rows));
  assert.ok(r.status.data.resultsSpec.columns.every(c => c.w === undefined), 'every column equal/fill width (no per-column w)');
  const v = view(r.status);
  assert.equal(v['status-text'], `${FLAT_FX.total} matches`);
});

test('query.loaded with payload.error: treated as a failure, not a crash -- result cleared, error set', () => {
  const s0 = go(loaded(), 'btn-run.click').status;
  const r = go(s0, 'query.loaded', { error: 'syntax error near "> >"' });
  assert.equal(r.status.data.error, 'syntax error near "> >"');
  assert.equal(r.status.data.result, null);
  assert.equal(r.status.data.running, false);
  assert.equal(r.status.data.resultsSpec, null, 'no dynamic spec built for an error payload');
  assert.equal(view(r.status)['results'], 'syntax error near "> >"');
});

test('query.failed: running cleared, error set from payload', () => {
  const s0 = go(loaded(), 'btn-run.click').status;
  const r = go(s0, 'query.failed', { error: 'HTTP 404' });
  assert.equal(r.status.data.running, false);
  assert.equal(r.status.data.error, 'HTTP 404');
  assert.equal(view(r.status)['status-text'], 'HTTP 404');
});

test('FIXTURE_URLS.query: run tacked on as a harmless ?run= suffix -- static file server ignores it, same fixture either way', () => {
  assert.equal(FIXTURE_URLS.query(EXAMPLES[0].q, ''), '/content/query/result-0.json');
  assert.equal(FIXTURE_URLS.query(EXAMPLES[0].q, 'r-0008'), '/content/query/result-0.json?run=r-0008');
});

test('a free-typed query with no matching fixture -- FIXTURE_URLS.query falls back to a path this repo does not ship (clean 404 -> query.failed, no crash)', () => {
  const s0 = go(loaded(), 'fql.input', { value: 'reactions[foo] > foo' }).status;
  const r = go(s0, 'btn-run.click');
  assert.deepEqual(r.effects, [{ fetch: '/content/query/result-none.json', ok: 'query.loaded', err: 'query.failed' }]);
});

test('results.click/results.scroll: no-op before any query has run (resultsSpec null); routes to the dynamic spec once one exists', () => {
  const s0 = loaded();
  assert.deepEqual(go(s0, 'results.click', click('results', 'results-col-party')), { status: s0, effects: [] });
  assert.deepEqual(go(s0, 'results.scroll', { name: 'results', event: 'scroll', scrollTop: 0, clientHeight: 200 }), { status: s0, effects: [] });
  const withResult = go(go(loaded(), 'btn-run.click').status, 'query.loaded', GROUPED_FX).status;
  const sorted = go(withResult, 'results.click', click('results', 'results-col-count'));
  assert.deepEqual(sorted.status.data.results.sort, { key: 'count', dir: 'asc' });
  const scrolled = go(withResult, 'results.scroll', { name: 'results', event: 'scroll', scrollTop: 40, clientHeight: 200 });
  assert.deepEqual(scrolled.status.data.results.window, { scrollTop: 40, clientHeight: 200 });
});

test('refresh re-issues the runs fetch only, stays ready', () => {
  const s0 = pickRun(loaded(), RUNS_FX[0].run_id);
  const r = go(s0, 'btn-refresh.click');
  assert.equal(r.status.state, 'ready');
  assert.deepEqual(r.effects, [RUNS_FETCH]);
  assert.deepEqual(r.status, s0, 'no data change -- effect only, the fetch result itself updates data.runs');
});

test('nav click emits nav.go with the target; theme click emits theme.toggle; both stay ready', () => {
  const s = loaded();
  for (const to of ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'settings']) {
    const r = go(s, `nav-${to}.click`, click(`nav-${to}`));
    assert.equal(r.status.state, 'ready');
    assert.deepEqual(r.effects, [{ emit: 'nav.go', payload: { to } }]);
  }
  assert.deepEqual(go(s, 'btn-theme.click', click('btn-theme')).effects, [{ emit: 'theme.toggle' }]);
});

test('unknown trigger throws (C2); handlers keyed for every machine trigger', () => {
  assert.throws(() => go(loaded(), 'btn-primary.click'), /unknown trigger/);
  for (const k of ['runs.loaded', 'runs.failed', 'run-picker.click', 'example.click', 'fql.input',
    'btn-run.click', 'query.loaded', 'query.failed', 'results.click', 'results.scroll',
    'btn-refresh.click', 'btn-theme.click', 'nav-dashboard.click'])
    assert.equal(typeof handlers[k], 'function', k);
});
