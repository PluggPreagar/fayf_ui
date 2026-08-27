import { resolve, diff } from '../ui/model.js';
import { capture } from '../ui/render.js';

const tr = new TestRunner({ stopOnError: false });
tr.addBlock('anatomy renders 14 named parts', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(async () => {
     const root = document.querySelector('body > .bx');
     r.check(!!root, 'screen mounted');
     r.check(root.querySelectorAll('.bx').length > 40, 'composition is deep');
     const reg = await (await fetch('/registry.json')).json();
     const n = resolve(reg['screens/anatomy'], reg);
     const d = diff(capture(root), n);
     r.check(d.length === 0, 'screen invariant', `screen invariant: ${d.slice(0, 3).join('; ')}`);
   });
});
await tr.runBlocks();
