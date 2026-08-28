import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, print } from '../../ui/model.js';

test('parse enum tokens', () => {
  assert.deepEqual(parse('row, hug, solid, rounded'),
    { direction: 'row', size: 'hug', stroke: 'solid', radius: 'rounded' });
});
test('parse list form', () => {
  assert.deepEqual(parse(['stack', 'fill']), { direction: 'stack', size: 'fill' });
});
test('pad gap numerics', () => {
  assert.deepEqual(parse('pad:2, gap:1'), { pad: 2, gap: 1 });
});
test('key:value numerics', () => {
  assert.deepEqual(parse('w:120, h:22, opacity:0.5'), { w: 120, h: 22, opacity: 0.5 });
});
test('place both axes', () => {
  assert.deepEqual(parse('floating, center, middle'),
    { position: 'floating', 'place-h': 'center', 'place-v': 'middle' });
});
test('unknown token throws', () => {
  assert.throws(() => parse('centre'), /unknown token 'centre'/);
});
test('duplicate dial throws', () => {
  assert.throws(() => parse('row, stack'), /duplicate dial 'direction'/);
});
test('place with legal position ok', () => {
  assert.deepEqual(parse('floating, center'), { position: 'floating', 'place-h': 'center' });
});
test('place without position throws', () => {
  assert.throws(() => parse('center'), /requires position/);
});
test('place with in-flow position throws', () => {
  assert.throws(() => parse('in-flow, center'), /requires position/);
});
test('path primitive', () => {
  assert.deepEqual(parse('curve, dashed, trim-end:0.35', 'path'),
    { segment: 'curve', dash: 'dashed', 'trim-end': 0.35 });
});
test('print canonical + round-trip', () => {
  const canon = 'row, hug, mid, solid, rounded, w:80, pad:2';
  assert.equal(print(parse('w:80, pad:2, rounded, solid, mid, hug, row')), canon);
  assert.deepEqual(parse(print(parse(canon))), parse(canon));
});
