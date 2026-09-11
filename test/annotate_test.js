// test/annotate_test.js -- annotate.html (S6, docs/superpowers/plans/2026-09-11-workspace-dashboard.md).
// STORY-17.1 scope only (read-only Session -> Rede -> paragraph/sentence
// drill-down + coverage badge) -- see ui/annotate.js's header for the full
// list of deferred stories (record editing, slot form, D4 anchor mode,
// delete, fresh-suggestion, gold export -- all stay on the old ui-kit page).
// The node suite proves handlers/view pure; this proves the browser half: 1
// fetch (runs, tolerated on failure) -> ready immediately, session chips
// (child runs labeled against their parent), picking a session fetches +
// renders rede chips, picking a rede fetches segment+annotate IN PARALLEL --
// the paragraph tree + sentence text render as soon as segment lands, badges
// upgrade separately once annotate lands (never blocking the text on
// coverage data), all 4 badge kinds render correctly, a tree row click emits
// paragraph.jump with the right index (scrollIntoView is a page-level
// concern, not asserted here), single-select toggle-clear on both pickers,
// refresh, nav/theme, fit (C10), luna skin, C2.
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
// Sentence rows have no data-name (built inline, like query.js's chip rows) --
// a row is any direct child of 'sentences' with 2 nested divs (badge + text);
// a paragraph header has 0 (its content is a plain textContent string).
const sentenceRows = (scope) => [...q('sentences', scope).children].filter(el => el.children.length === 2);

const runsFixture = async () => (await fetch('/content/annotate/runs.json')).json();
const runFixture = async (id) => (await fetch(`/content/annotate/run-${id}.json`)).json();

tr.addBlock('annotate: load -- 1 fetch (runs) -> ready immediately, session chips (child labeled via parent), pickers/tree/sentences show prompts', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(async () => {
     r.check(!!root(), 'screen mounted at body > .bx');
     r.check(state() === 'ready', 'machine starts (and stays) ready -- no loading state exists', state());
     r.check(text('crumb-page') === 'Annotate', 'crumb-page "Annotate"', text('crumb-page'));
     const runs = await runsFixture();
     r.check(await until(() => qa('[data-name^="session-picker-"]').length === runs.length), 'a session-picker chip per fixture run', qa('[data-name^="session-picker-"]').length);
     r.check(text('status-text') === `${runs.length} sessions`, 'status-text reports the session count', text('status-text'));
     const child = runs.find(x => x.parent_run_id);
     r.check(!!child, 'fixture sanity: at least one child run');
     r.check(text(`session-picker-${child.run_id}`) === `${child.parent_run_id} → ${child.pipeline} (Kind-Lauf)`,
       'child session labeled against its parent, not its own unrecognizable id', text(`session-picker-${child.run_id}`));
     const plain = runs.find(x => !x.parent_run_id);
     r.check(text(`session-picker-${plain.run_id}`) === plain.run_id, 'plain session chip shows its own run_id');
     r.check(text('rede-picker') === 'Pick a session first.', 'rede-picker shows a prompt before any session is picked', text('rede-picker'));
     r.check(text('tree') === 'Pick a Rede to see its paragraphs.', 'tree shows a prompt', text('tree'));
     r.check(text('sentences') === 'Pick a Rede to see its text.', 'sentences shows a prompt', text('sentences'));
     r.check(!!text('legend'), 'a plain-text legend covers the dropped hover-tooltip (v1 simplification)');
   });
});

tr.addBlock('annotate: picking a session fetches + renders rede chips; picking it again clears them', (r) => {
  r.run(async () => {
     const runs = await runsFixture();
     const plain = runs.find(x => !x.parent_run_id && x.run_id === 'run-2026-09-08');
     q(`session-picker-${plain.run_id}`).click();
     r.check(await until(() => q(`session-picker-${plain.run_id}`).classList.contains('bx-selected')), 'session chip marked selected');
     const run = await runFixture(plain.run_id);
     r.check(await until(() => qa('[data-name^="rede-picker-"]').length === run.run.record_ids.length), 'a rede-picker chip per record_id', qa('[data-name^="rede-picker-"]').length);
     for (const id of run.run.record_ids) r.check(!!q(`rede-picker-${id}`), `rede-picker chip for ${id} present`);
     r.check(text('status-text').includes(plain.run_id), 'status-text shows the picked session', text('status-text'));

     q(`session-picker-${plain.run_id}`).click();
     await settled();
     r.check(!q(`session-picker-${plain.run_id}`).classList.contains('bx-selected'), 'clicking the same session again clears the selection');
     r.check(qa('[data-name^="rede-picker-"]').length === 0, 'rede chips cleared along with the session', qa('[data-name^="rede-picker-"]').length);
     r.check(text('rede-picker') === 'Pick a session first.', 'rede-picker prompt restored');
  });
});

