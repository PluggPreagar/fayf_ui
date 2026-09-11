// test/table_test.js -- table.html (C11 L9 table controller fixture).
// The node suite proves windowOf/sortRows/handlers pure; this proves the
// browser half: windowed paint (not 2000 rows), scroll -> window moves while
// the container element survives the morph, header click cycles sort,
// row click selects + emits, selection lives in status (survives scroll
// away and back), skins apply, C2 error on an unknown trigger.

const tr = new TestRunner({ stopOnError: false });
const settled = (ms = 60) => new Promise(r => setTimeout(r, ms));
const OVERSCAN = 4;

const q  = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const runs = () => q('[data-name="runs"]');
const rowsPainted = () => qa('[data-name^="runs-row-"]');
const rowId = (el) => Number(el.dataset.name.slice('runs-row-'.length));
const scrollTo = async (top) => {
  runs().scrollTop = top;
  runs().dispatchEvent(new Event('scroll'));
  await settled();
};

tr.addBlock('table: mount -- windowed paint from status, head + spacers', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(async () => {
     const ROW_H = window.ROW_H;
     r.check(Number.isInteger(ROW_H) && ROW_H > 0, 'ROW_H exported', ROW_H);
     r.check(runs() && runs().children.length > 0, 'runs slot has children');
     r.check(!!q('[data-name="runs-head"]'), 'header runs-head present');
     const cols = qa('[data-name^="runs-col-"]');
     r.check(cols.length === 4, '4 header cells runs-col-*', cols.length);
     const n = rowsPainted().length;
     r.check(n >= 11 && n <= 40, 'body rows windowed: 11..40 painted, not 2000', n);
     r.check(rowsPainted()[0]?.dataset.name === 'runs-row-0', 'first painted row is runs-row-0', rowsPainted()[0]?.dataset.name);
     const h = rowsPainted()[0]?.getBoundingClientRect().height;
     r.check(h === ROW_H, `row height = ROW_H (${ROW_H}px)`, h);
     const headH = q('[data-name="runs-head"]').getBoundingClientRect().height;
     const want = 2000 * ROW_H + headH, got = runs().scrollHeight;
     r.check(Math.abs(got - want) <= 2 * ROW_H, 'scrollHeight ~ 2000*ROW_H + head (spacers carry the rest)', `${got} vs ${want}`);
     r.check(q('[data-name="sel-line"]').textContent === 'nothing selected', 'sel-line: nothing selected', q('[data-name="sel-line"]').textContent);
   });
});

tr.addBlock('table: scroll -> window moves, container element kept', (r) => {
  r.run(async () => {
     const ROW_H = window.ROW_H;
     const before = runs();
     await scrollTo(1000 * ROW_H);
     const first = rowsPainted()[0];
     r.check(!!first, 'rows painted after scroll');
     const id = first ? rowId(first) : NaN;
     r.check(Math.abs(id - (1000 - OVERSCAN)) <= 1, `first painted row ~ ${1000 - OVERSCAN} (1000 - overscan)`, id);
     r.check(rowsPainted().length <= 40, 'still windowed (<= 40 rows)', rowsPainted().length);
     r.check(runs() === before, 'morph kept the runs element');
     r.check(runs().scrollTop === 1000 * ROW_H, 'scrollTop unchanged by the repaint', runs().scrollTop);
   });
});

tr.addBlock('table: header click cycles sort none -> asc -> desc -> none', (r) => {
  r.run(async () => {
     await scrollTo(0);
     const col = () => q('[data-name="runs-col-status"]');
     const firstText = () => rowsPainted()[0]?.textContent ?? '';
     col().click(); await settled();
     r.check(col().textContent.includes('▲'), 'asc: header shows ▲', col().textContent);
     r.check(firstText().includes('blocked'), 'asc: first row status blocked', firstText());
     col().click(); await settled();
     r.check(col().textContent.includes('▼'), 'desc: header shows ▼', col().textContent);
     r.check(firstText().includes('running'), 'desc: first row status running', firstText());
     col().click(); await settled();
     r.check(!/[▲▼]/.test(col().textContent), 'none: no sort mark', col().textContent);
     r.check(rowsPainted()[0]?.dataset.name === 'runs-row-0', 'none: first row is runs-row-0 again', rowsPainted()[0]?.dataset.name);
   });
});

tr.addBlock('table: row click selects, emits, selection lives in status', (r) => {
  r.run(async () => {
     const ROW_H = window.ROW_H;
     await scrollTo(0);
     const a = rowsPainted()[2], idA = rowId(a);
     a.click(); await settled();
     r.check(q('[data-name="sel-line"]').textContent === `selected #${idA}`, 'sel-line shows the selected id', q('[data-name="sel-line"]').textContent);
     r.check(q(`[data-name="runs-row-${idA}"]`).classList.contains('bx-selected'), 'clicked row has bx-selected');
     const last = window.__emitted.at(-1);
     r.check(last && last[0] === 'runs.select' && last[1] && last[1].id === idA, 'onEmit got runs.select with the row', JSON.stringify(last));
     const b = rowsPainted()[5], idB = rowId(b);
     b.click(); await settled();
     r.check(q('[data-name="sel-line"]').textContent === `selected #${idB}`, 'selection moved to the second row', q('[data-name="sel-line"]').textContent);
     const marked = rowsPainted().filter(e => e.classList.contains('bx-selected'));
     r.check(marked.length === 1 && rowId(marked[0]) === idB, 'exactly one bx-selected among painted rows', marked.map(rowId).join(','));
     await scrollTo(1000 * ROW_H);
     r.check(!q(`[data-name="runs-row-${idB}"]`), 'selected row left the window when scrolled away');
     await scrollTo(0);
     const back = q(`[data-name="runs-row-${idB}"]`);
     r.check(!!back && back.classList.contains('bx-selected'), 'scroll back: selected row still marked (state from status, not DOM)');
     r.check(q('[data-name="sel-line"]').textContent === `selected #${idB}`, 'sel-line still shows the selection');
   });
});

tr.addBlock('table: skins -- style toggle, luna brand', (r) => {
  r.run(() => {
     r.check(!!q('.style-toggle'), 'style toggle present');
     const before = document.documentElement.dataset.style;
     document.documentElement.dataset.style = 'luna';
     const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
     r.check(brand === '#00518c', 'luna: --brand is #00518c', brand);
     if (before === undefined) delete document.documentElement.dataset.style;
     else document.documentElement.dataset.style = before;
   });
});

tr.addBlock('table: C2 -- unknown trigger throws', (r) => {
  r.run(() => {
     let threw = null;
     try { window.__ctl.dispatch('nope.click'); } catch (e) { threw = e.message; }
     r.check(/unknown trigger/.test(threw), 'dispatch of a trigger no state knows throws', threw);
   });
});

await tr.runBlocks();
