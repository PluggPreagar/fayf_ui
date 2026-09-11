// test/issues_test.js -- issues.html (S6, docs/superpowers/plans/2026-09-11-workspace-dashboard.md).
// The node suite proves handlers/view pure; this proves the browser half:
// fetch -> ready, all 6 status groups render with correct counts, group
// collapse/expand, item select -> detail + emit, status chip click changes
// state, nav/refresh/theme, error -> retry, fit (C10), skins, C2.
import { STATUSES } from '../ui/issues.js';

const tr = new TestRunner({ stopOnError: false });
const rawCheck = tr.check.bind(tr);
tr.check = (cond, label, got = null, tag = null) => rawCheck(cond, label, got == null ? null : `${label} -- got ${got}`, tag);
const settled = (ms = 60) => new Promise(r => setTimeout(r, ms));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) return false; await wait(20); } return true; };

const root = () => document.querySelector('body > .bx');
const q = (name, scope = root()) => scope.querySelector(`[data-name="${name}"]`);
const qa = (sel, scope = root()) => [...scope.querySelectorAll(sel)];
const text = (name, scope) => (q(name, scope)?.textContent ?? '').trim();
const state = (scope = root()) => scope.dataset.machineState;
const NAV = ['nav-dashboard', 'nav-pipelines', 'nav-graph', 'nav-records', 'nav-issues', 'nav-settings'];
const READY_RE = /^\d+ issues · \d+ open$/;

const fixture = async () => (await fetch('/content/issues.json')).json();

tr.addBlock('issues: load -- fetch -> ready, status-text, crumb', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(async () => {
     r.check(!!root(), 'screen mounted at body > .bx');
     r.check(await until(() => state() === 'ready', 3000), 'data-machine-state reaches ready within 3 s', state());
     r.check(READY_RE.test(text('status-text')), 'status-text: "<n> issues · <m> open"', text('status-text'));
     r.check(text('crumb-page') === 'Issues', 'crumb-page "Issues"', text('crumb-page'));
     const list = await fixture();
     r.check(text('status-text') === `${list.length} issues · ${list.filter(i => ['open', 'in-progress'].includes(i.status)).length} open`,
       'status-text counts match the fixture', text('status-text'));
     r.check(q('nav-issues').classList.contains('bx-brand'), 'nav-issues active (bx-brand)');
     r.check(q('nav-dashboard') && !q('nav-dashboard').classList.contains('bx-brand'), 'nav-dashboard not active on this screen');
     r.check(text('detail-body') === 'Select an issue', 'detail-body default prompt', text('detail-body'));
   });
});

tr.addBlock('issues: tree -- all 6 status groups present with correct counts', (r) => {
  r.run(async () => {
     const list = await fixture();
     const counts = {};
     list.forEach(i => { counts[i.status] = (counts[i.status] || 0) + 1; });
     for (const status of STATUSES) {
       const g = q(`master-group-${status}`);
       r.check(!!g, `group ${status} present`);
       if (g) r.check(g.textContent.includes(`${status} (${counts[status]})`), `group ${status} shows count ${counts[status]}`, g.textContent);
     }
     const itemsPainted = qa('[data-name^="master-item-"]').length;
     r.check(itemsPainted === list.length, 'all items painted (all groups start expanded)', itemsPainted);
   });
});

tr.addBlock('issues: group collapse/expand -- item count in DOM changes', (r) => {
  r.run(async () => {
     const status = STATUSES[0];
     const before = qa('[data-name^="master-item-"]').length;
     q(`master-group-${status}`).click(); await settled();
     const afterCollapse = qa('[data-name^="master-item-"]').length;
     r.check(afterCollapse < before, 'collapsing a group reduces painted item count', `${afterCollapse} vs ${before}`);
     r.check(q(`master-group-${status}`).textContent.startsWith('▸'), 'collapsed group shows ▸ glyph', q(`master-group-${status}`).textContent);
     q(`master-group-${status}`).click(); await settled();
     const afterExpand = qa('[data-name^="master-item-"]').length;
     r.check(afterExpand === before, 'expanding again restores the item count', `${afterExpand} vs ${before}`);
     r.check(q(`master-group-${status}`).textContent.startsWith('▾'), 'expanded group shows ▾ glyph', q(`master-group-${status}`).textContent);
   });
});

