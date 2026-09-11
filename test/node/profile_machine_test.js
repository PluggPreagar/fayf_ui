import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { init, step, validateMachine } from '../../ui/machine.js';
import {
  profileMachine, handlers, makeHandlers, view, initialData, SPEAKERS, WINDOWS, FIXTURE_URLS,
} from '../../ui/profile.js';

// The profile (per-speaker credibility comparison) flow as JSON in, JSON out
// (C11): machines/profile.json + pure handlers + pure view, on the shipped
// fixtures. No DOM.
const fixture = (rel) => JSON.parse(readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf-8'));
const RUNS_FX = fixture('content/profile/runs.json');
const DONE_IDS = ['run-2026-09-08', 'run-2026-09-03'];   // newest-first, matches FIXTURE_URLS.profile's join
const RESULT_FX = fixture(`content/profile/result-${DONE_IDS.join('_')}.json`);
const M = profileMachine;
const RUNS_FETCH = { fetch: '/content/profile/runs.json', ok: 'runs.loaded', err: 'runs.failed' };
const go = (s, trigger, payload) => step(M, s, trigger, payload, handlers);
const start = () => init(M, initialData());
const loaded = () => go(start().status, 'runs.loaded', RUNS_FX).status;
const click = (name, ...path) => ({ name, event: 'click', target: path[0] ?? name, path: [...path, name, 'content', 'body', 'root'] });
const pick = (s, runId) => go(s, 'run-picker.click', click('run-picker', `run-picker-${runId}`)).status;

test('machines/profile.json validates; JSON round-trip identical', () => {
  assert.equal(validateMachine(M), M);
  assert.deepEqual(JSON.parse(JSON.stringify(M)), M);
  assert.deepEqual(JSON.parse(readFileSync(new URL('../../machines/profile.json', import.meta.url), 'utf-8')), M);
});

test('runs fixture shape; at least 3 done, a mix of other statuses', () => {
  for (const r of RUNS_FX) assert.deepEqual(Object.keys(r).sort(), ['pipeline', 'run_id', 'started_at', 'status']);
  const statuses = new Set(RUNS_FX.map(r => r.status));
  assert.ok(RUNS_FX.filter(r => r.status === 'done').length >= 3, 'at least 3 done runs');
  assert.ok(statuses.size >= 3, `mix of statuses, got ${[...statuses]}`);
});

test('init -> loading with 1 fetch effect (runs); data empty, nothing picked', () => {
  const { status, effects } = start();
  assert.equal(status.state, 'loading');
  assert.deepEqual(effects, [RUNS_FETCH]);
  assert.deepEqual(status.data.runs, []);
  assert.deepEqual(status.data.picked, {});
  assert.equal(status.data.fenster, 'wahlperiode');
  assert.equal(status.data.result, null);
  assert.equal(status.data.speakerId, null);
  assert.equal(status.data.computing, false);
  assert.deepEqual(status.data[SPEAKERS.name].rows, []);
});

test('view in loading: status-text "loading…", run-picker/speakers empty + loading token, compute disabled', () => {
  const v = view(start().status);
  assert.equal(v['status-text'], 'loading…');
  assert.equal(v['crumb-page'], 'Profile');
  assert.deepEqual(v['run-picker'], { content: [], state: 'loading' });
  assert.deepEqual(v[SPEAKERS.name], { content: [], state: '' });
  assert.equal(v['btn-compute'].state, 'disabled');
  assert.equal(v['detail-body'], 'Select a speaker');
});

test('runs.loaded: filters to done-only, sorted newest-first; transitions to ready', () => {
  const r = go(start().status, 'runs.loaded', RUNS_FX);
  assert.equal(r.status.state, 'ready');
  assert.deepEqual(r.effects, []);
  const runs = r.status.data.runs;
  assert.ok(runs.every(x => x.status === 'done'));
  assert.equal(runs.length, RUNS_FX.filter(x => x.status === 'done').length);
  for (let i = 1; i < runs.length; i++) assert.ok(runs[i - 1].started_at >= runs[i].started_at, 'newest first');
  assert.deepEqual(runs.map(x => x.run_id).slice(0, 2), DONE_IDS, 'top two match this test\'s DONE_IDS/fixture naming');
});

test('view in ready: run-picker rows + actionable state, fenster chips (wahlperiode selected), compute disabled at 0 picked', () => {
  const v = view(loaded());
  assert.equal(v['run-picker'].content.length, RUNS_FX.filter(x => x.status === 'done').length);
  for (const r of RUNS_FX.filter(x => x.status === 'done')) assert.deepEqual(v[`run-picker-${r.run_id}`], { state: 'actionable' });
  assert.equal(v['fenster'].content.length, WINDOWS.length);
  for (const w of WINDOWS) assert.deepEqual(v[`fenster-${w}`], { state: w === 'wahlperiode' ? 'selected' : 'actionable' });
  assert.equal(v['btn-compute'].content, 'Profile berechnen');
  assert.equal(v['btn-compute'].state, 'disabled');
  assert.equal(v[SPEAKERS.name], 'Pick at least two runs, then compute.');
});

test('run-picker click toggles data.picked by path-prefix match; unrelated path -> no-op', () => {
  const s0 = loaded();
  const id = DONE_IDS[0];
  const s1 = pick(s0, id);
  assert.deepEqual(s1.data.picked, { [id]: true });
  assert.deepEqual(view(s1)[`run-picker-${id}`], { state: 'selected' });
  const s2 = pick(s1, id);   // click again -> untoggled
  assert.deepEqual(s2.data.picked, { [id]: false });
  assert.deepEqual(go(s0, 'run-picker.click', click('run-picker')), { status: s0, effects: [] }, 'click with no run-picker-<id> in path is a no-op');
});

test('fenster click: switches data.fenster, no fetch; each of the 6 triggers reachable', () => {
  const s0 = loaded();
  for (const w of WINDOWS) {
    const r = go(s0, `fenster-${w}.click`, click(`fenster-${w}`));
    assert.equal(r.status.data.fenster, w);
    assert.deepEqual(r.effects, []);
  }
});

test('compute: needs >= 2 picked, else no-op (no fetch, no state change)', () => {
  const s0 = loaded();
  assert.deepEqual(go(s0, 'btn-compute.click', click('btn-compute')), { status: s0, effects: [] }, '0 picked');
  const s1 = pick(s0, DONE_IDS[0]);
  assert.deepEqual(go(s1, 'btn-compute.click', click('btn-compute')), { status: s1, effects: [] }, '1 picked');
});

test('compute with >= 2 picked: sets computing, issues the right fetch URL (id order = pick order)', () => {
  const s0 = loaded();
  let s = pick(s0, DONE_IDS[0]);
  s = pick(s, DONE_IDS[1]);
  const r = go(s, 'btn-compute.click', click('btn-compute'));
  assert.equal(r.status.data.computing, true);
  assert.deepEqual(r.effects, [{ fetch: FIXTURE_URLS.profile(DONE_IDS), ok: 'profile.loaded', err: 'profile.failed' }]);
  assert.deepEqual(go(r.status, 'btn-compute.click', click('btn-compute')), { status: r.status, effects: [] }, 'already computing -- no double fetch');
});

test('profile.loaded: stores result, builds the speakers table (rows = profiles), resets speakerId', () => {
  let s = pick(loaded(), DONE_IDS[0]);
  s = pick(s, DONE_IDS[1]);
  const r = go(s, 'profile.loaded', RESULT_FX);
  assert.deepEqual(r.status.data.result, RESULT_FX);
  assert.equal(r.status.data.computing, false);
  assert.equal(r.status.data.speakerId, null);
  const rows = r.status.data[SPEAKERS.name].rows;
  assert.equal(rows.length, RESULT_FX.profiles.length);
  const merz = rows.find(x => x.id === 'sp-merz');
  assert.deepEqual(merz, { id: 'sp-merz', name: 'F. Merz', party: 'CDU', sessions: 2, pairs: 5, widerspricht: 2, konsistent: 3 });
  const v = view(r.status);
  assert.equal(v[SPEAKERS.name].content[0].name, 'speakers-head');
});

test('profile.failed: computing cleared, error set', () => {
  let s = pick(loaded(), DONE_IDS[0]);
  s = pick(s, DONE_IDS[1]);
  const r = go(s, 'profile.failed', { error: 'HTTP 500' });
  assert.equal(r.status.data.computing, false);
  assert.equal(r.status.data.error, 'HTTP 500');
});

function computed() {
  let s = pick(loaded(), DONE_IDS[0]);
  s = pick(s, DONE_IDS[1]);
  return go(s, 'profile.loaded', RESULT_FX).status;
}

test('speaker row click: sets speakerId; view shows that speaker\'s name + findings', () => {
  const s0 = computed();
  const r = go(s0, 'speakers.click', click('speakers', 'speakers-row-sp-merz'));
  assert.equal(r.status.data.speakerId, 'sp-merz');
  assert.deepEqual(r.effects, [{ emit: 'speakers.select', payload: r.status.data[SPEAKERS.name].rows.find(x => x.id === 'sp-merz') }]);
  const v = view(r.status);
  assert.equal(v['detail-title'], 'F. Merz');
  assert.ok(v['detail-body'].some(row => row.content && row.content.includes('WIDERSPRICHT: 2026-09-03')), 'a befund row rendered');
});

test('the 0-pairs speaker (sp-lindner) renders cleanly: no crash, honesty line shown', () => {
  const s0 = computed();
  const r = go(s0, 'speakers.click', click('speakers', 'speakers-row-sp-lindner'));
  assert.equal(r.status.data.speakerId, 'sp-lindner');
  const v = view(r.status);
  assert.equal(v['detail-title'], 'C. Lindner');
  assert.ok(v['detail-body'].some(row => row.content === 'Keine klassifizierten Paare für diese Person.'));
});

test('fenster click after compute switches the CURRENT bucket display, no re-fetch', () => {
  const s0 = computed();
  let s = go(s0, 'speakers.click', click('speakers', 'speakers-row-sp-merz')).status;
  const before = view(s)['detail-body'];
  const r = go(s, 'fenster-jahr.click', click('fenster-jahr'));
  assert.equal(r.status.data.fenster, 'jahr');
  assert.deepEqual(r.effects, []);
  const after = view(r.status)['detail-body'];
  assert.notDeepEqual(before, after, 'bucket rows differ between wahlperiode and jahr for sp-merz');
});

test('refresh -> loading with 1 fetch, KEEPS picked + result (only runs reload); retry same shape', () => {
  const s0 = computed();
  const withSel = go(s0, 'speakers.click', click('speakers', 'speakers-row-sp-merz')).status;
  const r = go(withSel, 'btn-refresh.click');
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, [RUNS_FETCH]);
  assert.equal(r.status.data.error, null);
  assert.deepEqual(r.status.data.picked, withSel.data.picked, 'picked survives a refresh');
  assert.deepEqual(r.status.data.result, withSel.data.result, 'result survives a refresh (only runs reload)');
  assert.equal(r.status.data.speakerId, withSel.data.speakerId);
  const back = go(r.status, 'runs.loaded', RUNS_FX);
  assert.equal(back.status.state, 'ready');
  assert.deepEqual(back.status.data.result, withSel.data.result);
});

