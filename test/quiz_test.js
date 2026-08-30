// test/quiz_test.js
import { resolve } from '../ui/model.js';
import { render } from '../ui/render.js';
import { mountQuiz, mountQuizFromUrl } from '../ui/quiz.js';
import { mountInspector } from '../ui/inspector.js';

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

     // Real state-rules wiring: a revealed row's per-row click listener is
     // already gone by this point (exitAnswering ran) -- read-only makes
     // that fact visible/inert instead of silently misleading.
     answers.forEach((a, i) => r.check(a.classList.contains('bx-readonly'), `answer ${i} marked read-only once revealed`));
     r.check(answers[0].tabIndex === -1, 'read-only answer dropped from tab order');

     // Same fix, same reasoning, for btn-lock: exitAnswering already
     // removed its click listener, it just hadn't been honest about it
     // (used to stay fully enabled-looking after already locking in).
     r.check(lockBtn.classList.contains('bx-disabled'), 'lock button disabled once locked in -- no longer misleadingly actionable');
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

// Grading: a correct answer the user never selected is just as wrong a call
// as selecting an incorrect one -- both directions of mismatch should color
// red, not just "selected something wrong". Only the selected-wrong
// direction was ever exercised above (lesson1's Q1 test always selects the
// exact correct set).
let syntheticMissed = null;

tr.addBlock('quiz: a missed correct answer is colored wrong, not just left blank', (r) => {
  r.run(() => {
    (async () => {
      const reg = await (await fetch('/registry.json')).json();
      const container = document.createElement('div');
      container.id = 'synthetic-missed-correct-quiz';
      document.body.appendChild(container);
      const freshRoot = render(resolve(reg['screens/quiz'], reg));
      container.appendChild(freshRoot);
      const quizData = {
        id: 'quiz/synthetic-missed', questions: [
          { prompt: 'Pick both primes', mode: 'multiple',
            answers: [
              { text: '2', correct: true },
              { text: '4', correct: false },
              { text: '5', correct: true } ],
            hint: 'synthetic missed-correct hint' } ] };
      mountQuiz(freshRoot, quizData, reg);
      syntheticMissed = { container, freshRoot };
    })();
  })
  .waitFor(() => syntheticMissed !== null, 3000, 50, 'synthetic missed-correct quiz mounted')
  .run(() => {
    const { freshRoot } = syntheticMissed;
    const answers = [...freshRoot.querySelectorAll('[data-name^="answer-"]')];
    answers[0].click(); // "2", correct -- but leave "5" (also correct) unselected
    freshRoot.querySelector('[data-name="btn-lock"]').click();

    r.check(answers[0].classList.contains('bx-correct'), 'selected correct answer colorized correct');
    r.check(!!answers[0].querySelector('use[href="#icon-done"]'), 'selected correct answer got the done icon');
    r.check(answers[1].classList.contains('bx-wrong') === false && answers[1].classList.contains('bx-correct') === false,
      'unselected wrong answer stays neutral, no color either way');
    r.check(answers[2].classList.contains('bx-wrong'),
      'missed correct answer (never selected) is colored wrong, not neutral or correct');
    r.check(!!answers[2].querySelector('use[href="#icon-cancelled"]'),
      'missed correct answer got the cancelled icon, same as a wrongly-selected one');

    const { container } = syntheticMissed;
    container.remove();
  });
});

let inspectorSynthetic = null;