tr.addBlock('issues: item select -- detail shows the title, emits master.select', (r) => {
  r.run(async () => {
     const item = qa('[data-name^="master-item-"]')[0];
     const id = item.dataset.name.slice('master-item-'.length);
     const before = window.__emitted.length;
     item.click(); await settled();
     r.check(q(`master-item-${id}`).classList.contains('bx-selected'), 'clicked item has bx-selected');
     r.check(await until(() => text('detail-title') !== 'Detail', 3000), 'detail-title updates after the fetch', text('detail-title'));
     r.check(text('detail-title').includes(item.textContent.replace(/^#\d+\s*/, '').trim()) || item.textContent.includes(text('detail-title').replace(/^#\d+\s*/, '')),
       'detail-title relates to the clicked item label', `${text('detail-title')} vs ${item.textContent}`);
     const sel = window.__emitted.slice(before).find(e => e[0] === 'master.select');
     r.check(!!sel && String(sel[1].id) === id, 'onEmit got master.select with the row', JSON.stringify(sel));
     r.check(!!q('detail-status'), 'status chip row present once a detail is loaded');
     const chips = qa('[data-name^="detail-status-"]');
     r.check(chips.length === STATUSES.length, `${STATUSES.length} status chips present`, chips.length);
   });
});

tr.addBlock('issues: status chip click -- old chip actionable, new chip selected', (r) => {
  r.run(async () => {
     const cur = STATUSES.find(v => q(`detail-status-${v}`).classList.contains('bx-selected'));
     r.check(!!cur, 'exactly one chip starts selected', cur);
     const next = STATUSES.find(v => v !== cur);
     q(`detail-status-${next}`).click(); await settled();
     r.check(q(`detail-status-${cur}`).dataset.name === `detail-status-${cur}`, `old chip data-name unchanged`, q(`detail-status-${cur}`).dataset.name);
     r.check(!q(`detail-status-${cur}`).classList.contains('bx-selected'), 'old chip no longer bx-selected (actionable)');
     r.check(q(`detail-status-${next}`).classList.contains('bx-selected'), 'new chip now bx-selected');
   });
});

tr.addBlock('issues: refresh -- ready -> loading -> ready', (r) => {
  r.run(async () => {
     q('btn-refresh').click();
     r.check(state() === 'loading', 'btn-refresh.click -> loading (synchronous)', state());
     r.check(text('status-text') === 'loading…', 'status-text "loading…" while loading', text('status-text'));
     r.check(await until(() => state() === 'ready', 3000), 'back in ready after the fetch', state());
     r.check(READY_RE.test(text('status-text')), 'status-text ready pattern after refresh', text('status-text'));
   });
});

tr.addBlock('issues: error path -- failed fetch -> error, retry re-issues it', (r) => {
  r.run(async () => {
     const ctl = window.__mount({ fetch: () => Promise.resolve({ ok: false, status: 503 }) });
     const el = ctl.el;
     r.check(await until(() => state(el) === 'error'), 'failed fetch -> error', state(el));
     r.check(text('status-text', el).startsWith('failed:'), 'status-text starts with "failed:"', text('status-text', el));
     const retry = q('btn-retry', el);
     r.check(!!retry && q('master', el).contains(retry), 'btn-retry inside master');
     r.check(!!retry && retry.classList.contains('bx-error'), 'btn-retry marked bx-error');
     NAV.forEach(n => r.check(q(n, el).classList.contains('bx-disabled'), `${n} disabled in error (guard)`));
     el.parentNode.remove();

     // issues.json's `loading` state fires a single fetch (unlike dashboard's
     // 3 parallel ones) -- one failure, one retry click, one real fetch.
     let n = 0;
     const io = { fetch: (u) => n++ < 1 ? Promise.resolve({ ok: false, status: 503 }) : fetch(u) };
     const ctl2 = window.__mount(io), el2 = ctl2.el;
     r.check(await until(() => state(el2) === 'error'), 'second mount: failures -> error', state(el2));
     q('btn-retry', el2).click();
     r.check(state(el2) === 'loading', 'btn-retry.click -> loading', state(el2));
     r.check(await until(() => state(el2) === 'ready'), 'retry -> loading -> ready with the real fetch', state(el2));
     r.check(READY_RE.test(text('status-text', el2)), 'status-text ready pattern after retry', text('status-text', el2));
     el2.parentNode.remove();
     r.check(!document.querySelector('.issues-mount'), 'containers removed');
   });
});

tr.addBlock('issues: nav + theme emit', (r) => {
  r.run(async () => {
     q('nav-dashboard').click(); await settled();
     const last = window.__emitted.at(-1);
     r.check(!!last && last[0] === 'nav.go' && last[1] && last[1].to === 'dashboard', "nav-dashboard.click -> emit nav.go {to:'dashboard'}", JSON.stringify(last));
     q('btn-theme').click(); await settled();
     r.check(window.__emitted.at(-1)[0] === 'theme.toggle', 'btn-theme.click -> emit theme.toggle', JSON.stringify(window.__emitted.at(-1)));
     r.check(state() === 'ready', 'still ready after nav/theme', state());
   });
});

tr.addBlock('issues: fit (C10) -- root does not scroll, content fits, detail status row within panel', (r) => {
  r.run(() => {
     const el = root();
     r.check(el.scrollWidth <= el.clientWidth, 'root: no horizontal overflow', `${el.scrollWidth} > ${el.clientWidth}`);
     r.check(el.scrollHeight <= el.clientHeight, 'root: no vertical overflow', `${el.scrollHeight} > ${el.clientHeight}`);
     const rr = el.getBoundingClientRect();
     r.check(Math.abs(rr.width - window.innerWidth) <= 1, 'root fills viewport width', `${rr.width} vs ${window.innerWidth}`);
     const chipsRow = q('detail-status');
     if (chipsRow) {
       const detailBox = q('detail').getBoundingClientRect();
       const rowBox = chipsRow.getBoundingClientRect();
       r.check(rowBox.right <= detailBox.right + 1, 'status chip row does not overflow the detail panel (C10)', `${rowBox.right} vs ${detailBox.right}`);
     }
   });
});

tr.addBlock('issues: skins -- style toggle, luna brand', (r) => {
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

tr.addBlock('issues: C2 -- unknown trigger throws', (r) => {
  r.run(() => {
     let threw = null;
     try { window.__ctl.dispatch('nope.click'); } catch (e) { threw = e.message; }
     r.check(/unknown trigger/.test(threw), 'dispatch of a trigger no state knows throws', threw);
   });
});

await tr.runBlocks();
