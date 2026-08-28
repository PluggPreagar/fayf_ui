// ui/actions.js -- page-level no-op action wiring: click + hover feedback
// for an element ahead of its real behavior landing. NOT part of the box/
// vocabulary model (no "onClick"/"hover" dial exists, C2) -- reuses the
// existing feedback parts instead of inventing new ones:
//   action feedback -> component/toast  (anatomy.json's own usage convention:
//                       "floating, center, bottom")
//   hover feedback  -> atom/tooltip      ("hint · hover label" per the
//                       vocabulary reference)
import { resolve } from './model.js';
import { render } from './render.js';

export function wireAction(el, label, { reg } = {}) {
  if (!el) return;
  el.classList.add('bx-actionable');
  el.style.cursor = 'pointer';
  el.addEventListener('click', () => {
    console.debug(`[action] ${label} (no-op)`);
    if (reg) raiseToast(reg);
  });
  if (reg) wireHoverTip(el, reg, label);
}

let toast = null;
export function raiseToast(reg, doc = document) {
  dismissToast();
  const node = resolve({ $ref: 'component/toast', box: 'floating, center, bottom' }, reg);
  const el = render(node, doc);
  el.addEventListener('click', dismissToast);
  doc.body.appendChild(el);
  toast = { el, timer: doc.defaultView.setTimeout(dismissToast, 2400) };
}

function dismissToast() {
  if (!toast) return;
  clearTimeout(toast.timer);
  toast.el.remove();
  toast = null;
}

let tip = null;
export function wireHoverTip(el, reg, text) {
  if (!el) return;
  const doc = el.ownerDocument;
  el.addEventListener('mouseenter', () => {
    const node = resolve({ $ref: 'atom/tooltip', content: text }, reg);
    tip = render(node, doc);
    tip.style.position = 'fixed';
    doc.body.appendChild(tip);
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const above = r.top - t.height - 6;
    tip.style.left = `${Math.round(r.left + r.width / 2 - t.width / 2)}px`;
    tip.style.top = `${Math.round(above >= 0 ? above : r.bottom + 6)}px`;
  });
  el.addEventListener('mouseleave', () => { tip?.remove(); tip = null; });
}
