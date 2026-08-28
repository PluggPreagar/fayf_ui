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

     const rail = root.querySelectorAll('[data-name^="icon-"]');
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
await tr.runBlocks();
