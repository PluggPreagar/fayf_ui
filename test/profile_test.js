// test/profile_test.js -- profile.html (S6, docs/superpowers/plans/2026-09-11-workspace-dashboard.md).
// The node suite proves handlers/view pure; this proves the browser half: 1
// fetch -> ready, run-picker chips render per fixture "done" run, clicking 2
// chips selects them + enables Compute (0/1 selected leaves it disabled and
// a click does nothing), Compute fetches + renders the speakers table, a
// fenster chip click changes the bucket display, a speaker row click shows
// findings incl. the 0-pairs speaker rendering cleanly, refresh, nav/theme,
// error/retry, fit (C10), luna skin, C2.
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
const READY_RE = /^\d+ runs available$/;
const runsFixture = async () => (await fetch('/content/profile/runs.json')).json();
const doneRuns = (runs) => runs.filter(r => r.status === 'done').sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));

tr.addBlock('profile: load -- 1 fetch -> ready, status-text, a run-picker chip per "done" run', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(async () => {
     r.check(!!root(), 'screen mounted at body > .bx');
     r.check(await until(() => state() === 'ready', 3000), 'data-machine-state reaches ready within 3 s', state());
     r.check(text('crumb-page') === 'Profile', 'crumb-page "Profile"', text('crumb-page'));
     const runs = await runsFixture();
     const done = doneRuns(runs);
     r.check(READY_RE.test(text('status-text')), 'status-text: "<n> runs available"', text('status-text'));
     r.check(text('status-text') === `${done.length} runs available`, 'status-text count matches done-only runs', text('status-text'));
     r.check(q('nav-profile') == null, 'no nav-profile item exists in this shared side-panel (pre-existing gap)');
     for (const run of done) r.check(!!q(`run-picker-${run.run_id}`), `run-picker chip for ${run.run_id} present`);
     r.check(qa('[data-name^="run-picker-"]').length === done.length, 'exactly one chip per done run, no extras', qa('[data-name^="run-picker-"]').length);
     for (const w of ['wahlperiode', 'jahr', 'monat', 'woche', 'tag', 'jahrzehnt']) r.check(!!q(`fenster-${w}`), `fenster chip ${w} present`);
     r.check(q('fenster-wahlperiode').classList.contains('bx-selected'), 'fenster-wahlperiode selected by default');
     r.check(q('btn-compute').classList.contains('bx-disabled'), 'btn-compute disabled with 0 picked');
   });
});

tr.addBlock('profile: run-picker -- 0/1 picked leaves Compute disabled (click no-ops); 2 picked selects + enables', (r) => {
  r.run(async () => {
     const runs = await runsFixture();
     const done = doneRuns(runs);
     const [a, b] = done;
     const before = window.__emitted.length;
     q('btn-compute').click(); await settled();
     r.check(window.__emitted.length === before, 'Compute click with 0 picked emits nothing');

     q(`run-picker-${a.run_id}`).click(); await settled();
     r.check(q(`run-picker-${a.run_id}`).classList.contains('bx-selected'), 'clicked chip visually selected');
     r.check(q('btn-compute').classList.contains('bx-disabled'), 'still disabled with only 1 picked');
     q('btn-compute').click(); await settled();
     r.check(window.__emitted.length === before, 'Compute click with 1 picked still emits nothing');

     q(`run-picker-${b.run_id}`).click(); await settled();
     r.check(q(`run-picker-${b.run_id}`).classList.contains('bx-selected'), 'second chip visually selected');
     r.check(!q('btn-compute').classList.contains('bx-disabled'), 'btn-compute enabled with 2 picked');
   });
});

tr.addBlock('profile: Compute -- fetches + renders the speakers table', (r) => {
  r.run(async () => {
     q('btn-compute').click();
     r.check(text('btn-compute') === 'Computing…', 'button label flips to Computing…', text('btn-compute'));
     r.check(await until(() => text('btn-compute') !== 'Computing…', 3000), 'compute settles', text('btn-compute'));
     r.check(!!q('speakers-head'), 'speakers-head present after compute');
     const rows = qa('[data-name^="speakers-row-"]');
     r.check(rows.length === 4, 'speakers table has 4 rows (the fixture profiles)', rows.length);
     r.check(!!q('speakers-row-sp-merz'), 'sp-merz row present');
     r.check(!!q('speakers-row-sp-lindner'), '0-pairs speaker (sp-lindner) row present, not hidden');
   });
});

tr.addBlock('profile: fenster chip click -- switches the current bucket display, speaker row click shows findings', (r) => {
  r.run(async () => {
     q('speakers-row-sp-merz').click(); await settled();
     r.check(q('speakers-row-sp-merz').classList.contains('bx-selected'), 'speaker row selected');
     r.check(text('detail-title') === 'F. Merz', 'detail-title shows the selected speaker\'s name', text('detail-title'));
     const bodyWahlperiode = text('detail-body');
     r.check(bodyWahlperiode.includes('WIDERSPRICHT'), 'detail-body shows a befund');

     q('fenster-jahr').click(); await settled();
     r.check(q('fenster-jahr').classList.contains('bx-selected'), 'fenster-jahr now selected');
     r.check(!q('fenster-wahlperiode').classList.contains('bx-selected'), 'fenster-wahlperiode no longer selected');
     const bodyJahr = text('detail-body');
     r.check(bodyJahr.includes('Fenster (jahr)'), 'detail-body header reflects the new fenster', bodyJahr);
     r.check(bodyJahr !== bodyWahlperiode, 'bucket rows actually changed between windows');

     q('speakers-row-sp-lindner').click(); await settled();
     r.check(text('detail-title') === 'C. Lindner', 'detail-title switches to the 0-pairs speaker', text('detail-title'));
     r.check(text('detail-body').includes('Keine klassifizierten Paare'), '0-pairs speaker renders the honesty line, no crash', text('detail-body'));
   });
});

