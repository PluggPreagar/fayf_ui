// test/quiz_test.js
import { resolve } from '../ui/model.js';
import { render } from '../ui/render.js';
import { mountQuiz } from '../ui/quiz.js';

const tr = new TestRunner({ stopOnError: false });

tr.addBlock('quiz: hint reveal and multiple-choice flow', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(() => {
     const root = document.querySelector('body > .bx');
     r.check(!!root, 'screen mounted');

     const hintPanel = root.querySelector('[data-name="hint-panel"]');
     r.check(getComputedStyle(hintPanel).visibility === 'hidden', 'hint starts hidden');
     root.querySelector('[data-name="btn-hint"]').click();
     r.check(getComputedStyle(hintPanel).visibility === 'visible', 'hint reveals on click');
     r.check(hintPanel.textContent.includes('divisors'), 'hint shows the real hint text');

     const answers = [...root.querySelectorAll('[data-name^="answer-"]')];
     r.check(answers.length === 4, 'renders 4 answers for lesson1');

     const lockBtn = root.querySelector('[data-name="btn-lock"]');
     r.check(!lockBtn.classList.contains('bx-disabled'), 'lock button enabled in multiple mode');

     const selector0 = root.querySelector('[data-name="selector-0"]');
     const selector1 = root.querySelector('[data-name="selector-1"]');
     r.check(selector0.textContent === '', 'checkbox starts unticked');

     answers[0].click(); // "2", correct
     answers[1].click(); // "4", wrong
     r.check(answers[0].classList.contains('bx-selected'), 'answer 0 marked selected');
     r.check(answers[1].classList.contains('bx-selected'), 'answer 1 marked selected');
     r.check(selector0.textContent === '✓', 'checkbox 0 ticks on click');
     r.check(selector1.textContent === '✓', 'checkbox 1 ticks on click');

     answers[1].click(); // deselect "4"
     r.check(!answers[1].classList.contains('bx-selected'), 'answer 1 deselect works');
     r.check(selector1.textContent === '', 'checkbox 1 unticks on deselect');

     answers[2].click(); // "5", correct -- now selected = {0, 2}, the exact correct set
     lockBtn.click();

     r.check(answers[0].classList.contains('bx-correct'), 'correct answer 0 colorized correct');
     r.check(answers[2].classList.contains('bx-correct'), 'correct answer 2 colorized correct');
     r.check(!answers[1].classList.contains('bx-wrong'), 'unselected wrong answer 1 not marked wrong');
     r.check(!answers[3].classList.contains('bx-wrong'), 'unselected wrong answer 3 not marked wrong');
     r.check(!!answers[0].querySelector('use[href="#icon-done"]'), 'correct answer got the done icon');
   });
});

tr.addBlock('quiz: pause gate then next, click-to-continue skips the timer', (r) => {
  r.run(() => {
    const root = document.querySelector('body > .bx');
    const nextBtn = root.querySelector('[data-name="btn-next"]');
    r.check(nextBtn.classList.contains('bx-disabled'), 'next stays disabled immediately after reveal');
  })
  .run(() => { document.querySelector('body > .bx').click(); }) // click-to-continue, skip the 900ms wait
  .waitFor(() => {
    const nextBtn = document.querySelector('body > .bx [data-name="btn-next"]');
    return !nextBtn.classList.contains('bx-disabled');
  }, 1000, 50, 'next enabled after click-to-continue')
  .run(() => {
    const root = document.querySelector('body > .bx');
    root.querySelector('[data-name="btn-next"]').click();
    r.check(root.querySelector('[data-name="btn-next"]').classList.contains('bx-disabled'),
      'next disabled again -- entering question 2 fresh (lesson1 now has 2 questions)');
    r.check(root.querySelector('[data-name="prompt"]').textContent.includes('prime numbers is true'),
      'prompt advanced to question 2');
  });
});

tr.addBlock('quiz: question 2 renders the sentence (spacious-list) answer layout', (r) => {
  r.run(() => {
    const root = document.querySelector('body > .bx');
    const answers = [...root.querySelectorAll('[data-name^="answer-"]')];
    r.check(answers.length === 3, 'renders 3 answers for question 2');
    r.check(answers[0].dataset.box.includes('h:52'),
      'answer row resolved component/answer.spacious-list (h:52), not the plain base row');
    const selector0 = root.querySelector('[data-name="selector-0"]');
    r.check(getComputedStyle(selector0).width === '18px', 'selector sized up for the sentence layout (w:18)');
    r.check(selector0.classList.contains('bx-circle'), 'single mode still uses a circle selector');

    answers[0].click(); // the correct sentence -- single mode locks in immediately
    r.check(answers[0].classList.contains('bx-correct'), 'correct sentence answer colorized correct');
  })
  .run(() => { document.querySelector('body > .bx').click(); }) // click-to-continue past the pause
  .waitFor(() => {
    const nextBtn = document.querySelector('body > .bx [data-name="btn-next"]');
    return !nextBtn.classList.contains('bx-disabled');
  }, 1000, 50, 'next enabled after question 2 reveal')
  .run(() => {
    const root = document.querySelector('body > .bx');
    root.querySelector('[data-name="btn-next"]').click();
    r.check(root.querySelector('[data-name="btn-next"]').classList.contains('bx-disabled'),
      'next disabled again -- question 2 was the last one, this is real "finish"');
  });
});

