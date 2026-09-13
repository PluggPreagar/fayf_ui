import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { init, step, validateMachine } from '../../ui/machine.js';
import { issuesMachine, makeHandlers, handlers, view, initialData, STATUSES, MASTER, FIXTURE_URLS } from '../../ui/issues.js';

// The issues flow as JSON in, JSON out (C11): machines/issues.json + pure
// handlers + pure view, on the shipped fixtures. No DOM.
const fixture = (rel) => JSON.parse(readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf-8'));
const LIST_FX = fixture('content/issues.json');
const DETAIL_FX = (id) => fixture(`content/issues/${id}.json`);
const M = issuesMachine;
const LIST_FETCH = { fetch: '/content/issues.json', ok: 'list.loaded', err: 'list.failed' };
const go = (s, trigger, payload, h = handlers) => step(M, s, trigger, payload, h);
const start = () => init(M, initialData());
const click = (name, ...path) => ({ name, event: 'click', target: path[0], path: [...path, name, 'content', 'body', 'root'] });
const loaded = (h = handlers) => go(start().status, 'list.loaded', LIST_FX, h).status;

test('machines/issues.json validates; JSON round-trip identical', () => {
  assert.equal(validateMachine(M), M);
  assert.deepEqual(JSON.parse(JSON.stringify(M)), M);
  assert.deepEqual(JSON.parse(readFileSync(new URL('../../machines/issues.json', import.meta.url), 'utf-8')), M);
});

test('fixtures: list covers all 6 statuses, at least one per status; ids unique', () => {
  assert.ok(LIST_FX.length >= 8, `list ${LIST_FX.length}`);
  for (const i of LIST_FX) {
    assert.deepEqual(Object.keys(i).sort(), ['body', 'id', 'number', 'page', 'status', 'title', ...(i.has_sketch ? ['has_sketch'] : [])].sort());
    assert.ok(STATUSES.includes(i.status), i.status);
  }
  for (const status of STATUSES) assert.ok(LIST_FX.some(i => i.status === status), `no fixture issue with status ${status}`);
  assert.equal(new Set(LIST_FX.map(i => i.id)).size, LIST_FX.length, 'id unique');
  for (const i of LIST_FX) {
    const d = DETAIL_FX(i.id);
    assert.equal(d.id, i.id);
    assert.equal(d.status, i.status);
    assert.match(d.created, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  }
});

test('init -> loading with 1 fetch effect; master tree empty', () => {
  const { status, effects } = start();
  assert.equal(status.state, 'loading');
  assert.deepEqual(effects, [LIST_FETCH]);
  assert.deepEqual(status.data[MASTER.name].rows, []);
  assert.equal(status.data.detail, null);
  assert.equal(status.data.error, null);
});

test('view in loading: status-text "loading…", master empty + loading token', () => {
  const v = view(start().status);
  assert.equal(v['status-text'], 'loading…');
  assert.equal(v['crumb-page'], 'Issues');
  assert.equal(v['detail-title'], 'Detail');
  assert.equal(v['detail-body'], 'Select an issue');
  assert.deepEqual(v[MASTER.name], { content: [], state: 'loading' });
});

test('list.loaded: master tree populated (has_sketch rows get a 📷 title prefix), transitions to ready', () => {
  const r = go(start().status, 'list.loaded', LIST_FX);
  assert.equal(r.status.state, 'ready', 'list.loaded -> ready per the machine');
  assert.deepEqual(r.effects, []);
  assert.deepEqual(r.status.data.allIssues, LIST_FX, 'the raw, undecorated list is kept for re-filtering');
  const rows = r.status.data[MASTER.name].rows;
  assert.equal(rows.length, LIST_FX.length);
  for (let i = 0; i < LIST_FX.length; i++) {
    if (LIST_FX[i].has_sketch) assert.deepEqual(rows[i], { ...LIST_FX[i], title: '📷 ' + LIST_FX[i].title });
    else assert.deepEqual(rows[i], LIST_FX[i]);
  }
  assert.ok(LIST_FX.some(i => i.has_sketch), 'fixture sanity: at least one has_sketch row to exercise the decoration');
});

test('filter-issues.input: matches title OR body (case-insensitive), preserves tree open/sel, empty text resets', () => {
  const s0 = loaded();
  // open a group + select a row first, so the filter must NOT reset either.
  const target = LIST_FX.find(i => i.status === 'open');
  const s1 = go(s0, 'master.click', click(`master-item-${target.id}`)).status;
  const r = go(s1, 'filter-issues.input', { value: 'zoom' });
  assert.equal(r.status.data.filterText, 'zoom');
  const rows = r.status.data[MASTER.name].rows;
  assert.deepEqual(rows.map(x => x.id), ['iss-2'], 'matches title substring, case-insensitive query vs mixed-case title');
  assert.equal(r.status.data[MASTER.name].sel, target.id, 'selection preserved across a filter keystroke');
  // body-only match (the word doesn't appear in any title)
  const r2 = go(r.status, 'filter-issues.input', { value: 'scroll wheel' });
  assert.deepEqual(r2.status.data[MASTER.name].rows.map(x => x.id), ['iss-2'], 'matches body text too');
  // clearing the filter restores every row
  const r3 = go(r2.status, 'filter-issues.input', { value: '' });
  assert.equal(r3.status.data[MASTER.name].rows.length, LIST_FX.length);
});

test('view in ready: status-text counts, tree grouped by status in STATUSES order', () => {
  const s = loaded();
  const v = view(s);
  const openCount = LIST_FX.filter(i => ['open', 'in-progress'].includes(i.status)).length;
  assert.equal(v['status-text'], `${LIST_FX.length} issues · ${openCount} open`);
  const groupNames = v[MASTER.name].content.filter(n => n.name.startsWith('master-group-')).map(n => n.name.slice('master-group-'.length));
  assert.deepEqual(groupNames, STATUSES.filter(st => LIST_FX.some(i => i.status === st)), 'groups in lifecycle order, empty ones omitted');
});

test('master.click select: tree sel set, emit master.select, ADDITIONAL detail fetch effect, detail cleared + loading', () => {
  const s = loaded();
  const target = LIST_FX[0];
  const r = go(s, 'master.click', click(`master-item-${target.id}`));
  assert.equal(r.status.state, 'ready');
  assert.equal(r.status.data[MASTER.name].sel, target.id);
  assert.equal(r.status.data.detail, null);
  assert.equal(r.status.data.detailLoading, true);
  assert.deepEqual(r.effects, [
    { emit: 'master.select', payload: target },
    { fetch: FIXTURE_URLS.detail(target.id), ok: 'detail.loaded', err: 'detail.failed' },
  ]);
});

test('detail.loaded: data.detail set, detailLoading cleared; view shows title + status chips', () => {
  const s0 = loaded();
  const target = LIST_FX.find(i => i.status === 'open') || LIST_FX[0];
  const afterClick = go(s0, 'master.click', click(`master-item-${target.id}`)).status;
  const detail = DETAIL_FX(target.id);
  const r = go(afterClick, 'detail.loaded', detail);
  assert.deepEqual(r.status.data.detail, detail);
  assert.equal(r.status.data.detailLoading, false);
  const v = view(r.status);
  assert.equal(v['detail-title'], `#${detail.number} ${detail.title}`);
  const chips = v['detail-body'][0];
  assert.equal(chips.name, 'detail-status');
  assert.deepEqual(chips.children.map(c => c.name), STATUSES.map(x => `detail-status-${x}`));
  for (const st of STATUSES) assert.deepEqual(v[`detail-status-${st}`], { state: st === detail.status ? 'selected' : 'actionable' });
});

test('detailBody parses recent_actions/marked_elements into a readable list instead of the raw repr text', () => {
  const s0 = loaded();
  const afterClick = go(s0, 'master.click', click('master-item-iss-2')).status;
  const detail = DETAIL_FX('iss-2');
  const s = go(afterClick, 'detail.loaded', detail).status;
  const v = view(s);
  const texts = v['detail-body'].map(n => n.content).filter(c => typeof c === 'string');
  assert.ok(texts.includes('recent_actions'), 'label row present');
  assert.ok(texts.some(t => t.includes('2026-08-03T12:59:38.100Z') && t.includes('click button "Zoom in"')),
    'parsed {ts, action} entry rendered as one readable line, not the raw python-repr string');
  assert.ok(texts.includes('marked_elements'));
  assert.ok(texts.some(t => t === 'div.canvas:nth-of-type(1) > svg.edge-layer'), 'parsed plain-string list entry');
  assert.ok(!texts.some(t => t.includes("[{'ts'")), 'raw repr text never shown verbatim');
});

test('btn-edit only actionable for an open issue; click seeds editText from body (sketch ref stripped)', () => {
  const s0 = loaded();
  const openTarget = LIST_FX.find(i => i.status === 'open');
  const closedTarget = LIST_FX.find(i => i.status !== 'open');
  let s = go(s0, 'master.click', click(`master-item-${openTarget.id}`)).status;
  s = go(s, 'detail.loaded', DETAIL_FX(openTarget.id)).status;
  assert.deepEqual(view(s)['btn-edit'], { state: 'actionable' });

  const r = go(s, 'btn-edit.click');
  assert.equal(r.status.data.editing, true);
  assert.equal(r.status.data.editText, 'Zooming with the scroll wheel snaps to a far zoom level instead of scaling smoothly.',
    'the ![screen sketch](...) markdown ref create_issue appends is stripped back off for editing');
  const v = view(r.status);
  assert.deepEqual(v['detail-body'][0], { name: 'detail-editor', box: 'fill, pad:2, solid, rounded', field: 'textarea', content: r.status.data.editText });
  assert.deepEqual(v['btn-edit'], { state: 'disabled' }, 'no re-entrant edit while already editing');
  // Found live: detailEditor()'s content has no detail-status-* chips at all
  // (that row is part of detailBody()'s read-only rows only) -- patching
  // those slots anyway made ui/machine.js's own name-checked morph throw
  // ("view names slot ... not in screen"), a real crash the first live test
  // of the edit flow hit immediately.
  for (const st of STATUSES) assert.ok(!(`detail-status-${st}` in v), `detail-status-${st} must not be patched while editing`);

  // a non-open issue never gets an actionable Edit button, and clicking it anyway is a no-op
  let s2 = go(s0, 'master.click', click(`master-item-${closedTarget.id}`)).status;
  s2 = go(s2, 'detail.loaded', DETAIL_FX(closedTarget.id)).status;
  assert.deepEqual(view(s2)['btn-edit'], { state: 'disabled' });
  assert.deepEqual(go(s2, 'btn-edit.click').status, s2);
});

test('edit flow, urls.updateBody null (demo): type, cancel discards, save is local-optimistic', () => {
  const s0 = loaded();
  const target = LIST_FX.find(i => i.status === 'open');
  let s = go(s0, 'master.click', click(`master-item-${target.id}`)).status;
  s = go(s, 'detail.loaded', DETAIL_FX(target.id)).status;
  s = go(s, 'btn-edit.click').status;

  const typed = go(s, 'detail-editor.input', { value: 'Edited body text.' }).status;
  assert.equal(typed.data.editText, 'Edited body text.');

  const cancelled = go(typed, 'btn-cancel-edit.click').status;
  assert.equal(cancelled.data.editing, false);
  assert.equal(cancelled.data.editText, '');
  assert.equal(cancelled.data.detail.body, DETAIL_FX(target.id).body, 'cancel discards the edit, detail.body untouched');

  const r = go(typed, 'btn-save-edit.click');
  assert.deepEqual(r.effects, [], 'no backend configured -> no fetch effect');
  assert.equal(r.status.data.editing, false);
  assert.equal(r.status.data.detail.body, 'Edited body text.');
});

test('edit flow, urls.updateBody configured: real POST, save-body.ok/err', () => {
  const urls = { detail: FIXTURE_URLS.detail, status: null, updateBody: (id) => `/api/issues/${id}/body` };
  const h = makeHandlers(urls);
  const target = LIST_FX.find(i => i.status === 'open');
  let s = go(loaded(h), 'master.click', click(`master-item-${target.id}`), h).status;
  s = go(s, 'detail.loaded', DETAIL_FX(target.id), h).status;
  s = go(s, 'btn-edit.click', undefined, h).status;
  s = go(s, 'detail-editor.input', { value: 'Real backend edit.' }, h).status;

  const r = go(s, 'btn-save-edit.click', undefined, h);
  assert.deepEqual(r.effects, [{
    fetch: `/api/issues/${target.id}/body`,
    init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: 'Real backend edit.' }) },
    ok: 'save-body.ok', err: 'save-body.err',
  }]);
  assert.equal(r.status.data.editing, true, 'still editing until the fetch resolves');

  // server re-appends the sketch ref on its own response -- detail.body should
  // reflect exactly what a fresh GET would now return, not the bare edited text.
  const ok = go(r.status, 'save-body.ok', { id: target.id, body: 'Real backend edit.\n\n![screen sketch](x.jpg)' }, h);
  assert.equal(ok.status.data.editing, false);
  assert.equal(ok.status.data.detail.body, 'Real backend edit.\n\n![screen sketch](x.jpg)');
  assert.equal(ok.status.data.saveError, null);

  const err = go(r.status, 'save-body.err', { error: 'HTTP 500', body: { error: 'issue is not open' } }, h);
  assert.equal(err.status.data.saveError, 'issue is not open', 'the server\'s own message wins over the bare HTTP status');
});

