import test from 'node:test';
import assert from 'node:assert/strict';
import { step, init, validateMachine } from '../../ui/machine.js';
import { ROW_H, windowOf, sortRows, tableInit, tableHandlers, tableView } from '../../ui/table.js';

// C11: table = pure sub-controller on status.data[spec.name]. JSON in, JSON
// out -- no DOM. The browser half (test/table_test.js) proves the paint.
const SPEC = { name: 'runs', columns: [{ key: 'id', label: 'ID', w: 60 }, { key: 'status', label: 'Status', w: 80 }, { key: 'name', label: 'Name' }] };
const ROWS = [
  { id: 1, status: 'done', name: 'alpha' },
  { id: 2, status: 'running', name: 'Beta' },
  { id: 3, status: null, name: 'gamma' },
  { id: 4, status: 'done', name: 'delta' },
];
const many = (n) => Array.from({ length: n }, (_, i) => ({ id: i, status: i % 3 ? 'done' : 'running', name: `run ${i}` }));
const H = tableHandlers(SPEC);
const S0 = { state: 'ready', data: { runs: tableInit(SPEC, ROWS) } };
const click = (...path) => ({ name: 'runs', event: 'click', target: path[0], path: [...path, 'runs', 'root'] });
const freeze = (v) => JSON.stringify(v);

test('windowOf: scroll 0 -> start 0, viewport + overscan below', () => {
  assert.deepEqual(windowOf({ scrollTop: 0, clientHeight: 300 }, 2000), { start: 0, count: Math.ceil(300 / ROW_H) + 8 });
});

test('windowOf: middle -> overscan above and below', () => {
  const r = windowOf({ scrollTop: 100 * ROW_H, clientHeight: 280 }, 2000);
  assert.deepEqual(r, { start: 96, count: 10 + 8 });
});

test('windowOf: end clamps count to the rows left', () => {
  const r = windowOf({ scrollTop: 1990 * ROW_H, clientHeight: 280 }, 2000);
  assert.deepEqual(r, { start: 1986, count: 14 });
  assert.deepEqual(windowOf({ scrollTop: 0, clientHeight: 300 }, 3), { start: 0, count: 3 });
  assert.deepEqual(windowOf({ scrollTop: 0, clientHeight: 300 }, 0), { start: 0, count: 0 });
});

test('windowOf: clientHeight 0 (unmeasured) -> 1 + 2*overscan rows', () => {
  assert.deepEqual(windowOf({ scrollTop: 0, clientHeight: 0 }, 2000), { start: 0, count: 9 });
  assert.deepEqual(windowOf({}, 5), { start: 0, count: 5 });
  assert.deepEqual(windowOf({ scrollTop: 0, clientHeight: 0 }, 100, 10, 2), { start: 0, count: 5 });
});

test('sortRows: asc / desc / none; input untouched', () => {
  const before = freeze(ROWS);
  assert.deepEqual(sortRows(ROWS, { key: 'id', dir: 'asc' }).map(r => r.id), [1, 2, 3, 4]);
  assert.deepEqual(sortRows(ROWS, { key: 'id', dir: 'desc' }).map(r => r.id), [4, 3, 2, 1]);
  const none = sortRows(ROWS, null);
  assert.deepEqual(none, ROWS);
  assert.notEqual(none, ROWS, 'new array even for no sort');
  assert.equal(freeze(ROWS), before);
  assert.throws(() => sortRows(ROWS, { key: 'id', dir: 'up' }), /not asc\|desc/);
});

