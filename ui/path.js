// ui/path.js -- L3 stroke primitive. SVG overlay; anchors resolve against L2 boxes.
const NS = 'http://www.w3.org/2000/svg';

export function drawPaths(host) {
  host.querySelectorAll(':scope svg.px').forEach(s => s.remove());
  const nodes = [host, ...host.querySelectorAll('[data-extra]')]
    .filter(el => el.dataset.extra && JSON.parse(el.dataset.extra).path);
  for (const el of nodes) drawOne(el, host);
}

function drawOne(el, root) {
  const spec = JSON.parse(el.dataset.extra);
  const r = el.getBoundingClientRect();
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'px');
  svg.setAttribute('width', r.width); svg.setAttribute('height', r.height);
  svg.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:visible';
  const a = anchor(spec.from, el, root, r), b = anchor(spec.to, el, root, r);
  if (!a || !b) return;
  const d = spec.path ?? {};
  const seg = d.segment ?? 'straight';
  let dAttr;
  if (seg === 'elbow') {
    const mx = (a.x + b.x) / 2;
    dAttr = `M${a.x},${a.y} L${mx},${a.y} L${mx},${b.y} L${b.x},${b.y}`;
  } else if (seg === 'curve') {
    const dx = (b.x - a.x) / 2;
    dAttr = `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
  } else if (seg === 'arc') {
    const rr = Math.hypot(b.x - a.x, b.y - a.y);
    dAttr = `M${a.x},${a.y} A${rr},${rr} 0 0 1 ${b.x},${b.y}`;
  } else {
    dAttr = `M${a.x},${a.y} L${b.x},${b.y}`;
  }
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', dAttr);
  p.setAttribute('fill', d.closed === 'closed' ? 'var(--tint2)' : 'none');
  p.setAttribute('stroke', 'var(--ink)');
  p.setAttribute('stroke-width', d.weight ?? 1.5);
  if (d.dash === 'dashed') p.setAttribute('stroke-dasharray', '5 4');
  if (d.dash === 'dotted') p.setAttribute('stroke-dasharray', '1.5 3');
  if (d['trim-end'] != null || d['trim-start'] != null) {
    p.setAttribute('pathLength', 1);
    const s = d['trim-start'] ?? 0, e = d['trim-end'] ?? 1;
    p.setAttribute('stroke-dasharray', `${e - s} 1`);
    p.setAttribute('stroke-dashoffset', -s);
  }
  svg.appendChild(p);
  // arrow end (only end marker in the wireframe kit; dot/bar analogous, add on demand)
  if (spec.path?.end === undefined) { /* ends come via from/to spec keys later */ }
  el.appendChild(svg);
}

function anchor(ref, el, root, hostRect) {
  if (!ref) return null;
  let [scope, kind] = ref.includes('.') ? ref.split('.', 2) : [null, ref];
  let box = el;
  if (scope) {
    box = root.querySelector(`[data-name="${scope}"]`);
    if (!box) return null;
  }
  const b = box.getBoundingClientRect();
  const rel = { x: b.left - hostRect.left, y: b.top - hostRect.top, w: b.width, h: b.height };
  const [k, arg] = kind.split(':');
  if (k === 'free') { const [x, y] = arg.split(',').map(Number); return { x, y }; }
  if (k === 'center') return { x: rel.x + rel.w / 2, y: rel.y + rel.h / 2 };
  if (k === 'edge') return {
    left:   { x: rel.x, y: rel.y + rel.h / 2 },
    right:  { x: rel.x + rel.w, y: rel.y + rel.h / 2 },
    top:    { x: rel.x + rel.w / 2, y: rel.y },
    bottom: { x: rel.x + rel.w / 2, y: rel.y + rel.h },
  }[arg];
  if (k === 'corner') return {
    tl: { x: rel.x, y: rel.y }, tr: { x: rel.x + rel.w, y: rel.y },
    bl: { x: rel.x, y: rel.y + rel.h }, br: { x: rel.x + rel.w, y: rel.y + rel.h },
  }[arg];
  return null;
}
