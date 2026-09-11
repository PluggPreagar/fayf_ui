// test/dashboard_test.js -- dashboard.html (S3, docs/superpowers/plans/2026-09-11-workspace-dashboard.md).
// The node suite proves handlers/view/counts pure; this proves the browser
// half: 3 fetches -> ready, stats + status line from status, two windowed
// tables, row select -> detail + emit, refresh round trip, error -> retry,
// nav/theme emits, fit (C10), skins, C2 error on an unknown trigger.
import { counts } from '../ui/dashboard.js';

const tr = new TestRunner({ stopOnError: false });
// r.check(cond, label, got): a failing line keeps its label next to the value (C7).
const rawCheck = tr.check.bind(tr);
tr.check = (cond, label, got = null, tag = null) => rawCheck(cond, label, got == null ? null : `${label} -- got ${got}`, tag);
const settled = (ms = 60) => new Promise(r => setTimeout(r, ms));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) return false; await wait(20); } return true; };

const root = () => document.querySelector('body > .bx');
const q = (name, scope = root()) => scope.querySelector(`[data-name="${name}"]`);
const qa = (sel, scope = root()) => [...scope.querySelectorAll(sel)];
const text = (name, scope) => (q(name, scope)?.textContent ?? '').trim();
const isInt = (s) => /^\d+$/.test(s);
const READY_RE = /^\d+ runs · \d+ pipelines$/;
const STATS = ['stat-running', 'stat-failed', 'stat-pipelines', 'stat-issues'];
const NAV = ['nav-dashboard', 'nav-pipelines', 'nav-graph', 'nav-records', 'nav-issues', 'nav-settings'];
const rowsOf = (table, scope) => qa(`[data-name^="${table}-row-"]`, scope);
const rowId = (table, el) => el.dataset.name.slice(`${table}-row-`.length);
const state = (scope = root()) => scope.dataset.machineState;

const fixture = async (name) => (await fetch(`/content/dashboard/${name}.json`)).json();

tr.addBlock('dashboard: load -- 3 fetches -> ready, stats + status line from status', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(async () => {
     r.check(!!root(), 'screen mounted at body > .bx');
     r.check(await until(() => state() === 'ready', 3000), 'data-machine-state reaches ready within 3 s', state());
     r.check(READY_RE.test(text('status-text')), 'status-text: "<n> runs · <m> pipelines"', text('status-text'));
     STATS.forEach(n => r.check(isInt(text(n)), `${n} is an integer (not –)`, text(n)));
     const [runs, pipelines, issues] = await Promise.all(['runs', 'pipelines', 'issues'].map(fixture));
     // counts() reads the status.data shape: raw runs/pipelines, issues under the table slice's rows
     const c = counts({ runs, pipelines, issues: { rows: issues } });
     r.check(Number(text('stat-pipelines')) === c.pipelines, 'stat-pipelines = counts(fixtures).pipelines', `${text('stat-pipelines')} vs ${c.pipelines}`);
     const e2e = pipelines.filter(p => /^e2e-deploy-/.test(p)).length;
     r.check(e2e > 0 && c.pipelines === pipelines.length - e2e, 'stat-pipelines excludes e2e-deploy names', `${c.pipelines} of ${pipelines.length}, e2e=${e2e}`);
     r.check(Number(text('stat-running')) === c.running, 'stat-running = counts.running', `${text('stat-running')} vs ${c.running}`);
     r.check(Number(text('stat-failed')) === c.failed, 'stat-failed = counts.failed', `${text('stat-failed')} vs ${c.failed}`);
     r.check(Number(text('stat-issues')) === c.issues, 'stat-issues = counts.issues', `${text('stat-issues')} vs ${c.issues}`);
     r.check(text('status-text') === `${runs.length} runs · ${c.pipelines} pipelines`, 'status-text counts match fixtures', text('status-text'));
     r.check(text('crumb-page') === 'Dashboard', 'crumb-page "Dashboard"', text('crumb-page'));
     r.check(q('nav-dashboard').classList.contains('bx-brand'), 'nav-dashboard active (bx-brand)');
     r.check(text('detail-body') === 'Select a run or an issue', 'detail-body default prompt', text('detail-body'));
   });
});

