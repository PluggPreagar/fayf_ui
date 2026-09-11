// ui/splitter.js -- page-mount concern (not vocabulary/model, same layer as
// ui/style-mode.js/ui/inspector.js): a draggable boundary between two
// adjacent panels in a row. The box model's own `fixed, w:N` dial (a literal
// px default) or `fill, w:N/D` dial (a proportional flex-grow weight, see
// ui/model.js's parseSizeWeight) only ever set a static DEFAULT -- this
// overrides it live via `style.flex` on the panel to the handle's right
// (mount-time escape hatch, same precedent as style-mode.js writing
// `dataset.style` directly). `flex: 0 0 <px>` (not `style.width`) is the
// generalized pin: a `fill`-sized panel's flex-basis is 0, so a plain
// `width` would be silently ignored by the flex algorithm once dragged --
// `flex: 0 0 <px>` overrides grow/shrink/basis together, pinning an exact
// size regardless of which sizing mode the panel started in. Optionally
// persists to localStorage so a resize survives reload (same idea the OLD
// ui-kit's own tree|detail splitter used -- a fresh, unrelated key here,
// not shared storage with that retired system).
export function mountSplitter(handleEl, panelEl, { min = 160, max = 900, storageKey } = {}) {
  const clamp = (w) => Math.max(min, Math.min(max, w));
  const pin = (w) => { panelEl.style.flex = `0 0 ${clamp(w)}px`; };

  if (storageKey) {
    const saved = Number(localStorage.getItem(storageKey));
    if (saved) pin(saved);
  }

  let dragging = false, startX = 0, startW = 0;

  function onMove(e) {
    if (!dragging) return;
    // Handle sits LEFT of panelEl -- dragging left (dx > 0) grows the panel.
    const dx = startX - e.clientX;
    pin(startW + dx);
  }
  function onUp() {
    dragging = false;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    if (storageKey) {
      try { localStorage.setItem(storageKey, String(Math.round(panelEl.getBoundingClientRect().width))); }
      catch (e) { /* private mode / storage disabled -- resize still works this session */ }
    }
  }
  handleEl.addEventListener('pointerdown', (e) => {
    dragging = true;
    startX = e.clientX;
    startW = panelEl.getBoundingClientRect().width;
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    e.preventDefault();   // no text-selection drag artifact
  });

  return { setWidth: pin };
}
