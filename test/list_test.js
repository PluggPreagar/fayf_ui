// test/list_test.js -- list.html (S6, docs/superpowers/plans/2026-09-11-workspace-dashboard.md).
// The node suite proves handlers/view pure; this proves the browser half: 2
// fetches -> ready, both tables render with real fixture row counts, pipeline
// row click filters the runs table (+ detail stats update), same row again
// clears it, a selected pipeline's "start a run" field (field:"text", the new
// real-<input> escape hatch) accepts typed input and emits run.open on
// submit, run row click emits run.open (no page nav in this fixture demo),
// nav/theme, error/retry, fit (C10), skins, C2.
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
const READY_RE = /^\d+ runs · \d+ pipelines$/;
const rowsOf = (table, scope) => qa(`[data-name^="${table}-row-"]`, scope);
const rowId = (table, el) => el.dataset.name.slice(`${table}-row-`.length);

const fixture = async (name) => (await fetch(`/content/dashboard/${name}.json`)).json();

tr.addBlock('list: load -- 2 fetches -> ready, status-text, both tables real row counts', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(async () => {
     r.check(!!root(), 'screen mounted at body > .bx');
     r.check(await until(() => state() === 'ready', 3000), 'data-machine-state reaches ready within 3 s', state());
     r.check(READY_RE.test(text('status-text')), 'status-text: "<n> runs · <m> pipelines"', text('status-text'));
     r.check(text('crumb-page') === 'Pipelines', 'crumb-page "Pipelines"', text('crumb-page'));
     const [pipelines, runs] = await Promise.all(['pipelines', 'runs'].map(fixture));
     r.check(text('status-text') === `${runs.length} runs · ${pipelines.length} pipelines`, 'status-text counts match fixtures', text('status-text'));
     r.check(q('nav-pipelines').classList.contains('bx-brand'), 'nav-pipelines active (bx-brand)');
     r.check(q('nav-dashboard') && !q('nav-dashboard').classList.contains('bx-brand'), 'nav-dashboard not active on this screen');
     r.check(!!q('pipelines-head'), 'pipelines-head present');
     r.check(!!q('runs-head'), 'runs-head present');
     const pipeRows = rowsOf('pipelines'), runRows = rowsOf('runs');
     r.check(pipeRows.length === Math.min(pipelines.length, 20), 'pipelines table painted rows (windowed)', pipeRows.length);
     r.check(runRows.length > 0 && runRows.length <= 20, 'runs table painted rows (windowed)', runRows.length);
     r.check(text('detail-title') === 'Pipelines', 'detail-title default "Pipelines"', text('detail-title'));
     const totalRow = q('detail-body').textContent;
     r.check(totalRow.includes(String(runs.length)), 'detail-body shows total runs count', totalRow);
   });
});

tr.addBlock('list: pipeline filter -- click filters runs table + detail stats, click again clears', (r) => {
  r.run(async () => {
     const pipelines = await fixture('pipelines');
     const runs = await fixture('runs');
     const target = pipelines[0];
     const targetRuns = runs.filter(x => x.pipeline === target);
     const row = q(`pipelines-row-${target}`);
     r.check(!!row, 'pipeline row present', target);
     row.click(); await settled();
     r.check(row.classList.contains('bx-selected'), 'clicked pipeline row has bx-selected');
     r.check(text('detail-title') === `Pipeline: ${target}`, 'detail-title "Pipeline: <name>"', text('detail-title'));
     r.check(text('status-text').includes(`filtered: ${target}`), 'status-text shows filtered marker', text('status-text'));
     const filteredRows = rowsOf('runs');
     r.check(filteredRows.length === Math.min(targetRuns.length, 20), 'runs table shrinks to the pipeline\'s rows', `${filteredRows.length} vs ${targetRuns.length}`);
     r.check(q('detail-body').textContent.includes(String(targetRuns.length)), 'detail-body total updates to the filtered count', q('detail-body').textContent);

     row.click(); await settled();
     r.check(!row.classList.contains('bx-selected'), 'clicking the same pipeline row again clears the selection');
     r.check(text('detail-title') === 'Pipelines', 'detail-title back to "Pipelines"', text('detail-title'));
     r.check(!text('status-text').includes('filtered:'), 'status-text filtered marker gone', text('status-text'));
     r.check(rowsOf('runs').length === Math.min(runs.length, 20), 'runs table back to the full list', rowsOf('runs').length);
   });
});

tr.addBlock('list: start a run -- field types, no-op guards, local-optimistic emits run.open', (r) => {
  r.run(async () => {
     const pipelines = await fixture('pipelines');
     const target = pipelines[1];   // a different pipeline than the filter test used
     q(`pipelines-row-${target}`).click(); await settled();
     const field = q('start-record-id'), btn = q('btn-start-run');
     r.check(field && field.tagName === 'INPUT', 'start-record-id is a real <input>', field && field.tagName);
     r.check(!!btn, 'btn-start-run present');
     const before = window.__emitted.length;
     btn.click(); await settled();
     r.check(window.__emitted.length === before, 'no-op: Start run with an empty field emits nothing');

     field.value = '21_67';
     field.dispatchEvent(new Event('input', { bubbles: true }));
     await settled();
     r.check(field.value === '21_67', 'typed value stays in the field (view patch does not clobber it)');

     btn.click(); await settled();
     const opened = window.__emitted.find(e => e[0] === 'run.open' && e[1].run_id === `${target}-21_67`);
     r.check(!!opened, 'run.open emitted with pipeline-record_id', JSON.stringify(window.__emitted.at(-1)));
     r.check(field.value === '', 'field cleared after starting');

     q(`pipelines-row-${target}`).click(); await settled();   // deselect, leave state clean for later blocks
  });
});

