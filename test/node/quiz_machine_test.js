import test from 'node:test';
import assert from 'node:assert/strict';
import { init, step, validateMachine } from '../../ui/machine.js';
import { quizMachine, handlers, view, grade } from '../../ui/quiz.js';

// The quiz flow as JSON in, JSON out (C11): machines/quiz.json + pure handlers
// + pure view. Same fixture shapes as test/quiz_test.js, no DOM.
const QUIZ = {
  id: 'q', questions: [
    { prompt: 'Pick both primes', mode: 'multiple', hint: 'divisors',
      answers: [{ text: '2', correct: true }, { text: '4', correct: false }, { text: '5', correct: true }, { text: '6', correct: false }] },
    { prompt: 'Pick B', mode: 'single', hint: 'hint two', layout: 'sentence',
      answers: [{ text: 'A', correct: false }, { text: 'B', correct: true }, { text: 'C', correct: false }] },
  ],
};
const M = quizMachine;
const go = (s, trigger, payload) => step(M, s, trigger, payload, handlers);
// Run a step and any `send` effects it produced, like the controller does.
const drive = (s, trigger, payload) => {
  let r = go(s, trigger, payload), effects = [];
  for (;;) {
    const sends = r.effects.filter(e => 'send' in e);
    effects = effects.concat(r.effects.filter(e => !('send' in e)));
    if (!sends.length) return { status: r.status, effects };
    r = go(r.status, sends[0].send, sends[0].payload);
  }
};
const clickAnswer = (i) => ({ name: 'root', event: 'click', target: `answer-${i}`, path: [`answer-${i}`, 'answers', 'quiz-body', 'root'] });

test('machines/quiz.json validates', () => { assert.equal(validateMachine(M), M); });

test('idle -> flow.loaded -> answering with question 0, nothing selected', () => {
  const s = go(init(M).status, 'flow.loaded', QUIZ).status;
  assert.equal(s.state, 'answering');
  assert.deepEqual({ q: s.data.q, selected: s.data.selected, hint: s.data.hint }, { q: 0, selected: [], hint: false });
});

test('idle -> flow.load -> loading with a fetch effect; flow.failed -> error; retry re-fetches', () => {
  let r = go(init(M).status, 'flow.load', { url: '/content/quiz/x.json' });
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, [{ fetch: '/content/quiz/x.json', ok: 'flow.loaded', err: 'flow.failed' }]);
  r = go(r.status, 'flow.failed', { error: 'HTTP 404' });
  assert.equal(r.status.state, 'error');
  assert.equal(view(r.status)['btn-retry'].state, 'error');
  assert.equal(view(r.status).answers.content[0].name, 'btn-retry');
  r = go(r.status, 'btn-retry.click');
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, [{ fetch: '/content/quiz/x.json', ok: 'flow.loaded', err: 'flow.failed' }]);
  assert.equal(view(r.status).answers.state, 'loading');
  r = go(r.status, 'flow.loaded', QUIZ);
  assert.equal(view(r.status).answers.state, '', 'loading token cleared once answering (state is absolute per paint)');
});

test('multiple mode: answer clicks toggle selection, stay answering; Check locks in', () => {
  let s = go(init(M).status, 'flow.loaded', QUIZ).status;
  s = go(s, 'root.click', clickAnswer(0)).status;
  s = go(s, 'root.click', clickAnswer(1)).status;
  assert.deepEqual(s.data.selected, [0, 1]);
  assert.equal(s.state, 'answering');
  let v = view(s);
  assert.equal(v['answer-0'].state, 'actionable, selected');
  assert.equal(v['answer-2'].state, 'actionable');
  assert.equal(v.answers.content[0].children[0].content, '✓', 'selector 0 ticked');
  assert.equal(v.answers.content[2].children[0].content, '', 'selector 2 unticked');
  assert.equal(v['btn-action'].content, 'Check');
  assert.equal(v['btn-action'].state, '', 'Check enabled in multiple mode');
  assert.equal(v['hint-panel'].state, 'hidden');
  s = go(s, 'root.click', clickAnswer(1)).status;          // deselect 4
  s = go(s, 'root.click', clickAnswer(2)).status;          // select 5 -> exact correct set
  assert.deepEqual(s.data.selected, [0, 2]);
  const r = drive(s, 'btn-action.click');
  assert.equal(r.status.state, 'revealed', 'Check -> send flow.lock -> revealed');
  assert.deepEqual(r.effects, [{ timer: 900, trigger: 'timer.paused' }], 'revealed enters with the pause timer');
  v = view(r.status);
  assert.equal(v.prompt.state, 'correct');
  assert.equal(v['hint-panel'].state, 'correct, hidden', 'correct result does not auto-reveal the hint');
  assert.equal(v['answer-0'].state, 'readonly, selected, correct');
  assert.equal(v['answer-1'].state, 'readonly', 'unselected wrong stays neutral');
  assert.equal(v['answer-2'].state, 'readonly, selected, correct');
  assert.equal(v.answers.content[0].children[2].name, 'icon-done');
  assert.equal(v['btn-action'].content, 'Next');
});

