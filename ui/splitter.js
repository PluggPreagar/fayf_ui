// ui/splitter.js -- page-mount concern (not vocabulary/model, same layer as
// ui/style-mode.js/ui/inspector.js): a draggable boundary between the TWO
// panels either side of a handle in a row -- and ONLY those two. Dragging
// grows one and shrinks the other by the exact same amount; every other
// panel in the row must stay untouched (found live: an earlier version
// pinned just the handle's right-hand panel via an explicit px width,
// leaving its LEFT-hand neighbor still `fill`-sized -- with more than one
// `fill` panel in the row, the leftover space those un-pinned panels share
// is a shared pool, so pinning one silently reshuffled how much of that
// pool the OTHERS got, moving a border nobody dragged).
//
// The box model's own `fixed, w:N` dial (a literal px default) or
// `fill, w:N/D` dial (a proportional flex-grow weight, see ui/model.js's
// parseSizeWeight) only ever set a static DEFAULT for the row's initial,
// responsive paint -- this overrides it live via `style.flex` on BOTH
// adjacent panels (mount-time escape hatch, same precedent as
// style-mode.js writing `dataset.style` directly), pinning each to its own
// exact CURRENT rendered width the moment either of its handles is
// touched. `flex: 0 0 <px>` (not `style.width`) is the correct pin: a
// `fill`-sized panel's flex-basis is 0, so a plain `width` would be
// silently ignored by the flex algorithm -- `flex: 0 0 <px>` overrides
// grow/shrink/basis together regardless of which sizing mode the panel
// started in. A panel between two handles (e.g. the middle column of a
// 3-column row) gets pinned once, by whichever handle mounts first --
// `pinnedSplitter` on the element itself guards against a second handle
// re-measuring and re-pinning it to a possibly-already-dragged width.
//
// Optionally persists {left, right} to localStorage per handle so a
// resize survives reload (same idea the OLD ui-kit's own tree|detail
// splitter used -- a fresh, unrelated key here, not shared storage with
// that retired system).
//
// Caller invariant: `min` must be <= each panel's own default rendered
// width (e.g. a `fill, w:1/12` panel's default at the mounted viewport),
// and `max` >= it. The drag clamp solves for a dx that keeps BOTH panels
// inside [min, max] while their combined width stays constant -- if a
// panel already starts outside that range (min set higher than its real
// default), no such dx exists in the requested direction and the drag
// will appear to move opposite to the pointer, or not at all.
export function mountSplitter(handleEl, leftEl, rightEl, { min = 160, max = 900, storageKey } = {}) {
  const widthOf = (el) => el.getBoundingClientRect().width;
  const pin = (el, w) => { el.style.flex = `0 0 ${w}px`; };
  const pinAtCurrent = (el) => {
    if (el.dataset.pinnedSplitter) return;
    pin(el, widthOf(el));
    el.dataset.pinnedSplitter = '1';
  };
  pinAtCurrent(leftEl);
  pinAtCurrent(rightEl);

  if (storageKey) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch (e) { /* ignore */ }
    if (saved && typeof saved.left === 'number' && typeof saved.right === 'number') {
      pin(leftEl, saved.left);
      pin(rightEl, saved.right);
    }
  }

  let dragging = false, startX = 0, startLeftW = 0, startRightW = 0;

  function onMove(e) {
    if (!dragging) return;
    // Handle sits between the two panels -- dragging right (dx > 0) grows
    // the left panel and shrinks the right panel by the same amount.
    let dx = e.clientX - startX;
    dx = Math.max(min - startLeftW, Math.min(max - startLeftW, dx));
    dx = Math.max(startRightW - max, Math.min(startRightW - min, dx));
    pin(leftEl, startLeftW + dx);
    pin(rightEl, startRightW - dx);
  }
  function onUp() {
    dragging = false;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          left: Math.round(widthOf(leftEl)), right: Math.round(widthOf(rightEl)),
        }));
      } catch (e) { /* private mode / storage disabled -- resize still works this session */ }
    }
  }
  handleEl.addEventListener('pointerdown', (e) => {
    dragging = true;
    startX = e.clientX;
    startLeftW = widthOf(leftEl);
    startRightW = widthOf(rightEl);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    e.preventDefault();   // no text-selection drag artifact
  });

  return { setWidths: (l, r) => { pin(leftEl, l); pin(rightEl, r); } };
}
