import { exportPayload } from '../ui/inspector.js';

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

tr.addBlock('form reflects the selected node\'s dials, incl. gap growth + place guard', (r) => {
  r.run(() => {
    const root = document.querySelector('.bx[data-name="root"]');
    root.querySelector('[data-name="a"]').click();
    const panel = document.querySelector('.ins-panel');
    r.check(panel.querySelector('[data-dial="direction"] select').value === 'row', 'direction=row (child override wins)');
    r.check(panel.querySelector('[data-dial="size"] select').value === 'hug', 'size=hug (survives from base/box)');
    r.check(panel.querySelector('[data-dial="align"] select').value === 'mid', 'align=mid');
    r.check(panel.querySelector('[data-dial="pad"] .ins-value').value === '2', 'pad=2');
    r.check(panel.querySelector('[data-dial="place-h"] select').disabled, 'place-h disabled: position not set');
    r.check(panel.querySelector('[data-dial="place-v"] select').disabled, 'place-v disabled: position not set');
  })
  .run(() => {
    const root = document.querySelector('.bx[data-name="root"]');
    root.click(); // root itself: box 'row, mid, pad:2, gap:2' -- gap is a plain fixed value
    const panel = document.querySelector('.ins-panel');
    r.check(panel.querySelector('[data-dial="gap"] .ins-value').value === '2', 'gap value=2');
    r.check(panel.querySelector('[data-dial="gap"] .ins-growth').value === '', 'gap growth=fixed (no suffix)');
  });
});

tr.addBlock('editing a dial scopes re-render to the selected subtree only', (r) => {
  r.run(() => {
    const root = document.querySelector('.bx[data-name="root"]');
    const bBefore = root.querySelector('[data-name="b"]');
    root.querySelector('[data-name="a"]').click();
    const panel = document.querySelector('.ins-panel');
    const radiusSelect = panel.querySelector('[data-dial="radius"] select');
    radiusSelect.value = 'circle';
    radiusSelect.dispatchEvent(new Event('change'));

    const aAfter = root.querySelector('[data-name="a"]');
    r.check(aAfter.classList.contains('bx-circle'), 'edited node re-rendered with the new dial');
    r.check(aAfter.classList.contains('ins-selected'), 'edited node is re-selected after replace');
    r.check(root.querySelector('[data-name="b"]') === bBefore, 'sibling untouched -- same DOM reference, not replaced');
  });
});

tr.addBlock('gap growth suffix round-trips through the form into data-box', (r) => {
  r.run(() => {
    const root = document.querySelector('.bx[data-name="root"]');
    root.click();
    const panel = document.querySelector('.ins-panel');
    panel.querySelector('[data-dial="gap"] .ins-growth').value = '+';
    panel.querySelector('[data-dial="gap"] .ins-growth').dispatchEvent(new Event('change'));
    const rootAfter = document.querySelector('.bx[data-name="root"]');
    r.check(rootAfter.dataset.box.includes('gap:2+'), 'growth suffix applied to data-box', rootAfter.dataset.box);
  });
});

tr.addBlock('place-h/place-v are cleared and disabled when position is unset via the form', (r) => {
  r.run(() => {
    const root = document.querySelector('.bx[data-name="root"]');
    root.querySelector('[data-name="b"]').click();
    const panel = document.querySelector('.ins-panel');
    const positionSelect = panel.querySelector('[data-dial="position"] select');
    positionSelect.value = 'floating';
    positionSelect.dispatchEvent(new Event('change'));
    r.check(!panel.querySelector('[data-dial="place-h"] select').disabled, 'place-h enabled once position=floating');
    positionSelect.value = '';
    positionSelect.dispatchEvent(new Event('change'));
    r.check(panel.querySelector('[data-dial="place-h"] select').disabled, 'place-h disabled again once position cleared');
    const bAfter = root.querySelector('[data-name="b"]');
    r.check(!bAfter.dataset.box.includes('floating'), 'position was cleared, not left stale on the node', bAfter.dataset.box);
  });
});

// select() legitimately attaches fresh hx-square/hx-pill handles to
// whatever node is currently selected -- that's correct, ongoing UI
// behavior, not the bug. The bug was capture() baking those handles in
// as permanent, indistinguishable-from-real '.bx' children. So these
// regression checks count only *real* children: '.bx' elements that
// are not themselves the live handle overlay.
function realChildren(el) {
  return [...el.children].filter(c => c.classList.contains('bx')
    && !c.classList.contains('hx-square') && !c.classList.contains('hx-pill'));
}

tr.addBlock('editing a node does not leak its own resize-handle overlay into captured content/children', (r) => {
  r.run(() => {
    // Regression: select() calls attachHandles(selected), which appends
    // real .bx-classed hx-square/hx-pill elements as DOM children of the
    // selected node. onChange used to call capture(selected) before
    // detaching those -- capture() can't tell a handle overlay from a
    // real child (both just match .bx), so it either dropped the node's
    // real content (leaf node: kids.length > 0 skips the content branch)
    // or baked the handles in as permanent children that compound on
    // every further edit.
    const root = document.querySelector('.bx[data-name="root"]');
    const a = root.querySelector('[data-name="a"]');
    a.click();
    const panel = document.querySelector('.ins-panel');
    const radiusSelect = panel.querySelector('[data-dial="radius"] select');
    radiusSelect.value = 'rounded';
    radiusSelect.dispatchEvent(new Event('change'));
    const aAfter1 = root.querySelector('[data-name="a"]');
    r.check(aAfter1.textContent === 'Go', 'leaf content survives first edit', aAfter1.textContent);
    r.check(realChildren(aAfter1).length === 0, 'no phantom handle children baked in after first edit', String(realChildren(aAfter1).length));

    // Edit again on the same (now re-selected) node -- catches compounding.
    const radiusSelect2 = document.querySelector('.ins-panel [data-dial="radius"] select');
    radiusSelect2.value = 'circle';
    radiusSelect2.dispatchEvent(new Event('change'));
    const aAfter2 = root.querySelector('[data-name="a"]');
    r.check(aAfter2.textContent === 'Go', 'leaf content survives second edit', aAfter2.textContent);
    r.check(realChildren(aAfter2).length === 0, 'no phantom handle children after second edit -- no compounding', String(realChildren(aAfter2).length));
  });
});

