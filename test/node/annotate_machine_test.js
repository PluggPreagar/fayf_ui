import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { init, step, validateMachine } from '../../ui/machine.js';
import {
  annotateMachine, handlers, makeHandlers, view, initialData,
  coverageSets, badgeFor, SESSION_PICKER, REDE_PICKER, TREE, FIXTURE_URLS,
} from '../../ui/annotate.js';

// The annotate (Session -> Rede -> paragraph/sentence drill-down + coverage +
// record panel) flow as JSON in, JSON out (C11): machines/annotate.json +
// pure handlers + pure view, on the shipped fixtures. No DOM. Covers
// STORY-17.1 (drill-down/coverage), 17.2 (suggestions/take-over), 17.4
// (delete), 17.5 (Neuer Satz), 17.6 (gold export) -- see ui/annotate.js's
// header for the deferred-stories list (slot-form editor, D4 anchor mode,
// manual create all stay on the old ui-kit page).
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
const clickSentence = (s, ps, h = handlers) => step(M, s, 'sentences.click', click('sentences', `sentence-${ps}`), h);
const clickPanel = (s, rowName, h = handlers) => step(M, s, 'panel.click', click('panel', rowName), h);

// A fully-loaded Rede (session+rede picked, segment+coverage both landed) --
// the common starting point for every record-panel test below.
function readyRede() {
  let s = pickSession(loaded(), RUNS_FX[0].run_id);
  s = go(s, 'rede.loaded', RUN_FX).status;
  s = pickRede(s, RUN_FX.run.record_ids[0]);
  s = go(s, 'segment.loaded', SEGMENT_FX).status;
  return go(s, 'annotate.loaded', COVERAGE_FX).status;
}

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
  for (const to of ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'browse', 'query', 'annotate', 'profile']) {
    const r = go(s, `nav-${to}.click`, click(`nav-${to}`));
    assert.equal(r.status.state, 'ready');
    assert.deepEqual(r.effects, [{ emit: 'nav.go', payload: { to } }]);
  }
  assert.deepEqual(go(s, 'btn-theme.click', click('btn-theme')).effects, [{ emit: 'theme.toggle' }]);
  assert.deepEqual(go(s, 'brand.click', click('brand')).effects, [{ emit: 'nav.go', payload: { to: 'dashboard' } }], 'brand click -> nav.go dashboard');
});

// ---- record panel: sentence selection ---------------------------------

test('sentence click: sets selectedPs; a paragraph-header click (no sentence- name in path) is a no-op', () => {
  const s = readyRede();
  const r = clickSentence(s, 'P0/S0');
  assert.equal(r.status.data.selectedPs, 'P0/S0');
  assert.deepEqual(r.effects, []);
  const noop = step(M, s, 'sentences.click', click('sentences'), handlers);
  assert.deepEqual(noop, { status: s, effects: [] });
});

test('sentence click: reselecting the SAME sentence keeps freshSuggestions; a DIFFERENT one clears it (no leaking into a new sentence)', () => {
  let s = clickSentence(readyRede(), 'P0/S0').status;
  s = step(M, s, 'suggest.ok', { suggestions: [{ records: [{ typ: 'x' }], triage: [] }] }, handlers).status;
  assert.equal(s.data.freshSuggestions.length, 1);
  const same = clickSentence(s, 'P0/S0').status;
  assert.equal(same.data.freshSuggestions.length, 1, 'same sentence again -- fresh suggestions survive');
  const other = clickSentence(s, 'P1/S0').status;
  assert.equal(other.data.selectedPs, 'P1/S0');
  assert.equal(other.data.freshSuggestions, null, 'a different sentence clears stale fresh suggestions');
});

// ---- record panel: view() rows -----------------------------------------

test('view: panel before a Rede is loaded / before a sentence is selected / accepted+triage rows once P0/S0 is selected', () => {
  const noSegment = view(pickSession(loaded(), RUNS_FX[0].run_id));
  assert.equal(noSegment.panel, 'Pick a Rede to see records.');

  const rede = readyRede();
  const beforeSelect = view(rede);
  assert.equal(beforeSelect.panel.content[0].content, 'Satz wählen für Vorschläge.');
  assert.equal(beforeSelect['btn-suggest'].state, 'disabled');
  assert.equal(beforeSelect['btn-export'].state, 'actionable', 'annotate already loaded -- export enabled even with no sentence selected');

  const s0 = clickSentence(rede, 'P0/S0').status;
  const v0 = view(s0);
  assert.equal(v0['btn-suggest'].state, 'actionable');
  const flat = v0.panel.content.map(r => JSON.stringify(r));
  assert.ok(flat.some(r => r.includes('REC-01') && r.includes('vorgeschlagen')), 'accepted record REC-01 listed', flat);
  assert.ok(flat.some(r => r.includes('panel-confirm-REC-01')), 'confirm chip addresses REC-01');
  assert.ok(flat.some(r => r.includes('panel-delete-REC-01')), 'delete chip addresses REC-01');

  const s2 = clickSentence(rede, 'P2/S0').status;
  const v2 = view(s2);
  const flat2 = v2.panel.content.map(r => JSON.stringify(r));
  assert.ok(flat2.some(r => r.includes('panel-take-triage-0') && r.includes('objekt: unklar')), 'the one triage entry (index 0) listed with its take-over chip', flat2);

  const s1 = clickSentence(rede, 'P1/S1').status;
  const v1 = view(s1);
  assert.ok(v1.panel.content.some(r => r.content === 'Keine Vorschläge für diesen Satz.'), 'a sentence with no candidates shows the empty state');
});

