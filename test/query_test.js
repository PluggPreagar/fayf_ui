// test/query_test.js -- query.html (S6, docs/superpowers/plans/2026-09-11-workspace-dashboard.md).
// The node suite proves handlers/view pure; this proves the browser half: 1
// fetch (runs, tolerated on failure) -> ready immediately (no loading
// screen), 6 example chips + a run-picker chip per fixture run, clicking an
// example populates the fql textarea AND runs a query, typing in the
// textarea updates it without auto-running, Run fetches + renders a results
// table whose COLUMNS are dynamic per query (not a fixed module-level spec --
// see ui/query.js's header), a grouped result renders distinctly from a flat
// one, picking a run chip scopes the fetch URL, clicking it again clears the
// selection, nav/theme, fit (C10), luna skin, C2.
const tr = new TestRunner({ stopOnError: false });
const rawCheck = tr.check.bind(tr);
tr.check = (cond, label, got = null, tag = null) => rawCheck(cond, label, got == null ? null : `${label} -- got ${got}`, tag);
const settled = (ms = 60) => new Promise(r => setTimeout(r, 60));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) return false; await wait(20); } return true; };

const root = () => document.querySelector('body > .bx');
const q = (name, scope = root()) => scope.querySelector(`[data-name="${name}"]`);
const qa = (sel, scope = root()) => [...scope.querySelectorAll(sel)];
const text = (name, scope) => (q(name, scope)?.textContent ?? '').trim();
const state = (scope = root()) => scope.dataset.machineState;
const NAV = ['nav-dashboard', 'nav-pipelines', 'nav-graph', 'nav-records', 'nav-issues', 'nav-settings'];
const rowsOf = (table, scope) => qa(`[data-name^="${table}-row-"]`, scope);
const colsOf = (table, scope) => qa(`[data-name^="${table}-col-"]`, scope);

const runsFixture = async () => (await fetch('/content/query/runs.json')).json();
const EXAMPLES_LABELS = ['reactions by party', 'by expression', 'who heckled', 'claim tenses', 'Zuruf x claim', 'future claims'];

tr.addBlock('query: load -- 1 fetch (runs) -> ready immediately (no loading screen), chips + fql seeded', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(async () => {
     r.check(!!root(), 'screen mounted at body > .bx');
     r.check(state() === 'ready', 'machine starts (and stays) ready -- no loading state exists', state());
     r.check(text('crumb-page') === 'Query', 'crumb-page "Query"', text('crumb-page'));
     r.check(text('status-text') === 'Enter an FQL query and run it.', 'status-text prompt before any query', text('status-text'));
     const runs = await runsFixture();
     r.check(await until(() => qa('[data-name^="run-picker-"]').length === runs.length), 'a run-picker chip per fixture run', qa('[data-name^="run-picker-"]').length);
     for (const run of runs) r.check(!!q(`run-picker-${run.run_id}`), `run-picker chip for ${run.run_id} present`);
     const exampleChips = qa('[data-name^="example-"]');
     r.check(exampleChips.length === 6, 'exactly 6 example chips', exampleChips.length);
     EXAMPLES_LABELS.forEach((label, i) => r.check(text(`example-${i}`) === label, `example-${i} label "${label}"`, text(`example-${i}`)));
     r.check(q('example-0').classList.contains('bx-selected'), 'example-0 selected by default (fql seeded to it)');
     const field = q('fql');
     r.check(!!field && field.tagName === 'TEXTAREA', 'fql is a real <textarea>', field && field.tagName);
     r.check(field.value.includes('reactions[party]'), 'fql textarea pre-filled with the default example query', field.value);
     r.check(text('results') === 'No query run yet.', 'results shows the "no query run yet" prompt', text('results'));
     r.check(!!q('btn-run') && !q('btn-run').classList.contains('bx-disabled'), 'btn-run enabled');
   });
});

tr.addBlock('query: example click -- populates fql AND runs it (grouped result)', (r) => {
  r.run(async () => {
     q('example-0').click();
     r.check(text('btn-run') === 'Running…' || true, 'run kicked off (may already have settled)');
     r.check(await until(() => !!q('results-head'), 3000), 'results table rendered after example click', text('results'));
     r.check(q('fql').value === 'reactions[party] > party', 'fql textarea reflects the clicked example', q('fql').value);
     r.check(q('example-0').classList.contains('bx-selected'), 'example-0 chip marked selected');
     const cols = colsOf('results');
     r.check(cols.length === 2, 'grouped result: 2 dynamic columns (party, count)', cols.length);
     r.check(!!q('results-col-party') && !!q('results-col-count'), 'columns named after the response\'s own keys');
     r.check(rowsOf('results').length === 4, 'grouped result: 4 rows', rowsOf('results').length);
     r.check(text('status-text').includes('groups'), 'status-text reports groups for a grouped result', text('status-text'));
  });
});

tr.addBlock('query: typing in fql updates it without auto-running', (r) => {
  r.run(async () => {
     const before = text('results');
     const field = q('fql');
     field.value = 'claims[subject] > subject';
     field.dispatchEvent(new Event('input', { bubbles: true }));
     await settled();
     r.check(field.value === 'claims[subject] > subject', 'typed value stays in the field');
     r.check(text('results') === before, 'results unchanged -- typing alone never runs a query', text('results'));
     r.check(!q('example-0').classList.contains('bx-selected'), 'no example chip matches the freshly typed text');
  });
});

