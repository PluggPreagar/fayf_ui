import { resolve, diff } from '../ui/model.js';
import { capture } from '../ui/render.js';

const tr = new TestRunner({ stopOnError: false });
tr.addBlock('math trainer dashboard renders and matches model', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(async () => {
     const root = document.querySelector('body > .bx');
     r.check(!!root, 'screen mounted');
     const reg = await (await fetch('/registry.json')).json();
     const n = resolve(reg['screens/math-trainer-dashboard'], reg);
     const d = diff(capture(root), n);
     r.check(d.length === 0, 'screen invariant', `screen invariant: ${d.slice(0, 3).join('; ')}`);

     const rail = root.querySelector('[data-name="nav-rail"]').querySelectorAll('[data-name^="icon-"]');
     r.check(rail.length === 5, 'nav rail has 5 sections');
     const dashboardRow = root.querySelector('[data-name="icon-dashboard"]');
     const dashboardUse = dashboardRow.querySelector('use');
     r.check(!!dashboardUse, 'dashboard row got a real icon');
     r.check(dashboardUse.getAttribute('href') === '#icon-dashboard', 'dashboard row got its own icon, not the placeholder');
     const shopRow = root.querySelector('[data-name="icon-shop"]');
     const shopUse = shopRow.querySelector('use');
     r.check(!!shopUse && shopUse.getAttribute('href') === '#icon-placeholder', 'shop row falls back to the shared placeholder glyph');
     r.check(shopRow.closest('.bx-disabled') === null, 'shop nav item is enabled (no-op wired)');
     const trainingChip = root.querySelector('[data-name="nav-training"]');
     r.check(trainingChip.className.includes('bx-disabled') === false, 'training nav item is enabled (no-op wired)');
     const lectureRow = root.querySelector('[data-name="icon-lecture"]');
     r.check(lectureRow.closest('.bx-disabled') !== null, 'lecture nav item is still disabled (unbuilt)');
     r.check(dashboardRow.closest('.bx-disabled') === null, 'dashboard nav item is active');

     const primary = root.querySelector('[data-name="primary-action"]');
     r.check(getComputedStyle(primary).cursor === 'pointer', 'primary action shows a pointer cursor');
     r.check(getComputedStyle(root.querySelector('[data-name="nav-shop"]')).cursor === 'pointer', 'nav-shop shows a pointer cursor');

     const toggle = document.querySelector('.style-toggle-inline');
     r.check(!!toggle, 'style toggle mounted as a non-modeled overlay');
     r.check(toggle && toggle.parentElement === root, 'style toggle is a direct sibling of the resolved tree, not nested in it');
   });
});
tr.addBlock('starting the quiz shows loading on primary-action for the real fetch gap, clears once mounted', (r) => {
  r.run(() => {
    const root = document.querySelector('body > .bx');
    const primary = root.querySelector('[data-name="primary-action"]');
    r.check(!primary.classList.contains('bx-loading'), 'primary-action starts without bx-loading');
    primary.click(); // enters the quiz state; enterQuiz sets loading synchronously before its await
    r.check(primary.classList.contains('bx-loading'), 'bx-loading set synchronously, before the content fetch resolves');
    r.check(primary.tabIndex === -1, 'dropped from tab order while loading');
  })
  .waitFor(() => document.querySelector('[data-name="primary-action"]').classList.contains('bx-loading') === false, 3000,
    50, 'loading cleared once quiz content is fetched and mounted')
  .run(() => {
    const root = document.querySelector('body > .bx');
    const primary = root.querySelector('[data-name="primary-action"]');
    r.check(primary.tabIndex === 0, 'tab order restored once loading clears');
    r.check(!!root.querySelector('[data-name="quiz-body"]'), 'quiz content actually mounted into work');

    // quiz-body is now a fixed height (screens/quiz.json), not fill -- work
    // needs bx-evenly (same trick screens/quiz.json's own root uses) to
    // actually center it, matching the standalone quiz.html page instead of
    // leaving it stuck top-anchored in the leftover space.
    const work = root.querySelector('[data-name="work"]');
    r.check(work.classList.contains('bx-evenly'), 'work centers its lone quiz-body child vertically while quiz is shown');
  });
});

tr.addBlock('leaving the quiz cleans up the centering override', (r) => {
  r.run(() => {
    const root = document.querySelector('body > .bx');
    root.querySelector('[data-name="crumb-dashboard"]').click(); // back to dashboard
    const work = root.querySelector('[data-name="work"]');
    r.check(!work.classList.contains('bx-evenly'), 'bx-evenly removed once back on the dashboard');
    r.check(!work.classList.contains('bx-mid'), 'bx-mid removed too, same as before');
  });
});

await tr.runBlocks();