// Finding 3 (final review): this block edits `hint-panel`, which is ALSO
// `ctx.hintPanelEl` in ui/quiz.js -- a cached DOM reference the state
// machine holds from mount time (same for `ctx.hintTextEl`, hint-panel's
// child). The inspector's scoped re-render (capture()+render()+replaceWith)
// replaces hint-panel with a fresh element, so that cached reference now
// points at a detached node. This is the spec's own documented "Re-render"
// limitation -- "if the edited node's own descendants carry live-wired
// state, that resets on replace" -- just applying to the selected node
// itself (which quiz.js happens to cache), not only its descendants.
//
// It is NOT a bug in onChange or the re-render mechanism, and this test
// must not "fix" it by changing that mechanism. What it must do is stop
// silently failing to verify it: the answer-click assertion below only
// proves editing one node doesn't break listeners ELSEWHERE in the tree
// that don't cache a reference to the edited node -- it says nothing about
// the edited node's own cached state, which this block also touches. Pin
// that half with a real, failing-if-it-regresses assertion instead of
// leaving it unverified.
tr.addBlock('quiz: inspector edit on a live quiz does not break OTHER listeners (editing a node the state machine itself caches has a known, asserted limitation)', (r) => {
  r.run(() => {
    (async () => {
      const reg = await (await fetch('/registry.json')).json();
      const container = document.createElement('div');
      container.id = 'synthetic-inspector-quiz';
      document.body.appendChild(container);
      const freshRoot = render(resolve(reg['screens/quiz'], reg));
      container.appendChild(freshRoot);
      const quizData = {
        id: 'quiz/synthetic-inspector', questions: [
          { prompt: 'Pick the right one', mode: 'single',
            answers: [
              { text: 'A', correct: false },
              { text: 'B', correct: true } ],
            hint: 'synthetic inspector hint' } ] };
      mountQuiz(freshRoot, quizData, reg);
      const { destroy } = mountInspector(freshRoot, { sourceId: 'screens/quiz' });
      inspectorSynthetic = { container, freshRoot, destroy };
    })();
  })
  .waitFor(() => inspectorSynthetic !== null, 3000, 50, 'synthetic inspector quiz mounted')
  .run(() => {
    const { freshRoot } = inspectorSynthetic;
    const answersBefore = [...freshRoot.querySelectorAll('[data-name^="answer-"]')];
    r.check(answersBefore.length === 2, 'renders 2 answers before any inspector edit');

    // select+edit a node that is NOT any answer row -- the hint panel's box
    // -- via the inspector, exactly like a real debugging session would.
    const hintPanel = freshRoot.querySelector('[data-name="hint-panel"]');
    r.check(getComputedStyle(hintPanel).visibility === 'hidden', 'hint panel starts hidden, before any edit');
    hintPanel.click();
    r.check(hintPanel.classList.contains('ins-selected'), 'inspector selected the hint panel');
    // quiz.html's own script (Step 1) already mounted its own inspector on
    // the real page before this synthetic block runs, so document already
    // has an earlier .ins-panel for that unrelated container -- each
    // mountInspector() call appends a fresh, independent panel to
    // document.body with no cleanup of prior ones. Take the most recently
    // mounted panel (last in DOM order), which is this block's own.
    const panels = document.querySelectorAll('.ins-panel');
    const panel = panels[panels.length - 1];
    const radiusSelect = panel.querySelector('[data-dial="radius"] select');
    radiusSelect.value = 'pill';
    radiusSelect.dispatchEvent(new Event('change'));
    const hintPanelAfter = freshRoot.querySelector('[data-name="hint-panel"]');
    r.check(hintPanelAfter.classList.contains('bx-pill'), 'hint panel re-rendered with the edited dial');
    r.check(hintPanelAfter !== hintPanel, 'hint panel is a fresh element after the scoped re-render');

    // Known limitation, asserted: render() never re-applies the inline
    // `style.visibility = 'hidden'` enterAnswering set on the ORIGINAL
    // hint-panel at question-start (capture() only round-trips box-dial-
    // driven styles, not arbitrary inline ones) -- so the fresh hint-panel
    // comes back at the browser's default visibility, already visible,
    // before Hint was ever clicked.
    r.check(getComputedStyle(hintPanelAfter).visibility === 'visible',
      'known limitation: hint panel comes back already visible after the edit -- its cached hidden state was lost with the replaced element');
    // And since ctx.hintPanelEl still points at the OLD, now-detached
    // element, clicking Hint after the edit changes nothing the user can
    // see -- it sets visibility on a node no longer on screen.
    freshRoot.querySelector('[data-name="btn-hint"]').click();
    r.check(getComputedStyle(hintPanelAfter).visibility === 'visible' && !hintPanel.isConnected,
      'known limitation: clicking Hint after the edit no longer reaches the on-screen element (ctx.hintPanelEl is the stale, detached one)');

    // Interactivity elsewhere in the tree, with NO cached reference to the
    // edited node, must still work: answer click -> revealed, still driven
    // by the SAME state machine wired at mount time.
    const answersAfter = [...freshRoot.querySelectorAll('[data-name^="answer-"]')];
    r.check(answersAfter.length === 2, 'answers untouched by an edit elsewhere in the tree');
    answersAfter[1].click(); // "B", correct, single mode locks in immediately
    r.check(answersAfter[1].classList.contains('bx-correct'),
      'quiz state machine still responds correctly after an unrelated inspector edit (no cached reference involved)');

    inspectorSynthetic.destroy();
    inspectorSynthetic.container.remove();
  });
});

