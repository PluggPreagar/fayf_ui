import { exportPayload, mountInspector, mountInspectorToggle } from '../ui/inspector.js';
import { resolve } from '../ui/model.js';
import { render } from '../ui/render.js';

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

    // Finding 1 (final review): the edited node is a fresh element (not the
    // one the provenance WeakMap was tagged against at mount time), but per
    // the spec's edit rule it's still sourced from the same path/file, just
    // now with a local override -- so its provenance entry must carry over
    // to the replacement, not fall back to "runtime-inserted". This is the
    // deliberate carry-over onChange performs, distinct from a genuine
    // runtime swap done by other code (see the dedicated block below).
    const source = document.querySelector('.ins-source').textContent;
    r.check(source.includes('fixture/doc') && source.includes('extends atom/button'),
      'provenance survives an inspector-driven edit -- same path/file, just locally overridden', source);
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
    const payload = exportPayload(a, 'fixture/doc', null); // elementProvenance omitted on purpose
    r.check(payload.source === 'runtime-inserted, no static source',
      'no elementProvenance map passed -> honest fallback text', payload.source);
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

// Finding 1 (final review): describeProvenance/provenance lookup used to be
// keyed by path string, so a path re-occupied at runtime by a completely
// different node (e.g. math-trainer.html's work.replaceChildren() swap)
// inherited the OLD node's provenance with full, wrong confidence. Fixed by
// tagging elements into a WeakMap by identity at mount time, so a path
// collision can no longer happen -- an element the mount-time walk never
// saw simply has no entry, by construction.
// Isolated on its own fresh mount (not the shared fixture above, which by
// this point in the suite has had several of its nodes edited through the
// inspector -- editing an ANCESTOR re-renders its whole subtree via
// capture()+render(), so descendants legitimately lose WeakMap identity
// too, same as the edited node's known "live-wired state resets" limit.
// That's expected, not what this block is isolating.
let swapFixture = null;
tr.addBlock('runtime-inserted node at a previously-static path gets the honest fallback, not the old node\'s provenance', (r) => {
  r.run(() => {
    const reg = {
      'base/box': { box: 'stack, hug, bare, square' },
      'atom/button': { extends: 'base/box', box: 'row, mid, packed, pad:2, solid, rounded', content: 'Go' },
    };
    const doc = { box: 'row, mid, pad:2, gap:2', name: 'sroot', children: [
      { extends: 'atom/button', name: 'x' },
      { box: 'hug, pad:1', name: 'y', content: 'plain' },
    ] };
    const provenance = new Map();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const el = render(resolve(doc, reg, [], new Set(), [], provenance));
    container.appendChild(el);
    const inspector = mountInspector(el, { sourceId: 'swap/fixture', provenance });
    swapFixture = { container, el, inspector };
    // This mount's panel is a second, independent .ins-panel appended to
    // document.body after the shared fixture's own -- take the most
    // recently mounted one (last in DOM order), same convention as
    // test/quiz_test.js's synthetic-inspector block.
    const panels = document.querySelectorAll('.ins-panel');
    const panel = panels[panels.length - 1];

    const x = el.querySelector('[data-name="x"]');
    x.click();
    const sourceX = panel.querySelector('.ins-source').textContent;
    r.check(sourceX.includes('swap/fixture') && sourceX.includes('extends atom/button'),
      'x shows correct provenance before any swap', sourceX);

    // Bypass the inspector entirely (no click, no onChange) -- this is the
    // "some other code restructured the DOM" case finding #1 reported, not
    // an inspector-driven edit (which deliberately carries provenance
    // across the replace -- see the earlier block in this file).
    const yOld = el.querySelector('[data-name="y"]');
    const swapped = document.createElement('div');
    swapped.className = 'bx';
    swapped.dataset.box = 'hug, pad:1';
    swapped.dataset.name = 'y';
    swapped.textContent = 'swapped-in at runtime';
    yOld.replaceWith(swapped);

    swapped.click();
    r.check(swapped.classList.contains('ins-selected'), 'runtime-swapped node gets selected');
    const sourceSwapped = panel.querySelector('.ins-source').textContent;
    r.check(sourceSwapped === 'runtime-inserted, no static source',
      'occupying y\'s old path does not inherit y\'s stale provenance', sourceSwapped);

    // Regression guard: the fix must not blanket-disable provenance -- a
    // real, still-untouched node elsewhere in the tree still resolves
    // correctly after the unrelated swap happened.
    x.click();
    const sourceX2 = panel.querySelector('.ins-source').textContent;
    r.check(sourceX2.includes('swap/fixture') && sourceX2.includes('extends atom/button'),
      'an untouched node elsewhere in the tree is unaffected by the swap', sourceX2);

    swapFixture.inspector.destroy();
    swapFixture.container.remove();
  });
});

