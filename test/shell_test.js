// test/shell_test.js -- workspace shell screen (S2, docs/superpowers/plans/2026-09-11-workspace-dashboard.md)
import { resolve, diff } from '../ui/model.js';
import { render, capture } from '../ui/render.js';

const tr = new TestRunner({ stopOnError: false });

// Contract of data-names between screens/shell.json and its consumers.
const NAMES = [
  'ws-head', 'brand', 'crumbs', 'crumb-home', 'crumb-page', 'head-actions', 'btn-primary', 'user',
  'body', 'side-panel',
  'nav-dashboard', 'nav-pipelines', 'nav-graph', 'nav-records', 'nav-issues', 'nav-settings',
  'content', 'content-title', 'content-body',
  'detail', 'detail-title', 'detail-body',
  'status-bar', 'status-text', 'status-right', 'status-version', 'btn-theme',
];
const NAV = ['nav-dashboard', 'nav-pipelines', 'nav-graph', 'nav-records', 'nav-issues', 'nav-settings'];

const root = () => document.querySelector('body > .bx');
const q = (name) => root().querySelector(`[data-name="${name}"]`);
const rect = (name) => q(name).getBoundingClientRect();
const inside = (a, b, tol = 1) =>
  a.left >= b.left - tol && a.top >= b.top - tol && a.right <= b.right + tol && a.bottom <= b.bottom + tol;

tr.addBlock('shell: mounts, every contract name present', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(() => {
     r.check(!!root(), 'screen mounted at body > .bx');
     const missing = NAMES.filter(n => !q(n));
     r.check(missing.length === 0, 'every contract data-name exists', `missing: ${missing.join(', ')}`);
     NAMES.forEach(n => r.check(root().querySelectorAll(`[data-name="${n}"]`).length === 1, `${n} unique`));
   });
});

tr.addBlock('shell: layout -- fixed head/status/side/detail, content fills between', (r) => {
  r.run(() => {
    const head = rect('ws-head'), status = rect('status-bar');
    const side = rect('side-panel'), content = rect('content'), detail = rect('detail');
    r.check(Math.round(head.height) === 44, 'ws-head h:44', head.height);
    r.check(Math.round(status.height) === 20, 'status-bar h:20', status.height);
    r.check(Math.round(side.width) === 200, 'side-panel w:200', side.width);
    r.check(Math.round(detail.width) === 280, 'detail w:280', detail.width);
    r.check(content.width > 0, 'content has width', content.width);
    r.check(content.right <= detail.left + 1, 'content.right <= detail.left', `${content.right} vs ${detail.left}`);
    r.check(side.left <= content.left && content.left < detail.left,
      'body row order: side-panel | content | detail', `${side.left} ${content.left} ${detail.left}`);
    r.check(side.right <= content.left + 1, 'side-panel.right <= content.left', `${side.right} vs ${content.left}`);
    // stretch across the body row (checklist #1/#11)
    const body = rect('body');
    r.check(Math.abs(side.height - body.height) <= 1, 'side-panel stretches to body height', `${side.height} vs ${body.height}`);
    r.check(Math.abs(detail.height - body.height) <= 1, 'detail stretches to body height', `${detail.height} vs ${body.height}`);
    r.check(Math.abs(content.height - body.height) <= 1, 'content stretches to body height', `${content.height} vs ${body.height}`);
    // vertical stack: head above body above status
    r.check(head.bottom <= body.top + 1 && body.bottom <= status.top + 1,
      'stack order: ws-head | body | status-bar', `${head.bottom} ${body.top} ${body.bottom} ${status.top}`);
  });
});

tr.addBlock('shell: fit (C10) -- root does not scroll, every region inside root', (r) => {
  r.run(() => {
    const el = root();
    r.check(el.scrollWidth <= el.clientWidth, 'root: no horizontal overflow', `${el.scrollWidth} > ${el.clientWidth}`);
    r.check(el.scrollHeight <= el.clientHeight, 'root: no vertical overflow', `${el.scrollHeight} > ${el.clientHeight}`);
    const rr = el.getBoundingClientRect();
    r.check(Math.abs(rr.width - window.innerWidth) <= 1, 'root fills viewport width', `${rr.width} vs ${window.innerWidth}`);
    r.check(Math.abs(rr.height - window.innerHeight) <= 1, 'root fills viewport height', `${rr.height} vs ${window.innerHeight}`);
    const out = NAMES.filter(n => !inside(rect(n), rr));
    r.check(out.length === 0, 'every named region inside root bbox (1px tol)', `outside: ${out.join(', ')}`);
  });
});

tr.addBlock('shell: nav -- 6 items, dashboard active (bx-brand), others plain', (r) => {
  r.run(() => {
    const items = root().querySelectorAll('[data-name^="nav-"]');
    r.check(items.length === 6, '6 nav items', items.length);
    r.check(q('nav-dashboard').classList.contains('bx-brand'), 'nav-dashboard active variant (bx-brand)');
    NAV.filter(n => n !== 'nav-dashboard')
       .forEach(n => r.check(!q(n).classList.contains('bx-brand'), `${n} not active`));
    NAV.forEach(n => r.check(inside(rect(n), rect('side-panel')), `${n} inside side-panel`));
  });
});

tr.addBlock('shell: model invariant -- diff(capture(render(resolve(d))), resolve(d)) empty', (r) => {
  r.run(async () => {
    const reg = await (await fetch('/registry.json')).json();
    r.check(!!reg['screens/shell'], 'registry has screens/shell');
    const n = resolve(reg['screens/shell'], reg);
    const el = render(n);
    document.body.appendChild(el);
    const d = diff(capture(el), n);
    r.check(d.length === 0, 'invariant screens/shell', d.join('; '));
    el.remove();
  });
});

tr.addBlock('shell: skins -- luna brand resolves, active nav tinted; style toggle mounted', (r) => {
  const before = document.documentElement.dataset.style;
  r.run(() => {
    document.documentElement.dataset.style = 'luna';
    const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
    r.check(brand === '#00518c', 'luna: --brand is #00518c', brand);
    const bg = getComputedStyle(q('nav-dashboard')).backgroundColor;
    r.check(bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent', 'luna: active nav has a background', bg);
    r.check(!!document.querySelector('.style-toggle'), 'style toggle present');
  })
  .run(() => {
    if (before === undefined) delete document.documentElement.dataset.style;
    else document.documentElement.dataset.style = before;
  });
});

await tr.runBlocks();