// ---- record panel: confirm / delete -------------------------------------

test('panel-confirm: vorgeschlagen -> bestaetigt, local-optimistic version bump; re-confirming is idempotent (no further bump... same value, version DOES bump again -- PATCH has no no-op short-circuit, ground truth parity)', () => {
  const s0 = clickSentence(readyRede(), 'P0/S0').status;
  assert.equal(s0.data.annotateVersion, null, 'fixture has no version at all');
  const r1 = clickPanel(s0, 'panel-confirm-REC-01');
  assert.equal(r1.status.data.annotate.records[0].annotation_status, 'bestaetigt');
  assert.equal(r1.status.data.annotateVersion, 1, 'local-optimistic: (null||0)+1');
  assert.deepEqual(r1.effects, []);
  const r2 = clickPanel(r1.status, 'panel-confirm-REC-01');
  assert.equal(r2.status.data.annotate.records[0].annotation_status, 'bestaetigt', 'still bestaetigt, never downgraded');
  assert.equal(r2.status.data.annotateVersion, 2, 'PATCH has no no-op short-circuit -- version still advances');
});

test('panel-delete: removes exactly one record, others untouched; unknown row prefix is a no-op', () => {
  const s0 = readyRede();
  const r = clickPanel(s0, 'panel-delete-REC-01');
  assert.deepEqual(r.status.data.annotate.records, []);
  assert.equal(r.status.data.annotateVersion, 1);
  assert.deepEqual(clickPanel(s0, 'panel-nonsense-x'), { status: s0, effects: [] });
});

test('panel.click without annotate loaded yet is a no-op (confirm/delete/take-over all guard on d.annotate)', () => {
  let s = pickSession(loaded(), RUNS_FX[0].run_id);
  s = go(s, 'rede.loaded', RUN_FX).status;
  s = pickRede(s, RUN_FX.run.record_ids[0]);
  assert.equal(s.data.annotate, null);
  assert.deepEqual(clickPanel(s, 'panel-confirm-REC-01'), { status: s, effects: [] });
});

// ---- record panel: triage take-over (STORY-17.2) -------------------------

test('panel-take-triage: appends a "manuell" stub filling the named slot, id from speaker_code; unknown index no-ops', () => {
  const s0 = readyRede();
  const r = clickPanel(s0, 'panel-take-triage-0');
  const recs = r.status.data.annotate.records;
  assert.equal(recs.length, 2, 'original REC-01 kept, new stub appended');
  const stub = recs[1];
  assert.equal(stub.id, 'REC-02', 'nextLocalId continues REC-01\'s own numbering');
  assert.deepEqual(stub.src, ['P2/S0']);
  assert.equal(stub.annotation_status, 'manuell');
  assert.equal(stub.objekt, 'unklar', 'the triage entry\'s own slot/vorschlag filled in');
  assert.ok(stub.anmerkung.includes('aus Triage übernommen'));
  assert.deepEqual(clickPanel(s0, 'panel-take-triage-9'), { status: s0, effects: [] });
});

test('padId/nextLocalId rollover: REC-09 -> next stub is REC-10 (2-digit minimum, never truncated)', () => {
  let s = readyRede();
  s = { ...s, data: { ...s.data, annotate: { ...s.data.annotate, records: [{ id: 'REC-09', src: [], annotation_status: 'manuell' }] } } };
  const r = clickPanel(s, 'panel-take-triage-0');
  assert.equal(r.status.data.annotate.records.at(-1).id, 'REC-10');
});

// ---- record panel: "Neuer Satz" (STORY-17.5) ------------------------------

