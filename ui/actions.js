// ui/actions.js -- page-level no-op click wiring. NOT part of the box/
// vocabulary model (no "onClick"/"action" dial exists, C2). Marks an
// element as genuinely interactive (pointer cursor, a real listener) ahead
// of its real behavior being implemented -- the click itself is a no-op.
export function wireAction(el, label) {
  if (!el) return;
  el.style.cursor = 'pointer';
  el.addEventListener('click', () => console.debug(`[action] ${label} (no-op)`));
}
