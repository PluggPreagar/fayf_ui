// ui/quiz.js -- quiz-specific controller. Page-mount layer, same
// bucket as ui/actions.js -- not part of the box/vocabulary model.
import { createMachine } from './state-machine.js';
import { resolve } from './model.js';
import { render } from './render.js';
import { mountIcons } from './icons.js';

export function grade(answers, selectedIndices) {
  const correct = new Set(answers.map((a, i) => i).filter(i => answers[i].correct));
  const selected = new Set(selectedIndices);
  if (correct.size !== selected.size) return false;
  for (const i of correct) if (!selected.has(i)) return false;
  return true;
}

const PAUSE_MS = 900;

function selectorShape(mode) {
  if (mode === 'single') return 'circle';
  if (mode === 'multiple') return 'square';
  throw new Error(`unknown quiz mode '${mode}'`);
}

function answerNode(index, text, mode) {
  return {
    name: `answer-${index}`,
    box: 'row, mid, gap:1, hug, w:280, solid, rounded, pad:1',
    children: [
      { name: `selector-${index}`, box: `fixed, w:12, h:12, solid, mid, evenly, ${selectorShape(mode)}` },
      { box: 'hug', content: text },
    ],
  };
}

function markNode(kind) {
  return { name: `icon-${kind}`, box: 'fixed, w:14, h:14' };
}

function enterAnswering(ctx, send) {
  const q = ctx.quizData.questions[ctx.qIndex];
  ctx.selected = new Set();
  ctx.promptEl.textContent = q.prompt;
  ctx.promptEl.classList.remove('bx-correct', 'bx-wrong');
  ctx.hintTextEl.textContent = q.hint;
  // visibility, not display: this keeps hint-panel's own footprint
  // reserved in the layout at all times, so revealing it never
  // shifts anything below (e.g. "controls") -- fixed as possible.
  ctx.hintPanelEl.style.visibility = 'hidden';
  ctx.answersEl.replaceChildren();
  ctx.btnNext.classList.add('bx-disabled');
  ctx.btnLock.classList.toggle('bx-disabled', q.mode !== 'multiple');

  ctx.rowListeners = q.answers.map((a, i) => {
    const row = render(resolve(answerNode(i, a.text, q.mode)));
    ctx.answersEl.appendChild(row);
    const onClick = (e) => {
      if (q.mode === 'single') {
        ctx.selected = new Set([i]);
        send('lockIn', e); // pass the triggering event through -- see enterRevealed.
      } else {
        if (ctx.selected.has(i)) ctx.selected.delete(i); else ctx.selected.add(i);
        const isSelected = ctx.selected.has(i);
        row.classList.toggle('bx-selected', isSelected);
        row.querySelector(`[data-name="selector-${i}"]`).textContent = isSelected ? '✓' : '';
      }
    };
    row.addEventListener('click', onClick);
    return [row, onClick];
  });

  ctx.onHint = () => { ctx.hintPanelEl.style.visibility = 'visible'; };
  ctx.hintBtn.addEventListener('click', ctx.onHint);

  ctx.onLock = q.mode === 'multiple' ? (e) => send('lockIn', e) : null;
  if (ctx.onLock) ctx.btnLock.addEventListener('click', ctx.onLock);
}

function exitAnswering(ctx) {
  ctx.rowListeners.forEach(([row, fn]) => row.removeEventListener('click', fn));
  ctx.hintBtn.removeEventListener('click', ctx.onHint);
  if (ctx.onLock) ctx.btnLock.removeEventListener('click', ctx.onLock);
}

function enterRevealed(ctx, send, triggerEvent) {
  const q = ctx.quizData.questions[ctx.qIndex];
  const rows = [...ctx.answersEl.children];
  q.answers.forEach((a, i) => {
    const row = rows[i];
    if (a.correct) {
      row.classList.add('bx-correct');
      row.appendChild(render(resolve(markNode('done'))));
    } else if (ctx.selected.has(i)) {
      row.classList.add('bx-wrong');
      row.appendChild(render(resolve(markNode('cancelled'))));
    }
  });
  mountIcons(ctx.answersEl);

  const correct = grade(q.answers, ctx.selected);
  ctx.promptEl.classList.toggle('bx-correct', correct);
  ctx.promptEl.classList.toggle('bx-wrong', !correct);

  ctx.timer = setTimeout(() => send('paused'), PAUSE_MS);
  // The click that just caused the answering -> revealed transition (lock-in,
  // or a single-mode answer) is still bubbling toward root when this runs, so
  // attaching a plain listener here would let that same click immediately
  // re-trigger it, skipping the PAUSE_MS reveal window entirely. Rather than
  // guessing at a timing gap to dodge that one event, ignore it by identity
  // (the DOM dispatches the exact same Event object to every listener along
  // one bubble path) -- any other click, including one issued a moment
  // later, is a different Event object and continues as normal.
  ctx.onContinue = (e) => { if (e !== triggerEvent) send('paused'); };
  ctx.root.addEventListener('click', ctx.onContinue);
}

function exitRevealed(ctx) {
  clearTimeout(ctx.timer);
  ctx.root.removeEventListener('click', ctx.onContinue);
}

function enterNextReady(ctx) {
  ctx.btnNext.classList.remove('bx-disabled');
  ctx.onNext = () => {
    const isLast = ctx.qIndex + 1 >= ctx.quizData.questions.length;
    if (isLast) { ctx.send('finish'); }
    else { ctx.qIndex += 1; ctx.send('next'); }
  };
  ctx.btnNext.addEventListener('click', ctx.onNext);
}

function exitNextReady(ctx) {
  ctx.btnNext.removeEventListener('click', ctx.onNext);
}

function enterFinished(ctx) {
  ctx.btnNext.classList.add('bx-disabled');
}

const states = {
  answering:    { enter: enterAnswering, exit: exitAnswering, on: { lockIn: 'revealed' } },
  revealed:     { enter: enterRevealed,  exit: exitRevealed,  on: { paused: 'next-ready' } },
  'next-ready': { enter: enterNextReady, exit: exitNextReady, on: { next: 'answering', finish: 'finished' } },
  finished:     { enter: enterFinished },
};

export function mountQuiz(root, quizData) {
  // box.size:fill sets align-self:stretch as a side effect (checklist
  // #11) -- correct for "grow to fill available height" (needed so
  // distribute:between has room to space out quiz-body's own regions
  // depending on viewport height), wrong for the parent's own mid
  // (center) request: stretch pins the fixed-width box to the
  // cross-axis start instead of centering it. Override just the
  // alignment, not the sizing -- inline style always wins over the
  // class, no vocabulary dial models "align: self".
  const quizBody = root.querySelector('[data-name="quiz-body"]');
  if (quizBody) quizBody.style.alignSelf = 'center';
  const ctx = {
    quizData, qIndex: 0, root,
    promptEl: root.querySelector('[data-name="prompt"]'),
    answersEl: root.querySelector('[data-name="answers"]'),
    hintPanelEl: root.querySelector('[data-name="hint-panel"]'),
    hintTextEl: root.querySelector('[data-name="hint-text"]'),
    hintBtn: root.querySelector('[data-name="btn-hint"]'),
    btnLock: root.querySelector('[data-name="btn-lock"]'),
    btnNext: root.querySelector('[data-name="btn-next"]'),
  };
  const machine = createMachine({ states, initial: 'answering', context: ctx });
  ctx.send = machine.send;
  return machine;
}
