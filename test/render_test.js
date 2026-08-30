import { parse, resolve, diff } from '../ui/model.js';
import { render, capture } from '../ui/render.js';

suite('render — computed style (visual truth, not just round-trip)');
const host = document.createElement('div');
host.style.cssText = 'position:relative;width:400px;height:200px';
document.body.appendChild(host);

const a = render(resolve({ box: 'row, gap:2, pad:3, hug, solid' }));
host.appendChild(a);
let cs = getComputedStyle(a);
assert('gap:2 = 8px', cs.gap, '8px');
assert('pad:3 = 12px', cs.padding, '12px');
assert('solid border style', cs.borderTopStyle, 'solid');
assert('solid border width snapped ok', ['1px', '1.5px'].includes(cs.borderTopWidth), true);
assert('hug has no fixed width', a.style.width, '');

const b = render(resolve({ box: 'docked, left, fixed, w:40' }));
host.appendChild(b);
cs = getComputedStyle(b);
assert('docked left inset 0', cs.left, '0px');
assert('docked left spans height', cs.top + ' ' + cs.bottom, '0px 0px');
assert('w:40', cs.width, '40px');

const t = render(resolve({ box: 'hug, font:17', content: 'Title' }));
host.appendChild(t);
assert('font:17 = 17px font-size', getComputedStyle(t).fontSize, '17px');

suite('render — elastic gap growth (L2)');
{
  const rows = (...hs) => hs.map(h => ({ box: `fixed, h:${h}` }));

  // A: huge excess -> both gaps cap at base+allow (2+ = base8 allow8 -> cap16)
  const hA = document.createElement('div'); hA.style.cssText = 'width:100px;height:200px';
  host.appendChild(hA);
  const elA = render(resolve({ box: 'stack, fixed, h:200, w:100, gap:2+', children: rows(20, 20, 20) }));
  hA.appendChild(elA);
  const spacersA = [...elA.children].filter(c => !c.classList.contains('bx'));
  assert('growth gap: two spacers inserted for 3 children', spacersA.length, 2);
  assert('growth gap: capped at base+allow (16px)', getComputedStyle(spacersA[0]).height, '16px');
  assert('growth gap: both gaps cap equally (homogeneous)', getComputedStyle(spacersA[1]).height, '16px');
  assert('growth gap: no CSS gap property set', elA.style.gap, '');
  assert('growth gap: no garbage className leaked', elA.className.includes('bx-2+'), false);

  // B: hug container -> zero excess -> spacer sits at base (8px)
  const elB = render(resolve({ box: 'stack, hug, gap:2+', children: rows(20, 20) }));
  host.appendChild(elB);
  const spacerB = [...elB.children].find(c => !c.classList.contains('bx'));
  assert('growth gap: hug container has no excess, spacer at base (8px)', getComputedStyle(spacerB).height, '8px');

  // C: different growth classes cap at different sizes (nesting differentiates weight)
  const hC = document.createElement('div'); hC.style.cssText = 'width:80px;height:100px';
  host.appendChild(hC);
  const elC1 = render(resolve({ box: 'stack, fixed, h:100, w:80, gap:1+', children: rows(10, 10) }));
  const elC2 = render(resolve({ box: 'stack, fixed, h:100, w:80, gap:2++', children: rows(10, 10) }));
  hC.append(elC1, elC2);
  const spacerC1 = [...elC1.children].find(c => !c.classList.contains('bx'));
  const spacerC2 = [...elC2.children].find(c => !c.classList.contains('bx'));
  assert('gap:1+ caps lower (base4+allow8=12px)', getComputedStyle(spacerC1).height, '12px');
  assert('gap:2++ caps higher (base8+allow16=24px)', getComputedStyle(spacerC2).height, '24px');

  // D: below-cap proportional split, homogeneous gaps share leftover equally
  const elD = render(resolve({ box: 'stack, fixed, h:84, w:80, gap:2+', children: rows(20, 20, 20) }));
  host.appendChild(elD);
  const spacersD = [...elD.children].filter(c => !c.classList.contains('bx'));
  assert('below cap: gap 1 grows by its equal share (8+4=12px)', getComputedStyle(spacersD[0]).height, '12px');
  assert('below cap: gap 2 grows by its equal share (8+4=12px)', getComputedStyle(spacersD[1]).height, '12px');

  // E: distribute dial (evenly) still soaks up whatever excess the capped gap doesn't claim
  const elE = render(resolve({ box: 'stack, fixed, h:300, w:80, evenly, gap:2+', children: rows(20, 20) }));
  host.appendChild(elE);
  const spacerE = [...elE.children].find(c => !c.classList.contains('bx'));
  assert('evenly + growth gap: gap still capped at 16px', getComputedStyle(spacerE).height, '16px');
  const firstChildE = [...elE.children].find(c => c.classList.contains('bx'));
  const topGapE = firstChildE.getBoundingClientRect().top - elE.getBoundingClientRect().top;
  assert('evenly + growth gap: leftover excess still gives a real leading margin', topGapE > 40, true);

  // F: round-trip invariant holds for a growth-suffixed gap (spacers excluded from capture)
  const docF = { box: 'stack, hug, gap:2+', children: [{ box: 'fixed, h:10' }, { box: 'fixed, h:10' }] };
  const rF = resolve(docF);
  const elF = render(rF);
  host.appendChild(elF);
  assert('growth gap: capture round-trip invariant holds', diff(capture(elF), rF), []);
}

suite('render — invariant');
const doc = { box: 'stack, hug, gap:1, solid, rounded',
  children: [
    { name: 'label', box: 'fixed, w:40, h:6, tint2', },
    { box: 'row, mid, pad:2, solid', content: 'Go' } ] };
const r = resolve(doc);
const el = render(r);
host.appendChild(el);
assert('diff(capture(render(resolve)), resolve) empty', diff(capture(el), r), []);

suite('render — empty-string content round-trips');
{
  const docEmpty = { box: 'fill', content: '' };
  const rEmpty = resolve(docEmpty);
  const elEmpty = render(rEmpty);
  host.appendChild(elEmpty);
  assert('explicit content:"" survives capture (not undefined)', capture(elEmpty).content, '');
  assert('diff(capture(render(resolve)), resolve) empty for content:""', diff(capture(elEmpty), rEmpty), []);
}

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

suite('relation — scrollbar thumb follows scroll');
{
  const { wireRelations } = await import('../ui/relation.js');
  const scroller = render(resolve({ box: 'stack, fixed, w:60, h:80, scroll', children:
    [{ box: 'fixed, h:400, tint0' }] }));
  const bar = render(resolve(reg['component/scrollbar'], reg));
  host.append(scroller, bar);
  wireRelations(bar, { host: scroller });
  scroller.scrollTop = 160;                       // 160 / (400-80) = 0.5
  scroller.dispatchEvent(new Event('scroll'));     // explicit — native scroll dispatch is suppressed on hidden panes
  await new Promise(r => setTimeout(r, 50));
  const thumb = bar.querySelector('[data-name="thumb"]');
  assert('thumb offset = 50% of free track (33px)', thumb.style.top, '33px');
}
suite('motion — reveal + draw-on');
{
  const { applyMotion, drawOn } = await import('../ui/motion.js');
  const sk = render(resolve(reg['component/skeleton'], reg));
  host.appendChild(sk);
  applyMotion(sk);
  assert('reveal class applied', sk.classList.contains('mx-reveal'), true);
}

harnessFinish();
