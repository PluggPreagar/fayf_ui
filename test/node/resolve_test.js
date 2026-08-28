import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, diff } from '../../ui/model.js';

const reg = {
  'base/box': { box: 'stack, hug, bare, square' },
  'atom/button': { extends: 'base/box',
    box: 'row, mid, packed, pad:2, solid, rounded', content: 'Go' },
};

test('extends merges per dial', () => {
  const n = resolve(reg['atom/button'], reg);
  assert.equal(n.box.direction, 'row');      // child wins
  assert.equal(n.box.size, 'hug');           // parent survives
  assert.equal(n.content, 'Go');
  assert.equal(n.extends, undefined);
});
test('$ref with per-instance override', () => {
  const n = resolve({ $ref: 'atom/button', box: 'square', content: 'A' }, reg);
  assert.equal(n.box.radius, 'square');
  assert.equal(n.box.direction, 'row');
  assert.equal(n.content, 'A');
});
test('children resolve and replace wholesale', () => {
  const n = resolve({ box: 'row', children: [{ $ref: 'atom/button' }] }, reg);
  assert.equal(n.children[0].box.stroke, 'solid');
});
test('cycle throws', () => {
  const bad = { a: { extends: 'b' }, b: { extends: 'a' } };
  assert.throws(() => resolve(bad.a, bad), /cycle/);
});
test('unknown id throws', () => {
  assert.throws(() => resolve({ extends: 'nope' }, reg), /unknown id 'nope'/);
});
test('diff empty on equal, pathed on differ', () => {
  const a = resolve(reg['atom/button'], reg);
  const b = resolve(reg['atom/button'], reg);
  assert.deepEqual(diff(a, b), []);
  b.box.radius = 'pill';
  assert.deepEqual(diff(a, b), ['box.radius: "rounded" ≠ "pill"']);
});
