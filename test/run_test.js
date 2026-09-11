// test/run_test.js -- run.html (S6, docs/superpowers/plans/2026-09-11-workspace-dashboard.md).
// The node suite proves handlers/view pure; this proves the browser half: a
// real fetch of the run's snapshot -> ready, status badge + steps table
// render from real fixture data, the fake-stream fixture (run.html's own
// FakeEventSource test-double, NOT part of ui/run.js/ui/machine.js) actually
// replays its scripted events over real wall-clock time and the status
// badge/event log visibly update, pause/resume/cancel enabled/disabled per
// the CURRENT status and a real click fires the right POST (intercepted via
// an injected io.fetch, same seam test/list_test.js's error-path block
// already uses -- this repo's dev server has no do_POST, so a real POST
// against the fixture would 501), a steps row click emits records.open, the
// two head buttons emit records.open/graph.open, nav/theme, error/retry, fit
// (C10), skins, C2. Mirrors test/records_test.js.
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

const fixture = async (rel) => (await fetch(`/content/run/${rel}`)).json();
// A stub EventSource that never fires -- used by blocks that don't care about
// the live stream, so its own natural fake-replay (started fresh by every
// window.__mount call) can't race a block's own log/status assertions.
class NoStream { constructor() {} close() {} }

tr.addBlock('run: load -- real fetch -> ready, status-text, steps table renders', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(async () => {
     r.check(!!root(), 'screen mounted at body > .bx');
     r.check(await until(() => state() === 'ready', 3000), 'data-machine-state reaches ready within 3 s', state());
     r.check(text('crumb-page') === 'Run', 'crumb-page "Run"', text('crumb-page'));
     const snap = await fixture('snapshot.json');
     r.check(text('status-text').includes(snap.run.pipeline), 'status-text includes pipeline', text('status-text'));
     r.check(text('status-text').includes(snap.run.run_id), 'status-text includes run id', text('status-text'));
     r.check(text('status-text').includes(snap.run.status), 'status-text includes status (running)', text('status-text'));
     for (const stepId of Object.keys(snap.steps)) r.check(!!q(`steps-row-${stepId}`), `step row present: ${stepId}`);
     r.check(!q('btn-pause').classList.contains('bx-disabled'), 'pause enabled while running');
     r.check(q('btn-resume').classList.contains('bx-disabled'), 'resume disabled while running');
     r.check(!q('btn-cancel').classList.contains('bx-disabled'), 'cancel enabled while running');
  });
});

tr.addBlock('run: fake SSE stream replays over real wall-clock time -- status badge visibly changes, event log grows', (r) => {
  r.run(async () => {
     // A FRESH mount (rather than window.__ctl, which opened its own stream
     // back at page load and may already be mid- or post-replay by the time
     // this block runs) -- gives this block's own timing budget starting
     // from a known t=0 (its own 'ready'), not from whenever page load
     // happened to occur relative to the test chain.
     const ctl = window.__mount({});
     const el = ctl.el;
     r.check(await until(() => state(el) === 'ready'), 'fresh mount reaches ready', state(el));
     const before = q('event-log', el).children.length;
     // Poll the CONTROLLER's own data (status.data.log), not the rendered
     // status-text, for the intermediate run_paused message: the paused window
     // is only ~1 replay tick wide (run_resumed follows right after), so a
     // rendered-text poll can race past it between polls -- the log entry,
     // once written, stays put and is a robust proxy for "the real stream
     // delivered this message over real wall-clock time".
     // Generous budgets: this environment's setInterval cadence for the fake
     // stream is not a tight 400ms in practice (background-tab-style timer
     // throttling in a sandboxed/virtualized browser) -- the real assertion
     // is "eventually, over real wall-clock time, not instantly", not an
     // exact interval.
     r.check(await until(() => ctl.status.data.log.some(l => l.includes('run_paused')), 6000), 'log eventually records the run_paused message (real replay, not instant)', JSON.stringify(ctl.status.data.log));
     r.check(await until(() => ctl.status.data.log.some(l => l.includes('run_finished')), 5000), 'log eventually records the run_finished message', JSON.stringify(ctl.status.data.log));
     r.check(await until(() => text('status-text', el).includes('running') && !text('status-text', el).includes('paused'), 1000), 'status badge settles back on running after the full replay + snapshot re-fetch', text('status-text', el));
     r.check(q('event-log', el).children.length > before, 'event log grew with replayed messages (rendered DOM rows)', q('event-log', el).children.length);
     el.parentNode.remove();
  });
});

