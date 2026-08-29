import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, print, distributeGrowth, parseGapGrowth } from '../../ui/model.js';

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
test('job-lifecycle state values', () => {
  for (const s of ['running', 'paused', 'blocked', 'cancelled', 'done'])
    assert.deepEqual(parse(s), { state: s });
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

// elastic gap growth suffix -- too-much-space mechanism 1
test('gap without growth suffix stays a plain number', () => {
  assert.deepEqual(parse('gap:2'), { gap: 2 });
});
test('gap with + growth suffix parses as a string token', () => {
  assert.deepEqual(parse('gap:2+'), { gap: '2+' });
});
test('gap with ++ growth suffix parses as a string token', () => {
  assert.deepEqual(parse('gap:2++'), { gap: '2++' });
});
test('growth suffix on a non-gap numeric throws', () => {
  assert.throws(() => parse('w:80+'), /growth suffix only valid on 'gap'/);
});
test('growth suffix print round-trip', () => {
  assert.equal(print(parse('gap:2+')), 'gap:2+');
  assert.deepEqual(parse(print(parse('gap:2++'))), parse('gap:2++'));
});

// distributeGrowth -- pure excess->gap distribution (too-much-space mechanism 1)
test('distributeGrowth: no growable slots -> leftover = excess unchanged', () => {
  const { values, leftover } = distributeGrowth([{ base: 8, allow: 0 }, { base: 12, allow: 0 }], 40);
  assert.deepEqual(values, [8, 12]);
  assert.equal(leftover, 40);
});
test('distributeGrowth: single growable slot consumes excess up to its cap', () => {
  const { values, leftover } = distributeGrowth([{ base: 8, allow: 16 }], 40);
  assert.deepEqual(values, [24]);
  assert.equal(leftover, 24);
});
test('distributeGrowth: single growable slot below cap consumes proportional share', () => {
  const { values, leftover } = distributeGrowth([{ base: 8, allow: 16 }], 10);
  assert.deepEqual(values, [18]);
  assert.equal(leftover, 0);
});
test('distributeGrowth: multiple slots split proportional to allowance weight', () => {
  const { values, leftover } = distributeGrowth([{ base: 4, allow: 8 }, { base: 8, allow: 24 }], 16);
  assert.deepEqual(values, [8, 20]);
  assert.equal(leftover, 0);
});
test('distributeGrowth: negative excess never shrinks below base', () => {
  const { values, leftover } = distributeGrowth([{ base: 8, allow: 16 }], -20);
  assert.deepEqual(values, [8]);
  assert.equal(leftover, -20);
});
test('distributeGrowth: caps keep leftover for margins even when excess exceeds total allowance', () => {
  const { values, leftover } = distributeGrowth([{ base: 4, allow: 4 }, { base: 4, allow: 4 }], 100);
  assert.deepEqual(values, [8, 8]);
  assert.equal(leftover, 92);
});

// discrete text-size dial -- carried internally by atom/text.* parts only
test('font numeric parses', () => {
  assert.deepEqual(parse('font:17'), { font: 17 });
});

// parseGapGrowth -- decodes a growth-suffixed gap value for the L2 renderer
test('parseGapGrowth: + suffix', () => {
  assert.deepEqual(parseGapGrowth('2+'), { base: 2, allow: 2 });
});
test('parseGapGrowth: ++ suffix', () => {
  assert.deepEqual(parseGapGrowth('2++'), { base: 2, allow: 4 });
});
test('parseGapGrowth: plain number (no suffix) returns null', () => {
  assert.equal(parseGapGrowth(2), null);
});
