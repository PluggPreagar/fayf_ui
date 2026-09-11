// ui/splitter.js -- page-mount concern (not vocabulary/model, same layer as
// ui/style-mode.js/ui/inspector.js): a draggable boundary between two
// adjacent panels in a row. The box model's own `fixed, w:N` dial only sets
// a static DEFAULT width -- this overrides it live via inline style.width on
// the panel to the handle's right (mount-time escape hatch, same precedent
// as style-mode.js writing `dataset.style` directly). Optionally persists to
// localStorage so a resize survives reload (same idea the OLD ui-kit's own
// tree|detail splitter used -- a fresh, unrelated key here, not shared
// storage with that retired system).
export function mountSplitter(handleEl, panelEl, { min = 160, max = 900, storageKey } = {}) {
  const clamp = (w) => Math.max(min, Math.min(max, w));

  if (storageKey) {
    const saved = Number(localStorage.getItem(storageKey));
    if (saved) panelEl.style.width = `${clamp(saved)}px`;
  }

  let dragging = false, startX = 0, startW = 0;

  function onMove(e) {
    if (!dragging) return;
    // Handle sits LEFT of panelEl -- dragging left (dx > 0) grows the panel.
    const dx = startX - e.clientX;
    panelEl.style.width = `${clamp(startW + dx)}px`;
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

  return { setWidth: (w) => { panelEl.style.width = `${clamp(w)}px`; } };
}