tr.addBlock('run: steps row click emits records.open with {run_id, step_id}', (r) => {
  r.run(async () => {
     const row = q('steps-row-ingest');
     r.check(!!row, 'ingest step row present');
     const before = window.__emitted.length;
     row.click(); await settled();
     const evs = window.__emitted.slice(before);
     const opened = evs.find(e => e[0] === 'records.open');
     r.check(!!opened && opened[1].run_id === window.__ctl.status.data.runId && opened[1].step_id === 'ingest',
       'records.open emitted with {run_id, step_id}', JSON.stringify(opened));
  });
});

tr.addBlock('run: head actions -- View records / View on graph emit records.open/graph.open', (r) => {
  r.run(async () => {
     q('btn-view-records').click(); await settled();
     let last = window.__emitted.at(-1);
     r.check(last[0] === 'records.open' && last[1].run_id === window.__ctl.status.data.runId, 'btn-view-records -> records.open {run_id}', JSON.stringify(last));
     q('btn-view-graph').click(); await settled();
     last = window.__emitted.at(-1);
     r.check(last[0] === 'graph.open' && last[1].run === window.__ctl.status.data.runId, 'btn-view-graph -> graph.open {run}', JSON.stringify(last));
  });
});

tr.addBlock('run: pause/resume/cancel -- real click POSTs the right url, action.done clears actioning + logs; buttons track a live status change', (r) => {
  r.run(async () => {
     const calls = [];
     const io = { EventSource: NoStream, fetch: (url, init) => {
       if (init && init.method === 'POST') { calls.push({ url, init }); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); }
       return fetch(url);
     } };
     const ctl = window.__mount(io);
     const el = ctl.el;
     r.check(await until(() => state(el) === 'ready'), 'second mount reaches ready', state(el));
     r.check(ctl.status.data.status === 'running', 'starts running (real snapshot fetch)', ctl.status.data.status);
     r.check(!q('btn-pause', el).classList.contains('bx-disabled'), 'pause enabled while running');
     r.check(q('btn-resume', el).classList.contains('bx-disabled'), 'resume disabled while running');

     q('btn-pause', el).click();
     r.check(await until(() => calls.length === 1), 'pause click fired exactly one fetch');
     r.check(calls[0].init.method === 'POST', 'action fetch uses method POST', calls[0].init.method);
     r.check(calls[0].url.includes(ctl.status.data.runId) && calls[0].url.includes('pause'), 'action url carries runId + action name', calls[0].url);
     r.check(await until(() => ctl.status.data.actioning === null), 'action.done clears actioning');
     r.check(ctl.status.data.log.at(-1) === '[action] pause', 'log gets a "[action] pause" line', ctl.status.data.log.at(-1));

     // The real backend would now push a run_paused SSE event; simulate that
     // one message directly (no DOM analog for a stream message) and confirm
     // the view's button-state guard reacts to the DATA change.
     ctl.dispatch('run.event', { type: 'run_paused' });
     r.check(ctl.status.data.status === 'paused', 'status updated from the simulated stream event', ctl.status.data.status);
     r.check(q('btn-pause', el).classList.contains('bx-disabled'), 'pause now disabled while paused');
     r.check(!q('btn-resume', el).classList.contains('bx-disabled'), 'resume now enabled while paused');
     r.check(!q('btn-cancel', el).classList.contains('bx-disabled'), 'cancel still enabled while paused');

     q('btn-resume', el).click();
     r.check(await until(() => calls.length === 2), 'resume click fired a second fetch');
     r.check(calls[1].url.includes('resume'), 'second action url is resume', calls[1].url);
     r.check(await until(() => ctl.status.data.log.at(-1) === '[action] resume'), 'log gets a "[action] resume" line');

     q('btn-cancel', el).click();
     r.check(await until(() => calls.length === 3), 'cancel click fired a third fetch');
     r.check(calls[2].url.includes('cancel'), 'third action url is cancel', calls[2].url);

     el.parentNode.remove();
  });
});