tr.addBlock('editing a node with real children preserves exactly those children, no more no less', (r) => {
  r.run(() => {
    let root = document.querySelector('.bx[data-name="root"]');
    root.click();
    const panel = document.querySelector('.ins-panel');
    const radiusSelect = panel.querySelector('[data-dial="radius"] select');
    radiusSelect.value = 'rounded';
    radiusSelect.dispatchEvent(new Event('change'));

    root = document.querySelector('.bx[data-name="root"]');
    const kids = realChildren(root);
    r.check(kids.length === 2, 'root keeps exactly its 2 real children after edit, not 33', String(kids.length));
    r.check(root.querySelector('[data-name="a"]')?.textContent === 'Go', 'child a content intact after root edit');
    r.check(root.querySelector('[data-name="b"]')?.textContent === 'plain', 'child b content intact after root edit');
  });
});

tr.addBlock('exportPayload: JSON matches capture(), labeled with the provenance breadcrumb', (r) => {
  r.run(() => {
    const root = document.querySelector('.bx[data-name="root"]');
    const a = root.querySelector('[data-name="a"]');
    const payload = exportPayload(a, root, 'fixture/doc', null); // provenance omitted here on purpose
    r.check(payload.source === 'runtime-inserted, no static source',
      'no provenance map passed -> honest fallback text', payload.source);
    r.check(payload.node.name === 'a', 'node.name matches capture() output');
    r.check(payload.node.box.direction === 'row', 'node.box matches capture() output');
  });
});

// Regression: select() calls attachHandles(selected), appending live
// hx-square/hx-pill elements as real '.bx' children of the selected node
// (same mechanism as the onChange bug fixed in Task 4). copyBtn/downloadBtn
// call exportPayload(selected, ...) -> capture(selected) with no guard, so
// clicking either while a node is selected used to ship JSON polluted with
// the handle overlay as phantom children. These tests go through the real
// select()-via-click path (so attachHandles genuinely runs) and the real
// button click (so the fix -- detachHandles/attachHandles bracketing the
// exportPayload call -- is what's under test, not a hand-picked bypass).
tr.addBlock('Copy JSON excludes the live resize-handle overlay from captured children', (r) => {
  r.run(() => {
    const root = document.querySelector('.bx[data-name="root"]');
    root.click(); // real select() path -> attachHandles(root)
    r.check(!!document.querySelector('.hx-square'), 'handle squares attached after selection');

    const copyBtn = document.querySelector('.ins-panel .ins-copy');
    let captured = null;
    const originalWriteText = navigator.clipboard.writeText;
    navigator.clipboard.writeText = (text) => { captured = text; return Promise.resolve(); };
    copyBtn.click();
    navigator.clipboard.writeText = originalWriteText;

    r.check(typeof captured === 'string', 'copy handler wrote JSON to the clipboard');
    const payload = JSON.parse(captured);
    const kids = payload.node.children || [];
    const phantom = kids.filter(c => !c.name);
    r.check(phantom.length === 0, 'no phantom hx-square/hx-pill entries in copied JSON', JSON.stringify(kids));
    r.check(kids.length === 2, 'copied JSON keeps exactly root\'s 2 real children', String(kids.length));
    r.check(!!document.querySelector('.hx-square'), 'handles re-attached after copy -- selection stays editable');
  });
});

tr.addBlock('Download JSON excludes the live resize-handle overlay from captured children', (r) => {
  r.run(() => {
    const root = document.querySelector('.bx[data-name="root"]');
    const b = root.querySelector('[data-name="b"]');
    b.click(); // real select() path -> attachHandles(b)
    r.check(!!document.querySelector('.hx-square'), 'handle squares attached after selection');

    const downloadBtn = document.querySelector('.ins-panel .ins-download');
    let capturedJson = null;
    const OriginalBlob = window.Blob;
    window.Blob = function (parts, opts) { capturedJson = parts[0]; return new OriginalBlob(parts, opts); };
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {}; // suppress the real file-save side effect
    downloadBtn.click();
    HTMLAnchorElement.prototype.click = originalClick;
    window.Blob = OriginalBlob;

    r.check(typeof capturedJson === 'string', 'download handler built a JSON blob');
    const payload = JSON.parse(capturedJson);
    r.check(!payload.node.children, 'b (leaf, no real children) has no children entry once handles are excluded');
    r.check(payload.node.content === 'plain', 'leaf content still captured correctly', payload.node.content);
    r.check(!!document.querySelector('.hx-square'), 'handles re-attached after download -- selection stays editable');
  });
});

await tr.runBlocks();
