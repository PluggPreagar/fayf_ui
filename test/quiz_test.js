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
     r.check(getComputedStyle(hintPanel).display === 'none', 'hint starts hidden');
     root.querySelector('[data-name="btn-hint"]').click();
     r.check(getComputedStyle(hintPanel).display !== 'none', 'hint reveals on click');
     r.check(hintPanel.textContent.includes('divisors'), 'hint shows the real hint text');

     const answers = [...root.querySelectorAll('[data-name^="answer-"]')];
     r.check(answers.length === 4, 'renders 4 answers for lesson1');

     const lockBtn = root.querySelector('[data-name="btn-lock"]');
     r.check(!lockBtn.classList.contains('bx-disabled'), 'lock button enabled in multiple mode');

     answers[0].click(); // "2", correct
     answers[1].click(); // "4", wrong
     r.check(answers[0].classList.contains('bx-selected'), 'answer 0 marked selected');
     r.check(answers[1].classList.contains('bx-selected'), 'answer 1 marked selected');

     answers[1].click(); // deselect "4"
     r.check(!answers[1].classList.contains('bx-selected'), 'answer 1 deselect works');

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
      'next disabled again -- lesson1 has only 1 question, so this was "finish"');
  });
});

// content/quiz/lesson1.json (Task 3, already reviewed/approved, asserted verbatim by
// test/node/quiz_content_test.js) only has a "multiple" question -- single mode has
// never been driven through a real click. Build a synthetic single-mode quizData
// inline instead of touching that fixture, and mount a second, independent
// screens/quiz shell for it (kept off `body > .bx` so it can't collide with the
// two blocks above, which key off that exact selector).
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
      mountQuiz(freshRoot, quizData);
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

await tr.runBlocks();