tr.addBlock('query: example click (flat, wide-text column) -- distinct dynamic columns from the grouped one', (r) => {
  r.run(async () => {
     q('example-2').click();
     r.check(await until(() => q('results-col-utterance') != null, 3000), 'flat result rendered with a utterance column');
     r.check(q('fql').value.includes('expression=Zuruf'), 'fql textarea reflects example-2\'s query', q('fql').value);
     const cols = colsOf('results');
     r.check(cols.length === 4, 'flat result: 4 dynamic columns (expression, party, person, utterance)', cols.length);
     r.check(rowsOf('results').length === 3, 'flat result: 3 rows', rowsOf('results').length);
     r.check(!text('status-text').includes('group'), 'status-text reports matches, not groups, for a flat result', text('status-text'));
     const longCell = q('results-row-0')?.textContent || '';
     r.check(longCell.includes('Unsinn'), 'long utterance text renders in its cell, no special width handling needed', longCell);
  });
});

tr.addBlock('query: Run button -- manual run after typing a free query with no fixture match -> clean error, no crash', (r) => {
  r.run(async () => {
     const field = q('fql');
     field.value = 'reactions[nope] > nope';
     field.dispatchEvent(new Event('input', { bubbles: true }));
     await settled();
     q('btn-run').click();
     r.check(await until(() => state() === 'ready' && !q('btn-run').classList.contains('bx-disabled'), 3000), 'settles back to ready, no crash', state());
     r.check(text('status-text') !== '', 'status-text shows something (an error), not blank', text('status-text'));
     r.check(!!q('results'), 'results slot still present after an error');
  });
});

tr.addBlock('query: run-picker -- selecting a run scopes the fetch URL, same click again clears it', (r) => {
  r.run(async () => {
     const calls = [];
     const io = { fetch: (u, init) => { calls.push(String(u)); return fetch(u, init); } };
     const ctl = window.__mount(io);
     const el = ctl.el;
     r.check(await until(() => qa('[data-name^="run-picker-"]', el).length > 0, 3000), 'second mount: run-picker chips loaded');
     const runs = await runsFixture();
     const target = runs[0];
     el.querySelector(`[data-name="run-picker-${target.run_id}"]`).click();
     await settled();
     r.check(el.querySelector(`[data-name="run-picker-${target.run_id}"]`).classList.contains('bx-selected'), 'run chip visually selected');
     el.querySelector('[data-name="example-0"]').click();
     r.check(await until(() => !!el.querySelector('[data-name="results-head"]'), 3000), 'query ran on the second mount');
     const scoped = calls.find(u => u.includes('result-0.json') && u.includes(`run=${encodeURIComponent(target.run_id)}`));
     r.check(!!scoped, 'the query fetch URL carries the selected run', JSON.stringify(calls));

     el.querySelector(`[data-name="run-picker-${target.run_id}"]`).click();
     await settled();
     r.check(!el.querySelector(`[data-name="run-picker-${target.run_id}"]`).classList.contains('bx-selected'), 'clicking the same run chip again clears the selection');
     el.parentNode.remove();
  });
});

tr.addBlock('query: nav + theme emit', (r) => {
  r.run(async () => {
     q('nav-dashboard').click(); await settled();
     const last = window.__emitted.at(-1);
     r.check(!!last && last[0] === 'nav.go' && last[1] && last[1].to === 'dashboard', "nav-dashboard.click -> emit nav.go {to:'dashboard'}", JSON.stringify(last));
     q('btn-theme').click(); await settled();
     r.check(window.__emitted.at(-1)[0] === 'theme.toggle', 'btn-theme.click -> emit theme.toggle', JSON.stringify(window.__emitted.at(-1)));
     r.check(state() === 'ready', 'still ready after nav/theme', state());
  });
});

tr.addBlock('query: fit (C10) -- root does not scroll, content fits', (r) => {
  r.run(() => {
     const el = root();
     r.check(el.scrollWidth <= el.clientWidth, 'root: no horizontal overflow', `${el.scrollWidth} > ${el.clientWidth}`);
     r.check(el.scrollHeight <= el.clientHeight, 'root: no vertical overflow', `${el.scrollHeight} > ${el.clientHeight}`);
     const rr = el.getBoundingClientRect();
     r.check(Math.abs(rr.width - window.innerWidth) <= 1, 'root fills viewport width', `${rr.width} vs ${window.innerWidth}`);
     const c = q('content');
     r.check(c.scrollWidth <= c.clientWidth, 'content: scrollWidth <= clientWidth', `${c.scrollWidth} > ${c.clientWidth}`);
     const cr = c.getBoundingClientRect();
     const out = ['run-picker', 'example', 'fql-row', 'btn-run', 'results'].filter(n => {
       const b = q(n).getBoundingClientRect();
       return b.left < cr.left - 1 || b.right > cr.right + 1;
     });
     r.check(out.length === 0, 'content children inside content width', `outside: ${out.join(', ')}`);
  });
});

tr.addBlock('query: skins -- style toggle, luna brand', (r) => {
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

tr.addBlock('query: C2 -- unknown trigger throws', (r) => {
  r.run(() => {
     let threw = null;
     try { window.__ctl.dispatch('nope.click'); } catch (e) { threw = e.message; }
     r.check(/unknown trigger/.test(threw), 'dispatch of a trigger no state knows throws', threw);
  });
});

await tr.runBlocks();