test('sortRows: stable on ties, numeric vs string, null last both ways', () => {
  assert.deepEqual(sortRows(ROWS, { key: 'status', dir: 'asc' }).map(r => r.id), [1, 4, 2, 3], 'done,done (1 before 4), running, null last');
  assert.deepEqual(sortRows(ROWS, { key: 'status', dir: 'desc' }).map(r => r.id), [2, 1, 4, 3], 'null stays last in desc');
  const nums = [{ id: 'a', v: 10 }, { id: 'b', v: 9 }, { id: 'c', v: 100 }];
  assert.deepEqual(sortRows(nums, { key: 'v', dir: 'asc' }).map(r => r.id), ['b', 'a', 'c'], 'numbers numeric, not "10" < "9"');
  const strs = [{ id: 'a', v: '10' }, { id: 'b', v: '9' }, { id: 'c', v: '100' }];
  assert.deepEqual(sortRows(strs, { key: 'v', dir: 'asc' }).map(r => r.id), ['a', 'c', 'b'], 'strings localeCompare');
  assert.deepEqual(sortRows(ROWS, { key: 'name', dir: 'asc' }).map(r => r.name), ['alpha', 'Beta', 'delta', 'gamma'], 'locale order, case-insensitive-ish');
});

test('tableInit: shape', () => {
  assert.deepEqual(tableInit(SPEC, ROWS), { rows: ROWS, sort: null, sel: null, window: { scrollTop: 0, clientHeight: 0 } });
  assert.deepEqual(tableInit(SPEC).rows, []);
  assert.throws(() => tableInit({ columns: [] }), /spec.name/);
  assert.throws(() => tableInit({ name: 'x' }), /spec.columns/);
});

test('tableHandlers: keys are <name>.click and <name>.scroll', () => {
  assert.deepEqual(Object.keys(H).sort(), ['runs.click', 'runs.scroll']);
});

test('header click cycles sort none -> asc -> desc -> none; sel unchanged; input untouched', () => {
  const before = freeze(S0);
  let s = { ...S0, data: { runs: { ...S0.data.runs, sel: 2 } } };
  let r = H['runs.click'](s, click('runs-col-status', 'runs-head'));
  assert.deepEqual(r.status.data.runs.sort, { key: 'status', dir: 'asc' });
  assert.equal(r.effects, undefined);
  r = H['runs.click'](r.status, click('runs-col-status', 'runs-head'));
  assert.deepEqual(r.status.data.runs.sort, { key: 'status', dir: 'desc' });
  r = H['runs.click'](r.status, click('runs-col-status', 'runs-head'));
  assert.equal(r.status.data.runs.sort, null);
  r = H['runs.click'](r.status, click('runs-col-name', 'runs-head'));
  r = H['runs.click'](r.status, click('runs-col-id', 'runs-head'));
  assert.deepEqual(r.status.data.runs.sort, { key: 'id', dir: 'asc' }, 'another column starts at asc');
  assert.equal(r.status.data.runs.sel, 2, 'sel untouched by sorting');
  assert.equal(r.status.state, 'ready');
  assert.equal(freeze(S0), before);
});

test('row click sets sel + emits <name>.select with the row object', () => {
  const r = H['runs.click'](S0, click('runs-row-3'));
  assert.equal(r.status.data.runs.sel, 3);
  assert.deepEqual(r.effects, [{ emit: 'runs.select', payload: ROWS[2] }]);
  assert.equal(r.effects[0].payload, ROWS[2], 'the row object itself');
  assert.notEqual(r.status, S0);
  assert.notEqual(r.status.data.runs, S0.data.runs);
  assert.equal(S0.data.runs.sel, null, 'input status untouched');
  assert.equal(r.status.data.runs.rows, ROWS, 'rows shared, not copied');
});

test('row click uses spec.rowKey; key compared as String()', () => {
  const spec = { name: 'iss', rowKey: 'code', columns: [{ key: 'code', label: 'Code' }] };
  const rows = [{ code: 'A-1' }, { code: 'B-2' }];
  const s = { state: 'ready', data: { iss: tableInit(spec, rows) } };
  const r = tableHandlers(spec)['iss.click'](s, { name: 'iss', event: 'click', target: 'iss-row-B-2', path: ['iss-row-B-2', 'iss', 'root'] });
  assert.equal(r.status.data.iss.sel, 'B-2');
  assert.deepEqual(r.effects, [{ emit: 'iss.select', payload: rows[1] }]);
});