test('status chip click, urls.status = null (demo): sets status locally, no effect', () => {
  const s0 = loaded();
  const target = LIST_FX.find(i => i.status === 'open');
  let s = go(s0, 'master.click', click(`master-item-${target.id}`)).status;
  s = go(s, 'detail.loaded', DETAIL_FX(target.id)).status;
  const other = STATUSES.find(x => x !== target.status);
  const r = go(s, `detail-status-${other}.click`);
  assert.equal(r.status.data.detail.status, other);
  assert.deepEqual(r.effects, []);
  // same status clicked again -> no-op
  const r2 = go(r.status, `detail-status-${other}.click`);
  assert.deepEqual(r2.status, r.status);
  assert.deepEqual(r2.effects, []);
});

test('status chip click, no detail selected -> no-op', () => {
  const s = loaded();
  const r = go(s, 'detail-status-open.click');
  assert.deepEqual(r.status, s);
  assert.deepEqual(r.effects, []);
});

test('status chip click, urls.status configured: saving + pendingStatus, POST fetch effect', () => {
  const urls = { detail: FIXTURE_URLS.detail, status: (id, v) => `/api/issues/${id}/status` };
  const h = makeHandlers(urls);
  const s0 = loaded(h);
  const target = LIST_FX.find(i => i.status === 'open');
  let s = go(s0, 'master.click', click(`master-item-${target.id}`), h).status;
  s = go(s, 'detail.loaded', DETAIL_FX(target.id), h).status;
  const other = STATUSES.find(x => x !== target.status);
  const r = go(s, `detail-status-${other}.click`, undefined, h);
  assert.equal(r.status.data.detail.saving, true);
  assert.equal(r.status.data.detail.pendingStatus, other);
  assert.equal(r.status.data.detail.status, target.status, 'status not switched until status.saved');
  assert.deepEqual(r.effects, [{
    fetch: `/api/issues/${target.id}/status`,
    init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: other }) },
    ok: 'status.saved', err: 'status.failed',
  }]);
  const saved = go(r.status, 'status.saved', undefined, h);
  assert.equal(saved.status.data.detail.status, other);
  assert.equal(saved.status.data.detail.saving, false);
  assert.equal(saved.status.data.detail.pendingStatus, null);
});