// Finding 2 (final review): nodePath(el, root) dereferenced el.parentElement
// with no guard, so if the host page removed the selected subtree outside
// the inspector's control, the next form change threw inside onChange
// (capture() on a detached node, then a no-op replaceWith, then a throwing
// nodePath call), leaving the panel stuck showing stale dials.
tr.addBlock('detached selection guards onChange/copy/download instead of throwing', (r) => {
  r.run(() => {
    const root = document.querySelector('.bx[data-name="root"]');
    const b = root.querySelector('[data-name="b"]');
    b.click();
    r.check(b.classList.contains('ins-selected'), 'b selected before detaching it');

    b.remove(); // host page tears down the selected subtree, outside inspector's control
    r.check(!b.isConnected, 'selected node is now detached');

    let caught = null;
    const onError = (ev) => { caught = ev.error || ev.message; };
    window.addEventListener('error', onError);

    const panel = document.querySelector('.ins-panel');
    const radiusSelect = panel.querySelector('[data-dial="radius"] select');
    radiusSelect.value = 'circle';
    radiusSelect.dispatchEvent(new Event('change')); // used to throw inside onChange

    document.querySelector('.ins-panel .ins-copy').click();     // used to throw via exportPayload
    document.querySelector('.ins-panel .ins-download').click(); // ditto

    window.removeEventListener('error', onError);
    r.check(!caught, 'no uncaught throw from onChange/copy/download on a detached selection', String(caught));
  });
});

// Finding 5 (final review): mountInspector() appended its panel to
// document.body with no way to remove it -- a page that mounts/unmounts the
// inspector repeatedly (e.g. test/quiz_test.js's synthetic blocks) leaked
// one orphaned .ins-panel per mount, forever.
tr.addBlock('destroy() removes the panel from the DOM', (r) => {
  r.run(() => {
    const before = document.querySelectorAll('.ins-panel').length;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fresh = render(resolve({ box: 'hug', name: 'destroy-fixture', content: 'x' }));
    container.appendChild(fresh);
    const { destroy } = mountInspector(fresh, { sourceId: 'destroy-fixture' });
    r.check(document.querySelectorAll('.ins-panel').length === before + 1, 'mounting adds one panel');

    destroy();
    r.check(document.querySelectorAll('.ins-panel').length === before, 'destroy() removes exactly the panel it added');
    container.remove();
  });
});