tr.addBlock('dashboard: tables -- head + windowed rows, newest run first, sort cycle', (r) => {
  r.run(async () => {
     for (const t of ['recent-runs', 'issues']) {
       r.check(!!q(`${t}-head`), `${t}-head present`);
       const n = rowsOf(t).length;
       r.check(n >= 5 && n <= 20, `${t}: 5..20 rows painted (windowed in h:240)`, n);
       const h = rowsOf(t)[0]?.getBoundingClientRect().height;
       r.check(h === 28, `${t}: row height 28`, h);
     }
     const runsT = window.__ctl.status.data['recent-runs'];
     r.check(!!runsT && runsT.sort && runsT.sort.key === 'started_at' && runsT.sort.dir === 'desc',
       'recent-runs default sort started_at desc', JSON.stringify(runsT?.sort));
     const newest = [...runsT.rows].sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0];
     r.check(rowId('recent-runs', rowsOf('recent-runs')[0]) === String(newest.run_id),
       'first runs row is the newest started_at', `${rowId('recent-runs', rowsOf('recent-runs')[0])} vs ${newest.run_id}`);
     const col = () => q('recent-runs-col-status');
     col().click(); await settled();
     r.check(col().textContent.includes('▲'), 'status header: ▲ after 1st click', col().textContent);
     col().click(); await settled();
     r.check(col().textContent.includes('▼'), 'status header: ▼ after 2nd click', col().textContent);
     col().click(); await settled();
     r.check(!/[▲▼]/.test(col().textContent), 'status header: no mark after 3rd click', col().textContent);
     // back to the default order for the blocks below
     const started = () => q('recent-runs-col-started_at');
     started().click(); await settled(); started().click(); await settled();
     r.check(started().textContent.includes('▼'), 'started_at desc restored', started().textContent);
   });
});

