import test from 'node:test';
import assert from 'node:assert/strict';
import { filetreeInit, filetreeHandlers, filetreeView, setChildren, setLoading, setError } from '../../ui/filetree.js';

// C11: filetree = pure sub-controller on status.data[spec.name], same
// pattern as ui/table.js/ui/tree.js (test/node/table_test.js, tree_test.js).
// Genuinely different shape from ui/tree.js: recursive, N-level, lazy. JSON
// in, JSON out -- no DOM, no fetch (the fetch DECISION belongs to the
// consumer, not this controller).
const SPEC = { name: 'tree' };
const MOUNTS = [{ name: 'runs', label: 'Runs', write: false }, { name: 'backend', label: 'Backend', write: true }];
const H = filetreeHandlers(SPEC);
const nodeName = (path) => `tree-node-${encodeURIComponent(path)}`;
const click = (path, ...rest) => ({ name: 'tree', event: 'click', target: nodeName(path), path: [nodeName(path), ...rest, 'tree', 'root'] });

function withRunsChildren() {
  let t = filetreeInit(SPEC, MOUNTS);
  t = setChildren(t, 'runs', [
    { name: 'run-1', path: 'runs/run-1', kind: 'dir' },
    { name: 'a.json', path: 'runs/a.json', kind: 'file' },
  ]);
  return t;
}

test('filetreeInit: one root dir node per mount, path = mount name', () => {
  const t = filetreeInit(SPEC, MOUNTS);
  assert.deepEqual(t, {
    nodes: [
      { name: 'Runs', path: 'runs', kind: 'dir', open: false, loading: false, error: null, children: null },
      { name: 'Backend', path: 'backend', kind: 'dir', open: false, loading: false, error: null, children: null },
    ],
    sel: null, pendingPath: null,
  });
  assert.deepEqual(filetreeInit(SPEC).nodes, []);
  assert.throws(() => filetreeInit({}), /spec.name/);
});

test('filetreeHandlers: keys are <name>.click only', () => {
  assert.deepEqual(Object.keys(H), ['tree.click']);
});

test('dir click toggles open, pure, no effects (fetch decision is not this controller\'s job)', () => {
  const s0 = { state: 'ready', data: { tree: filetreeInit(SPEC, MOUNTS) } };
  const before = JSON.stringify(s0);
  const r = H['tree.click'](s0, click('runs'));
  assert.equal(r.status.data.tree.nodes[0].open, true);
  assert.equal(r.effects, undefined);
  assert.equal(JSON.stringify(s0), before, 'input status untouched');
  const r2 = H['tree.click'](r.status, click('runs'));
  assert.equal(r2.status.data.tree.nodes[0].open, false, 'click again closes it');
});

test('file click: sets sel, emits <name>.select with the node object; nested (2 levels) works too', () => {
  const s0 = { state: 'ready', data: { tree: withRunsChildren() } };
  const r = H['tree.click'](s0, click('runs/a.json'));
  assert.equal(r.status.data.tree.sel, 'runs/a.json');
  assert.deepEqual(r.effects, [{ emit: 'tree.select', payload: { name: 'a.json', path: 'runs/a.json', kind: 'file', open: false, loading: false, error: null, children: null } }]);
  assert.equal(s0.data.tree.sel, null, 'input status untouched');
});

test('click on a nested dir toggles its own open, leaves siblings/ancestors untouched', () => {
  const s0 = { state: 'ready', data: { tree: withRunsChildren() } };
  const r = H['tree.click'](s0, click('runs/run-1'));
  const runs = r.status.data.tree.nodes[0];
  assert.equal(runs.open, false, 'ancestor (runs mount) itself untouched by a click on its child');
  const run1 = runs.children.find(n => n.path === 'runs/run-1');
  assert.equal(run1.open, true);
});

test('click on an unknown node path -> no-op', () => {
  const s0 = { state: 'ready', data: { tree: filetreeInit(SPEC, MOUNTS) } };
  const r = H['tree.click'](s0, click('nope'));
  assert.equal(r.status, s0);
  assert.equal(r.effects, undefined);
});

test('click elsewhere (no tree-node- name in path) -> unchanged status, no effects', () => {
  const s0 = { state: 'ready', data: { tree: filetreeInit(SPEC, MOUNTS) } };
  for (const p of [{ name: 'tree', event: 'click', target: 'tree', path: ['tree', 'root'] }, { name: 'tree', event: 'click' }]) {
    const r = H['tree.click'](s0, p);
    assert.equal(r.status, s0);
    assert.equal(r.effects, undefined);
  }
});

