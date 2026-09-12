import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { init, step, validateMachine } from '../../ui/machine.js';
import { recordsMachine, makeHandlers, handlers, view, initialData, TREE, FIXTURE_RUN_ID } from '../../ui/records.js';
import { detailBody, detailEditor } from '../../ui/browse.js';

// The records (run artefact browser) flow as JSON in, JSON out (C11):
// machines/records.json + pure handlers + pure view, on the shipped
// fixtures. No DOM. Simpler than test/node/browse_machine_test.js -- no
// pendingPath/single-fetch-guard concept, since every node's children are
// already known from the one run-metadata fetch.
const fixture = (rel) => JSON.parse(readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf-8'));
const RUN_FX = fixture('content/records/run.json');
const INGEST_67 = fixture('content/records/artifact/ingest/21_67.json');
const NLP_67 = fixture('content/records/artifact/nlp-parse/21_67.json');
const M = recordsMachine;
const RUN_FETCH = { fetch: '/content/records/run.json', ok: 'run.loaded', err: 'run.failed' };
const go = (s, trigger, payload) => step(M, s, trigger, payload, handlers);
const start = () => init(M, initialData(FIXTURE_RUN_ID));
const loaded = () => go(start().status, 'run.loaded', RUN_FX).status;
const nodeName = (path) => `tree-node-${encodeURIComponent(path)}`;
const click = (path, ...rest) => ({ name: 'tree', event: 'click', target: nodeName(path), path: [nodeName(path), ...rest, 'tree', 'root'] });
const editTextFor = (detail) => detailBody({ format: 'json', content: JSON.stringify(detail.value) });

test('machines/records.json validates; JSON round-trip identical', () => {
  assert.equal(validateMachine(M), M);
  assert.deepEqual(JSON.parse(JSON.stringify(M)), M);
  assert.deepEqual(JSON.parse(readFileSync(new URL('../../machines/records.json', import.meta.url), 'utf-8')), M);
});

test('fixtures: run.json shape -- 3 steps, 3 record_ids', () => {
  assert.equal(RUN_FX.run.run_id, FIXTURE_RUN_ID);
  assert.equal(Object.keys(RUN_FX.steps).length, 3);
  assert.equal(RUN_FX.run.record_ids.length, 3);
});

test('init -> loading with 1 fetch effect (run.json); tree empty', () => {
  const { status, effects } = start();
  assert.equal(status.state, 'loading');
  assert.deepEqual(effects, [RUN_FETCH]);
  assert.deepEqual(status.data[TREE.name].nodes, []);
  assert.equal(status.data.runMeta, null);
  assert.equal(status.data.detail, null);
  assert.equal(status.data.error, null);
  assert.equal(status.data.runId, FIXTURE_RUN_ID);
  assert.equal(status.data.editText, '');
  assert.equal(status.data.saveMsg, '');
});

test('view in loading: status-text "loading…", tree empty + loading token', () => {
  const v = view(start().status);
  assert.equal(v['status-text'], 'loading…');
  assert.equal(v['crumb-page'], 'Records');
  assert.equal(v['detail-title'], 'Select a record');
  assert.deepEqual(v['detail-body'], { content: 'Select a record' });
  assert.deepEqual(v['btn-save'], { state: 'disabled' });
  assert.deepEqual(v[TREE.name], { content: [], state: 'loading' });
});

test('run.loaded: 3 step nodes, each with its 3 record children ALREADY populated (never null); transitions to ready', () => {
  const r = go(start().status, 'run.loaded', RUN_FX);
  assert.equal(r.status.state, 'ready');
  assert.deepEqual(r.effects, []);
  const t = r.status.data[TREE.name];
  assert.equal(t.nodes.length, 3);
  assert.deepEqual(t.nodes.map(n => n.path).sort(), ['index', 'ingest', 'nlp-parse']);
  for (const step of t.nodes) {
    assert.equal(step.kind, 'dir');
    assert.equal(step.open, false);
    assert.ok(Array.isArray(step.children), `${step.path}: children already populated, not null`);
    assert.equal(step.children.length, 3);
    assert.deepEqual(step.children.map(c => c.path).sort(), [`${step.path}/21_67`, `${step.path}/21_68`, `${step.path}/21_69`]);
    for (const rec of step.children) {
      assert.equal(rec.kind, 'file');
      assert.ok(!('children' in rec), 'a record leaf has no children key at all');
    }
  }
  assert.deepEqual(r.status.data.runMeta, RUN_FX.run);
});

test('view in ready: status-text "<pipeline> · run <id>"', () => {
  const v = view(loaded());
  assert.equal(v['status-text'], `${RUN_FX.run.pipeline} · run ${FIXTURE_RUN_ID}`);
});

test('expanding a step: toggles open, NO fetch effect (children were never null)', () => {
  const r = go(loaded(), 'tree.click', click('ingest'));
  const t = r.status.data[TREE.name];
  assert.equal(t.nodes.find(n => n.path === 'ingest').open, true);
  assert.deepEqual(r.effects, [], 'children already populated -- no lazy-load effect');
  assert.equal(t.pendingPath, null, 'this tree never uses pendingPath (nothing to fetch)');
});

test('clicking a record: issues exactly one detail.loaded-bound fetch effect, sets detailLoading + tree.sel', () => {
  let s = go(loaded(), 'tree.click', click('ingest')).status;   // expand first, same as a real click sequence
  const r = go(s, 'tree.click', click('ingest/21_67'));
  assert.deepEqual(r.effects, [
    { emit: 'tree.select', payload: r.status.data[TREE.name].nodes.find(n => n.path === 'ingest').children.find(n => n.path === 'ingest/21_67') },
    { fetch: '/content/records/artifact/ingest/21_67.json', ok: 'detail.loaded', err: 'detail.failed' },
  ]);
  assert.equal(r.status.data.detail, null);
  assert.equal(r.status.data.detailLoading, true);
  assert.equal(r.status.data[TREE.name].sel, 'ingest/21_67');
});

test('detail.loaded: data.detail set, detailLoading cleared, editText seeded; view shows the selected path as detail-title, a real editable field as detail-body', () => {
  let s = go(loaded(), 'tree.click', click('ingest')).status;
  s = go(s, 'tree.click', click('ingest/21_67')).status;
  assert.equal(s.data[TREE.name].sel, 'ingest/21_67');
  const r = go(s, 'detail.loaded', INGEST_67);
  assert.deepEqual(r.status.data.detail, INGEST_67);
  assert.equal(r.status.data.detailLoading, false);
  const expectedText = editTextFor(INGEST_67);
  assert.equal(r.status.data.editText, expectedText);
  const v = view(r.status);
  assert.equal(v['detail-title'], 'ingest/21_67', 'shows the selected node path (tree.sel), not something from the artifact payload');
  assert.deepEqual(v['detail-body'], { content: detailEditor(expectedText) }, 'adapts { value, version } into a real editable field exactly like ui/browse.js would render the same raw content');
  assert.deepEqual(v['btn-save'], { state: 'actionable' }, 'a record is always writable in this v1 -- no per-mount write flag like browse.html');
});

test('detail.loaded with a nested/multi-line value (nlp-parse/21_67): matches detailBody line-for-line', () => {
  const s = go(loaded(), 'detail.loaded', NLP_67).status;
  const v = view(s);
  const expectedText = editTextFor(NLP_67);
  assert.deepEqual(v['detail-body'], { content: detailEditor(expectedText) });
  assert.ok(expectedText.split('\n').length > 5, 'nested object -> multiple lines, not one blob');
});

test('detail.failed: detailLoading cleared, error set, tree left completely undisturbed', () => {
  const s0 = go(loaded(), 'tree.click', click('ingest')).status;
  const r = go(s0, 'detail.failed', { error: 'HTTP 404' });
  assert.equal(r.status.data.detailLoading, false);
  assert.equal(r.status.data.error, 'HTTP 404');
  assert.deepEqual(r.status.data[TREE.name], s0.data[TREE.name], 'a failed artifact fetch never touches the tree');
  assert.equal(r.status.state, 'ready', 'stays in ready, does not crash/transition to error');
});

test('typing updates editText', () => {
  const s = go(loaded(), 'detail.loaded', INGEST_67).status;
  const r = go(s, 'detail-editor.input', { value: '{"a":1}' });
  assert.equal(r.status.data.editText, '{"a":1}');
});

test('btn-save.click, invalid JSON typed: no effects, a local error message, nothing else changes', () => {
  let s = go(loaded(), 'detail.loaded', INGEST_67).status;
  s = go(s, 'detail-editor.input', { value: 'not json' }).status;
  const r = go(s, 'btn-save.click');
  assert.deepEqual(r.effects, []);
  assert.match(r.status.data.saveMsg, /^Save failed: invalid JSON/);
  assert.deepEqual(r.status.data.detail, INGEST_67, 'unsaved -- detail untouched');
});

test('btn-save.click, no real backend (FIXTURE_URLS.saveArtifact is null): saves locally, bumps the version, shows a confirmation', () => {
  let s = go(loaded(), 'detail.loaded', INGEST_67).status;
  const edited = { ...INGEST_67.value, raw_text: 'edited' };
  s = go(s, 'detail-editor.input', { value: JSON.stringify(edited) }).status;
  const r = go(s, 'btn-save.click');
  assert.deepEqual(r.effects, [], 'no fetch -- fixture demo has no writable backend, mutates locally');
  assert.deepEqual(r.status.data.detail.value, edited);
  assert.equal(r.status.data.detail.version, INGEST_67.version + 1);
  assert.equal(r.status.data.saveMsg, 'Saved (local)');
});

test('btn-save.click with a real urls.saveArtifact: fires the right PATCH fetch effect (2-segment path -> /api/step/..., never /api/channel/...); save.ok replaces detail wholesale; save.err surfaces the server message', () => {
  const saveUrls = { artifact: (p) => `/content/records/artifact/${p}.json`,
    saveArtifact: (runId, stepId, recordId, value, version) => ({ url: `/api/step/${runId}/${stepId}/${recordId}`, init: { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value, if_version: version }) } }) };
  const h = makeHandlers(saveUrls);
  const goH = (s, trigger, payload) => step(M, s, trigger, payload, h);
  let s = goH(start().status, 'run.loaded', RUN_FX).status;
  s = goH(s, 'tree.click', click('ingest')).status;
  s = goH(s, 'tree.click', click('ingest/21_67')).status;
  s = goH(s, 'detail.loaded', INGEST_67).status;
  const edited = { ...INGEST_67.value, raw_text: 'edited via save flow' };
  s = goH(s, 'detail-editor.input', { value: JSON.stringify(edited) }).status;
  const r = goH(s, 'btn-save.click');
  assert.equal(r.effects.length, 1);
  assert.equal(r.effects[0].fetch, `/api/step/${FIXTURE_RUN_ID}/ingest/21_67`);
  assert.deepEqual(JSON.parse(r.effects[0].init.body), { value: edited, if_version: INGEST_67.version });
  assert.equal(r.status.data.saveMsg, 'Saving…');

  const okPayload = { value: edited, version: INGEST_67.version + 1 };
  const ok = goH(r.status, 'save.ok', okPayload);
  assert.deepEqual(ok.status.data.detail, okPayload);
  assert.equal(ok.status.data.editText, editTextFor(okPayload));
  assert.equal(ok.status.data.saveMsg, 'Saved');

  const err = goH(r.status, 'save.err', { error: 'HTTP 409', body: { error: 'this value changed since you loaded it -- reload and try again' } });
  assert.equal(err.status.data.saveMsg, 'Save failed: this value changed since you loaded it -- reload and try again', 'prefers the server’s own JSON error body over the generic HTTP status');
});

