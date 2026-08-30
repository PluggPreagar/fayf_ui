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

// Shared "make this box actionable" wiring -- hover (bx-actionable, tokens.css)
// plus real keyboard focus, since these are plain boxes, not native buttons
// (no tabindex/Enter-Space activation for free). One name per effect (C2):
// callers needing hover+focus but not the no-op click/tooltip below use
// these directly instead of wireAction.
const keydownHandlers = new WeakMap();

export function markActionable(el) {
  if (!el || el.classList.contains('bx-actionable')) return;
  el.classList.add('bx-actionable');
  el.style.cursor = 'pointer';
  el.tabIndex = 0;
  const onKeydown = (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || el.classList.contains('bx-disabled')) return;
    e.preventDefault();
    el.click();
  };
  keydownHandlers.set(el, onKeydown);
  el.addEventListener('keydown', onKeydown);
}

export function unmarkActionable(el) {
  if (!el) return;
  el.classList.remove('bx-actionable');
  el.style.cursor = '';
  el.removeAttribute('tabindex');
  const onKeydown = keydownHandlers.get(el);
  if (onKeydown) { el.removeEventListener('keydown', onKeydown); keydownHandlers.delete(el); }
}

// Pairs the existing bx-disabled toggle (state dial, tokens.css) with tab
// order -- pointer-events:none alone still leaves a disabled box reachable
// (and Enter/Space-triggerable) by keyboard.
export function setActionableDisabled(el, disabled) {
  el.classList.toggle('bx-disabled', disabled);
  el.tabIndex = disabled ? -1 : 0;
}

export function wireAction(el, label, { reg, tipSide } = {}) {
  if (!el) return;
  markActionable(el);
  el.addEventListener('click', () => {
    console.debug(`[action] ${label} (no-op)`);
    if (reg) raiseToast(reg);
  });
  if (reg) wireHoverTip(el, reg, label, { side: tipSide });
}

// Any component/breadcrumb-trail: crumb boxes are named "crumb-<slug>"
// (same convention as nav-*/icon-*). Last crumb = current page, stays
// inert; every earlier one gets the same no-op wiring as any other nav
// item. Generic across screens -- no per-crumb wiring at the call site.
export function wireBreadcrumbs(root, reg) {
  const crumbs = [...root.querySelectorAll('[data-name^="crumb-"]')];
  crumbs.slice(0, -1).forEach(el =>
    wireAction(el, el.dataset.name.slice('crumb-'.length), { reg }));
}

let toast = null;
export function raiseToast(reg, doc = document) {
  dismissToast();
  const node = resolve({ extends: 'component/toast', box: 'floating, center, bottom' }, reg);
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
// side: undefined -> above the anchor (falls to below if clipped), for
// anchors with horizontal siblings (e.g. the topbar). 'left'/'right' ->
// beside the anchor instead, for a *vertical* stack of siblings (e.g. the
// side nav rail) -- above/below there would sit directly over the icon
// before/after it in the stack, not just near the viewport edge.
export function wireHoverTip(el, reg, text, { side } = {}) {
  if (!el) return;
  const doc = el.ownerDocument;
  el.addEventListener('mouseenter', () => {
    const node = resolve({ extends: 'atom/tooltip', content: text }, reg);
    tip = render(node, doc);
    tip.style.position = 'fixed';
    doc.body.appendChild(tip);
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const margin = 4;
    let left, top;
    if (side === 'right' || side === 'left') {
      left = side === 'right' ? r.right + 6 : r.left - t.width - 6;
      top = r.top + r.height / 2 - t.height / 2;
    } else {
      const above = r.top - t.height - 6;
      left = r.left + r.width / 2 - t.width / 2;
      top = above >= 0 ? above : r.bottom + 6;
    }
    const w = doc.defaultView.innerWidth, h = doc.defaultView.innerHeight;
    tip.style.left = `${Math.round(Math.min(Math.max(left, margin), w - t.width - margin))}px`;
    tip.style.top = `${Math.round(Math.min(Math.max(top, margin), h - t.height - margin))}px`;
  });
  el.addEventListener('mouseleave', () => { tip?.remove(); tip = null; });
}