test('a missed correct answer is wrong; wrong overall auto-reveals the hint', () => {
  let s = go(init(M).status, 'flow.loaded', QUIZ).status;
  s = go(s, 'root.click', clickAnswer(0)).status;          // 2 only, 5 missed
  s = drive(s, 'btn-action.click').status;
  const v = view(s);
  assert.equal(grade(QUIZ.questions[0].answers, s.data.selected), false);
  assert.equal(v.prompt.state, 'wrong');
  assert.equal(v['hint-panel'].state, 'wrong', 'visible (no hidden token) + wrong tint');
  assert.equal(v['answer-2'].state, 'readonly, wrong');
  assert.equal(v.answers.content[2].children[2].name, 'icon-cancelled');
  assert.equal(v['answer-1'].state, 'readonly');
});

test('hint button reveals the hint while answering; inert once revealed', () => {
  let s = go(init(M).status, 'flow.loaded', QUIZ).status;
  s = go(s, 'btn-hint.click').status;
  assert.equal(s.data.hint, true);
  assert.equal(view(s)['hint-panel'].state, '');
  assert.equal(view(s)['hint-text'], 'divisors');
  s = drive(go(s, 'root.click', clickAnswer(0)).status, 'btn-action.click').status;
  const r = go(s, 'btn-hint.click');
  assert.deepEqual(r, { status: s, effects: [] }, 'inert in revealed: no-op');
});

test('revealed -> next-ready by timer or by any click; Next advances, resets selection + hint', () => {
  let s = go(init(M).status, 'flow.loaded', QUIZ).status;
  s = go(s, 'btn-hint.click').status;
  s = drive(go(s, 'root.click', clickAnswer(0)).status, 'btn-action.click').status;
  assert.equal(view(s)['btn-action'].state, '', 'Next label while guard (machine) disables it: no btn-action trigger in revealed');
  const byTimer = go(s, 'timer.paused').status;
  const byClick = go(s, 'root.click', { name: 'root', event: 'click', target: 'root', path: ['root'] }).status;
  assert.equal(byTimer.state, 'next-ready');
  assert.equal(byClick.state, 'next-ready');
  const r = drive(byClick, 'btn-action.click');
  assert.equal(r.status.state, 'answering', 'not the last question -> flow.next');
  assert.deepEqual({ q: r.status.data.q, selected: r.status.data.selected, hint: r.status.data.hint }, { q: 1, selected: [], hint: false });
  const v = view(r.status);
  assert.equal(v.prompt.content, 'Pick B');
  assert.equal(v['hint-panel'].state, 'hidden', 'result tint + reveal cleared on re-entry');
  assert.deepEqual(v.answers.env, ['spacious'], 'layout question resolves under the spacious condition');
  assert.equal(v.answers.content[0].conditional[0].extends, 'component/answer.spacious-list');
  assert.ok(v.answers.content[0].children[0].box.includes('circle'), 'single mode -> circle selector');
  assert.ok(v.answers.content[0].children[0].box.includes('w:18'), 'selector sized up for a layout');
  assert.equal(v['btn-action'].state, 'disabled', 'Check disabled in single mode');
});

test('single mode: an answer click locks in at once; last question -> finished', () => {
  let s = go(init(M).status, 'flow.loaded', QUIZ).status;
  s = drive(go(s, 'root.click', clickAnswer(0)).status, 'btn-action.click').status;
  s = drive(go(s, 'timer.paused').status, 'btn-action.click').status;   // -> question 2
  assert.equal(s.data.q, 1);
  let r = drive(s, 'root.click', clickAnswer(1));                        // B, correct
  assert.equal(r.status.state, 'revealed');
  assert.deepEqual(r.status.data.selected, [1]);
  assert.equal(view(r.status)['answer-1'].state, 'readonly, selected, correct');
  assert.equal(view(r.status).answers.content[1].children[0].content, '', 'single mode shows no tick');
  s = go(r.status, 'timer.paused').status;
  r = drive(s, 'btn-action.click');
  assert.equal(r.status.state, 'finished', 'last question -> flow.finish');
  assert.equal(view(r.status)['btn-action'].content, 'Next');
});

test('buzzer layout pairs rows into 2-cell wrappers', () => {
  const quiz = { id: 'b', questions: [{ prompt: 'p', mode: 'single', hint: 'h', layout: 'buzzer',
    answers: [{ text: 'A', correct: true }, { text: 'B', correct: false }, { text: 'C', correct: false }] }] };
  const s = go(init(M).status, 'flow.loaded', quiz).status;
  const c = view(s).answers.content;
  assert.equal(c.length, 2);
  assert.deepEqual(c.map(w => w.children.map(r => r.name)), [['answer-0', 'answer-1'], ['answer-2']]);
});

test('clicks that are not on an answer row change nothing while answering', () => {
  const s = go(init(M).status, 'flow.loaded', QUIZ).status;
  const r = go(s, 'root.click', { name: 'root', event: 'click', target: 'prompt', path: ['prompt', 'quiz-body', 'root'] });
  assert.deepEqual(r.status, s);
});
