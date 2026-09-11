import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { init, step, validateMachine } from '../../ui/machine.js';
import {
  annotateMachine, handlers, makeHandlers, view, initialData,
  coverageSets, badgeFor, SESSION_PICKER, REDE_PICKER, TREE, FIXTURE_URLS,
} from '../../ui/annotate.js';

// The annotate (Session -> Rede -> paragraph/sentence drill-down + coverage)
// flow as JSON in, JSON out (C11): machines/annotate.json + pure handlers +
// pure view, on the shipped fixtures. No DOM. STORY-17.1 scope only -- see
// ui/annotate.js's header for the full deferred-stories list (record editing,
// slot form, etc. all stay on the old ui-kit page).
const fixture = (rel) => JSON.parse(readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf-8'));
const RUNS_FX = fixture('content/annotate/runs.json');
const RUN_FX = fixture('content/annotate/run-run-2026-09-08.json');
const SEGMENT_FX = fixture('content/annotate/segment-run-2026-09-08-rede-1.json');
const COVERAGE_FX = fixture('content/annotate/coverage-run-2026-09-08-rede-1.json');
const M = annotateMachine;
const RUNS_FETCH = { fetch: '/content/annotate/runs.json', ok: 'runs.loaded', err: 'runs.failed' };
const go = (s, trigger, payload) => step(M, s, trigger, payload, handlers);
const start = () => init(M, initialData());
const loaded = () => go(start().status, 'runs.loaded', RUNS_FX).status;
const click = (name, ...path) => ({ name, event: 'click', target: path[0] ?? name, path: [...path, name, 'content', 'body', 'root'] });
const pickSession = (s, id) => go(s, `${SESSION_PICKER}.click`, click(SESSION_PICKER, `${SESSION_PICKER}-${id}`)).status;
const pickRede = (s, id) => go(s, `${REDE_PICKER}.click`, click(REDE_PICKER, `${REDE_PICKER}-${id}`)).status;
const clickTree = (s, i) => go(s, `${TREE}.click`, click(TREE, `${TREE}-P${i}`));

test('machines/annotate.json validates; JSON round-trip identical; one state only', () => {
  assert.equal(validateMachine(M), M);
  assert.deepEqual(JSON.parse(JSON.stringify(M)), M);
  assert.deepEqual(JSON.parse(readFileSync(new URL('../../machines/annotate.json', import.meta.url), 'utf-8')), M);
  assert.equal(M.initial, 'ready');
  assert.equal(Object.keys(M.states).length, 1);
});

test('fixtures: runs.json has 4 sessions incl. one parent/child pair; run-<id>.json has 2 redes; segment has 3 paragraphs/6 sentences', () => {
  assert.equal(RUNS_FX.length, 4);
  const child = RUNS_FX.find(r => r.parent_run_id);
  assert.ok(child, 'at least one child run carries parent_run_id');
  assert.equal(RUN_FX.run.record_ids.length, 2);
  const paragraphs = SEGMENT_FX.content.paragraphs;
  assert.equal(paragraphs.length, 3);
  assert.equal(paragraphs.reduce((n, p) => n + p.sentences.length, 0), 6);
});

test('init -> ready with 1 fetch effect (runs); nothing picked', () => {
  const { status, effects } = start();
  assert.equal(status.state, 'ready');
  assert.deepEqual(effects, [RUNS_FETCH]);
  assert.deepEqual(status.data.runs, []);
  assert.equal(status.data.runId, null);
  assert.deepEqual(status.data.recordIds, []);
  assert.equal(status.data.recordId, null);
  assert.equal(status.data.segment, null);
  assert.equal(status.data.annotate, null);
  assert.deepEqual(status.data.loading, { segment: false, annotate: false });
  assert.equal(status.data.error, null);
});

test('coverageSets/badgeFor: pure functions, all 4 badge kinds + default', () => {
  const sets = coverageSets(COVERAGE_FX);
  assert.deepEqual(badgeFor('P0/S0', sets), { label: '✓', tip: 'Record erfasst' });
  assert.deepEqual(badgeFor('P0/S1', sets), { label: 's', tip: 'Übersprungen (Skip)' });
  assert.deepEqual(badgeFor('P1/S0', sets), { label: '⚠', tip: 'Nur Triage-Markierung (L3), noch kein Record' });
  assert.deepEqual(badgeFor('P1/S1', sets), { label: '·', tip: 'Offen — noch nicht bearbeitet' });
  const empty = coverageSets({});
  assert.deepEqual(badgeFor('P9/S9', empty), { label: '·', tip: 'Offen — noch nicht bearbeitet' });
});

test('view before any pick: session chips (child labeled via parent), rede-picker prompt, tree/sentences prompts', () => {
  const v = view(loaded());
  assert.equal(v['crumb-page'], 'Annotate');
  assert.equal(v['status-text'], '4 sessions');
  assert.equal(v['session-picker'].content.length, 4);
  const child = RUNS_FX.find(r => r.parent_run_id);
  const chip = v['session-picker'].content.find(c => c.name === `${SESSION_PICKER}-${child.run_id}`);
  assert.equal(chip.content, `${child.parent_run_id} → ${child.pipeline} (Kind-Lauf)`, 'child run labeled against its parent, not its own unrecognizable id');
  const plain = RUNS_FX.find(r => !r.parent_run_id);
  const plainChip = v['session-picker'].content.find(c => c.name === `${SESSION_PICKER}-${plain.run_id}`);
  assert.equal(plainChip.content, plain.run_id);
  assert.equal(v['rede-picker'], 'Pick a session first.');
  assert.equal(v['tree'], 'Pick a Rede to see its paragraphs.');
  assert.equal(v['sentences'], 'Pick a Rede to see its text.');
});

test('runs.loaded stores the array; runs.failed tolerated silently -- stays [], no page-level error', () => {
  const ok = go(start().status, 'runs.loaded', RUNS_FX);
  assert.deepEqual(ok.status.data.runs, RUNS_FX);
  const failed = go(start().status, 'runs.failed', { error: 'HTTP 500' });
  assert.deepEqual(failed.status.data.runs, []);
  assert.equal(failed.status.data.error, null);
  assert.deepEqual(failed.effects, []);
});

test('session-picker: single-select -- pick fetches urls.run(id); same click again clears with no fetch; another replaces', () => {
  const s0 = loaded();
  const id = RUNS_FX[0].run_id;
  const r1 = go(s0, `${SESSION_PICKER}.click`, click(SESSION_PICKER, `${SESSION_PICKER}-${id}`));
  assert.equal(r1.status.data.runId, id);
  assert.deepEqual(r1.effects, [{ fetch: FIXTURE_URLS.run(id), ok: 'rede.loaded', err: 'rede.failed' }]);
  const s1 = r1.status;
  const r2 = go(s1, `${SESSION_PICKER}.click`, click(SESSION_PICKER, `${SESSION_PICKER}-${id}`));
  assert.equal(r2.status.data.runId, null, 'clicking the same session again clears it');
  assert.deepEqual(r2.effects, []);
  const id2 = RUNS_FX[1].run_id;
  const r3 = go(s1, `${SESSION_PICKER}.click`, click(SESSION_PICKER, `${SESSION_PICKER}-${id2}`));
  assert.equal(r3.status.data.runId, id2, 'clicking a different session replaces, not adds');
  assert.deepEqual(go(s0, `${SESSION_PICKER}.click`, click(SESSION_PICKER)), { status: s0, effects: [] }, 'no session-picker-<id> in path -- no-op');
});

test('session pick resets recordId/recordIds/segment/annotate', () => {
  let s = pickSession(loaded(), RUNS_FX[0].run_id);
  s = go(s, 'rede.loaded', RUN_FX).status;
  s = pickRede(s, RUN_FX.run.record_ids[0]);
  assert.ok(s.data.recordId, 'sanity: a rede is picked');
  const s2 = pickSession(s, RUNS_FX[1].run_id);
  assert.equal(s2.data.recordId, null);
  assert.deepEqual(s2.data.recordIds, []);
  assert.equal(s2.data.segment, null);
  assert.equal(s2.data.annotate, null);
});

test('rede.loaded stores run.record_ids; rede.failed clears to []', () => {
  const s = pickSession(loaded(), RUNS_FX[0].run_id);
  const ok = go(s, 'rede.loaded', RUN_FX);
  assert.deepEqual(ok.status.data.recordIds, RUN_FX.run.record_ids);
  const failed = go(s, 'rede.failed', { error: 'HTTP 500' });
  assert.deepEqual(failed.status.data.recordIds, []);
});

test('rede-picker: single-select -- pick issues BOTH segment+annotate fetches, sets loading true for both; same click again clears, no fetch', () => {
  let s = pickSession(loaded(), RUNS_FX[0].run_id);
  s = go(s, 'rede.loaded', RUN_FX).status;
  const id = RUN_FX.run.record_ids[0];
  const r1 = go(s, `${REDE_PICKER}.click`, click(REDE_PICKER, `${REDE_PICKER}-${id}`));
  assert.equal(r1.status.data.recordId, id);
  assert.deepEqual(r1.status.data.loading, { segment: true, annotate: true });
  assert.deepEqual(r1.effects, [
    { fetch: FIXTURE_URLS.segment(s.data.runId, id), ok: 'segment.loaded', err: 'segment.failed' },
    { fetch: FIXTURE_URLS.annotate(s.data.runId, id), ok: 'annotate.loaded', err: 'annotate.failed' },
  ]);
  const r2 = go(r1.status, `${REDE_PICKER}.click`, click(REDE_PICKER, `${REDE_PICKER}-${id}`));
  assert.equal(r2.status.data.recordId, null, 'clicking the same rede again clears it');
  assert.deepEqual(r2.effects, []);
  assert.deepEqual(r2.status.data.loading, { segment: false, annotate: false });
  assert.deepEqual(go(s, `${REDE_PICKER}.click`, click(REDE_PICKER)), { status: s, effects: [] }, 'no rede-picker-<id> in path -- no-op');
});

function pickedSegmentOnly() {
  let s = pickSession(loaded(), RUNS_FX[0].run_id);
  s = go(s, 'rede.loaded', RUN_FX).status;
  s = pickRede(s, RUN_FX.run.record_ids[0]);
  return go(s, 'segment.loaded', SEGMENT_FX).status;
}

test('segment.loaded: sets data.segment, clears loading.segment only -- annotate still loading (independent, no shared gate)', () => {
  const s = pickedSegmentOnly();
  assert.deepEqual(s.data.segment, SEGMENT_FX);
  assert.deepEqual(s.data.loading, { segment: false, annotate: true });
});

test('view with segment loaded but annotate still pending: tree rows present (0/N, no coverage yet), sentence rows show placeholder badges, text itself already visible', () => {
  const v = view(pickedSegmentOnly());
  assert.equal(v.tree.content.length, 3);
  assert.equal(v.tree.content[0].content, 'P0 0/2');
  assert.equal(v.tree.content[1].content, 'P1 0/3');
  assert.equal(v.tree.content[2].content, 'P2 0/1');
  const rows = v.sentences.content;
  const sentenceTexts = rows.filter(r => Array.isArray(r.children)).map(r => r.children[1].content);
  assert.deepEqual(sentenceTexts, SEGMENT_FX.content.paragraphs.flatMap(p => p.sentences.map(s => s.text)), 'text shown immediately, not blocked on annotate');
  const badges = rows.filter(r => Array.isArray(r.children)).map(r => r.children[0].content);
  assert.ok(badges.every(b => b === '…'), 'every badge is the neutral placeholder while annotate is still loading');
});

test('annotate.loaded: upgrades all 4 badge kinds + tree coverage counts (record+skip count as covered, L3-only does not)', () => {
  const s0 = pickedSegmentOnly();
  const s = go(s0, 'annotate.loaded', COVERAGE_FX).status;
  assert.deepEqual(s.data.loading, { segment: false, annotate: false });
  const v = view(s);
  assert.equal(v.tree.content[0].content, 'P0 2/2', 'P0: one record + one skip, both count as covered');
  assert.equal(v.tree.content[1].content, 'P1 0/3', 'P1: only an L3 marker -- triage-only never counts as covered');
  assert.equal(v.tree.content[2].content, 'P2 0/1');
  const rows = v.sentences.content.filter(r => Array.isArray(r.children));
  const badges = rows.map(r => r.children[0].content);
  assert.deepEqual(badges, ['✓', 's', '⚠', '·', '·', '·']);
});

test('annotate.failed: not fatal -- loading.annotate cleared, every sentence falls back to "offen" (empty coverageSets default)', () => {
  const s0 = pickedSegmentOnly();
  const r = go(s0, 'annotate.failed', { error: 'HTTP 500' });
  assert.deepEqual(r.status.data.loading, { segment: false, annotate: false });
  assert.equal(r.status.data.annotate, null);
  const v = view(r.status);
  const badges = v.sentences.content.filter(row => Array.isArray(row.children)).map(row => row.children[0].content);
  assert.ok(badges.every(b => b === '·'), 'no page-level error surfaced -- every sentence just reads offen');
});

test('segment.failed: loading.segment cleared, error set; tree/sentences stay at their "pick a Rede" prompts (segment still null)', () => {
  let s = pickSession(loaded(), RUNS_FX[0].run_id);
  s = go(s, 'rede.loaded', RUN_FX).status;
  s = pickRede(s, RUN_FX.run.record_ids[0]);
  const r = go(s, 'segment.failed', { error: 'HTTP 404' });
  assert.deepEqual(r.status.data.loading, { segment: false, annotate: true });
  assert.equal(r.status.data.error, 'HTTP 404');
  const v = view(r.status);
  assert.equal(v.tree, 'Pick a Rede to see its paragraphs.');
  assert.equal(v.sentences, 'Pick a Rede to see its text.');
});

test('tree click: emits paragraph.jump with the right index; no-op without a tree-P<i> in path', () => {
  const s = pickedSegmentOnly();
  const r = clickTree(s, 1);
  assert.deepEqual(r.effects, [{ emit: 'paragraph.jump', payload: { index: 1 } }]);
  assert.deepEqual(r.status, s, 'no data change, effect only');
  assert.deepEqual(go(s, `${TREE}.click`, click(TREE)), { status: s, effects: [] });
});

test('makeHandlers(urls): custom URLs are used for run/segment/annotate fetches', () => {
  const urls = {
    runs: '/api/runs?include_children=1',
    run: (id) => `/api/runs/${id}`,
    segment: (runId, recordId) => `/api/step/${runId}/segment/${recordId}`,
    annotate: (runId, recordId) => `/api/annotate/${runId}/${recordId}/seed`,
  };
  const h = makeHandlers(urls);
  const goH = (s, trigger, payload) => step(M, s, trigger, payload, h);
  const s0 = loaded();
  const id = RUNS_FX[0].run_id;
  const r1 = goH(s0, `${SESSION_PICKER}.click`, click(SESSION_PICKER, `${SESSION_PICKER}-${id}`));
  assert.deepEqual(r1.effects, [{ fetch: urls.run(id), ok: 'rede.loaded', err: 'rede.failed' }]);
  let s = goH(r1.status, 'rede.loaded', RUN_FX).status;
  const recId = RUN_FX.run.record_ids[0];
  const r2 = goH(s, `${REDE_PICKER}.click`, click(REDE_PICKER, `${REDE_PICKER}-${recId}`));
  assert.deepEqual(r2.effects, [
    { fetch: urls.segment(id, recId), ok: 'segment.loaded', err: 'segment.failed' },
    { fetch: urls.annotate(id, recId), ok: 'annotate.loaded', err: 'annotate.failed' },
  ]);
  const r3 = goH(s, 'btn-refresh.click');
  assert.deepEqual(r3.effects, [{ fetch: urls.runs, ok: 'runs.loaded', err: 'runs.failed' }]);
});

test('refresh re-issues the runs fetch only, no data change', () => {
  const s0 = pickSession(loaded(), RUNS_FX[0].run_id);
  const r = go(s0, 'btn-refresh.click');
  assert.deepEqual(r.effects, [RUNS_FETCH]);
  assert.deepEqual(r.status, s0);
});

test('nav click emits nav.go with the target; theme click emits theme.toggle', () => {
  const s = loaded();
  for (const to of ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'settings']) {
    const r = go(s, `nav-${to}.click`, click(`nav-${to}`));
    assert.equal(r.status.state, 'ready');
    assert.deepEqual(r.effects, [{ emit: 'nav.go', payload: { to } }]);
  }
  assert.deepEqual(go(s, 'btn-theme.click', click('btn-theme')).effects, [{ emit: 'theme.toggle' }]);
});

test('unknown trigger throws (C2); handlers keyed for every machine trigger', () => {
  assert.throws(() => go(loaded(), 'btn-nope.click'), /unknown trigger/);
  for (const k of ['runs.loaded', 'runs.failed', 'session-picker.click', 'rede.loaded', 'rede.failed',
    'rede-picker.click', 'segment.loaded', 'segment.failed', 'annotate.loaded', 'annotate.failed',
    'tree.click', 'btn-refresh.click', 'btn-theme.click', 'nav-dashboard.click'])
    assert.equal(typeof handlers[k], 'function', k);
});
