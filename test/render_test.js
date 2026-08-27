import { parse, resolve, diff } from '../ui/model.js';
import { render, capture } from '../ui/render.js';

suite('render — computed style (visual truth, not just round-trip)');
const host = document.createElement('div');
host.style.cssText = 'position:relative;width:400px;height:200px';
document.body.appendChild(host);

const a = render(resolve({ box: 'row, gap2, pad3, hug, solid' }));
host.appendChild(a);
let cs = getComputedStyle(a);
assert('gap2 = 8px', cs.gap, '8px');
assert('pad3 = 12px', cs.padding, '12px');
assert('solid border style', cs.borderTopStyle, 'solid');
assert('solid border width snapped ok', ['1px', '1.5px'].includes(cs.borderTopWidth), true);
assert('hug has no fixed width', a.style.width, '');

const b = render(resolve({ box: 'docked, left, fixed, w:40' }));
host.appendChild(b);
cs = getComputedStyle(b);
assert('docked left inset 0', cs.left, '0px');
assert('docked left spans height', cs.top + ' ' + cs.bottom, '0px 0px');
assert('w:40', cs.width, '40px');

suite('render — invariant');
const doc = { box: 'stack, hug, gap1, solid, rounded',
  children: [
    { name: 'label', box: 'fixed, w:40, h:6, tint2', },
    { box: 'row, mid, pad2, solid', content: 'Go' } ] };
const r = resolve(doc);
const el = render(r);
host.appendChild(el);
assert('diff(capture(render(resolve)), resolve) empty', diff(capture(el), r), []);

suite('render — reserved-key pass-through');
const p = resolve({ box: 'fixed, w:80, h:24', path: 'curve, solid', from: 'free:0,12', to: 'free:80,12' });
const pe = render(p);
host.appendChild(pe);
assert('path keys survive round-trip', diff(capture(pe), p), []);

suite('path — crossbox and connector');
const { drawPaths } = await import('../ui/path.js');
const reg = await (await fetch('/registry.json')).json();
const ph = render(resolve(reg['atom/image-placeholder'], reg));
host.appendChild(ph);
drawPaths(ph);
const svg = ph.querySelector('svg.px');
assert('crossbox svg present', !!svg, true);
const line = svg.querySelector('line, path');
assert('crossbox stroke drawn', !!line, true);
drawPaths(ph);
assert('idempotent — one svg', ph.querySelectorAll('svg.px').length, 1);

harnessFinish();