tr.addBlock('dashboard: select -- run row -> detail + emit, issue row -> detail switches', (r) => {
  r.run(async () => {
     const row = rowsOf('recent-runs')[0], id = rowId('recent-runs', row);
     const before = window.__emitted.length;
     row.click(); await settled();
     r.check(q(`recent-runs-row-${id}`).classList.contains('bx-selected'), 'clicked runs row has bx-selected');
     r.check(text('detail-title') === `Run ${id}`, 'detail-title "Run <run_id>"', text('detail-title'));
     const run = window.__ctl.status.data['recent-runs'].rows.find(x => String(x.run_id) === id);
     r.check(!!run && text('detail-body').includes(run.pipeline), 'detail-body names the pipeline', `${run?.pipeline} in "${text('detail-body')}"`);
     const sel = window.__emitted.slice(before).find(e => e[0] === 'recent-runs.select');
     r.check(!!sel && sel[1] && String(sel[1].run_id) === id, 'onEmit got recent-runs.select with the row', JSON.stringify(sel));
     const irow = rowsOf('issues')[1] ?? rowsOf('issues')[0], iid = rowId('issues', irow);
     irow.click(); await settled();
     const issue = window.__ctl.status.data.issues.rows.find(x => String(x.id) === iid);
     r.check(/^Issue #\d+$/.test(text('detail-title')), 'detail-title "Issue #<n>" after issue click', text('detail-title'));
     r.check(!!issue && text('detail-title') === `Issue #${issue.number}`, 'detail-title number matches the row', `${text('detail-title')} vs #${issue?.number}`);
     r.check(q(`issues-row-${iid}`).classList.contains('bx-selected'), 'clicked issues row has bx-selected');
     r.check(rowsOf('issues').filter(e => e.classList.contains('bx-selected')).length === 1, 'exactly one selected issues row');
     r.check(rowsOf('recent-runs').filter(e => e.classList.contains('bx-selected')).length <= 1, 'at most one selected runs row');
   });
});

tr.addBlock('dashboard: refresh -- ready -> loading -> ready', (r) => {
  r.run(async () => {
     q('btn-refresh').click();
     r.check(state() === 'loading', 'btn-refresh.click -> loading (synchronous)', state());
     r.check(text('status-text') === 'loading…', 'status-text "loading…" while loading', text('status-text'));
     r.check(await until(() => state() === 'ready', 3000), 'back in ready after the fetches', state());
     STATS.forEach(n => r.check(isInt(text(n)), `${n} integer after refresh`, text(n)));
     r.check(READY_RE.test(text('status-text')), 'status-text ready pattern after refresh', text('status-text'));
   });
});

tr.addBlock('dashboard: error path -- 503 -> error, retry re-issues the fetches', (r) => {
  r.run(async () => {
     const ctl = window.__mount({ fetch: () => Promise.resolve({ ok: false, status: 503 }) });
     const el = ctl.el;
     r.check(await until(() => state(el) === 'error'), 'failed fetch -> error', state(el));
     r.check(text('status-text', el).startsWith('failed:'), 'status-text starts with "failed:"', text('status-text', el));
     const retry = q('btn-retry', el);
     r.check(!!retry && q('recent-runs', el).contains(retry), 'btn-retry inside recent-runs');
     r.check(!!retry && retry.classList.contains('bx-error'), 'btn-retry marked bx-error');
     r.check(!!retry && !retry.classList.contains('bx-disabled'), 'btn-retry enabled in error');
     NAV.forEach(n => r.check(q(n, el).classList.contains('bx-disabled'), `${n} disabled in error (guard)`));
     r.check(q('btn-refresh', el).classList.contains('bx-disabled'), 'btn-refresh disabled in error');
     el.parentNode.remove();

     let n = 0;
     const io = { fetch: (u) => n++ < 3 ? Promise.resolve({ ok: false, status: 503 }) : fetch(u) };
     const ctl2 = window.__mount(io), el2 = ctl2.el;
     r.check(await until(() => state(el2) === 'error'), 'second mount: 3 failures -> error', state(el2));
     q('btn-retry', el2).click();
     r.check(state(el2) === 'loading', 'btn-retry.click -> loading', state(el2));
     r.check(await until(() => state(el2) === 'ready'), 'retry -> loading -> ready with the real fetch', state(el2));
     r.check(READY_RE.test(text('status-text', el2)), 'status-text ready pattern after retry', text('status-text', el2));
     r.check(rowsOf('recent-runs', el2).length >= 5, 'runs rows painted after retry', rowsOf('recent-runs', el2).length);
     el2.parentNode.remove();
     r.check(!document.querySelector('.dashboard-mount'), 'containers removed');
   });
});

tr.addBlock('dashboard: nav + theme emit', (r) => {
  r.run(async () => {
     q('nav-issues').click(); await settled();
     const last = window.__emitted.at(-1);
     r.check(!!last && last[0] === 'nav.go' && last[1] && last[1].to === 'issues', "nav-issues.click -> emit nav.go {to:'issues'}", JSON.stringify(last));
     q('btn-theme').click(); await settled();
     r.check(window.__emitted.at(-1)[0] === 'theme.toggle', 'btn-theme.click -> emit theme.toggle', JSON.stringify(window.__emitted.at(-1)));
     r.check(state() === 'ready', 'still ready after nav/theme', state());
   });
});

tr.addBlock('dashboard: fit (C10) -- root does not scroll, tables h:240, content fits', (r) => {
  r.run(() => {
     const el = root();
     r.check(el.scrollWidth <= el.clientWidth, 'root: no horizontal overflow', `${el.scrollWidth} > ${el.clientWidth}`);
     r.check(el.scrollHeight <= el.clientHeight, 'root: no vertical overflow', `${el.scrollHeight} > ${el.clientHeight}`);
     const rr = el.getBoundingClientRect();
     r.check(Math.abs(rr.width - window.innerWidth) <= 1, 'root fills viewport width', `${rr.width} vs ${window.innerWidth}`);
     for (const t of ['recent-runs', 'issues']) {
       const h = q(t).getBoundingClientRect().height;
       r.check(Math.round(h) === 240, `${t} height 240`, h);
     }
     const c = q('content');
     r.check(c.scrollWidth <= c.clientWidth, 'content: scrollWidth <= clientWidth', `${c.scrollWidth} > ${c.clientWidth}`);
     const cr = c.getBoundingClientRect();
     const out = ['glance', 'recent-runs', 'issues'].filter(n => {
       const b = q(n).getBoundingClientRect();
       return b.left < cr.left - 1 || b.right > cr.right + 1;
     });
     r.check(out.length === 0, 'glance + tables inside content width', `outside: ${out.join(', ')}`);
   });
});

tr.addBlock('dashboard: skins -- style toggle, luna brand', (r) => {
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

tr.addBlock('dashboard: C2 -- unknown trigger throws', (r) => {
  r.run(() => {
     let threw = null;
     try { window.__ctl.dispatch('nope.click'); } catch (e) { threw = e.message; }
     r.check(/unknown trigger/.test(threw), 'dispatch of a trigger no state knows throws', threw);
   });
});

await tr.runBlocks();
