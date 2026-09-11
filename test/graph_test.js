// test/graph_test.js -- graph.html (S6, docs/superpowers/plans/2026-09-11-workspace-dashboard.md).
// The LAST S6 page, and the simplest: no fetch, no loading state -- ready
// immediately. This mirrors only the simplest parts of test/query_test.js
// (load, nav/theme, fit, skin, C2) since there is no data flow to exercise:
// the real graph canvas is Embed (out of scope, see ui/graph.js's header),
// and the embed slot itself is just an empty, full-bleed box for the
// fayf_processor sibling to drop an <iframe> into.
const tr = new TestRunner({ stopOnError: false });
const rawCheck = tr.check.bind(tr);
tr.check = (cond, label, got = null, tag = null) => rawCheck(cond, label, got == null ? null : `${label} -- got ${got}`, tag);
const settled = (ms = 60) => new Promise(r => setTimeout(r, 60));

const root = () => document.querySelector('body > .bx');
const q = (name, scope = root()) => scope.querySelector(`[data-name="${name}"]`);
const text = (name, scope) => (q(name, scope)?.textContent ?? '').trim();
const state = (scope = root()) => scope.dataset.machineState;
const NAV = ['nav-dashboard', 'nav-pipelines', 'nav-graph', 'nav-records', 'nav-issues', 'nav-settings'];

tr.addBlock('graph: load -- ready immediately (no loading state), crumb, no status-bar, no detail panel', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(async () => {
     r.check(!!root(), 'screen mounted at body > .bx');
     r.check(state() === 'ready', 'machine starts (and stays) ready -- no loading/fetch at all', state());
     r.check(text('crumb-page') === 'Graph', 'crumb-page "Graph"', text('crumb-page'));
     r.check(!q('status-bar'), 'no status-bar region -- deliberately bare shell');
     r.check(!q('detail'), 'no detail side panel -- deliberately bare shell');
     r.check(!!q('side-panel'), 'side-panel present (nav rail)');
     r.check(q('nav-graph').classList.contains('bx-brand'), 'nav-graph marked active', q('nav-graph').className);
   });
});

tr.addBlock('graph: embed slot -- present, empty of real chrome, ready to receive foreign content', (r) => {
  r.run(() => {
     const embed = q('embed');
     r.check(!!embed, 'embed slot present');
     r.check(embed.children.length === 0, 'embed slot has no fayf_ui-rendered children of its own', embed.children.length);
     r.check(text('embed') === 'graph canvas embeds here', 'this fixture\'s own placeholder text was set post-mount', text('embed'));
  });
});

tr.addBlock('graph: nav + theme emit', (r) => {
  r.run(async () => {
     for (const name of NAV) {
       window.__emitted.length = 0;
       q(name).click(); await settled();
       const last = window.__emitted.at(-1);
       const to = name.slice('nav-'.length);
       r.check(!!last && last[0] === 'nav.go' && last[1] && last[1].to === to, `${name}.click -> emit nav.go {to:'${to}'}`, JSON.stringify(last));
     }
     r.check(!q('btn-theme'), 'no btn-theme element on this screen (no status-bar) -- theme.toggle has no live trigger here');
     r.check(state() === 'ready', 'still ready after nav clicks', state());
  });
});

tr.addBlock('graph: fit (C10) -- root does not scroll, embed slot has no overflow', (r) => {
  r.run(() => {
     const el = root();
     r.check(el.scrollWidth <= el.clientWidth, 'root: no horizontal overflow', `${el.scrollWidth} > ${el.clientWidth}`);
     r.check(el.scrollHeight <= el.clientHeight, 'root: no vertical overflow', `${el.scrollHeight} > ${el.clientHeight}`);
     const rr = el.getBoundingClientRect();
     r.check(Math.abs(rr.width - window.innerWidth) <= 1, 'root fills viewport width', `${rr.width} vs ${window.innerWidth}`);
     const embed = q('embed');
     r.check(embed.scrollWidth <= embed.clientWidth, 'embed: no horizontal overflow (trivially, it is empty)', `${embed.scrollWidth} > ${embed.clientWidth}`);
     r.check(embed.scrollHeight <= embed.clientHeight, 'embed: no vertical overflow', `${embed.scrollHeight} > ${embed.clientHeight}`);
     const body = q('body');
     const br = body.getBoundingClientRect(), er = embed.getBoundingClientRect();
     r.check(er.right <= br.right + 1 && er.bottom <= br.bottom + 1, 'embed nested inside body BBox (C10)', `${JSON.stringify(er)} vs ${JSON.stringify(br)}`);
  });
});

tr.addBlock('graph: skins -- style toggle, luna brand', (r) => {
  r.run(() => {
     r.check(!!document.querySelector('.style-toggle'), 'style toggle present');
     const before = document.documentElement.dataset.style;
     document.documentElement.dataset.style = 'luna';
     const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
     r.check(brand === '#00518c', 'luna: --brand is #00518c', brand);
     if (before === undefined) delete document.documentElement.dataset.style;
     else document.documentElement.dataset.style = before;
  });
});

tr.addBlock('graph: C2 -- unknown trigger throws', (r) => {
  r.run(() => {
     let threw = null;
     try { window.__ctl.dispatch('nope.click'); } catch (e) { threw = e.message; }
     r.check(/unknown trigger/.test(threw), 'dispatch of a trigger no state knows throws', threw);
  });
});

await tr.runBlocks();
