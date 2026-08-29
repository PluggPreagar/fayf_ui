// ui/render.js -- L2. The ONLY DOM writer (C5).
import { parse, print, parseGapGrowth } from './model.js';

const PASSTHRU = ['path', 'from', 'to', 'relation', 'motion'];

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
  const el = doc.createElement('div');
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
  el.dataset.box = print(d, 'box');
  if (node.name) el.dataset.name = node.name;
  const extra = {};
  for (const k of PASSTHRU) if (node[k] != null) extra[k] = node[k];
  if (Object.keys(extra).length) el.dataset.extra = JSON.stringify(extra);
  if (node.content != null) el.textContent = node.content;
  const children = node.children ?? [];
  children.forEach((child, i) => {
    el.appendChild(render(child, doc));
    if (growth && i < children.length - 1) el.appendChild(gapSpacer(growth, d.direction));
  });
  return el;
}

export function capture(el) {
  const node = {};
  if (el.dataset.name) node.name = el.dataset.name;
  if (el.dataset.box) node.box = parse(el.dataset.box, 'box');
  if (el.dataset.extra) Object.assign(node, JSON.parse(el.dataset.extra));
  const kids = [...el.children].filter(c => c.classList?.contains('bx'));
  if (kids.length) node.children = kids.map(capture);
  else if (el.textContent !== '') node.content = el.textContent;
  return node;
}
