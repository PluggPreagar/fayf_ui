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
    assert.deepEqual(Object.keys(i).sort(), ['id', 'number', 'page', 'status', 'title']);
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

test('list.loaded: master tree populated, transitions to ready', () => {
  const r = go(start().status, 'list.loaded', LIST_FX);
  assert.equal(r.status.state, 'ready', 'list.loaded -> ready per the machine');
  assert.deepEqual(r.effects, []);
  assert.deepEqual(r.status.data[MASTER.name].rows, LIST_FX);
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
  for (const to of ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'settings']) {
    const r = go(s, `nav-${to}.click`, click(`nav-${to}`));
    assert.equal(r.status.state, 'ready');
    assert.deepEqual(r.effects, [{ emit: 'nav.go', payload: { to } }]);
  }
  assert.deepEqual(go(s, 'btn-theme.click').effects, [{ emit: 'theme.toggle' }]);
});

test('unknown trigger throws (C2); tree handler keyed by master.click', () => {
  assert.throws(() => go(loaded(), 'tile-running.click'), /unknown trigger/);
  assert.equal(typeof handlers['master.click'], 'function');
});
