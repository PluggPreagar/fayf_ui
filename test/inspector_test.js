const tr = new TestRunner({ stopOnError: false });

tr.addBlock('click-to-select highlights exactly one node, shows provenance', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(() => {
     const root = document.querySelector('.bx[data-name="root"]');
     const a = root.querySelector('[data-name="a"]');
     a.click();
     r.check(a.classList.contains('ins-selected'), 'clicked node gets .ins-selected');
     r.check(document.querySelector('.ins-empty').hidden, 'empty state hidden after selection');
     const source = document.querySelector('.ins-source').textContent;
     r.check(source.includes('fixture/doc'), 'shows sourceId', source);
     r.check(source.includes('path 0'), 'shows the node\'s path', source);
     r.check(source.includes('extends atom/button'), 'shows the extends link', source);
   })
   .run(() => {
     // Regression: attachHandles() renders its handle squares/pills via
     // render(), so they carry the '.bx' class too and match the click
     // delegation's `.closest('.bx')` just like any real node. Clicking
     // one that belongs to the *currently selected* node used to crash --
     // select() detached the old node's handles (removing the very
     // element just clicked) before nodePath() walked its now-null
     // parentElement. window 'error' catches an uncaught throw inside
     // the click listener (click() itself never rethrows synchronously).
     const root = document.querySelector('.bx[data-name="root"]');
     const a = root.querySelector('[data-name="a"]');
     let caught = null;
     const onError = (ev) => { caught = ev.error || ev.message; };
     window.addEventListener('error', onError);
     const handle = document.querySelector('.hx-square');
     r.check(!!handle, 'a resize-handle square exists to click');
     handle.click();
     window.removeEventListener('error', onError);
     r.check(!caught, 'clicking a handle square does not crash the inspector', String(caught));
     r.check(a.classList.contains('ins-selected'), 'original node stays selected after handle click');
   })
   .run(() => {
     const root = document.querySelector('.bx[data-name="root"]');
     const b = root.querySelector('[data-name="b"]');
     b.click();
     r.check(b.classList.contains('ins-selected'), 'newly clicked node selected');
     r.check(!root.querySelector('[data-name="a"]').classList.contains('ins-selected'), 'previous selection cleared');
     const source = document.querySelector('.ins-source').textContent;
     r.check(!source.includes('extends'), 'b has no extends link (plain node)', source);
     r.check(!source.includes('runtime-inserted'), 'b still has static provenance (no extends != no provenance)', source);
   });
});

await tr.runBlocks();
