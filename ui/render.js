// ui/render.js -- L2. The ONLY DOM writer (C5).
import { parse, print } from './model.js';

const PASSTHRU = ['path', 'from', 'to', 'relation', 'motion'];

export function render(node, doc = document) {
  const el = doc.createElement('div');
  const d = node.box ?? {};
  el.className = ['bx', ...Object.values(d).filter(v => typeof v === 'string').map(v => `bx-${v}`)].join(' ');
  if ('pad' in d) el.style.padding = `${d.pad * 4}px`;
  if ('gap' in d) el.style.gap = `${d.gap * 4}px`;
  if ('w' in d) el.style.width = `${d.w}px`;
  if ('h' in d) el.style.height = `${d.h}px`;
  if ('depth' in d) el.style.zIndex = d.depth;
  if ('opacity' in d) el.style.opacity = d.opacity;
  if ('rotate' in d) el.style.transform = `rotate(${d.rotate}deg)`;
  el.dataset.box = print(d, 'box');
  if (node.name) el.dataset.name = node.name;
  const extra = {};
  for (const k of PASSTHRU) if (node[k] != null) extra[k] = node[k];
  if (Object.keys(extra).length) el.dataset.extra = JSON.stringify(extra);
  if (node.content != null) el.textContent = node.content;
  for (const child of node.children ?? []) el.appendChild(render(child, doc));
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
