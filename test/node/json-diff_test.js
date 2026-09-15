import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenValue, diffJson, fmtVal } from '../../ui/json-diff.js';

test('flattenValue: primitives, nested objects, arrays by index, sorted keys', () => {
  assert.deepEqual(flattenValue(1), { '(value)': 1 });
  assert.deepEqual(flattenValue('x'), { '(value)': 'x' });
  assert.deepEqual(flattenValue(null), { '(value)': null });
  assert.deepEqual(flattenValue({ b: 1, a: 2 }), { a: 2, b: 1 }, 'object keys sorted');
  assert.deepEqual(flattenValue({ a: { b: 1, c: [10, 20] } }), { 'a.b': 1, 'a.c.0': 10, 'a.c.1': 20 });
  assert.deepEqual(flattenValue({}), { '(value)': '{}' }, 'empty object gets a placeholder leaf');
  assert.deepEqual(flattenValue([]), { '(value)': '[]' }, 'empty array gets a placeholder leaf');
});

test('flattenValue: depth cap at 6 collapses to one placeholder entry', () => {
  let deep = 'leaf';
  for (let i = 0; i < 10; i++) deep = { n: deep };
  const flat = flattenValue(deep);
  assert.equal(Object.keys(flat).length, 1);
  const [key] = Object.keys(flat);
  assert.equal(flat[key], '…');
});

test('diffJson: added/removed/changed, sorted by path', () => {
  const rows = diffJson({ a: 1, b: 2, c: 3 }, { a: 1, b: 20, d: 4 });
  assert.deepEqual(rows, [
    { kind: 'changed', path: 'b', oldV: 2, newV: 20 },
    { kind: 'removed', path: 'c', oldV: 3 },
    { kind: 'added', path: 'd', newV: 4 },
  ]);
});

test('diffJson: identical values -> no rows', () => {
  assert.deepEqual(diffJson({ a: [1, 2, { x: 'y' }] }, { a: [1, 2, { x: 'y' }] }), []);
});

test('diffJson: nested path changes report the leaf dot-path, not the whole subtree', () => {
  const rows = diffJson({ a: { b: 1 } }, { a: { b: 2 } });
  assert.deepEqual(rows, [{ kind: 'changed', path: 'a.b', oldV: 1, newV: 2 }]);
});

test('fmtVal: strings as-is, other values JSON-stringified, truncated at 120 chars', () => {
  assert.equal(fmtVal('hi'), 'hi');
  assert.equal(fmtVal(42), '42');
  assert.equal(fmtVal(null), 'null');
  assert.equal(fmtVal({ a: 1 }), '{"a":1}');
  const long = 'x'.repeat(200);
  const out = fmtVal(long);
  assert.equal(out.length, 121);
  assert.ok(out.endsWith('…'));
  assert.equal(out.slice(0, 120), long.slice(0, 120));
});
