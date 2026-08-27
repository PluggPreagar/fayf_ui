import { resolve, diff } from '../ui/model.js';
import { render, capture } from '../ui/render.js';

const tr = new TestRunner({ stopOnError: false });
tr.addBlock('gallery renders', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000, 100, 'gallery ready')
   .run(() => r.check(document.querySelectorAll('.g-item').length >= 2, 'items rendered'));
});
tr.addBlock('invariant over every registry entry', (r) => {
  r.run(async () => {
    const reg = await (await fetch('/registry.json')).json();
    for (const [id, doc] of Object.entries(reg)) {
      const n = resolve(doc, reg);
      const el = render(n);
      document.body.appendChild(el);
      const d = diff(capture(el), n);
      r.check(d.length === 0, `invariant ${id}`, `invariant ${id}: ${d.join('; ')}`);
      el.remove();
    }
  });
});
await tr.runBlocks();
