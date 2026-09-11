import test from 'node:test';
import assert from 'node:assert/strict';
import { treeInit, treeHandlers, treeView } from '../../ui/tree.js';

// C11: tree = pure sub-controller on status.data[spec.name], same pattern as
// ui/table.js (test/node/table_test.js). JSON in, JSON out -- no DOM.
const SPEC = { name: 'master', groupKey: 'status', groupOrder: ['todo', 'doing', 'done'], labelKey: 'title', rowKey: 'id' };
const ROWS = [
  { id: 1, status: 'todo', title: 'Alpha' },
  { id: 2, status: 'doing', title: 'Beta' },
  { id: 3, status: 'todo', title: 'Gamma' },
  { id: 4, status: 'done', title: 'Delta' },
  { id: 5, status: 'done', title: 'Epsilon' },
  // groups not in groupOrder -- defensive, sort after known groups, alphabetical
  { id: 6, status: 'zzz', title: 'Zeta' },
  { id: 7, status: 'aaa', title: 'Eta' },
];
const H = treeHandlers(SPEC);
const S0 = { state: 'ready', data: { master: treeInit(SPEC, ROWS) } };
const click = (...path) => ({ name: 'master', event: 'click', target: path[0], path: [...path, 'master', 'root'] });

test('treeInit: shape', () => {
  assert.deepEqual(treeInit(SPEC, ROWS), { rows: ROWS, open: {}, sel: null });
  assert.deepEqual(treeInit(SPEC).rows, []);
  assert.throws(() => treeInit({ groupKey: 'x', groupOrder: [], labelKey: 'y' }), /spec.name/);
  assert.throws(() => treeInit({ name: 'x', groupOrder: [], labelKey: 'y' }), /groupKey/);
  assert.throws(() => treeInit({ name: 'x', groupKey: 'g', labelKey: 'y' }), /groupOrder/);
  assert.throws(() => treeInit({ name: 'x', groupKey: 'g', groupOrder: [] }), /labelKey/);
});

test('treeHandlers: keys are <name>.click only', () => {
  assert.deepEqual(Object.keys(H), ['master.click']);
});

test('group toggle: header click collapses (default expanded), click again expands', () => {
  let s = S0;
  const before = JSON.stringify(s);
  let r = H['master.click'](s, click('master-group-todo'));
  assert.deepEqual(r.status.data.master.open, { todo: false }, 'first click on an unlisted group collapses it');
  assert.equal(r.effects, undefined);
  r = H['master.click'](r.status, click('master-group-todo'));
  assert.deepEqual(r.status.data.master.open, { todo: true });
  assert.equal(JSON.stringify(s), before, 'input status untouched');
});

test('item select: sets sel, emits <name>.select with the row object', () => {
  const r = H['master.click'](S0, click('master-item-3'));
  assert.equal(r.status.data.master.sel, 3);
  assert.deepEqual(r.effects, [{ emit: 'master.select', payload: ROWS[2] }]);
  assert.equal(r.effects[0].payload, ROWS[2], 'the row object itself');
  assert.equal(S0.data.master.sel, null, 'input status untouched');
});

test('item select: unknown row key -> no-op', () => {
  const r = H['master.click'](S0, click('master-item-999'));
  assert.equal(r.status, S0);
  assert.equal(r.effects, undefined);
});

test('click elsewhere (container, unrelated name) -> unchanged status, no effects', () => {
  for (const p of [click(), click('master'), { name: 'master', event: 'click' }, click('unrelated-thing')]) {
    const r = H['master.click'](S0, p);
    assert.equal(r.status, S0);
    assert.equal(r.effects, undefined);
  }
});

test('handlers throw when the sub-status is missing (C2)', () => {
  assert.throws(() => H['master.click']({ state: 'ready', data: {} }, click()), /status.data.master missing/);
});

test('treeView: groupOrder respected, extra groups alphabetical after', () => {
  const v = treeView(SPEC, S0.data.master);
  const names = v.master.content.filter(n => n.name.startsWith('master-group-')).map(n => n.name);
  assert.deepEqual(names, ['master-group-todo', 'master-group-doing', 'master-group-done', 'master-group-aaa', 'master-group-zzz']);
});

test('treeView: empty groups omitted', () => {
  const spec = { name: 'm', groupKey: 'status', groupOrder: ['todo', 'doing', 'done', 'blocked'], labelKey: 'title' };
  const v = treeView(spec, treeInit(spec, ROWS));
  const names = v.m.content.filter(n => n.name.startsWith('m-group-')).map(n => n.name);
  assert.ok(!names.includes('m-group-blocked'), 'blocked has no rows, not painted');
});

test('treeView: group header content = glyph + "group (count)"; state actionable always', () => {
  const v = treeView(SPEC, S0.data.master);
  const todo = v.master.content.find(n => n.name === 'master-group-todo');
  assert.equal(todo.content, '▾ todo (2)');
  assert.deepEqual(v['master-group-todo'], { state: 'actionable' });
});

test('treeView: items only appear in content when their group is open', () => {
  const t = { ...treeInit(SPEC, ROWS), open: { todo: false } };
  const v = treeView(SPEC, t);
  const names = v.master.content.map(n => n.name);
  assert.ok(!names.includes('master-item-1') && !names.includes('master-item-3'), 'todo items hidden while collapsed');
  assert.ok(names.includes('master-item-2'), 'doing items still shown');
  assert.equal(v['master-item-1'], undefined, 'no state patch for an unpainted item');
  const collapsedGlyph = v.master.content.find(n => n.name === 'master-group-todo').content;
  assert.equal(collapsedGlyph, '▸ todo (2)');
});

test('treeView: item content = row[labelKey]; state actionable + selected', () => {
  const t = { ...treeInit(SPEC, ROWS), sel: 4 };
  const v = treeView(SPEC, t);
  const item4 = v.master.content.find(n => n.name === 'master-item-4');
  assert.equal(item4.content, 'Delta');
  assert.deepEqual(v['master-item-4'], { state: 'actionable, selected' });
  assert.deepEqual(v['master-item-5'], { state: 'actionable' });
  assert.equal(treeView(SPEC, { ...t, sel: '4' })['master-item-4'].state, 'actionable, selected', 'sel compared via String()');
});

test('JSON round-trip: treeView output is plain JSON', () => {
  const v = treeView(SPEC, S0.data.master);
  assert.deepEqual(JSON.parse(JSON.stringify(v)), v);
});