test('status.failed: saving/pendingStatus cleared, error set, status unchanged', () => {
  const urls = { detail: FIXTURE_URLS.detail, status: (id) => `/api/issues/${id}/status` };
  const h = makeHandlers(urls);
  const target = LIST_FX.find(i => i.status === 'open');
  let s = go(loaded(h), 'master.click', click(`master-item-${target.id}`), h).status;
  s = go(s, 'detail.loaded', DETAIL_FX(target.id), h).status;
  const other = STATUSES.find(x => x !== target.status);
  s = go(s, `detail-status-${other}.click`, undefined, h).status;
  const r = go(s, 'status.failed', { error: 'HTTP 500' }, h);
  assert.equal(r.status.data.detail.status, target.status, 'status stays the old one');
  assert.equal(r.status.data.detail.saving, false);
  assert.equal(r.status.data.detail.pendingStatus, null);
  assert.equal(r.status.data.error, 'HTTP 500');
});

test('list.failed -> error; retry re-issues the fetch', () => {
  let r = go(start().status, 'list.failed', { error: 'HTTP 500' });
  assert.equal(r.status.state, 'error');
  assert.equal(r.status.data.error, 'HTTP 500');
  const v = view(r.status);
  assert.equal(v['status-text'], 'failed: HTTP 500');
  assert.deepEqual(v[MASTER.name], { content: [{ name: 'btn-retry', box: 'row, mid, packed, pad:2, solid, rounded', content: 'Retry' }], state: '' });
  assert.deepEqual(v['btn-retry'], { state: 'error' });
  r = go(r.status, 'btn-retry.click');
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, [LIST_FETCH]);
  assert.equal(r.status.data.error, null);
});

test('refresh from ready -> loading with 1 fetch; error cleared', () => {
  const s = loaded();
  const r = go(s, 'btn-refresh.click');
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, [LIST_FETCH]);
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

test('unknown trigger throws (C2); tree handler keyed by master.click', () => {
  assert.throws(() => go(loaded(), 'tile-running.click'), /unknown trigger/);
  assert.equal(typeof handlers['master.click'], 'function');
});
