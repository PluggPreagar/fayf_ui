import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { init, step, validateMachine } from '../../ui/machine.js';
import { browseMachine, handlers, view, initialData, TREE, detailBody } from '../../ui/browse.js';

// The browse (files explorer) flow as JSON in, JSON out (C11): machines/browse.json
// + pure handlers + pure view, on the shipped fixtures. No DOM.
const fixture = (rel) => JSON.parse(readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf-8'));
const MOUNTS_FX = fixture('content/browse/mounts.json');
const RUNS_LEVEL = fixture('content/browse/level/runs.json');
const RUN1_LEVEL = fixture('content/browse/level/runs/run-2026-09-01.json');
const LOGS_LEVEL = fixture('content/browse/level/runs/run-2026-09-01/logs.json');
const RESULT_FILE = fixture('content/browse/file/runs/run-2026-09-01/result.json.json');
const M = browseMachine;
const MOUNTS_FETCH = { fetch: '/content/browse/mounts.json', ok: 'mounts.loaded', err: 'mounts.failed' };
const go = (s, trigger, payload) => step(M, s, trigger, payload, handlers);
const start = () => init(M, initialData());
const loaded = () => go(start().status, 'mounts.loaded', MOUNTS_FX).status;
const nodeName = (path) => `tree-node-${encodeURIComponent(path)}`;
const click = (path, ...rest) => ({ name: 'tree', event: 'click', target: nodeName(path), path: [nodeName(path), ...rest, 'tree', 'root'] });

test('machines/browse.json validates; JSON round-trip identical', () => {
  assert.equal(validateMachine(M), M);
  assert.deepEqual(JSON.parse(JSON.stringify(M)), M);
  assert.deepEqual(JSON.parse(readFileSync(new URL('../../machines/browse.json', import.meta.url), 'utf-8')), M);
});

test('fixtures: mounts shape, level fixtures have entries', () => {
  for (const m of MOUNTS_FX) assert.deepEqual(Object.keys(m).sort(), ['label', 'name', 'write']);
  assert.ok(RUNS_LEVEL.entries.length >= 2);
  assert.ok(RUN1_LEVEL.entries.some(e => e.type === 'dir'), 'run-2026-09-01 has a nested dir (logs) -- exercises 3-level recursion');
});

test('init -> loading with 1 fetch effect (mounts); tree empty', () => {
  const { status, effects } = start();
  assert.equal(status.state, 'loading');
  assert.deepEqual(effects, [MOUNTS_FETCH]);
  assert.deepEqual(status.data[TREE.name].nodes, []);
  assert.equal(status.data.detail, null);
  assert.equal(status.data.error, null);
});

test('view in loading: status-text "loading…", tree empty + loading token', () => {
  const v = view(start().status);
  assert.equal(v['status-text'], 'loading…');
  assert.equal(v['crumb-page'], 'Browse');
  assert.equal(v['detail-title'], 'No file open');
  assert.equal(v['detail-body'], 'Select a file');
  assert.deepEqual(v[TREE.name], { content: [], state: 'loading' });
});

test('mounts.loaded: tree populated with one root per mount, transitions to ready', () => {
  const r = go(start().status, 'mounts.loaded', MOUNTS_FX);
  assert.equal(r.status.state, 'ready');
  assert.deepEqual(r.effects, []);
  assert.equal(r.status.data[TREE.name].nodes.length, MOUNTS_FX.length);
  assert.deepEqual(r.status.data[TREE.name].nodes.map(n => n.path), MOUNTS_FX.map(m => m.name));
});

test('view in ready: status-text "<n> mounts"', () => {
  const v = view(loaded());
  assert.equal(v['status-text'], `${MOUNTS_FX.length} mounts`);
});

test('expanding a mount root: toggles open + issues exactly one level.loaded-bound fetch, sets pendingPath', () => {
  const s0 = loaded();
  const r = go(s0, 'tree.click', click('runs'));
  const t = r.status.data[TREE.name];
  assert.equal(t.nodes.find(n => n.path === 'runs').open, true);
  assert.equal(t.pendingPath, 'runs');
  assert.deepEqual(r.effects, [{ fetch: '/content/browse/level/runs.json', ok: 'level.loaded', err: 'level.failed' }]);
});

test('expanding a SECOND unexpanded dir while the first is pending: toggles open, NO second fetch', () => {
  const s0 = loaded();
  const r1 = go(s0, 'tree.click', click('runs'));
  assert.equal(r1.status.data[TREE.name].pendingPath, 'runs');
  const r2 = go(r1.status, 'tree.click', click('backend'));
  assert.equal(r2.status.data[TREE.name].nodes.find(n => n.path === 'backend').open, true, 'still visibly opened');
  assert.equal(r2.status.data[TREE.name].pendingPath, 'runs', 'pendingPath unchanged -- no 2nd fetch started');
  assert.deepEqual(r2.effects, [], 'no fetch effect for the second click');
});

test('level.loaded splices children at the right node (2+ levels deep) and clears pendingPath', () => {
  let s = go(loaded(), 'tree.click', click('runs')).status;
  s = go(s, 'level.loaded', RUNS_LEVEL).status;
  let t = s.data[TREE.name];
  assert.equal(t.pendingPath, null);
  const run1 = t.nodes.find(n => n.path === 'runs').children.find(n => n.path === 'runs/run-2026-09-01');
  assert.ok(run1, 'entries mapped to runs/<name> paths');
  assert.equal(run1.kind, 'dir');
  assert.equal(run1.children, null, 'not fetched yet');

  // expand it -- level 2
  s = go(s, 'tree.click', click('runs/run-2026-09-01')).status;
  assert.equal(s.data[TREE.name].pendingPath, 'runs/run-2026-09-01');
  s = go(s, 'level.loaded', RUN1_LEVEL).status;
  t = s.data[TREE.name];
  const run1After = t.nodes.find(n => n.path === 'runs').children.find(n => n.path === 'runs/run-2026-09-01');
  const logs = run1After.children.find(n => n.path === 'runs/run-2026-09-01/logs');
  assert.ok(logs, 'level 2 spliced under the level-1 node');
  assert.equal(logs.kind, 'dir');
  assert.equal(t.pendingPath, null);

  // expand it -- level 3
  s = go(s, 'tree.click', click('runs/run-2026-09-01/logs')).status;
  assert.equal(s.data[TREE.name].pendingPath, 'runs/run-2026-09-01/logs');
  s = go(s, 'level.loaded', LOGS_LEVEL).status;
  t = s.data[TREE.name];
  const logsAfter = t.nodes.find(n => n.path === 'runs').children.find(n => n.path === 'runs/run-2026-09-01').children.find(n => n.path === 'runs/run-2026-09-01/logs');
  assert.deepEqual(logsAfter.children.map(n => n.path).sort(), ['runs/run-2026-09-01/logs/stderr.log', 'runs/run-2026-09-01/logs/stdout.log'], 'level 3 -- proves real recursion, not just one level');
});

test('level.failed: sets error on the pending node, clears pendingPath, loading', () => {
  let s = go(loaded(), 'tree.click', click('runs')).status;
  s = go(s, 'level.failed', { error: 'HTTP 500' }).status;
  const t = s.data[TREE.name];
  assert.equal(t.pendingPath, null);
  const runs = t.nodes.find(n => n.path === 'runs');
  assert.equal(runs.error, 'HTTP 500');
  assert.equal(runs.loading, false);
});

test('clicking a file: issues a file.loaded-bound fetch, does NOT touch pendingPath, sets detailLoading', () => {
  let s = go(loaded(), 'tree.click', click('runs')).status;
  s = go(s, 'level.loaded', RUNS_LEVEL).status;
  const r = go(s, 'tree.click', click('runs/README.md'));
  assert.deepEqual(r.effects, [
    { emit: 'tree.select', payload: r.status.data[TREE.name].nodes.find(n => n.path === 'runs').children.find(n => n.path === 'runs/README.md') },
    { fetch: '/content/browse/file/runs/README.md.json', ok: 'file.loaded', err: 'file.failed' },
  ]);
  assert.equal(r.status.data[TREE.name].pendingPath, null, 'a file click never sets pendingPath');
  assert.equal(r.status.data.detail, null);
  assert.equal(r.status.data.detailLoading, true);
  assert.equal(r.status.data[TREE.name].sel, 'runs/README.md');
});

test('file.loaded: data.detail set, detailLoading cleared; view shows the selected path as detail-title, pretty JSON as detail-body', () => {
  let s = go(loaded(), 'tree.click', click('runs')).status;
  s = go(s, 'level.loaded', RUNS_LEVEL).status;
  s = go(s, 'tree.click', click('runs/README.md')).status;   // a file click -- sets tree.sel, unlike a dir click
  assert.equal(s.data[TREE.name].sel, 'runs/README.md');
  const r = go(s, 'file.loaded', RESULT_FILE);
  assert.deepEqual(r.status.data.detail, RESULT_FILE);
  assert.equal(r.status.data.detailLoading, false);
  const v = view(r.status);
  assert.equal(v['detail-title'], 'runs/README.md', 'shows the selected node path (tree.sel), not something from the file payload');
  const body = detailBody(RESULT_FILE);
  assert.ok(body.length > 1, 'multi-line JSON -> multiple rows, not one blob');
  assert.equal(body[0].content, '{');
  assert.ok(body.some(row => row.content.startsWith('  ')), 'indented line uses NBSP, not a plain leading space');
});

test('detailBody: non-JSON passes through as-is, split into lines; invalid JSON falls back to raw', () => {
  const text = detailBody({ format: 'text', content: 'line1\n  line2\n' });
  assert.deepEqual(text.map(row => row.content), ['line1', '  line2', '']);
  const bad = detailBody({ format: 'json', content: 'not json' });
  assert.deepEqual(bad.map(row => row.content), ['not json']);
});

test('detailBody: caps at 500 lines with a trailing truncated row', () => {
  const content = Array.from({ length: 520 }, (_, i) => `line ${i}`).join('\n');
  const body = detailBody({ format: 'text', content });
  assert.equal(body.length, 501);
  assert.equal(body.at(-1).content, '… truncated');
});

test('file.failed: detailLoading cleared, error set', () => {
  const s0 = loaded();
  const r = go(s0, 'file.failed', { error: 'HTTP 404' });
  assert.equal(r.status.data.detailLoading, false);
  assert.equal(r.status.data.error, 'HTTP 404');
});

test('mounts.failed -> error; retry re-issues the mounts fetch', () => {
  let r = go(start().status, 'mounts.failed', { error: 'HTTP 500' });
  assert.equal(r.status.state, 'error');
  assert.equal(r.status.data.error, 'HTTP 500');
  const v = view(r.status);
  assert.equal(v['status-text'], 'failed: HTTP 500');
  assert.deepEqual(v[TREE.name], { content: [{ name: 'btn-retry', box: 'row, mid, packed, pad:2, solid, rounded', content: 'Retry' }], state: '' });
  assert.deepEqual(v['btn-retry'], { state: 'error' });
  r = go(r.status, 'btn-retry.click');
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, [MOUNTS_FETCH]);
  assert.equal(r.status.data.error, null);
});

test('refresh from ready -> loading with 1 fetch; error cleared', () => {
  const r = go(loaded(), 'btn-refresh.click');
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, [MOUNTS_FETCH]);
  assert.equal(r.status.data.error, null);
});

test('nav click emits nav.go with the target; theme click emits theme.toggle', () => {
  const s = loaded();
  for (const to of ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'settings']) {
    const r = go(s, `nav-${to}.click`, click(`nav-${to}`));
    assert.equal(r.status.state, 'ready');
    assert.deepEqual(r.effects, [{ emit: 'nav.go', payload: { to } }]);
  }
  assert.deepEqual(go(s, 'btn-theme.click').effects, [{ emit: 'theme.toggle' }]);
});

test('unknown trigger throws (C2); tree handler keyed by tree.click', () => {
  assert.throws(() => go(loaded(), 'tile-running.click'), /unknown trigger/);
  assert.equal(typeof handlers['tree.click'], 'function');
});
