// too-much-space mechanism 2 (TODO-5): component/answer.buzzer /
// .spacious-list variants, selected via the TODO-4 conditional/'spacious'
// condition -- same shape ui/quiz.js's answerNode() builds at runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from '../../ui/model.js';
import { loadRegistry } from './registry.js';

const reg = loadRegistry();

function answerDoc(target) {
  return { name: 'answer-0', conditional: [
    ...(target ? [{ condition: ['spacious'], extends: target }] : []),
    { extends: 'component/answer' } ] };
}

test('no layout -> plain component/answer regardless of env', () => {
  const n = resolve(answerDoc(null), reg, ['spacious']);
  assert.equal(n.box.size, 'clamped');
  assert.equal(n.box['fill-tint'], undefined);
});

test('buzzer layout + spacious env -> component/answer.buzzer wins', () => {
  const n = resolve(answerDoc('component/answer.buzzer'), reg, ['spacious']);
  assert.equal(n.box.w, 136);
  assert.equal(n.box['fill-tint'], 'tint2');
});

test('buzzer layout without spacious env -> falls back to component/answer', () => {
  const n = resolve(answerDoc('component/answer.buzzer'), reg, []);
  assert.equal(n.box.size, 'clamped');
  assert.equal(n.box['fill-tint'], undefined);
});

test('spacious-list layout + spacious env -> component/answer.spacious-list wins', () => {
  const n = resolve(answerDoc('component/answer.spacious-list'), reg, ['spacious']);
  assert.equal(n.box.gap, 2);
  assert.equal(n.box.h, 52);
});