tr.addBlock('list: run row click -- emits run.open with the run_id, no page nav in this fixture demo', (r) => {
  r.run(async () => {
     const row = rowsOf('runs')[0], id = rowId('runs', row);
     const before = window.__emitted.length;
     row.click(); await settled();
     const evs = window.__emitted.slice(before);
     const sel = evs.find(e => e[0] === 'runs.select');
     r.check(!!sel && String(sel[1].run_id) === id, 'onEmit got runs.select with the row', JSON.stringify(sel));
     const open = evs.find(e => e[0] === 'run.open');
     r.check(!!open && String(open[1].run_id) === id, 'onEmit got run.open with the same run_id', JSON.stringify(open));
     r.check(state() === 'ready', 'still ready after a run click (no real nav in this demo)', state());
   });
});

tr.addBlock('list: refresh -- ready -> loading -> ready', (r) => {
  r.run(async () => {
     q('btn-refresh').click();
     r.check(state() === 'loading', 'btn-refresh.click -> loading (synchronous)', state());
     r.check(text('status-text') === 'loading…', 'status-text "loading…" while loading', text('status-text'));
     r.check(await until(() => state() === 'ready', 3000), 'back in ready after the fetches', state());
     r.check(READY_RE.test(text('status-text')), 'status-text ready pattern after refresh', text('status-text'));
   });
});

tr.addBlock('list: error path -- 503 -> error, retry re-issues the fetches', (r) => {
  r.run(async () => {
     const ctl = window.__mount({ fetch: () => Promise.resolve({ ok: false, status: 503 }) });
     const el = ctl.el;
     r.check(await until(() => state(el) === 'error'), 'failed fetch -> error', state(el));
     r.check(text('status-text', el).startsWith('failed:'), 'status-text starts with "failed:"', text('status-text', el));
     const retry = q('btn-retry', el);
     r.check(!!retry && q('pipelines', el).contains(retry), 'btn-retry inside pipelines (the first/primary table)');
     r.check(!!retry && retry.classList.contains('bx-error'), 'btn-retry marked bx-error');
     NAV.forEach(n => r.check(q(n, el).classList.contains('bx-disabled'), `${n} disabled in error (guard)`));
     el.parentNode.remove();

     let n = 0;
     const io = { fetch: (u) => n++ < 2 ? Promise.resolve({ ok: false, status: 503 }) : fetch(u) };
     const ctl2 = window.__mount(io), el2 = ctl2.el;
     r.check(await until(() => state(el2) === 'error'), 'second mount: failures -> error', state(el2));
     q('btn-retry', el2).click();
     r.check(state(el2) === 'loading', 'btn-retry.click -> loading', state(el2));
     r.check(await until(() => state(el2) === 'ready'), 'retry -> loading -> ready with the real fetch', state(el2));
     r.check(READY_RE.test(text('status-text', el2)), 'status-text ready pattern after retry', text('status-text', el2));
     el2.parentNode.remove();
     r.check(!document.querySelector('.list-mount'), 'containers removed');
   });
});

tr.addBlock('list: nav + theme emit', (r) => {
  r.run(async () => {
     q('nav-dashboard').click(); await settled();
     const last = window.__emitted.at(-1);
     r.check(!!last && last[0] === 'nav.go' && last[1] && last[1].to === 'dashboard', "nav-dashboard.click -> emit nav.go {to:'dashboard'}", JSON.stringify(last));
     q('btn-theme').click(); await settled();
     r.check(window.__emitted.at(-1)[0] === 'theme.toggle', 'btn-theme.click -> emit theme.toggle', JSON.stringify(window.__emitted.at(-1)));
     r.check(state() === 'ready', 'still ready after nav/theme', state());
   });
});

tr.addBlock('list: fit (C10) -- root does not scroll, tables sized, content fits', (r) => {
  r.run(() => {
     const el = root();
     r.check(el.scrollWidth <= el.clientWidth, 'root: no horizontal overflow', `${el.scrollWidth} > ${el.clientWidth}`);
     r.check(el.scrollHeight <= el.clientHeight, 'root: no vertical overflow', `${el.scrollHeight} > ${el.clientHeight}`);
     const rr = el.getBoundingClientRect();
     r.check(Math.abs(rr.width - window.innerWidth) <= 1, 'root fills viewport width', `${rr.width} vs ${window.innerWidth}`);
     r.check(Math.round(q('pipelines').getBoundingClientRect().height) === 140, 'pipelines height 140', q('pipelines').getBoundingClientRect().height);
     r.check(Math.round(q('runs').getBoundingClientRect().height) === 320, 'runs height 320', q('runs').getBoundingClientRect().height);
     const c = q('content');
     r.check(c.scrollWidth <= c.clientWidth, 'content: scrollWidth <= clientWidth', `${c.scrollWidth} > ${c.clientWidth}`);
     const cr = c.getBoundingClientRect();
     const out = ['pipelines', 'runs'].filter(n => {
       const b = q(n).getBoundingClientRect();
       return b.left < cr.left - 1 || b.right > cr.right + 1;
     });
     r.check(out.length === 0, 'tables inside content width', `outside: ${out.join(', ')}`);
   });
});

tr.addBlock('list: skins -- style toggle, luna brand', (r) => {
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

tr.addBlock('list: C2 -- unknown trigger throws', (r) => {
  r.run(() => {
     let threw = null;
     try { window.__ctl.dispatch('nope.click'); } catch (e) { threw = e.message; }
     r.check(/unknown trigger/.test(threw), 'dispatch of a trigger no state knows throws', threw);
   });
});

await tr.runBlocks();
