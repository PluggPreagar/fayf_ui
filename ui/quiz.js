// ui/quiz.js -- quiz controller, L9 (C11). machines/quiz.json is the
// machine; everything here is pure (handlers, view) except the two mount
// functions, which only hand the machine to ui/machine.js.
//
// status.data = { url?, quiz, q, selected: [i], hint, error }
import quizMachine from '../machines/quiz.json' with { type: 'json' };
import { mountMachine } from './machine.js';

export { quizMachine };

export function grade(answers, selectedIndices) {
  const correct = new Set(answers.map((a, i) => i).filter(i => answers[i].correct));
  const selected = new Set(selectedIndices);
  if (correct.size !== selected.size) return false;
  for (const i of correct) if (!selected.has(i)) return false;
  return true;
}

function selectorShape(mode) {
  if (mode === 'single') return 'circle';
  if (mode === 'multiple') return 'square';
  throw new Error(`unknown quiz mode '${mode}'`);
}

// `layout` is an optional per-question content field (see content/quiz/*.json)
// that picks which spacious-condition target this question's answer rows
// resolve to -- "content shape is known at authoring time" (too-much-space
// spec, mechanism 2). Absent `layout` -> plain unconditioned component/answer.
function answerTarget(layout) {
  if (layout === 'buzzer') return 'component/answer.buzzer';
  if (layout === 'sentence') return 'component/answer.spacious-list';
  throw new Error(`unknown answer layout '${layout}'`);
}

function answerNode(index, text, mode, layout, tick, mark) {
  const selSize = layout ? 18 : 12;
  return {
    name: `answer-${index}`,
    conditional: [
      ...(layout ? [{ condition: ['spacious'], extends: answerTarget(layout) }] : []),
      { extends: 'component/answer' },
    ],
    children: [
      { name: `selector-${index}`, box: `fixed, w:${selSize}, h:${selSize}, solid, mid, evenly, ${selectorShape(mode)}`, content: tick ? '✓' : '' },
      { box: 'hug', content: text },
      ...(mark ? [{ name: `icon-${mark}`, box: 'fixed, w:14, h:14' }] : []),
    ],
  };
}

const REVEALED = new Set(['revealed', 'next-ready', 'finished']);
const fetchQuiz = (url) => ({ fetch: url, ok: 'flow.loaded', err: 'flow.failed' });
const withData = (s, patch) => ({ ...s, data: { ...s.data, ...patch } });
const answerIndex = (path) => {
  for (const n of path || []) { const m = /^answer-(\d+)$/.exec(n); if (m) return Number(m[1]); }
  return null;
};

// Pure. (status, payload) -> { status, effects? }
export const handlers = {
  'flow.load':   (s, p) => ({ status: withData(s, { url: p.url, error: null }), effects: [fetchQuiz(p.url)] }),
  'btn-retry.click': (s) => ({ status: withData(s, { error: null }), effects: [fetchQuiz(s.data.url)] }),
  'flow.loaded': (s, quiz) => ({ status: withData(s, { quiz, q: 0, selected: [], hint: false, error: null }) }),
  'flow.failed': (s, p) => ({ status: withData(s, { error: p.error }) }),
  'btn-hint.click': (s) => ({ status: withData(s, { hint: true }) }),
  // A click anywhere while answering: only an answer row means something.
  'root.click': (s, p) => {
    if (s.state !== 'answering') return { status: s };
    const i = answerIndex(p && p.path);
    if (i == null) return { status: s };
    const q = s.data.quiz.questions[s.data.q];
    if (q.mode === 'single') return { status: withData(s, { selected: [i] }), effects: [{ send: 'flow.lock' }] };
    const selected = s.data.selected.includes(i) ? s.data.selected.filter(x => x !== i) : [...s.data.selected, i];
    return { status: withData(s, { selected }) };
  },
  // One button, two jobs: "Check" while answering (multiple mode), "Next" once revealed.
  'btn-action.click': (s) => {
    if (s.state === 'answering') {
      const q = s.data.quiz.questions[s.data.q];
      return q.mode === 'multiple' ? { status: s, effects: [{ send: 'flow.lock' }] } : { status: s };
    }
    if (s.state === 'next-ready') {
      const last = s.data.q + 1 >= s.data.quiz.questions.length;
      return { status: s, effects: [{ send: last ? 'flow.finish' : 'flow.next' }] };
    }
    return { status: s };
  },
  'flow.next': (s) => ({ status: withData(s, { q: s.data.q + 1, selected: [], hint: false }) }),
};

