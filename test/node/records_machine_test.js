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
const NLP_67_HISTORY = fixture('content/records/history/nlp-parse/21_67.json');
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
  assert.equal(v['detail-title'], 'ingest/21_67 · v1', 'shows the selected node path (tree.sel) + version badge -- v1 alone (INGEST_67.version === 1), no "(edited)"');
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

test('tree filter: keeps a step iff the step id or one of its records matches, force-opens matches, restores on clear', () => {
  let s = loaded();
  // "nlp" matches only the nlp-parse step id -- every one of its records shows
  let r = go(s, 'tree-filter.input', { value: 'nlp' });
  assert.equal(r.status.data.filterText, 'nlp');
  let t = r.status.data[TREE.name];
  assert.deepEqual(t.nodes.map(n => n.path), ['nlp-parse']);
  assert.equal(t.nodes[0].open, true, 'a match force-opens');
  assert.equal(t.nodes[0].children.length, 3);

  // "21_68" matches no step id but one record under every step -- steps kept, narrowed to that one record
  r = go(s, 'tree-filter.input', { value: '21_68' });
  t = r.status.data[TREE.name];
  assert.deepEqual(t.nodes.map(n => n.path).sort(), ['index', 'ingest', 'nlp-parse']);
  for (const n of t.nodes) assert.deepEqual(n.children.map(c => c.path), [`${n.path}/21_68`]);

  // no match anywhere -- tree empty, not an error
  r = go(s, 'tree-filter.input', { value: 'zzz' });
  assert.deepEqual(r.status.data[TREE.name].nodes, []);

  // manual expand survives a rebuild that keeps the step present (prevNodes
  // carry-over) -- "21_68" matches a record under every step, so all three
  // stay in the (still filtered/narrowed) list across this filter change.
  let manual = go(s, 'tree.click', click('ingest')).status;   // open it by hand
  manual = go(manual, 'tree-filter.input', { value: '21_68' }).status;
  assert.equal(manual.data[TREE.name].nodes.find(n => n.path === 'ingest').open, true, 'still open (both manually, and force-open while filtering)');

  // a step DROPPED entirely by a filter (no match at all) loses its open
  // state along with it -- reverts to the default (closed) once the filter
  // clears and it reappears, same as any node that was never toggled.
  manual = go(manual, 'tree-filter.input', { value: 'nlp' }).status;   // ingest has no "nlp" anywhere -- dropped
  assert.equal(manual.data[TREE.name].nodes.find(n => n.path === 'ingest'), undefined);
  manual = go(manual, 'tree-filter.input', { value: '' }).status;
  assert.equal(manual.data[TREE.name].nodes.find(n => n.path === 'ingest').open, false);
});

test('version/edited badge: "· v1" at version 1, "· v2 (edited)" at version > 1', () => {
  let s = go(loaded(), 'tree.click', click('ingest')).status;
  s = go(s, 'tree.click', click('ingest/21_67')).status;
  const v1 = view(go(s, 'detail.loaded', INGEST_67).status);
  assert.equal(v1['detail-title'], 'ingest/21_67 · v1');

  const v2 = view(go(loaded(), 'detail.loaded', NLP_67).status);
  assert.ok(v2['detail-title'].endsWith(' · v2 (edited)'), v2['detail-title']);
});

test('tags chips (EPIC-TAGS lineage): rendered as atom/chip nodes when detail.tags is present, empty otherwise', () => {
  const withTags = view(go(loaded(), 'detail.loaded', NLP_67).status);
  assert.deepEqual(withTags['tags-row'], { content: [
    { extends: 'atom/chip', content: 'pipeline=bundestag-unified' },
    { extends: 'atom/chip', content: 'session=21_67' },
  ] });
  const noTags = view(go(loaded(), 'detail.loaded', INGEST_67).status);
  assert.deepEqual(noTags['tags-row'], { content: [] });
});