// content/quiz/lesson1.json's own single-mode question (Q2, above) already
// exercises a real click, but its answers are 3-5 sentence-length options --
// too few/specific to also isolate the click-to-continue race by itself.
// Build a synthetic single-mode quizData inline instead of touching that
// fixture, and mount a second, independent screens/quiz shell for it (kept
// off `body > .bx` so it can't collide with the two blocks above, which key
// off that exact selector).
let synthetic = null;

tr.addBlock('quiz: single-mode answer click transitions straight to revealed', (r) => {
  r.run(() => {
    (async () => {
      const reg = await (await fetch('/registry.json')).json();
      const container = document.createElement('div');
      container.id = 'synthetic-single-mode-quiz';
      document.body.appendChild(container);
      const freshRoot = render(resolve(reg['screens/quiz'], reg));
      container.appendChild(freshRoot);
      const quizData = {
        id: 'quiz/synthetic-single', questions: [
          { prompt: 'Pick the right one', mode: 'single',
            answers: [
              { text: 'A', correct: false },
              { text: 'B', correct: true },
              { text: 'C', correct: false } ],
            hint: 'synthetic single-mode hint' } ] };
      mountQuiz(freshRoot, quizData, reg);
      synthetic = { container, freshRoot };
    })();
  })
  .waitFor(() => synthetic !== null, 3000, 50, 'synthetic single-mode quiz mounted')
  .run(() => {
    const { freshRoot, container } = synthetic;
    const answers = [...freshRoot.querySelectorAll('[data-name^="answer-"]')];
    r.check(answers.length === 3, 'renders 3 answers for the synthetic single-mode question');

    const nextBtn = freshRoot.querySelector('[data-name="btn-next"]');
    answers[1].click(); // "B", the single correct answer -- no separate lock-in click in single mode
    r.check(answers[1].classList.contains('bx-correct'),
      'single-mode click transitions straight to revealed (correct answer colorized)');
    r.check(!!answers[1].querySelector('use[href="#icon-done"]'),
      'single-mode correct answer got the done icon');
    r.check(nextBtn.classList.contains('bx-disabled'),
      'next stays disabled immediately after single-mode reveal -- proves the click-to-continue race is fixed for single mode too');

    container.remove();
  });
});

// Finding 2 (final review): the real PAUSE_MS timer path is never exercised --
// the block above only ever uses click-to-continue to skip it. Mount a fresh
// synthetic quiz, lock in an answer, then wait past PAUSE_MS without ever
// clicking root/panel, and assert next-ready is reached by the timer alone.
let syntheticPause = null;

tr.addBlock('quiz: real PAUSE_MS timer reaches next-ready with no click-to-continue', (r) => {
  r.run(() => {
    (async () => {
      const reg = await (await fetch('/registry.json')).json();
      const container = document.createElement('div');
      container.id = 'synthetic-pause-timer-quiz';
      document.body.appendChild(container);
      const freshRoot = render(resolve(reg['screens/quiz'], reg));
      container.appendChild(freshRoot);
      const quizData = {
        id: 'quiz/synthetic-pause', questions: [
          { prompt: 'Pick the right one', mode: 'single',
            answers: [
              { text: 'A', correct: false },
              { text: 'B', correct: true } ],
            hint: 'synthetic pause-timer hint' } ] };
      mountQuiz(freshRoot, quizData, reg);
      syntheticPause = { container, freshRoot };
    })();
  })
  .waitFor(() => syntheticPause !== null, 3000, 50, 'synthetic pause-timer quiz mounted')
  .run(() => {
    const { freshRoot } = syntheticPause;
    const answers = [...freshRoot.querySelectorAll('[data-name^="answer-"]')];
    const nextBtn = freshRoot.querySelector('[data-name="btn-next"]');
    answers[1].click(); // "B" -- single mode locks in immediately, entering revealed
    r.check(nextBtn.classList.contains('bx-disabled'),
      'next still disabled right after reveal, before PAUSE_MS has elapsed');
  })
  .wait(1100, 'wait past PAUSE_MS -- no click on root/panel anywhere in this block')
  .run(() => {
    const { freshRoot, container } = syntheticPause;
    const nextBtn = freshRoot.querySelector('[data-name="btn-next"]');
    r.check(!nextBtn.classList.contains('bx-disabled'),
      'next enabled once the real PAUSE_MS timer fires on its own');
    container.remove();
  });
});