test('run.failed -> error; retry re-issues the run fetch', () => {
  let r = go(start().status, 'run.failed', { error: 'HTTP 500' });
  assert.equal(r.status.state, 'error');
  assert.equal(r.status.data.error, 'HTTP 500');
  const v = view(r.status);
  assert.equal(v['status-text'], 'failed: HTTP 500');
  assert.deepEqual(v[TREE.name], { content: [{ name: 'btn-retry', box: 'row, mid, packed, pad:2, solid, rounded', content: 'Retry' }], state: '' });
  assert.deepEqual(v['btn-retry'], { state: 'error' });
  r = go(r.status, 'btn-retry.click');
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, [RUN_FETCH]);
  assert.equal(r.status.data.error, null);
});

test('refresh from ready -> loading with 1 fetch; error cleared', () => {
  const r = go(loaded(), 'btn-refresh.click');
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, [RUN_FETCH]);
  assert.equal(r.status.data.error, null);
});

test('nav click emits nav.go with the target; theme click emits theme.toggle', () => {
  const s = loaded();
  for (const to of ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'browse', 'query', 'annotate', 'profile']) {
    const r = go(s, `nav-${to}.click`, click(`nav-${to}`));
    assert.equal(r.status.state, 'ready');
    assert.deepEqual(r.effects, [{ emit: 'nav.go', payload: { to } }]);
  }
  assert.deepEqual(go(s, 'btn-theme.click').effects, [{ emit: 'theme.toggle' }]);
  assert.deepEqual(go(s, 'brand.click').effects, [{ emit: 'nav.go', payload: { to: 'dashboard' } }], 'brand click -> nav.go dashboard');
});

test('unknown trigger throws (C2); tree handler keyed by tree.click', () => {
  assert.throws(() => go(loaded(), 'tile-running.click'), /unknown trigger/);
  assert.equal(typeof handlers['tree.click'], 'function');
});
