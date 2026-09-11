// test/records_test.js -- records.html (S6, docs/superpowers/plans/2026-09-11-workspace-dashboard.md).
// The node suite proves handlers/view pure; this proves the browser half: a
// real fetch of the run's metadata -> ready, a step's 3 record children are
// already there (no fetch needed to reveal them, unlike browse.html's lazy
// levels), a record click loads its JSON output into the detail pane
// (pretty-printed + NBSP-indented, reused from ui/browse.js's detailBody),
// a record with no fixture file fails cleanly, nav/theme, error/retry, fit
// (C10), skins, C2. Mirrors test/browse_test.js; simpler -- no multi-level
// recursion or lazy-fetch-guard to prove.
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
const nodeSel = (path) => `tree-node-${encodeURIComponent(path)}`;

const fixture = async (rel) => (await fetch(`/content/records/${rel}`)).json();

tr.addBlock('records: load -- real fetch -> ready, status-text, 3 step nodes render', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(async () => {
     r.check(!!root(), 'screen mounted at body > .bx');
     r.check(await until(() => state() === 'ready', 3000), 'data-machine-state reaches ready within 3 s', state());
     r.check(text('crumb-page') === 'Records', 'crumb-page "Records"', text('crumb-page'));
     const run = await fixture('run.json');
     r.check(text('status-text') === `${run.run.pipeline} · run ${run.run.run_id}`, 'status-text "<pipeline> · run <id>" matches fixture', text('status-text'));
     for (const stepId of Object.keys(run.steps)) r.check(!!q(nodeSel(stepId)), `step row present: ${stepId}`);
     r.check(text('detail-title') === 'Select a record', 'detail-title default', text('detail-title'));
     r.check(q('nav-records') && q('nav-records').classList.contains('bx-brand'), 'nav-records shows active (screens/records.json side-panel override)');
  });
});

tr.addBlock('records: expand a step -- its 3 record children are already there, no fetch needed', (r) => {
  r.run(async () => {
     const row = q(nodeSel('ingest'));
     r.check(!!row, 'ingest step row present');
     r.check(text(nodeSel('ingest')).startsWith('▸'), 'closed glyph before expand', text(nodeSel('ingest')));
     row.click();
     r.check(!!q(nodeSel('ingest/21_67')), 'ingest/21_67 record row present immediately (no waitFor -- no fetch involved)');
     r.check(!!q(nodeSel('ingest/21_68')), 'ingest/21_68 record row present');
     r.check(!!q(nodeSel('ingest/21_69')), 'ingest/21_69 record row present');
     r.check(text(nodeSel('ingest')).startsWith('▾'), 'open glyph after expand', text(nodeSel('ingest')));
     r.check(state() === 'ready', 'still ready -- expanding a step is a pure toggle, no loading flicker', state());
  });
});

tr.addBlock('records: click a record -- detail populates, pretty JSON renders as multiple NBSP-indented rows', (r) => {
  r.run(async () => {
     const file = q(nodeSel('ingest/21_67'));
     r.check(!!file, 'ingest/21_67 row present');
     file.click();
     r.check(await until(() => text('detail-title') === 'ingest/21_67', 3000), 'detail-title shows the selected path', text('detail-title'));
     r.check(file.classList.contains('bx-selected'), 'clicked record row has bx-selected');
     r.check(await until(() => q('detail-body').textContent.includes('record_id'), 3000), 'detail-body populated once the artifact fetch resolves', text('detail-body'));
     const body = q('detail-body');
     const lines = [...body.children];
     r.check(lines.length > 3, 'JSON renders as multiple distinct rows, not one blob', lines.length);
     r.check(lines[0].textContent.trim() === '{', 'first row is the opening brace', lines[0].textContent);
     const indented = lines.find(el => el.textContent.startsWith(' '));
     r.check(!!indented, 'an indented line starts with NBSP (U+00A0), not a plain space', indented && JSON.stringify(indented.textContent));
  });
});

tr.addBlock('records: a record with no fixture file fails cleanly -- stays ready, error set, no crash', (r) => {
  r.run(async () => {
     const step = q(nodeSel('index'));
     step.click(); await settled();
     r.check(!!q(nodeSel('index/21_68')), 'index/21_68 row present (a record with no fixture file -- only index/21_67 exists)');
     const file = q(nodeSel('index/21_68'));
     file.click();
     // detail.failed is a ready->ready self-transition (machines/records.json)
     // -- a per-record fetch failure never demotes the whole screen to the
     // top-level error state (that's reserved for the run-metadata fetch);
     // it only sets status.data.error. Read the controller's own status
     // (exposed via window.__ctl) rather than assuming a status-text change.
     r.check(await until(() => window.__ctl.status.data.error != null, 3000), 'missing fixture -> data.error populated', window.__ctl.status.data.error);
     r.check(state() === 'ready', 'machine stays in ready, does not crash/demote to error', state());
     r.check(text('detail-body') === 'Select a record', 'detail-body falls back cleanly instead of showing stale/broken content', text('detail-body'));
  });
});

