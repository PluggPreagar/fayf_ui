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
     r.check(!!dashboardRow.querySelector('use'), 'dashboard row got a real icon');
     const shopRow = root.querySelector('[data-name="icon-shop"]');
     r.check(!shopRow.querySelector('use'), 'shop row still falls back to dot placeholder');
     r.check(shopRow.closest('.bx-disabled') !== null, 'shop nav item is disabled');
     r.check(dashboardRow.closest('.bx-disabled') === null, 'dashboard nav item is active');
   });
});
await tr.runBlocks();
