import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, parse, print } from '../../ui/model.js';
import { loadRegistry } from './registry.js';

const RESERVED = new Set(['extends', 'box', 'content', 'children',
  'name', 'path', 'from', 'to', 'relation', 'motion']);

function walkKeys(node, id) {
  for (const k of Object.keys(node))
    assert.ok(RESERVED.has(k), `${id}: unknown key '${k}'`);
  for (const c of node.children ?? []) walkKeys(c, id);
}

const reg = loadRegistry();

test('registry non-empty', () => assert.ok(Object.keys(reg).length >= 3));

test('every part resolves, keys reserved, tokens print-stable', () => {
  for (const [id, doc] of Object.entries(reg)) {
    walkKeys(doc, id);
    const n = resolve(doc, reg);           // throws on unknown token/id/cycle
    if (n.box) assert.deepEqual(parse(print(n.box, 'box'), 'box'), n.box, id);
  }
});

test('variant naming: type.variant extends its type', () => {
  for (const [id, doc] of Object.entries(reg)) {
    const i = id.lastIndexOf('.');
    if (i > id.lastIndexOf('/'))
      assert.equal(doc.extends, id.slice(0, i), `${id} must extend its type`);
  }
});

test('classification rule holds', () => {
  const named = []; // filled task 6-8; rule checked structurally here
  for (const [id, doc] of Object.entries(reg)) {
    const n = resolve(doc, reg);
    if (id.startsWith('atom/'))   assert.ok(!n.children, `${id}: atom must have no children`);
    if (id.startsWith('screens/')) assert.ok(n.children?.length, `${id}: screen needs children`);
  }
});