// Detail-panel insets: a screen with named topbar/statusbar boxes (the
// screens/math-trainer-dashboard.json convention) should get a panel docked
// between them, not spanning the full viewport over both. Isolated fresh
// fixture -- the shared fixture above has neither region.
tr.addBlock('panel docks between topbar/statusbar when a screen has them, not over them', (r) => {
  r.run(() => {
    const doc = { box: 'stack, fixed, w:400, h:300', name: 'chromeroot', children: [
      { box: 'fixed, h:40', name: 'topbar', content: 'top' },
      { box: 'fixed, h:200', name: 'mid', content: 'content' },
      { box: 'fixed, h:20', name: 'statusbar', content: 'status' },
    ] };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const el = render(resolve(doc));
    container.appendChild(el);
    const { destroy } = mountInspector(el, { sourceId: 'chrome/fixture' });
    const panels = document.querySelectorAll('.ins-panel');
    const panel = panels[panels.length - 1];

    // Tolerance, not exact string equality: two independent
    // getBoundingClientRect() reads of the same static layout can differ by
    // a hair of a pixel (sub-pixel layout rounding) even with no real DOM
    // change in between -- verified empirically running this suite. The
    // property under test is "docked to the chrome, not painted over it",
    // not bit-exact float equality.
    const topbarRect = el.querySelector('[data-name="topbar"]').getBoundingClientRect();
    const statusbarRect = el.querySelector('[data-name="statusbar"]').getBoundingClientRect();
    const panelTop = parseFloat(panel.style.top);
    const panelBottom = parseFloat(panel.style.bottom);
    r.check(Math.abs(panelTop - topbarRect.bottom) < 1, 'panel top docks to topbar\'s bottom edge', `${panelTop} vs ${topbarRect.bottom}`);
    r.check(Math.abs(panelBottom - (window.innerHeight - statusbarRect.top)) < 1,
      'panel bottom docks to statusbar\'s top edge', `${panelBottom} vs ${window.innerHeight - statusbarRect.top}`);

    destroy();
    container.remove();
  });
});

tr.addBlock('panel spans full height (old behavior) when a screen has no topbar/statusbar', (r) => {
  r.run(() => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const el = render(resolve({ box: 'hug', name: 'no-chrome', content: 'x' }));
    container.appendChild(el);
    const { destroy } = mountInspector(el, { sourceId: 'no-chrome/fixture' });
    const panels = document.querySelectorAll('.ins-panel');
    const panel = panels[panels.length - 1];
    r.check(panel.style.top === '0px', 'no topbar -> panel starts at viewport top', panel.style.top);
    r.check(panel.style.bottom === '0px', 'no statusbar -> panel reaches viewport bottom', panel.style.bottom);
    destroy();
    container.remove();
  });
});

// mountInspectorToggle: opt-in wrapper real pages use instead of an
// unconditional mountInspector, same reproducible-URL pattern as
// ui/style-mode.js's mountStyleToggle (?inspect=1). Restores the page's
// real URL at the end so this test doesn't leak into the address bar for
// whatever runs next.
tr.addBlock('mountInspectorToggle: off by default, click mounts/unmounts, URL stays reproducible', (r) => {
  r.run(() => {
    const originalUrl = location.href;
    r.check(!location.search.includes('inspect='), 'starts with no ?inspect= param', location.search);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const el = render(resolve({ box: 'hug', name: 'toggle-fixture', content: 'x' }));
    container.appendChild(el);
    const before = document.querySelectorAll('.ins-panel').length;

    const btn = mountInspectorToggle(el, { sourceId: 'toggle/fixture', target: container });
    r.check(document.querySelectorAll('.ins-panel').length === before, 'starts off -- no panel mounted yet');
    r.check(btn.textContent === 'inspect: off', 'button reads "inspect: off" initially');

    btn.click();
    r.check(document.querySelectorAll('.ins-panel').length === before + 1, 'click mounts the panel');
    r.check(btn.textContent === 'inspect: on', 'button reads "inspect: on" after click');
    r.check(location.search.includes('inspect=1'), 'URL persists the on state', location.search);

    btn.click();
    r.check(document.querySelectorAll('.ins-panel').length === before, 'second click unmounts the panel');
    r.check(btn.textContent === 'inspect: off', 'button reads "inspect: off" again');
    r.check(!location.search.includes('inspect='), 'URL param cleared once off again', location.search);

    history.replaceState(null, '', originalUrl);
    container.remove();
  });
});

await tr.runBlocks();