test('btn-suggest: no-op without a selected sentence; fixture (no urls.suggest) -> canned local fresh suggestion', () => {
  const s0 = readyRede();
  assert.deepEqual(go(s0, 'btn-suggest.click'), { status: s0, effects: [] });
  const s1 = clickSentence(s0, 'P1/S1').status;   // an "offen" sentence, no accepted/triage candidates
  const r = go(s1, 'btn-suggest.click');
  assert.deepEqual(r.effects, []);
  assert.equal(r.status.data.freshSuggestions.length, 1);
  const flat = view(r.status).panel.content.map(x => JSON.stringify(x));
  assert.ok(flat.some(x => x.includes('panel-take-fresh-0') && x.includes('neu:')), 'fresh candidate rendered with its own take-over chip', flat);
});

test('makeHandlers(urls.suggest): real fetch effect carries run/record/selectedPs; suggest.ok/err update state', () => {
  const urls = { ...FIXTURE_URLS, suggest: (runId, recordId, ps) => ({ url: `/api/annotate/${runId}/${recordId}/suggest`, init: { method: 'POST', body: JSON.stringify({ src: ps }) } }) };
  const h = makeHandlers(urls);
  const s0 = clickSentence(readyRede(), 'P0/S1', h).status;
  const r = step(M, s0, 'btn-suggest.click', undefined, h);
  assert.deepEqual(r.effects, [{ fetch: '/api/annotate/run-2026-09-08/rede-1/suggest', init: { method: 'POST', body: JSON.stringify({ src: 'P0/S1' }) }, ok: 'suggest.ok', err: 'suggest.err' }]);
  const ok = step(M, r.status, 'suggest.ok', { src: 'P0/S1', suggestions: [{ records: [], triage: [{ src: 'P0/S1', grund: 'x' }] }] }, h);
  assert.equal(ok.status.data.freshSuggestions[0].triage.length, 1);
  const err = step(M, r.status, 'suggest.err', { error: 'Ollama down' }, h);
  assert.match(err.status.data.panelMsg, /Ollama down/);
});

test('panel-take-fresh (record kind): appends a new record, clears freshSuggestions (no duplicate "neu" listing)', () => {
  const s0 = clickSentence(readyRede(), 'P1/S1').status;
  const s1 = go(s0, 'btn-suggest.click').status;
  assert.equal(s1.data.freshSuggestions.length, 1);
  const r = clickPanel(s1, 'panel-take-fresh-0');
  assert.equal(r.status.data.freshSuggestions, null);
  const added = r.status.data.annotate.records.at(-1);
  assert.equal(added.annotation_status, 'vorgeschlagen');
  assert.equal(added.praedikat, 'IST');
  assert.notEqual(added.id, undefined);
});

test('panel-take-fresh (triage kind): appends a "manuell" stub like a plain triage take-over, does NOT clear freshSuggestions (ground truth parity)', () => {
  const urls = { ...FIXTURE_URLS };
  const h = makeHandlers(urls);
  let s = clickSentence(readyRede(), 'P1/S1', h).status;
  s = step(M, s, 'suggest.ok', { suggestions: [{ records: [], triage: [{ src: 'P1/S1', slot: 'agent', vorschlag: 'X', grund: 'unsicher' }] }] }, h).status;
  const r = clickPanel(s, 'panel-take-fresh-0', h);
  assert.notEqual(r.status.data.freshSuggestions, null, 'unlike chooseFresh, chooseTriage never clears freshSuggestions');
  const stub = r.status.data.annotate.records.at(-1);
  assert.equal(stub.annotation_status, 'manuell');
  assert.equal(stub.agent, 'X');
  assert.deepEqual(clickPanel(s, 'panel-take-fresh-9', h), { status: s, effects: [] }, 'unknown flat index no-ops');
});

// ---- record panel: PATCH round-trip with a real backend (urls.saveAnnotate) --

test('makeHandlers(urls.saveAnnotate): confirm PATCHes the artifact; save.ok/err update annotate/annotateVersion/panelMsg', () => {
  const urls = { ...FIXTURE_URLS, saveAnnotate: (runId, recordId, value, version) => ({ url: `/api/step/${runId}/record-annotate/${recordId}`, init: { method: 'PATCH', body: JSON.stringify({ value, if_version: version }) } }) };
  const h = makeHandlers(urls);
  const s0 = readyRede();
  const r = clickPanel(s0, 'panel-confirm-REC-01', h);
  assert.equal(r.status.data.panelMsg, 'Saving…');
  assert.equal(r.status.data.annotate, s0.data.annotate, 'not mutated locally -- waits for save.ok');
  assert.equal(r.effects.length, 1);
  assert.equal(r.effects[0].fetch, '/api/step/run-2026-09-08/record-annotate/rede-1');
  const nextValue = { ...s0.data.annotate, records: [{ ...s0.data.annotate.records[0], annotation_status: 'bestaetigt' }] };
  const ok = step(M, r.status, 'save.ok', { value: nextValue, version: 7 }, h);
  assert.deepEqual(ok.status.data.annotate, nextValue);
  assert.equal(ok.status.data.annotateVersion, 7);
  const err = step(M, r.status, 'save.err', { error: 'conflict' }, h);
  assert.match(err.status.data.panelMsg, /conflict/);
});

