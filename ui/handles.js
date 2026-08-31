// ui/handles.js -- L4. Handle = fixed box on an edge/corner; reveal = relation
// observing the pointer (doc t11). No new dial. Constants verbatim from the doc.
import { render } from './render.js';
import { parse } from './model.js';

const SQ = 'floating, fixed, w:8, h:8, solid, square, tint0';
const PILL_W = 42;

export const _engine = {
  speed: 0, settle: 0, pt: null, raf: null, hosts: new Set(),
  gate() {
    const slow = Math.max(0, Math.min(1, 1 - (this.speed - 0.04) / 0.34));
    return slow * this.settle;
  },
};

function apply() {
  _engine.raf = null;
  const p = _engine.pt; if (!p) return;
  const gate = _engine.gate();
  for (const host of _engine.hosts) {
    if (host.dataset.kbd === '1') continue;                 // keyboard reveal wins
    for (const h of host.querySelectorAll('.hx-square, .hx-pill')) {
      const r = h.getBoundingClientRect();
      const dx = Math.max(r.left - p.x, 0, p.x - r.right);
      const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
      const d = Math.hypot(dx, dy);
      const band = d > 84 ? 0 : d > 34 ? 0.1 : d > 13 ? 0.5 : 1;
      const v = band * gate;
      const ghost = h.classList.contains('hx-pill') ? 0.15 * gate : 0;
      h.style.opacity = Math.max(v, ghost).toFixed(3);
      h.style.borderColor = v > 0.8 ? 'var(--accent)' : 'var(--ink)';
      h.style.background = h.classList.contains('hx-pill')
        ? (v > 0.8 ? 'var(--accent)' : 'var(--ink)') : 'var(--tint0)';
    }
  }
}

function onMove(e) {
  const now = performance.now();
  if (_engine.pt) {
    const dt = Math.max(now - _engine.pt.t, 8);
    const s = Math.hypot(e.clientX - _engine.pt.x, e.clientY - _engine.pt.y) / dt;
    _engine.speed = _engine.speed * 0.72 + s * 0.28;
  }
  _engine.pt = { x: e.clientX, y: e.clientY, t: now };
  if (!_engine.raf) _engine.raf = requestAnimationFrame(apply);
}

let started = false;
function start() {
  if (started) return; started = true;
  window.addEventListener('mousemove', onMove);
  setInterval(() => {
    _engine.speed *= 0.7;
    const s = Math.max(0, Math.min(1, 1 - (_engine.speed - 0.04) / 0.34));
    _engine.settle = s > 0.5 ? Math.min(1, _engine.settle + 0.14)
                             : Math.max(0, _engine.settle - 0.34);
    if (_engine.pt && !_engine.raf) _engine.raf = requestAnimationFrame(apply);
  }, 100);
}

// Remembers the tabIndex attachHandles overwrites, so detachHandles can put
// it back. Without this, selecting ANY inert box (disabled/loading/readonly,
// tabIndex -1 by design) through the inspector permanently promoted it to
// tabIndex 0 -- attachHandles needs it focusable for keyboard reveal
// (focusin/focusout below) while selected, but nothing ever reversed that
// once the box was deselected again.
const priorTabIndex = new WeakMap();

export function attachHandles(el) {
  start();
  el.dataset.handles = '1';
  if (!priorTabIndex.has(el)) priorTabIndex.set(el, el.tabIndex);
  el.tabIndex = 0;
  const w = el.getBoundingClientRect().width;
  const pills = w >= 280 ? [0.25, 0.75] : w >= 140 ? [0.5] : [];
  const squares = [
    ['left', 'top'], ['center', 'top'], ['right', 'top'],
    ['left', 'middle'], ['right', 'middle'],
    ['left', 'bottom'], ['center', 'bottom'], ['right', 'bottom'],
  ];
  const CURSOR = { 'left top': 'nwse-resize', 'center top': 'ns-resize', 'right top': 'nesw-resize',
    'left middle': 'ew-resize', 'right middle': 'ew-resize',
    'left bottom': 'nesw-resize', 'center bottom': 'ns-resize', 'right bottom': 'nwse-resize' };
  for (const [h, v] of squares) {
    const s = render({ box: parse(`${SQ}, ${h}, ${v}`) });
    s.classList.add('hx-square');
    s.style.cssText += `;opacity:0;margin:-4px;transition:opacity .34s ease-out;cursor:${CURSOR[`${h} ${v}`]}`;
    el.appendChild(s);
  }
  for (const t of pills) {
    const p = render({ box: parse('floating, top, fixed, w:42, h:6, pill') });
    p.classList.add('hx-pill');
    p.style.cssText += `;left:${t * 100}%;margin-left:${-PILL_W / 2}px;top:-9px;opacity:0;background:var(--ink);transition:opacity .34s ease-out;cursor:move`;
    el.appendChild(p);
  }
  el.addEventListener('focusin', () => {
    el.dataset.kbd = '1';
    el.querySelectorAll('.hx-square, .hx-pill').forEach(h => { h.style.opacity = '0.5'; });
  });
  el.addEventListener('focusout', () => { delete el.dataset.kbd; });
  _engine.hosts.add(el);
}

export function detachHandles(el) {
  _engine.hosts.delete(el);
  delete el.dataset.handles;
  el.querySelectorAll('.hx-square, .hx-pill').forEach(h => h.remove());
  if (priorTabIndex.has(el)) {
    el.tabIndex = priorTabIndex.get(el);
    priorTabIndex.delete(el);
  }
}