test('Diff: disabled at version 1, fetches + toggles history at version > 1, cached on re-toggle', () => {
  const atV1 = go(loaded(), 'detail.loaded', INGEST_67).status;
  assert.deepEqual(view(atV1)['btn-diff'], { content: 'Diff', state: 'disabled' });
  assert.deepEqual(go(atV1, 'btn-diff.click'), { status: atV1, effects: [] }, 'version 1 -- no history to diff against, a no-op');

  let s = go(loaded(), 'tree.click', click('nlp-parse')).status;
  s = go(s, 'tree.click', click('nlp-parse/21_67')).status;
  s = go(s, 'detail.loaded', NLP_67).status;
  assert.deepEqual(view(s)['btn-diff'], { content: 'Diff', state: 'actionable' });

  const on = go(s, 'btn-diff.click');
  assert.equal(on.status.data.diffMode, true);
  assert.deepEqual(on.effects, [{ fetch: '/content/records/history/nlp-parse/21_67.json', ok: 'history.loaded', err: 'history.failed' }]);
  assert.deepEqual(view(on.status)['btn-diff'], { content: 'Back', state: 'actionable' });
  assert.equal(view(on.status)['detail-body'].content, 'Loading history…');

  const loadedHist = go(on.status, 'history.loaded', NLP_67_HISTORY);
  assert.deepEqual(loadedHist.status.data.history.entries, NLP_67_HISTORY.history);
  const diffView = view(loadedHist.status)['detail-body'].content;
  assert.ok(Array.isArray(diffView) && diffView.length > 1, 'diff rows rendered, not a bare string');
  assert.ok(diffView[0].content.includes('v1') && diffView[0].content.includes('v2'), diffView[0].content);
  const rowTexts = diffView.slice(1).map(x => x.content);
  assert.ok(rowTexts.some(t => t.startsWith('~ meta.model')), JSON.stringify(rowTexts));
  assert.ok(rowTexts.some(t => t.startsWith('+ entities.0.text')), JSON.stringify(rowTexts));

  // toggle off, then back on -- history is cached, no second fetch
  const off = go(loadedHist.status, 'btn-diff.click');
  assert.equal(off.status.data.diffMode, false);
  const backOn = go(off.status, 'btn-diff.click');
  assert.equal(backOn.status.data.diffMode, true);
  assert.deepEqual(backOn.effects, [], 'history already cached for this record -- no re-fetch');

  // a fresh tree selection drops the cached history/diffMode
  const reselected = go(backOn.status, 'tree.click', click('nlp-parse/21_68')).status;
  assert.equal(reselected.data.diffMode, false);
  assert.equal(reselected.data.history, null);
});

test('Diff: history.failed shows a message, not a crash', () => {
  let s = go(loaded(), 'tree.click', click('nlp-parse')).status;
  s = go(s, 'tree.click', click('nlp-parse/21_67')).status;
  s = go(s, 'detail.loaded', NLP_67).status;
  const on = go(s, 'btn-diff.click').status;
  const failed = go(on, 'history.failed', { error: 'HTTP 404' });
  assert.equal(view(failed.status)['detail-body'].content, 'No history for this artifact -- HTTP 404');
});

test('"Re-run..." emits rerun.open with {run_id, stepId}; disabled/no-op with nothing selected', () => {
  const s0 = loaded();
  assert.deepEqual(view(s0)['btn-rerun'], { state: 'disabled' });
  assert.deepEqual(go(s0, 'btn-rerun.click'), { status: s0, effects: [] });

  let s = go(s0, 'tree.click', click('ingest')).status;
  s = go(s, 'tree.click', click('ingest/21_67')).status;
  assert.deepEqual(view(s)['btn-rerun'], { state: 'actionable' });
  const r = go(s, 'btn-rerun.click');
  assert.deepEqual(r.effects, [{ emit: 'rerun.open', payload: { run_id: FIXTURE_RUN_ID, stepId: 'ingest' } }]);
  assert.deepEqual(r.status.data, s.data, 'a pure cross-link -- no local data change');
});

test('?sel=/?step_id=+?record_id= deep-link restore: initialData(runId, pendingSel) opens the step, preselects, and starts the SAME fetch a click would', () => {
  const withRecord = init(M, initialData(FIXTURE_RUN_ID, 'nlp-parse/21_67'));
  const r = go(withRecord.status, 'run.loaded', RUN_FX);
  assert.equal(r.status.data.pendingSel, null, 'consumed exactly once');
  assert.equal(r.status.data[TREE.name].sel, 'nlp-parse/21_67');
  assert.equal(r.status.data[TREE.name].nodes.find(n => n.path === 'nlp-parse').open, true);
  assert.equal(r.status.data.detailLoading, true);
  assert.deepEqual(r.effects, [{ fetch: '/content/records/artifact/nlp-parse/21_67.json', ok: 'detail.loaded', err: 'detail.failed' }]);

  // step_id alone (no record_id): opens the folder, no selection/fetch
  const stepOnly = init(M, initialData(FIXTURE_RUN_ID, 'ingest'));
  const r2 = go(stepOnly.status, 'run.loaded', RUN_FX);
  assert.equal(r2.status.data[TREE.name].sel, null);
  assert.equal(r2.status.data[TREE.name].nodes.find(n => n.path === 'ingest').open, true);
  assert.deepEqual(r2.effects, []);

  // an unknown step/record -- silently ignored, no crash
  const bogus = init(M, initialData(FIXTURE_RUN_ID, 'nope/21_67'));
  const r3 = go(bogus.status, 'run.loaded', RUN_FX);
  assert.equal(r3.status.data[TREE.name].sel, null);
  assert.deepEqual(r3.effects, []);
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
