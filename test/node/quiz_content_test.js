import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const doc = JSON.parse(readFileSync(new URL('../../content/quiz/lesson1.json', import.meta.url)));

test('content file has an id and a non-empty questions array', () => {
  assert.equal(typeof doc.id, 'string');
  assert.ok(Array.isArray(doc.questions) && doc.questions.length >= 1);
});

test('every question has a legal mode, 3-5 answers, and at least one correct', () => {
  for (const q of doc.questions) {
    assert.ok(['single', 'multiple'].includes(q.mode), `illegal mode '${q.mode}'`);
    assert.ok(q.answers.length >= 3 && q.answers.length <= 5, 'answers must be 3-5');
    assert.ok(q.answers.some(a => a.correct === true), 'needs at least one correct answer');
    assert.equal(typeof q.prompt, 'string');
    assert.equal(typeof q.hint, 'string');
    if (q.mode === 'single')
      assert.equal(q.answers.filter(a => a.correct).length, 1, 'single mode needs exactly one correct answer');
  }
});