test('click elsewhere (container, spacer, unknown row/col) -> unchanged status, no effects', () => {
  for (const p of [click(), click('runs-head'), click('runs-row-99'), click('runs-col-nope', 'runs-head'), { name: 'runs', event: 'click' }]) {
    const r = H['runs.click'](S0, p);
    assert.equal(r.status, S0);
    assert.equal(r.effects, undefined);
  }
});

test('scroll stores window; input untouched', () => {
  const r = H['runs.scroll'](S0, { name: 'runs', event: 'scroll', target: 'runs', path: ['runs', 'root'], scrollTop: 560, clientHeight: 300 });
  assert.deepEqual(r.status.data.runs.window, { scrollTop: 560, clientHeight: 300 });
  assert.deepEqual(S0.data.runs.window, { scrollTop: 0, clientHeight: 0 });
  assert.deepEqual(H['runs.scroll'](S0, {}).status.data.runs.window, { scrollTop: 0, clientHeight: 0 });
});

test('handlers throw when the sub-status is missing (C2)', () => {
  assert.throws(() => H['runs.click']({ state: 'ready', data: {} }, click()), /status.data.runs missing/);
});

test('tableView: 2000 rows, clientHeight 300 -> header + 2 spacers + a bounded slice', () => {
  const t = { ...tableInit(SPEC, many(2000)), window: { scrollTop: 0, clientHeight: 300 } };
  const v = tableView(SPEC, t);
  const c = v.runs.content;
  const { start, count } = windowOf(t.window, 2000);
  assert.equal(v.runs.state, '');
  assert.equal(c.length, 3 + count);
  assert.ok(count <= 1 + Math.ceil(300 / ROW_H) + 8, `count ${count}`);
  assert.equal(c[0].name, 'runs-head');
  assert.equal(c[1].box, `fixed, h:${start * ROW_H}, bare`, 'top spacer');
  assert.equal(c[c.length - 1].box, `fixed, h:${(2000 - start - count) * ROW_H}, bare`, 'bottom spacer');
  const rows = c.slice(2, -1);
  assert.deepEqual(rows.map(r => r.name), many(2000).slice(start, start + count).map(r => `runs-row-${r.id}`));
  assert.equal(rows[0].box, `row, mid, gap:2, clip, pad:1, bare, fixed, h:${ROW_H}`);
  assert.deepEqual(rows[0].children.map(x => x.box), ['fixed, w:60, clip, bare', 'fixed, w:80, clip, bare', 'fill, clip, bare']);
  assert.deepEqual(rows[1].children.map(x => x.content), ['1', 'done', 'run 1'], 'cells are String(row[key])');
});

test('tableView: spacer heights add up to (total - visible) * ROW_H at every scroll position', () => {
  const total = 2000;
  for (const scrollTop of [0, 5 * ROW_H, 700 * ROW_H + 13, (total - 11) * ROW_H, total * ROW_H]) {
    const t = { ...tableInit(SPEC, many(total)), window: { scrollTop, clientHeight: 300 } };
    const c = tableView(SPEC, t).runs.content;
    const h = (b) => Number(/h:(\d+)/.exec(b.box)[1]);
    const visible = c.length - 3;
    assert.equal(h(c[1]) + h(c[c.length - 1]), (total - visible) * ROW_H, `scrollTop ${scrollTop}`);
    assert.equal(h(c[1]), windowOf(t.window, total).start * ROW_H);
  }
});