tr.addBlock('annotate: picking a rede -- tree + sentence text render immediately, badges upgrade once coverage data lands (all 4 kinds)', (r) => {
  r.run(async () => {
     q('session-picker-run-2026-09-08').click();
     await until(() => !!q('rede-picker-rede-1'));
     q('rede-picker-rede-1').click();
     r.check(await until(() => qa('[data-name^="tree-P"]').length === 3), 'tree: 3 paragraph rows', qa('[data-name^="tree-P"]').length);
     r.check(await until(() => sentenceRows().length === 6), 'sentences: 6 sentence rows rendered from segment alone', sentenceRows().length);
     r.check(text('tree-P0').startsWith('P0 '), 'tree row P0 labeled', text('tree-P0'));
     const firstRowText = sentenceRows()[0].children[1].textContent;
     r.check(firstRowText.includes('Tagesordnungspunkt'), 'real sentence text visible right away, not blocked on coverage data', firstRowText);

     r.check(await until(() => {
       const badges = sentenceRows().map(row => row.children[0].textContent.trim());
       return badges.join('') === '✓s⚠···';
     }, 3000), 'once annotate data lands: all 4 badge kinds render in order (record/skip/L3/offen x3)',
       sentenceRows().map(row => row.children[0].textContent.trim()).join(''));
     r.check(text('tree-P0') === 'P0 2/2', 'tree P0 coverage count: record + skip both count', text('tree-P0'));
     r.check(text('tree-P1') === 'P1 0/3', 'tree P1 coverage count: an L3-only marker does not count as covered', text('tree-P1'));

     q('rede-picker-rede-1').click();
     await settled();
     r.check(!q('rede-picker-rede-1').classList.contains('bx-selected'), 'clicking the same rede again clears the selection');
     r.check(text('tree') === 'Pick a Rede to see its paragraphs.', 'tree prompt restored after clearing the rede');
  });
});

tr.addBlock('annotate: tree row click emits paragraph.jump with the right index', (r) => {
  r.run(async () => {
     q('rede-picker-rede-1').click();
     await until(() => qa('[data-name^="tree-P"]').length === 3);
     window.__emitted.length = 0;
     q('tree-P1').click();
     await settled();
     const last = window.__emitted.at(-1);
     r.check(!!last && last[0] === 'paragraph.jump' && last[1].index === 1, 'tree-P1 click -> emit paragraph.jump {index:1}', JSON.stringify(last));
  });
});

tr.addBlock('annotate: second mount with injected io -- segment/annotate fetch URLs carry the picked run + rede', (r) => {
  r.run(async () => {
     const calls = [];
     const io = { fetch: (u, init) => { calls.push(String(u)); return fetch(u, init); } };
     const ctl = window.__mount(io);
     const el = ctl.el;
     r.check(await until(() => qa('[data-name^="session-picker-"]', el).length > 0, 3000), 'second mount: session chips loaded');
     el.querySelector('[data-name="session-picker-run-2026-09-08"]').click();
     await until(() => !!el.querySelector('[data-name="rede-picker-rede-1"]'));
     el.querySelector('[data-name="rede-picker-rede-1"]').click();
     await settled();
     r.check(calls.some(u => u.includes('segment-run-2026-09-08-rede-1.json')), 'segment fetch URL carries run+rede', JSON.stringify(calls));
     r.check(calls.some(u => u.includes('coverage-run-2026-09-08-rede-1.json')), 'annotate fetch URL carries run+rede', JSON.stringify(calls));
     el.parentNode.remove();
  });
});

tr.addBlock('annotate: refresh re-fetches sessions; nav + theme emit', (r) => {
  r.run(async () => {
     q('btn-refresh').click();
     await settled();
     r.check(state() === 'ready', 'still ready after refresh', state());
     q('nav-dashboard').click(); await settled();
     const last = window.__emitted.at(-1);
     r.check(!!last && last[0] === 'nav.go' && last[1] && last[1].to === 'dashboard', "nav-dashboard.click -> emit nav.go {to:'dashboard'}", JSON.stringify(last));
     q('btn-theme').click(); await settled();
     r.check(window.__emitted.at(-1)[0] === 'theme.toggle', 'btn-theme.click -> emit theme.toggle');
  });
});

tr.addBlock('annotate: fit (C10) -- root does not scroll, content fits', (r) => {
  r.run(() => {
     const el = root();
     r.check(el.scrollWidth <= el.clientWidth, 'root: no horizontal overflow', `${el.scrollWidth} > ${el.clientWidth}`);
     r.check(el.scrollHeight <= el.clientHeight, 'root: no vertical overflow', `${el.scrollHeight} > ${el.clientHeight}`);
     const c = q('content');
     r.check(c.scrollWidth <= c.clientWidth, 'content: scrollWidth <= clientWidth', `${c.scrollWidth} > ${c.clientWidth}`);
     const cr = c.getBoundingClientRect();
     const out = ['session-picker', 'rede-picker', 'tree', 'sentences', 'legend'].filter(n => {
       const b = q(n).getBoundingClientRect();
       return b.left < cr.left - 1 || b.right > cr.right + 1;
     });
     r.check(out.length === 0, 'content children inside content width', `outside: ${out.join(', ')}`);
  });
});

tr.addBlock('annotate: skins -- style toggle, luna brand', (r) => {
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

tr.addBlock('annotate: C2 -- unknown trigger throws', (r) => {
  r.run(() => {
     let threw = null;
     try { window.__ctl.dispatch('nope.click'); } catch (e) { threw = e.message; }
     r.check(/unknown trigger/.test(threw), 'dispatch of a trigger no state knows throws', threw);
  });
});

await tr.runBlocks();