// Finding 3 (final review): at the time this was written, content/quiz/
// lesson1.json had exactly one question, so every other block above only
// ever took the "finish" branch out of next-ready (lesson1 has since grown
// a second question -- see the sentence-layout block above -- but this
// synthetic quiz stays useful on its own: it isolates the multiple->single
// selector-shape switch from any real content's specifics). Build a
// synthetic 2-question quiz (multiple, then single, to also confirm the
// selector shape switches) and drive the next -> answering re-entry path.
let syntheticMulti = null;

tr.addBlock('quiz: next -> answering re-entry loads the second question correctly', (r) => {
  r.run(() => {
    (async () => {
      const reg = await (await fetch('/registry.json')).json();
      const container = document.createElement('div');
      container.id = 'synthetic-multi-question-quiz';
      document.body.appendChild(container);
      const freshRoot = render(resolve(reg['screens/quiz'], reg));
      container.appendChild(freshRoot);
      const quizData = {
        id: 'quiz/synthetic-multi', questions: [
          { prompt: 'Question one (multiple)', mode: 'multiple',
            answers: [
              { text: 'A', correct: true },
              { text: 'B', correct: false } ],
            hint: 'hint one' },
          { prompt: 'Question two (single)', mode: 'single',
            answers: [
              { text: 'X', correct: false },
              { text: 'Y', correct: true },
              { text: 'Z', correct: false } ],
            hint: 'hint two' } ] };
      mountQuiz(freshRoot, quizData, reg);
      syntheticMulti = { container, freshRoot };
    })();
  })
  .waitFor(() => syntheticMulti !== null, 3000, 50, 'synthetic multi-question quiz mounted')
  .run(() => {
    const { freshRoot } = syntheticMulti;
    const selector0 = freshRoot.querySelector('[data-name="selector-0"]');
    r.check(selector0.classList.contains('bx-square'), 'question 1 (multiple) uses square selectors');

    const answers = [...freshRoot.querySelectorAll('[data-name^="answer-"]')];
    answers[0].click(); // "A", the correct answer
    freshRoot.querySelector('[data-name="btn-lock"]').click(); // lock in -> revealed
  })
  .wait(1100, 'wait past PAUSE_MS to reach next-ready for question 1')
  .run(() => {
    const { freshRoot } = syntheticMulti;
    const nextBtn = freshRoot.querySelector('[data-name="btn-next"]');
    r.check(!nextBtn.classList.contains('bx-disabled'), 'next-ready reached after question 1');
    nextBtn.click(); // not the last question -> re-enters "answering" for question 2
  })
  .run(() => {
    const { freshRoot } = syntheticMulti;
    r.check(freshRoot.querySelector('[data-name="prompt"]').textContent === 'Question two (single)',
      'prompt text updated to question 2');

    const answers = [...freshRoot.querySelectorAll('[data-name^="answer-"]')];
    r.check(answers.length === 3, 'renders 3 answers for question 2');

    const selector0 = freshRoot.querySelector('[data-name="selector-0"]');
    r.check(selector0.classList.contains('bx-circle'), 'question 2 (single) switches selector shape to circle');
    r.check(!selector0.classList.contains('bx-square'), 'question 2 selector is no longer square');

    const hintPanel = freshRoot.querySelector('[data-name="hint-panel"]');
    r.check(getComputedStyle(hintPanel).visibility === 'hidden', 'hint panel hidden again on re-entry');

    const nextBtn = freshRoot.querySelector('[data-name="btn-next"]');
    r.check(nextBtn.classList.contains('bx-disabled'), 'next disabled again on re-entry into answering');

    answers[1].click(); // "Y", correct -- single mode locks in immediately
  })
  .wait(1100, 'wait past PAUSE_MS to reach next-ready for question 2')
  .run(() => {
    const { freshRoot, container } = syntheticMulti;
    const nextBtn = freshRoot.querySelector('[data-name="btn-next"]');
    r.check(!nextBtn.classList.contains('bx-disabled'), 'next-ready reached after question 2');
    nextBtn.click(); // question 2 is the last one -> "finish"
    r.check(nextBtn.classList.contains('bx-disabled'),
      'next disabled again -- finish reached since question 2 was the last question');
    container.remove();
  });
});

await tr.runBlocks();