test('tableView: header cells, sort marks, actionable/selected tokens', () => {
  const t = { ...tableInit(SPEC, ROWS), sort: { key: 'status', dir: 'desc' }, sel: 4 };
  const v = tableView(SPEC, t);
  const head = v.runs.content[0];
  assert.equal(head.box, 'row, mid, gap:2, clamp, pad:1, hairline, tint1');
  assert.deepEqual(head.children.map(h => h.name), ['runs-col-id', 'runs-col-status', 'runs-col-name']);
  assert.deepEqual(head.children.map(h => h.box), [
    'row, mid, between, fixed, w:60, h:20, clip, bare',
    'row, mid, between, fixed, w:80, h:20, clip, bare',
    'row, mid, between, fill, h:20, clip, bare',
  ]);
  assert.deepEqual(head.children.map(h => h.children), [['ID', ''], ['Status', '▼'], ['Name', '']]);
  assert.deepEqual(v.runs.content.slice(2, -1).map(r => r.name), ['runs-row-2', 'runs-row-1', 'runs-row-4', 'runs-row-3'], 'rows painted in sort order');
  for (const k of ['id', 'status', 'name']) assert.deepEqual(v[`runs-col-${k}`], { state: 'actionable' });
  assert.deepEqual(v['runs-row-4'], { state: 'actionable, selected' });
  assert.deepEqual(v['runs-row-1'], { state: 'actionable' });
  assert.equal(tableView(SPEC, { ...t, sort: { key: 'status', dir: 'asc' } }).runs.content[0].children[1].children[1], '▲');
  assert.equal(tableView(SPEC, { ...t, sel: '4' })['runs-row-4'].state, 'actionable, selected', 'sel compared via String()');
  assert.equal(tableView(SPEC, { ...t, sel: null })['runs-row-4'].state, 'actionable');
  assert.equal(tableView(SPEC, { ...t, sort: null }).runs.content[0].children[1].children[1], '');
});

test('tableView: only visible rows get state patches; rows off-window are absent', () => {
  const t = { ...tableInit(SPEC, many(2000)), window: { scrollTop: 1000 * ROW_H, clientHeight: 300 }, sel: 0 };
  const v = tableView(SPEC, t);
  assert.equal(v['runs-row-0'], undefined, 'selected row off-window: no patch (slot does not exist)');
  assert.deepEqual(v['runs-row-1000'], { state: 'actionable' });
  const names = Object.keys(v).filter(k => k.startsWith('runs-row-'));
  assert.equal(names.length, v.runs.content.length - 3);
});

test('composition: tiny machine + tableHandlers via step(); emit surfaces; view merges', () => {
  const M = validateMachine({ initial: 'ready', states: { ready: { 'runs.click': 'ready', 'runs.scroll': 'ready' } } });
  const handlers = { ...H };
  const view = (s) => ({ title: `${s.data.runs.rows.length} runs`, ...tableView(SPEC, s.data.runs) });
  let s = init(M, { runs: tableInit(SPEC, ROWS) }).status;
  let r = step(M, s, 'runs.click', click('runs-row-2'), handlers);
  assert.equal(r.status.state, 'ready');
  assert.equal(r.status.data.runs.sel, 2);
  assert.deepEqual(r.effects, [{ emit: 'runs.select', payload: ROWS[1] }]);
  r = step(M, r.status, 'runs.scroll', { name: 'runs', event: 'scroll', target: 'runs', path: ['runs', 'root'], scrollTop: 0, clientHeight: 120 }, handlers);
  assert.deepEqual(r.status.data.runs.window, { scrollTop: 0, clientHeight: 120 });
  r = step(M, r.status, 'runs.click', click('runs-col-name', 'runs-head'), handlers);
  const v = view(r.status);
  assert.equal(v.title, '4 runs');
  assert.equal(v.runs.content[0].name, 'runs-head');
  assert.deepEqual(v.runs.content.slice(2, -1).map(x => x.name), ['runs-row-1', 'runs-row-2', 'runs-row-4', 'runs-row-3']);
  assert.equal(v['runs-row-2'].state, 'actionable, selected');
  assert.equal(s.data.runs.sel, null, 'initial status untouched through the whole drive');
});
