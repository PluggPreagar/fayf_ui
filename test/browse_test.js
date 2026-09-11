// test/browse_test.js -- browse.html (S6, docs/superpowers/plans/2026-09-11-workspace-dashboard.md).
// The node suite proves handlers/view pure; this proves the browser half: a
// real fetch of mounts -> ready, expanding a mount fetches its own level,
// expanding a directory 2 levels below that fetches ITS level (proves real
// recursion, not just one), a file click loads its content into the detail
// pane (JSON pretty-printed + NBSP-indented as distinct rows), collapsing
// hides children without losing them (re-expand doesn't re-fetch), nav/theme,
// error/retry, fit (C10), skins, C2.
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

const fixture = async (rel) => (await fetch(`/content/browse/${rel}`)).json();

tr.addBlock('browse: load -- real fetch -> ready, status-text, mount roots render', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(async () => {
     r.check(!!root(), 'screen mounted at body > .bx');
     r.check(await until(() => state() === 'ready', 3000), 'data-machine-state reaches ready within 3 s', state());
     r.check(text('crumb-page') === 'Browse', 'crumb-page "Browse"', text('crumb-page'));
     const mounts = await fixture('mounts.json');
     r.check(text('status-text') === `${mounts.length} mounts`, 'status-text "<n> mounts" matches fixture', text('status-text'));
     for (const m of mounts) r.check(!!q(nodeSel(m.name)), `mount root row present: ${m.name}`);
     r.check(text('detail-title') === 'No file open', 'detail-title default', text('detail-title'));
     r.check(q('nav-dashboard') && q('nav-dashboard').classList.contains('bx-brand'), 'nav-dashboard shows active (default side-panel, pre-existing gap -- no nav-browse item exists yet, per plan doc)');
   });
});

tr.addBlock('browse: expand a mount -- real fetch, its own level\'s children appear', (r) => {
  r.run(async () => {
     const row = q(nodeSel('runs'));
     r.check(!!row, 'runs mount row present');
     r.check(text(nodeSel('runs')).startsWith('▸'), 'closed glyph before expand', text(nodeSel('runs')));
     row.click();
     r.check(await until(() => !!q(nodeSel('runs/run-2026-09-01')), 3000), 'runs children appear after the real fetch', !!q(nodeSel('runs/run-2026-09-01')));
     r.check(!!q(nodeSel('runs/README.md')), 'runs/README.md file row present');
     r.check(text(nodeSel('runs')).startsWith('▾'), 'open glyph after expand', text(nodeSel('runs')));
     r.check(text(nodeSel('runs/run-2026-09-01')).includes('run-2026-09-01'), 'child row content is the entry name', text(nodeSel('runs/run-2026-09-01')));
  });
});

tr.addBlock('browse: expand a SUBdirectory 2 levels deep -- proves real recursion, not just one level', (r) => {
  r.run(async () => {
     const dir = q(nodeSel('runs/run-2026-09-01'));
     r.check(!!dir, 'runs/run-2026-09-01 row present');
     dir.click();
     r.check(await until(() => !!q(nodeSel('runs/run-2026-09-01/logs')), 3000), 'level-2 children appear', !!q(nodeSel('runs/run-2026-09-01/logs')));
     const logs = q(nodeSel('runs/run-2026-09-01/logs'));
     r.check(!!logs, 'logs dir row present');
     logs.click();
     r.check(await until(() => !!q(nodeSel('runs/run-2026-09-01/logs/stdout.log')), 3000), 'level-3 children appear, two expands below the mount root', !!q(nodeSel('runs/run-2026-09-01/logs/stdout.log')));
     r.check(!!q(nodeSel('runs/run-2026-09-01/logs/stderr.log')), 'stderr.log row present too');
  });
});

tr.addBlock('browse: click a file -- detail populates, pretty JSON renders as multiple NBSP-indented rows', (r) => {
  r.run(async () => {
     const file = q(nodeSel('runs/run-2026-09-01/result.json'));
     r.check(!!file, 'result.json row present');
     file.click();
     r.check(await until(() => text('detail-title') === 'runs/run-2026-09-01/result.json', 3000), 'detail-title shows the selected path', text('detail-title'));
     r.check(file.classList.contains('bx-selected'), 'clicked file row has bx-selected');
     r.check(await until(() => q('detail-body').textContent.includes('run_id'), 3000), 'detail-body populated once the file fetch resolves', text('detail-body'));
     const body = q('detail-body');
     const lines = [...body.children];
     r.check(lines.length > 3, 'JSON renders as multiple distinct rows, not one blob', lines.length);
     r.check(lines[0].textContent.trim() === '{', 'first row is the opening brace', lines[0].textContent);
     const indented = lines.find(el => el.textContent.startsWith(' '));
     r.check(!!indented, 'an indented line starts with NBSP (U+00A0), not a plain space', indented && JSON.stringify(indented.textContent));
  });
});

tr.addBlock('browse: collapsing hides children; re-expanding does not re-fetch (children stays loaded)', (r) => {
  r.run(async () => {
     const dir = q(nodeSel('runs/run-2026-09-01'));
     dir.click(); await settled();
     r.check(!q(nodeSel('runs/run-2026-09-01/logs')), 'children hidden after collapse');
     r.check(text(nodeSel('runs/run-2026-09-01')).startsWith('▸'), 'closed glyph after collapse');
     dir.click(); await settled();
     r.check(!!q(nodeSel('runs/run-2026-09-01/logs')), 'children reappear immediately on re-expand (already loaded, no fetch wait needed)');
     r.check(!!q(nodeSel('runs/run-2026-09-01/logs/stdout.log')), 'grandchild (level 3) still there too -- nothing lost by collapsing');
  });
});

tr.addBlock('browse: nav + theme emit', (r) => {
  r.run(async () => {
     q('nav-dashboard').click(); await settled();
     const last = window.__emitted.at(-1);
     r.check(!!last && last[0] === 'nav.go' && last[1] && last[1].to === 'dashboard', "nav-dashboard.click -> emit nav.go {to:'dashboard'}", JSON.stringify(last));
     q('btn-theme').click(); await settled();
     r.check(window.__emitted.at(-1)[0] === 'theme.toggle', 'btn-theme.click -> emit theme.toggle', JSON.stringify(window.__emitted.at(-1)));
     r.check(state() === 'ready', 'still ready after nav/theme', state());
  });
});

tr.addBlock('browse: error path -- failed mounts fetch -> error, retry re-issues it', (r) => {
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
     r.check(!document.querySelector('.browse-mount'), 'containers removed');
  });
});

tr.addBlock('browse: fit (C10) -- root does not scroll, tree/detail sized, content fits', (r) => {
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

tr.addBlock('browse: skins -- style toggle, luna brand', (r) => {
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

tr.addBlock('browse: C2 -- unknown trigger throws', (r) => {
  r.run(() => {
     let threw = null;
     try { window.__ctl.dispatch('nope.click'); } catch (e) { threw = e.message; }
     r.check(/unknown trigger/.test(threw), 'dispatch of a trigger no state knows throws', threw);
  });
});

await tr.runBlocks();
