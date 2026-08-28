import test from 'node:test';
import assert from 'node:assert/strict';
import { grade } from '../../ui/quiz.js';

const single = [
  { text: 'A', correct: true },
  { text: 'B', correct: false },
];

const multiple = [
  { text: '2', correct: true },
  { text: '4', correct: false },
  { text: '5', correct: true },
  { text: '9', correct: false },
];

test('single mode: selecting the correct answer passes', () => {
  assert.equal(grade(single, [0]), true);
});
test('single mode: selecting the wrong answer fails', () => {
  assert.equal(grade(single, [1]), false);
});
test('multiple mode: exact match of the correct set passes', () => {
  assert.equal(grade(multiple, [0, 2]), true);
});
test('multiple mode: exact match works with a Set too', () => {
  assert.equal(grade(multiple, new Set([2, 0])), true);
});
test('multiple mode: missing one correct answer fails', () => {
  assert.equal(grade(multiple, [0]), false);
});
test('multiple mode: an extra wrong answer selected fails', () => {
  assert.equal(grade(multiple, [0, 1, 2]), false);
});
test('multiple mode: nothing selected fails', () => {
  assert.equal(grade(multiple, []), false);
});