tr.addBlock('profile: refresh -- ready -> loading -> ready, picked/result survive (only runs reload)', (r) => {
  r.run(async () => {
     const wasSelected = text('detail-title');
     q('btn-refresh').click();
     r.check(state() === 'loading', 'btn-refresh.click -> loading (synchronous)', state());
     r.check(await until(() => state() === 'ready', 3000), 'back in ready after the fetch', state());
     r.check(READY_RE.test(text('status-text')), 'status-text ready pattern after refresh', text('status-text'));
     r.check(text('detail-title') === wasSelected, 'selected speaker detail survives a refresh (result kept)', text('detail-title'));
     r.check(!!q('speakers-row-sp-merz'), 'speakers table still populated after refresh');
   });
});

tr.addBlock('profile: error path -- fetch failure -> error, retry re-issues the fetch', (r) => {
  r.run(async () => {
     const ctl = window.__mount({ fetch: () => Promise.resolve({ ok: false, status: 503 }) });
     const el = ctl.el;
     r.check(await until(() => state(el) === 'error'), 'failed fetch -> error', state(el));
     r.check(text('status-text', el).startsWith('failed:'), 'status-text starts with "failed:"', text('status-text', el));
     const retry = q('btn-retry', el);
     r.check(!!retry && q('run-picker', el).contains(retry), 'btn-retry inside run-picker');
     r.check(!!retry && retry.classList.contains('bx-error'), 'btn-retry marked bx-error');
     NAV.forEach(n => r.check(q(n, el).classList.contains('bx-disabled'), `${n} disabled in error (guard)`));
     el.parentNode.remove();

     // Second, independent mount: fails twice then lets the real fetch through,
     // to prove retry actually recovers (a permanently-failing io, as above,
     // would fail retry forever too -- same two-mount pattern test/list_test.js uses).
     // machines/profile.json's `loading` state issues exactly ONE fetch per
     // entry (unlike list.json's 2 parallel fetches) -- one dummy failure
     // (the initial mount) is enough to reach `error`, so the retry's own
     // fetch (call #2) is the first one let through.
     let n = 0;
     const io = { fetch: (u) => n++ < 1 ? Promise.resolve({ ok: false, status: 503 }) : fetch(u) };
     const ctl2 = window.__mount(io), el2 = ctl2.el;
     r.check(await until(() => state(el2) === 'error'), 'second mount: failures -> error', state(el2));
     q('btn-retry', el2).click();
     r.check(state(el2) === 'loading', 'btn-retry.click -> loading', state(el2));
     r.check(await until(() => state(el2) === 'ready'), 'retry -> loading -> ready with the real fetch', state(el2));
     r.check(READY_RE.test(text('status-text', el2)), 'status-text ready pattern after retry', text('status-text', el2));
     el2.parentNode.remove();
     r.check(!document.querySelector('.profile-mount'), 'containers removed');
   });
});

tr.addBlock('profile: nav + theme emit', (r) => {
  r.run(async () => {
     q('nav-dashboard').click(); await settled();
     const last = window.__emitted.at(-1);
     r.check(!!last && last[0] === 'nav.go' && last[1] && last[1].to === 'dashboard', "nav-dashboard.click -> emit nav.go {to:'dashboard'}", JSON.stringify(last));
     q('btn-theme').click(); await settled();
     r.check(window.__emitted.at(-1)[0] === 'theme.toggle', 'btn-theme.click -> emit theme.toggle', JSON.stringify(window.__emitted.at(-1)));
     r.check(state() === 'ready', 'still ready after nav/theme', state());
   });
});

tr.addBlock('profile: fit (C10) -- root does not scroll, speakers table sized, content fits', (r) => {
  r.run(() => {
     const el = root();
     r.check(el.scrollWidth <= el.clientWidth, 'root: no horizontal overflow', `${el.scrollWidth} > ${el.clientWidth}`);
     r.check(el.scrollHeight <= el.clientHeight, 'root: no vertical overflow', `${el.scrollHeight} > ${el.clientHeight}`);
     const rr = el.getBoundingClientRect();
     r.check(Math.abs(rr.width - window.innerWidth) <= 1, 'root fills viewport width', `${rr.width} vs ${window.innerWidth}`);
     r.check(Math.round(q('speakers').getBoundingClientRect().height) === 240, 'speakers table height 240', q('speakers').getBoundingClientRect().height);
     const c = q('content');
     r.check(c.scrollWidth <= c.clientWidth, 'content: scrollWidth <= clientWidth', `${c.scrollWidth} > ${c.clientWidth}`);
     const cr = c.getBoundingClientRect();
     const out = ['run-picker', 'fenster', 'btn-compute', 'speakers'].filter(n => {
       const b = q(n).getBoundingClientRect();
       return b.left < cr.left - 1 || b.right > cr.right + 1;
     });
     r.check(out.length === 0, 'content children inside content width', `outside: ${out.join(', ')}`);
     const dr = q('detail').getBoundingClientRect();
     r.check(Math.round(dr.width) === 280, 'detail panel width 280', dr.width);
   });
});

tr.addBlock('profile: skins -- style toggle, luna brand', (r) => {
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

tr.addBlock('profile: C2 -- unknown trigger throws', (r) => {
  r.run(() => {
     let threw = null;
     try { window.__ctl.dispatch('nope.click'); } catch (e) { threw = e.message; }
     r.check(/unknown trigger/.test(threw), 'dispatch of a trigger no state knows throws', threw);
   });
});

await tr.runBlocks();