tr.addBlock('mountInspector().destroy() removes the panel it mounted, no leak across synthetic mounts', (r) => {
  r.run(() => {
    const panelsBefore = document.querySelectorAll('.ins-panel').length;
    const container = document.createElement('div');
    container.id = 'synthetic-destroy-quiz';
    document.body.appendChild(container);
    const freshRoot = render(resolve({ box: 'hug', name: 'destroy-fixture', content: 'x' }));
    container.appendChild(freshRoot);
    const { destroy } = mountInspector(freshRoot, { sourceId: 'destroy-fixture' });
    r.check(document.querySelectorAll('.ins-panel').length === panelsBefore + 1, 'mounting adds exactly one panel');
    destroy();
    r.check(document.querySelectorAll('.ins-panel').length === panelsBefore, 'destroy() leaves no orphaned .ins-panel behind');
    container.remove();
  });
});

let fromUrlSynthetic = null;

tr.addBlock('mountQuizFromUrl: loading shows during the fetch, clears once mounted (happy path)', (r) => {
  r.run(() => {
    (async () => {
      const reg = await (await fetch('/registry.json')).json();
      const container = document.createElement('div');
      container.id = 'synthetic-from-url-quiz';
      document.body.appendChild(container);
      const freshRoot = render(resolve(reg['screens/quiz'], reg));
      container.appendChild(freshRoot);
      const answersEl = freshRoot.querySelector('[data-name="answers"]');
      const p = mountQuizFromUrl(freshRoot, '/content/quiz/lesson1.json', reg);
      // loading is set synchronously before the fetch's first await yields,
      // same reasoning as math-trainer.html's primary-action test.
      r.check(answersEl.classList.contains('bx-loading'), 'loading set synchronously before the fetch resolves');
      await p;
      fromUrlSynthetic = { container, freshRoot, answersEl };
    })();
  })
  .waitFor(() => fromUrlSynthetic !== null, 3000, 50, 'mountQuizFromUrl settled')
  .run(() => {
    const { answersEl, freshRoot } = fromUrlSynthetic;
    r.check(!answersEl.classList.contains('bx-loading'), 'loading cleared once mounted');
    r.check(freshRoot.querySelectorAll('[data-name^="answer-"]').length === 4, 'real quiz content mounted (4 answers, lesson1)');
    fromUrlSynthetic.container.remove();
  });
});

let errorSynthetic = null;

tr.addBlock('mountQuizFromUrl: a failed fetch shows an actionable Retry, not a permanently-empty screen', (r) => {
  r.run(() => {
    (async () => {
      const reg = await (await fetch('/registry.json')).json();
      const container = document.createElement('div');
      container.id = 'synthetic-from-url-error-quiz';
      document.body.appendChild(container);
      const freshRoot = render(resolve(reg['screens/quiz'], reg));
      container.appendChild(freshRoot);
      // A URL guaranteed to 404 against this same dev server (real fetch,
      // not a mocked one -- server.py serves plain 404s for unknown paths).
      await mountQuizFromUrl(freshRoot, '/content/quiz/does-not-exist.json', reg);
      errorSynthetic = { container, freshRoot };
    })();
  })
  .waitFor(() => errorSynthetic !== null, 3000, 50, 'mountQuizFromUrl settled on the failing url')
  .run(() => {
    const { freshRoot, container } = errorSynthetic;
    const answersEl = freshRoot.querySelector('[data-name="answers"]');
    r.check(!answersEl.classList.contains('bx-loading'), 'loading cleared after the failure');
    const retryBtn = answersEl.querySelector('.bx-actionable');
    r.check(!!retryBtn, 'a Retry control is rendered in place of the empty answers area');
    r.check(retryBtn.textContent === 'Retry', 'labeled Retry', retryBtn.textContent);
    r.check(retryBtn.classList.contains('bx-error'), 'marked bx-error');
    r.check(retryBtn.tabIndex === 0, 'stays actionable/tabbable -- error never drops tab order');
    container.remove();
  });
});

await tr.runBlocks();
