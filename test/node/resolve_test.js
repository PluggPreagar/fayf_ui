import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, diff } from '../../ui/model.js';

const reg = {
  'base/box': { box: 'stack, hug, bare, square' },
  'atom/button': { extends: 'base/box',
    box: 'row, mid, packed, pad:2, solid, rounded', content: 'Go' },
  'atom/button.primary': { extends: 'atom/button', box: 'tint3' },
};

test('extends merges per dial', () => {
  const n = resolve(reg['atom/button'], reg);
  assert.equal(n.box.direction, 'row');      // child wins
  assert.equal(n.box.size, 'hug');           // parent survives
  assert.equal(n.content, 'Go');
  assert.equal(n.extends, undefined);
});
test('extends with per-instance override', () => {
  const n = resolve({ extends: 'atom/button', box: 'square', content: 'A' }, reg);
  assert.equal(n.box.radius, 'square');
  assert.equal(n.box.direction, 'row');
  assert.equal(n.content, 'A');
});
test('children resolve and replace wholesale', () => {
  const n = resolve({ box: 'row', children: [{ extends: 'atom/button' }] }, reg);
  assert.equal(n.children[0].box.stroke, 'solid');
});
test('bare string child is shorthand for hug + content', () => {
  const n = resolve({ box: 'stack', children: ['Score', '128 pts'] }, reg);
  assert.deepEqual(n.children[0], resolve({ box: 'hug', content: 'Score' }, reg));
  assert.equal(n.children[1].content, '128 pts');
});
test('bare string as the whole doc resolves the same way', () => {
  assert.deepEqual(resolve('Score', reg), resolve({ box: 'hug', content: 'Score' }, reg));
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

// conditional resolve — env-scoped extends/box switch (TODO-4)
const condDoc = { name: 'cta', conditional: [
  { condition: ['mobile', 'dark'], extends: 'atom/button.primary', box: 'w:20' },
  { condition: ['mobile'], extends: 'atom/button' },
  { extends: 'atom/button.primary' } ] };

test('conditional: no env → unconditioned default wins', () => {
  const n = resolve(condDoc, reg, []);
  assert.equal(n.box['fill-tint'], 'tint3');   // atom/button.primary
});
test('conditional: matching env picks the specific candidate', () => {
  const n = resolve(condDoc, reg, ['mobile']);
  assert.equal(n.box.stroke, 'solid');
  assert.equal(n.box['fill-tint'], undefined); // plain atom/button, no tint
});
test('conditional: most-specific candidate wins over a partial match', () => {
  const n = resolve(condDoc, reg, ['mobile', 'dark']);
  assert.equal(n.box.w, 20);
  assert.equal(n.box['fill-tint'], 'tint3');
});
test('conditional: outer name preserved on the winning candidate', () => {
  const n = resolve(condDoc, reg, ['mobile']);
  assert.equal(n.name, 'cta');
});
test('conditional: tie at same specificity throws', () => {
  const tie = { conditional: [
    { condition: ['mobile'], extends: 'atom/button' },
    { condition: ['dark'], extends: 'atom/button.primary' } ] };
  assert.throws(() => resolve(tie, reg, ['mobile', 'dark']), /ambiguous/);
});
test('conditional: no matching candidate throws', () => {
  const noDefault = { conditional: [
    { condition: ['mobile'], extends: 'atom/button' } ] };
  assert.throws(() => resolve(noDefault, reg, ['desktop']), /no candidate matches/);
});
test('conditional: unknown condition token throws', () => {
  const bad = { conditional: [
    { condition: ['flying'], extends: 'atom/button' },
    { extends: 'atom/button.primary' } ] };
  assert.throws(() => resolve(bad, reg, ['flying']), /unknown condition token 'flying'/);
});
test('conditional: env unaffected by unrelated resolve calls (no leakage)', () => {
  const a = resolve(condDoc, reg, ['mobile']);
  const b = resolve(reg['atom/button.primary'], reg);
  assert.equal(a.box.stroke, 'solid');
  assert.equal(b.box['fill-tint'], 'tint3');
});
