// ui/render.js -- L2. The ONLY DOM writer (C5).
import { parse, print, parseGapGrowth } from './model.js';

const PASSTHRU = ['path', 'from', 'to', 'relation', 'motion', 'field'];

// `field` (optional, plain data key -- not a dial, C8's token strings stay
// the closed 12-dial box vocabulary): 'text' | 'textarea' -> a real
// <input>/<textarea> instead of a div, C11 controllers' one escape hatch
// short of a full new primitive. `content` becomes the field's initial
// `.value` (not textContent -- a form field's value isn't "content" in the
// round-trippable capture() sense; a field node's `content` is therefore
// NOT captured back by capture() below, a known, accepted asymmetry).
const FIELD_TAG = { text: 'input', textarea: 'textarea' };

// Elastic gap (gap:2+/gap:2++): CSS `gap` is one uniform value per container,
// so it can't flex on its own. Instead we skip `gap` entirely and interleave
// real spacer elements between children -- native flex-grow/max-size handles
// the cap + redistribution continuously, no JS measurement/observer needed.
// Spacers get no 'bx' class, so capture()'s kids filter already excludes them.
function gapSpacer(growth, direction) {
  const el = document.createElement('div');
  el.className = 'bx-spacer';
  const basePx = growth.base * 4, capPx = (growth.base + growth.allow) * 4;
  el.style.flex = `${growth.allow} 1 ${basePx}px`;
  if (direction === 'stack') el.style.maxHeight = `${capPx}px`;
  else el.style.maxWidth = `${capPx}px`;
  return el;
}

export function render(node, doc = document) {
  const tag = node.field && FIELD_TAG[node.field];
  if (node.field && !tag) throw new Error(`render: unknown field '${node.field}' (text|textarea)`);
  const el = doc.createElement(tag ?? 'div');
  const d = node.box ?? {};
  const growth = parseGapGrowth(d.gap);
  el.className = ['bx', ...Object.entries(d)
    .filter(([k, v]) => typeof v === 'string' && k !== 'gap')
    .map(([, v]) => `bx-${v}`)].join(' ');
  if ('pad' in d) el.style.padding = `${d.pad * 4}px`;
  if ('gap' in d && !growth) el.style.gap = `${d.gap * 4}px`;
  if ('w' in d) el.style.width = `${d.w}px`;
  if ('h' in d) el.style.height = `${d.h}px`;
  if ('font' in d) el.style.fontSize = `${d.font}px`;
  if ('depth' in d) el.style.zIndex = d.depth;
  if ('opacity' in d) el.style.opacity = d.opacity;
  if ('rotate' in d) el.style.transform = `rotate(${d.rotate}deg)`;
  // Presence mirrors the model exactly: a node without `box` gets no
  // data-box at all, a node with `box: ""` (legal: zero dials, {}) gets an
  // empty one -- capture() below reads presence, not truthiness. Found
  // live (gallery invariant on screens/quiz's hint-text, box:""): the old
  // unconditional write + `if (dataset.box)` read made "" and absent
  // collapse into undefined on the way back. Same bug class as content:""
  // (dataset.hasContent), same fix shape.
  if (node.box != null) el.dataset.box = print(d, 'box');
  if (node.name) el.dataset.name = node.name;
  const extra = {};
  for (const k of PASSTHRU) if (node[k] != null) extra[k] = node[k];
  if (Object.keys(extra).length) el.dataset.extra = JSON.stringify(extra);
  if (node.content != null) {
    if (tag) el.value = node.content;
    else { el.textContent = node.content; el.dataset.hasContent = '1'; }
  }
  const children = node.children ?? [];
  children.forEach((child, i) => {
    el.appendChild(render(child, doc));
    if (growth && i < children.length - 1) el.appendChild(gapSpacer(growth, d.direction));
  });
  return el;
}

// L2 -- avail-need excess (px) along one axis, for the too-much-space
// space-class mechanism (TODO-5 mechanism 2). `container` must be a
// stable-sized box (V1: `fill`, sized by its own parent, not by `island`) --
// a `hug`-sized container would resize itself off `island`'s own footprint,
// which classify()'s caller could then feed back in as a moving target.
// `island` is the single child whose natural (unconditioned) footprint is
// being measured against the room `container` actually has.
export function excess(container, island, axis = 'height') {
  const cs = getComputedStyle(container);
  if (axis === 'width') {
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    return container.clientWidth - padX - island.offsetWidth;
  }
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  return container.clientHeight - padY - island.offsetHeight;
}

export function capture(el) {
  const node = {};
  if (el.dataset.name) node.name = el.dataset.name;
  if (el.dataset.box !== undefined) node.box = parse(el.dataset.box, 'box');
  if (el.dataset.extra) Object.assign(node, JSON.parse(el.dataset.extra));
  const kids = [...el.children].filter(c => c.classList?.contains('bx'));
  if (kids.length) node.children = kids.map(capture);
  else if (el.dataset.hasContent) node.content = el.textContent;
  return node;
}