tr.addBlock('records: nav + theme emit', (r) => {
  r.run(async () => {
     q('nav-dashboard').click(); await settled();
     const last = window.__emitted.at(-1);
     r.check(!!last && last[0] === 'nav.go' && last[1] && last[1].to === 'dashboard', "nav-dashboard.click -> emit nav.go {to:'dashboard'}", JSON.stringify(last));
     q('btn-theme').click(); await settled();
     r.check(window.__emitted.at(-1)[0] === 'theme.toggle', 'btn-theme.click -> emit theme.toggle', JSON.stringify(window.__emitted.at(-1)));
  });
});

tr.addBlock('records: error path -- failed run fetch -> error, retry re-issues it', (r) => {
  r.run(async () => {
     const ctl = window.__mount({ fetch: () => Promise.resolve({ ok: false, status: 503 }) });
     const el = ctl.el;
     r.check(await until(() => state(el) === 'error'), 'failed fetch -> error', state(el));
     r.check(text('status-text', el).startsWith('failed:'), 'status-text starts with "failed:"', text('status-text', el));
     const retry = q('btn-retry', el);
     r.check(!!retry && q('tree', el).contains(retry), 'btn-retry inside the tree region');
     r.check(!!retry && retry.classList.contains('bx-error'), 'btn-retry marked bx-error');
     NAV.forEach(n => r.check(q(n, el).classList.contains('bx-disabled'), `${n} disabled in error (guard)`));
     el.parentNode.remove();

     let n = 0;
     const io = { fetch: (u) => n++ < 1 ? Promise.resolve({ ok: false, status: 503 }) : fetch(u) };
     const ctl2 = window.__mount(io), el2 = ctl2.el;
     r.check(await until(() => state(el2) === 'error'), 'second mount: failures -> error', state(el2));
     q('btn-retry', el2).click();
     r.check(state(el2) === 'loading', 'btn-retry.click -> loading', state(el2));
     r.check(await until(() => state(el2) === 'ready'), 'retry -> loading -> ready with the real fetch', state(el2));
     el2.parentNode.remove();
     r.check(!document.querySelector('.records-mount'), 'containers removed');
  });
});

tr.addBlock('records: fit (C10) -- root does not scroll, tree/detail sized, content fits', (r) => {
  r.run(() => {
     const el = root();
     r.check(el.scrollWidth <= el.clientWidth, 'root: no horizontal overflow', `${el.scrollWidth} > ${el.clientWidth}`);
     r.check(el.scrollHeight <= el.clientHeight, 'root: no vertical overflow', `${el.scrollHeight} > ${el.clientHeight}`);
     const rr = el.getBoundingClientRect();
     r.check(Math.abs(rr.width - window.innerWidth) <= 1, 'root fills viewport width', `${rr.width} vs ${window.innerWidth}`);
     const c = q('content');
     r.check(c.scrollWidth <= c.clientWidth, 'content: scrollWidth <= clientWidth', `${c.scrollWidth} > ${c.clientWidth}`);
     const cr = c.getBoundingClientRect();
     const tb = q('tree').getBoundingClientRect();
     r.check(tb.left >= cr.left - 1 && tb.right <= cr.right + 1, 'tree inside content width', `${tb.left},${tb.right} vs ${cr.left},${cr.right}`);
     const d = q('detail');
     r.check(d.scrollWidth <= d.clientWidth, 'detail: scrollWidth <= clientWidth (NBSP-indented long lines still clip, not overflow)', `${d.scrollWidth} > ${d.clientWidth}`);
  });
});

tr.addBlock('records: skins -- style toggle, luna brand', (r) => {
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

tr.addBlock('records: C2 -- unknown trigger throws', (r) => {
  r.run(() => {
     let threw = null;
     try { window.__ctl.dispatch('nope.click'); } catch (e) { threw = e.message; }
     r.check(/unknown trigger/.test(threw), 'dispatch of a trigger no state knows throws', threw);
  });
});

await tr.runBlocks();