// ---- gold export (STORY-17.6) --------------------------------------------

test('btn-export: empty name -> panelMsg, no effect; fixture (no urls.exportGold) -> canned local exportResult', () => {
  const s0 = readyRede();
  const empty = go(s0, 'btn-export.click');
  assert.deepEqual(empty.effects, []);
  assert.match(empty.status.data.panelMsg, /Namen/);
  const named = go({ ...s0, data: { ...s0.data, annotatedBy: 'Peter' } }, 'btn-export.click');
  assert.deepEqual(named.effects, []);
  assert.ok(named.status.data.exportResult);
  assert.deepEqual(named.status.data.exportResult.errors, []);
});

test('view: exportResult replaces the panel with findings + a back chip; panel.click on it clears exportResult', () => {
  const s0 = readyRede();
  const s1 = go({ ...s0, data: { ...s0.data, annotatedBy: 'Peter' } }, 'btn-export.click').status;
  const v = view(s1);
  assert.equal(v.panel.content[0].name, 'panel-export-back');
  assert.ok(v.panel.content.some(r => r.content === 'Gültig — keine Befunde.'));
  const back = clickPanel(s1, 'panel-export-back');
  assert.equal(back.status.data.exportResult, null);
});

test('makeHandlers(urls.exportGold): real fetch effect carries runId/recordId/name; export.ok renders errors+warnings, export.err sets panelMsg', () => {
  const urls = { ...FIXTURE_URLS, exportGold: (runId, recordId, name) => ({ url: `/api/annotate/${runId}/${recordId}/export`, init: { method: 'POST', body: JSON.stringify({ annotated_by: name }) } }) };
  const h = makeHandlers(urls);
  const s0 = { ...readyRede(), data: { ...readyRede().data, annotatedBy: 'Peter' } };
  const r = step(M, s0, 'btn-export.click', undefined, h);
  assert.deepEqual(r.effects, [{ fetch: '/api/annotate/run-2026-09-08/rede-1/export', init: { method: 'POST', body: JSON.stringify({ annotated_by: 'Peter' }) }, ok: 'export.ok', err: 'export.err' }]);
  const ok = step(M, r.status, 'export.ok', { path: '/tmp/x.yaml', errors: ['bad'], warnings: [] }, h);
  const v = view(ok.status);
  assert.ok(v.panel.content.some(x => x.content === 'Fehler: bad'));
  const err = step(M, r.status, 'export.err', { error: 'disk full' }, h);
  assert.match(err.status.data.panelMsg, /disk full/);
});

// ---- session/Rede repick resets the whole panel working set --------------

test('picking a different session/Rede resets selectedPs/freshSuggestions/annotatedBy/exportResult/panelMsg/annotateVersion', () => {
  let s = clickSentence(readyRede(), 'P0/S0').status;
  s = { ...s, data: { ...s.data, annotatedBy: 'Peter', panelMsg: 'Saving…' } };
  s = go(s, 'btn-export.click').status;
  assert.ok(s.data.selectedPs && s.data.exportResult);
  const s2 = pickRede(s, RUN_FX.run.record_ids[0]);   // re-pick the SAME rede -- clears it (single-select toggle)
  assert.equal(s2.data.selectedPs, null);
  assert.equal(s2.data.exportResult, null);
  assert.equal(s2.data.annotatedBy, '');
  assert.equal(s2.data.panelMsg, '');
  assert.equal(s2.data.annotateVersion, null);
  const s3 = pickSession(readyRede(), RUNS_FX[1].run_id);
  assert.equal(s3.data.selectedPs, null);
});

test('unknown trigger throws (C2); handlers keyed for every machine trigger', () => {
  assert.throws(() => go(loaded(), 'btn-nope.click'), /unknown trigger/);
  for (const k of ['runs.loaded', 'runs.failed', 'session-picker.click', 'rede.loaded', 'rede.failed',
    'rede-picker.click', 'segment.loaded', 'segment.failed', 'annotate.loaded', 'annotate.failed',
    'tree.click', 'sentences.click', 'panel.click', 'btn-suggest.click', 'suggest.ok', 'suggest.err',
    'save.ok', 'save.err', 'annotated-by.input', 'btn-export.click', 'export.ok', 'export.err',
    'btn-refresh.click', 'btn-theme.click', 'nav-dashboard.click'])
    assert.equal(typeof handlers[k], 'function', k);
});