test('handlers throw when the sub-status is missing (C2)', () => {
  assert.throws(() => H['tree.click']({ state: 'ready', data: {} }, click('runs')), /status.data.tree missing/);
});

test('setChildren: splices at a NESTED node (2 levels deep), clears loading, does not mutate input', () => {
  let t = withRunsChildren();
  t = { ...t, nodes: t.nodes.map(n => n.path === 'runs' ? { ...n, open: true } : n) };
  const before = JSON.stringify(t);
  const t2 = setChildren(t, 'runs/run-1', [{ name: 'x.log', path: 'runs/run-1/x.log', kind: 'file' }]);
  assert.equal(JSON.stringify(t), before, 'input untouched');
  const run1 = t2.nodes[0].children.find(n => n.path === 'runs/run-1');
  assert.deepEqual(run1.children, [{ name: 'x.log', path: 'runs/run-1/x.log', kind: 'file', open: false, loading: false, error: null, children: null }]);
  assert.equal(run1.loading, false);
  // a 3rd level: splice under that just-added node
  const t3 = setChildren(t2, 'runs/run-1/x.log', []);
  const x = t3.nodes[0].children.find(n => n.path === 'runs/run-1').children.find(n => n.path === 'runs/run-1/x.log');
  assert.deepEqual(x.children, [], 'an empty dir: children [] not null');
});

test('setLoading: sets/clears loading at any depth, does not mutate input', () => {
  let t = withRunsChildren();
  const before = JSON.stringify(t);
  const t2 = setLoading(t, 'runs/run-1', true);
  assert.equal(JSON.stringify(t), before, 'input untouched');
  assert.equal(t2.nodes[0].children.find(n => n.path === 'runs/run-1').loading, true);
  const t3 = setLoading(t2, 'runs/run-1', false);
  assert.equal(t3.nodes[0].children.find(n => n.path === 'runs/run-1').loading, false);
});

test('setError: sets error, clears loading, at any depth, does not mutate input', () => {
  let t = withRunsChildren();
  t = setLoading(t, 'runs/run-1', true);
  const before = JSON.stringify(t);
  const t2 = setError(t, 'runs/run-1', 'HTTP 500');
  assert.equal(JSON.stringify(t), before, 'input untouched');
  const run1 = t2.nodes[0].children.find(n => n.path === 'runs/run-1');
  assert.equal(run1.error, 'HTTP 500');
  assert.equal(run1.loading, false);
});

test('filetreeView: closed dir -- glyph, no children walked/painted', () => {
  const t = filetreeInit(SPEC, MOUNTS);
  const v = filetreeView(SPEC, t);
  assert.equal(v.tree.content.length, 2, 'only the 2 mount roots, nothing nested');
  assert.equal(v.tree.content[0].content, '▸ Runs');
  assert.equal(v.tree.content[0].name, 'tree-node-runs');
  assert.deepEqual(v['tree-node-runs'], { state: 'actionable' });
});

test('filetreeView: open dir walks its children, indented by depth; loading dir gets its own glyph', () => {
  let t = withRunsChildren();
  t = { ...t, nodes: t.nodes.map(n => n.path === 'runs' ? { ...n, open: true } : n) };
  let v = filetreeView(SPEC, t);
  const names = v.tree.content.map(n => n.name);
  assert.deepEqual(names, ['tree-node-runs', nodeName('runs/run-1'), nodeName('runs/a.json'), 'tree-node-backend']);
  assert.equal(v.tree.content[0].content, '▾ Runs');
  assert.equal(v.tree.content[1].content, '  ▸ run-1');
  assert.equal(v.tree.content[2].content, '  · a.json');

  const loadingT = setLoading(t, 'runs/run-1', true);
  v = filetreeView(SPEC, loadingT);
  assert.equal(v.tree.content[1].content, '  … run-1');
});

test('filetreeView: file row state actionable + selected when sel matches', () => {
  let t = withRunsChildren();
  t = { ...t, nodes: t.nodes.map(n => n.path === 'runs' ? { ...n, open: true } : n), sel: 'runs/a.json' };
  const v = filetreeView(SPEC, t);
  assert.deepEqual(v[nodeName('runs/a.json')], { state: 'actionable, selected' });
  assert.deepEqual(v[nodeName('runs/run-1')], { state: 'actionable' }, 'a dir is never "selected"');
});

test('JSON round-trip: filetreeView output is plain JSON', () => {
  let t = withRunsChildren();
  t = { ...t, nodes: t.nodes.map(n => n.path === 'runs' ? { ...n, open: true } : n) };
  const v = filetreeView(SPEC, t);
  assert.deepEqual(JSON.parse(JSON.stringify(v)), v);
});