// Pure. status -> { name: patch }
export function view(s) {
  const d = s.data;
  if (s.state === 'idle') return {};
  if (s.state === 'loading') return { answers: { content: [], state: 'loading' } };
  if (s.state === 'error') return {
    answers: { content: [{ name: 'btn-retry', box: 'row, mid, packed, pad:2, solid, rounded', content: 'Retry' }], state: '' },
    'btn-retry': { state: 'error' },
  };
  const q = d.quiz.questions[d.q];
  const selected = new Set(d.selected);
  const revealed = REVEALED.has(s.state);
  const correct = revealed && grade(q.answers, selected);
  const result = revealed ? (correct ? 'correct' : 'wrong') : '';
  const rows = q.answers.map((a, i) => {
    const sel = selected.has(i);
    // Wrong covers both directions: picked one that wasn't correct, or missed one that was.
    const mark = !revealed ? null : a.correct !== sel ? 'cancelled' : a.correct ? 'done' : null;
    return answerNode(i, a.text, q.mode, q.layout, q.mode === 'multiple' && sel, mark);
  });
  // buzzer cells are sized for a 2-col grid, but "answers" is a plain vertical
  // stack -- pair rows into 2-cell row wrappers so the grid actually forms.
  const content = q.layout !== 'buzzer' ? rows
    : rows.reduce((acc, r, i) => (i % 2 ? acc[acc.length - 1].children.push(r) : acc.push({ box: 'row, gap:1, hug', children: [r] }), acc), []);
  const patches = {
    prompt: { content: q.prompt, state: result },
    'hint-text': q.hint,
    // visibility keeps the panel's footprint; a wrong result reveals the hint by itself.
    'hint-panel': { state: [result, (d.hint || (revealed && !correct)) ? '' : 'hidden'].filter(Boolean).join(', ') },
    answers: { content, env: q.layout ? ['spacious'] : [], state: '' },
    'btn-action': { content: s.state === 'answering' ? 'Check' : 'Next',
                    state: s.state === 'answering' && q.mode !== 'multiple' ? 'disabled' : '' },
  };
  q.answers.forEach((a, i) => {
    const sel = selected.has(i);
    const rowMark = !revealed ? '' : a.correct !== sel ? 'wrong' : a.correct ? 'correct' : '';
    patches[`answer-${i}`] = { state: [revealed ? 'readonly' : 'actionable', sel ? 'selected' : '', rowMark].filter(Boolean).join(', ') };
  });
  return patches;
}

function mount(root, reg, opts = {}) {
  // box.size:fill sets align-self:stretch as a side effect (checklist #11) --
  // right for "grow to fill", wrong for the parent's own mid request. Override
  // just the alignment; no vocabulary dial models "align: self".
  const quizBody = root.querySelector('[data-name="quiz-body"]');
  if (quizBody) quizBody.style.alignSelf = 'center';
  return mountMachine(root, root, quizMachine, handlers, { reg, view, ...opts });
}

export function mountQuiz(root, quizData, reg = {}) {
  const ctl = mount(root, reg);
  ctl.dispatch('flow.loaded', quizData);
  return ctl;
}

// Fetch + mount: `loading` while the fetch is in flight, `error` with an
// actionable Retry when it fails. Resolves once the machine left `loading`.
export function mountQuizFromUrl(root, url, reg = {}) {
  return new Promise((done) => {
    const ctl = mount(root, reg, { onStatus: (s) => { if (s.state !== 'loading' && s.state !== 'idle') done(ctl); } });
    ctl.dispatch('flow.load', { url });
  });
}