tr.addBlock('run: nav + theme emit', (r) => {
  r.run(async () => {
     q('nav-dashboard').click(); await settled();
     const last = window.__emitted.at(-1);
     r.check(!!last && last[0] === 'nav.go' && last[1] && last[1].to === 'dashboard', "nav-dashboard.click -> emit nav.go {to:'dashboard'}", JSON.stringify(last));
     q('btn-theme').click(); await settled();
     r.check(window.__emitted.at(-1)[0] === 'theme.toggle', 'btn-theme.click -> emit theme.toggle', JSON.stringify(window.__emitted.at(-1)));
  });
});

tr.addBlock('run: error path -- failed snapshot fetch -> error, retry re-issues it', (r) => {
  r.run(async () => {
     const ctl = window.__mount({ fetch: () => Promise.resolve({ ok: false, status: 503 }) });
     const el = ctl.el;
     r.check(await until(() => state(el) === 'error'), 'failed fetch -> error', state(el));
     r.check(text('status-text', el).startsWith('failed:'), 'status-text starts with "failed:"', text('status-text', el));
     const retry = q('btn-retry', el);
     r.check(!!retry && q('steps', el).contains(retry), 'btn-retry inside the steps region');
     r.check(!!retry && retry.classList.contains('bx-error'), 'btn-retry marked bx-error');
     NAV.forEach(n => r.check(q(n, el).classList.contains('bx-disabled'), `${n} disabled in error (guard)`));
     el.parentNode.remove();

     let n = 0;
     const io = { fetch: (u) => n++ < 1 ? Promise.resolve({ ok: false, status: 503 }) : fetch(u) };
     const ctl2 = window.__mount(io), el2 = ctl2.el;
     r.check(await until(() => state(el2) === 'error'), 'second mount: failure -> error', state(el2));
     q('btn-retry', el2).click();
     r.check(state(el2) === 'loading', 'btn-retry.click -> loading', state(el2));
     r.check(await until(() => state(el2) === 'ready'), 'retry -> loading -> ready with the real fetch', state(el2));
     el2.parentNode.remove();
     r.check(!document.querySelector('.run-mount'), 'containers removed');
  });
});

tr.addBlock('run: fit (C10) -- root does not scroll, steps/detail sized, content fits', (r) => {
  r.run(() => {
     const el = root();
     r.check(el.scrollWidth <= el.clientWidth, 'root: no horizontal overflow', `${el.scrollWidth} > ${el.clientWidth}`);
     r.check(el.scrollHeight <= el.clientHeight, 'root: no vertical overflow', `${el.scrollHeight} > ${el.clientHeight}`);
     const rr = el.getBoundingClientRect();
     r.check(Math.abs(rr.width - window.innerWidth) <= 1, 'root fills viewport width', `${rr.width} vs ${window.innerWidth}`);
     const c = q('content');
     r.check(c.scrollWidth <= c.clientWidth, 'content: scrollWidth <= clientWidth', `${c.scrollWidth} > ${c.clientWidth}`);
     const cr = c.getBoundingClientRect();
     const sb = q('steps').getBoundingClientRect();
     r.check(sb.left >= cr.left - 1 && sb.right <= cr.right + 1, 'steps table inside content width', `${sb.left},${sb.right} vs ${cr.left},${cr.right}`);
     const d = q('detail');
     r.check(d.scrollWidth <= d.clientWidth, 'detail: scrollWidth <= clientWidth (event log lines still clip, not overflow)', `${d.scrollWidth} > ${d.clientWidth}`);
     const ha = q('head-actions');
     r.check(ha.scrollWidth <= ha.clientWidth, 'head-actions (6 buttons + user) fits, no horizontal overflow', `${ha.scrollWidth} > ${ha.clientWidth}`);
     const wh = q('ws-head');
     r.check(wh.scrollWidth <= wh.clientWidth, 'ws-head fits, no horizontal overflow', `${wh.scrollWidth} > ${wh.clientWidth}`);
  });
});

tr.addBlock('run: skins -- style toggle, luna brand', (r) => {
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

tr.addBlock('run: C2 -- unknown trigger throws', (r) => {
  r.run(() => {
     let threw = null;
     try { window.__ctl.dispatch('nope.click'); } catch (e) { threw = e.message; }
     r.check(/unknown trigger/.test(threw), 'dispatch of a trigger no state knows throws', threw);
  });
});

await tr.runBlocks();