test('failed -> error: status-text, Retry in run-picker; retry re-issues the fetch', () => {
  let r = go(start().status, 'runs.failed', { error: 'HTTP 500' });
  assert.equal(r.status.state, 'error');
  assert.equal(r.status.data.error, 'HTTP 500');
  const v = view(r.status);
  assert.equal(v['status-text'], 'failed: HTTP 500');
  assert.deepEqual(v['run-picker'], { content: [{ name: 'btn-retry', box: 'row, mid, packed, pad:2, solid, rounded', content: 'Retry' }], state: '' });
  assert.deepEqual(v['btn-retry'], { state: 'error' });
  assert.deepEqual(go(r.status, 'runs.loaded', RUNS_FX), { status: r.status, effects: [] }, 'late result inert in error');
  r = go(r.status, 'btn-retry.click');
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, [RUNS_FETCH]);
  assert.equal(r.status.data.error, null);
});

test('nav click emits nav.go with the target; theme click emits theme.toggle; both stay ready', () => {
  const s = loaded();
  for (const to of ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'settings']) {
    const r = go(s, `nav-${to}.click`, click(`nav-${to}`));
    assert.equal(r.status.state, 'ready');
    assert.deepEqual(r.effects, [{ emit: 'nav.go', payload: { to } }]);
  }
  assert.deepEqual(go(s, 'btn-theme.click', click('btn-theme')).effects, [{ emit: 'theme.toggle' }]);
  assert.deepEqual(go(start().status, 'nav-dashboard.click', click('nav-dashboard')), { status: start().status, effects: [] }, 'inert while loading');
});

test('unknown trigger throws (C2); makeHandlers keyed correctly for a real backend swap', () => {
  assert.throws(() => go(loaded(), 'btn-primary.click'), /unknown trigger/);
  for (const k of ['run-picker.click', 'fenster-tag.click', 'btn-compute.click', 'speakers.click', 'speakers.scroll'])
    assert.equal(typeof handlers[k], 'function', k);
  const h2 = makeHandlers({ profile: (ids) => `/api/profile?runs=${ids.join(',')}` });
  const s = pick(pick(loaded(), DONE_IDS[0]), DONE_IDS[1]);
  const r = step(M, s, 'btn-compute.click', click('btn-compute'), h2);
  assert.deepEqual(r.effects, [{ fetch: `/api/profile?runs=${DONE_IDS.join(',')}`, ok: 'profile.loaded', err: 'profile.failed' }]);
});
