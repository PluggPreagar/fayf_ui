import test from 'node:test';
import assert from 'node:assert/strict';
import { step, init, validateMachine } from '../../ui/machine.js';
import { ROW_H, windowOf, sortRows, tableInit, tableHandlers, tableView, filterRows, toCSV } from '../../ui/table.js';

// C11: table = pure sub-controller on status.data[spec.name]. JSON in, JSON
// out -- no DOM. The browser half (test/table_test.js) proves the paint.
const SPEC = { name: 'runs', columns: [{ key: 'id', label: 'ID', w: 60 }, { key: 'status', label: 'Status', w: 80 }, { key: 'name', label: 'Name' }] };
const ROWS = [
  { id: 1, status: 'done', name: 'alpha' },
  { id: 2, status: 'running', name: 'Beta' },
  { id: 3, status: null, name: 'gamma' },
  { id: 4, status: 'done', name: 'delta' },
];
const many = (n) => Array.from({ length: n }, (_, i) => ({ id: i, status: i % 3 ? 'done' : 'running', name: `run ${i}` }));
const H = tableHandlers(SPEC);
const S0 = { state: 'ready', data: { runs: tableInit(SPEC, ROWS) } };
const click = (...path) => ({ name: 'runs', event: 'click', target: path[0], path: [...path, 'runs', 'root'] });
const freeze = (v) => JSON.stringify(v);

test('windowOf: scroll 0 -> start 0, viewport + overscan below', () => {
  assert.deepEqual(windowOf({ scrollTop: 0, clientHeight: 300 }, 2000), { start: 0, count: Math.ceil(300 / ROW_H) + 8 });
});

test('windowOf: middle -> overscan above and below', () => {
  const r = windowOf({ scrollTop: 100 * ROW_H, clientHeight: 280 }, 2000);
  assert.deepEqual(r, { start: 96, count: 10 + 8 });
});

test('windowOf: end clamps count to the rows left', () => {
  const r = windowOf({ scrollTop: 1990 * ROW_H, clientHeight: 280 }, 2000);
  assert.deepEqual(r, { start: 1986, count: 14 });
  assert.deepEqual(windowOf({ scrollTop: 0, clientHeight: 300 }, 3), { start: 0, count: 3 });
  assert.deepEqual(windowOf({ scrollTop: 0, clientHeight: 300 }, 0), { start: 0, count: 0 });
});

test('windowOf: clientHeight 0 (unmeasured) -> 1 + 2*overscan rows', () => {
  assert.deepEqual(windowOf({ scrollTop: 0, clientHeight: 0 }, 2000), { start: 0, count: 9 });
  assert.deepEqual(windowOf({}, 5), { start: 0, count: 5 });
  assert.deepEqual(windowOf({ scrollTop: 0, clientHeight: 0 }, 100, 10, 2), { start: 0, count: 5 });
});

test('sortRows: asc / desc / none; input untouched', () => {
  const before = freeze(ROWS);
  assert.deepEqual(sortRows(ROWS, { key: 'id', dir: 'asc' }).map(r => r.id), [1, 2, 3, 4]);
  assert.deepEqual(sortRows(ROWS, { key: 'id', dir: 'desc' }).map(r => r.id), [4, 3, 2, 1]);
  const none = sortRows(ROWS, null);
  assert.deepEqual(none, ROWS);
  assert.notEqual(none, ROWS, 'new array even for no sort');
  assert.equal(freeze(ROWS), before);
  assert.throws(() => sortRows(ROWS, { key: 'id', dir: 'up' }), /not asc\|desc/);
});

test('sortRows: stable on ties, numeric vs string, null last both ways', () => {
  assert.deepEqual(sortRows(ROWS, { key: 'status', dir: 'asc' }).map(r => r.id), [1, 4, 2, 3], 'done,done (1 before 4), running, null last');
  assert.deepEqual(sortRows(ROWS, { key: 'status', dir: 'desc' }).map(r => r.id), [2, 1, 4, 3], 'null stays last in desc');
  const nums = [{ id: 'a', v: 10 }, { id: 'b', v: 9 }, { id: 'c', v: 100 }];
  assert.deepEqual(sortRows(nums, { key: 'v', dir: 'asc' }).map(r => r.id), ['b', 'a', 'c'], 'numbers numeric, not "10" < "9"');
  const strs = [{ id: 'a', v: '10' }, { id: 'b', v: '9' }, { id: 'c', v: '100' }];
  assert.deepEqual(sortRows(strs, { key: 'v', dir: 'asc' }).map(r => r.id), ['a', 'c', 'b'], 'strings localeCompare');
  assert.deepEqual(sortRows(ROWS, { key: 'name', dir: 'asc' }).map(r => r.name), ['alpha', 'Beta', 'delta', 'gamma'], 'locale order, case-insensitive-ish');
});

test('tableInit: shape', () => {
  assert.deepEqual(tableInit(SPEC, ROWS), { rows: ROWS, sort: null, sel: null, window: { scrollTop: 0, clientHeight: 0 } });
  assert.deepEqual(tableInit(SPEC).rows, []);
  assert.throws(() => tableInit({ columns: [] }), /spec.name/);
  assert.throws(() => tableInit({ name: 'x' }), /spec.columns/);
});

test('tableHandlers: keys are <name>.click and <name>.scroll', () => {
  assert.deepEqual(Object.keys(H).sort(), ['runs.click', 'runs.scroll']);
});

test('header click cycles sort none -> asc -> desc -> none; sel unchanged; input untouched', () => {
  const before = freeze(S0);
  let s = { ...S0, data: { runs: { ...S0.data.runs, sel: 2 } } };
  let r = H['runs.click'](s, click('runs-col-status', 'runs-head'));
  assert.deepEqual(r.status.data.runs.sort, { key: 'status', dir: 'asc' });
  assert.equal(r.effects, undefined);
  r = H['runs.click'](r.status, click('runs-col-status', 'runs-head'));
  assert.deepEqual(r.status.data.runs.sort, { key: 'status', dir: 'desc' });
  r = H['runs.click'](r.status, click('runs-col-status', 'runs-head'));
  assert.equal(r.status.data.runs.sort, null);
  r = H['runs.click'](r.status, click('runs-col-name', 'runs-head'));
  r = H['runs.click'](r.status, click('runs-col-id', 'runs-head'));
  assert.deepEqual(r.status.data.runs.sort, { key: 'id', dir: 'asc' }, 'another column starts at asc');
  assert.equal(r.status.data.runs.sel, 2, 'sel untouched by sorting');
  assert.equal(r.status.state, 'ready');
  assert.equal(freeze(S0), before);
});

test('row click sets sel + emits <name>.select with the row object', () => {
  const r = H['runs.click'](S0, click('runs-row-3'));
  assert.equal(r.status.data.runs.sel, 3);
  assert.deepEqual(r.effects, [{ emit: 'runs.select', payload: ROWS[2] }]);
  assert.equal(r.effects[0].payload, ROWS[2], 'the row object itself');
  assert.notEqual(r.status, S0);
  assert.notEqual(r.status.data.runs, S0.data.runs);
  assert.equal(S0.data.runs.sel, null, 'input status untouched');
  assert.equal(r.status.data.runs.rows, ROWS, 'rows shared, not copied');
});

test('row click uses spec.rowKey; key compared as String()', () => {
  const spec = { name: 'iss', rowKey: 'code', columns: [{ key: 'code', label: 'Code' }] };
  const rows = [{ code: 'A-1' }, { code: 'B-2' }];
  const s = { state: 'ready', data: { iss: tableInit(spec, rows) } };
  const r = tableHandlers(spec)['iss.click'](s, { name: 'iss', event: 'click', target: 'iss-row-B-2', path: ['iss-row-B-2', 'iss', 'root'] });
  assert.equal(r.status.data.iss.sel, 'B-2');
  assert.deepEqual(r.effects, [{ emit: 'iss.select', payload: rows[1] }]);
});

test('click elsewhere (container, spacer, unknown row/col) -> unchanged status, no effects', () => {
  for (const p of [click(), click('runs-head'), click('runs-row-99'), click('runs-col-nope', 'runs-head'), { name: 'runs', event: 'click' }]) {
    const r = H['runs.click'](S0, p);
    assert.equal(r.status, S0);
    assert.equal(r.effects, undefined);
  }
});

test('scroll stores window; input untouched', () => {
  const r = H['runs.scroll'](S0, { name: 'runs', event: 'scroll', target: 'runs', path: ['runs', 'root'], scrollTop: 560, clientHeight: 300 });
  assert.deepEqual(r.status.data.runs.window, { scrollTop: 560, clientHeight: 300 });
  assert.deepEqual(S0.data.runs.window, { scrollTop: 0, clientHeight: 0 });
  assert.deepEqual(H['runs.scroll'](S0, {}).status.data.runs.window, { scrollTop: 0, clientHeight: 0 });
});

test('handlers throw when the sub-status is missing (C2)', () => {
  assert.throws(() => H['runs.click']({ state: 'ready', data: {} }, click()), /status.data.runs missing/);
});

test('tableView: 2000 rows, clientHeight 300 -> header + 2 spacers + a bounded slice', () => {
  const t = { ...tableInit(SPEC, many(2000)), window: { scrollTop: 0, clientHeight: 300 } };
  const v = tableView(SPEC, t);
  const c = v.runs.content;
  const { start, count } = windowOf(t.window, 2000);
  assert.equal(v.runs.state, '');
  assert.equal(c.length, 3 + count);
  assert.ok(count <= 1 + Math.ceil(300 / ROW_H) + 8, `count ${count}`);
  assert.equal(c[0].name, 'runs-head');
  assert.equal(c[1].box, `fixed, h:${start * ROW_H}, bare`, 'top spacer');
  assert.equal(c[c.length - 1].box, `fixed, h:${(2000 - start - count) * ROW_H}, bare`, 'bottom spacer');
  const rows = c.slice(2, -1);
  assert.deepEqual(rows.map(r => r.name), many(2000).slice(start, start + count).map(r => `runs-row-${r.id}`));
  assert.equal(rows[0].box, `row, mid, gap:2, clip, pad:1, bare, fixed, h:${ROW_H}`);
  assert.deepEqual(rows[0].children.map(x => x.box), ['fixed, w:60, clip, bare', 'fixed, w:80, clip, bare', 'fill, clip, bare']);
  assert.deepEqual(rows[1].children.map(x => x.content), ['1', 'done', 'run 1'], 'cells are String(row[key])');
});

test('tableView: spacer heights add up to (total - visible) * ROW_H at every scroll position', () => {
  const total = 2000;
  for (const scrollTop of [0, 5 * ROW_H, 700 * ROW_H + 13, (total - 11) * ROW_H, total * ROW_H]) {
    const t = { ...tableInit(SPEC, many(total)), window: { scrollTop, clientHeight: 300 } };
    const c = tableView(SPEC, t).runs.content;
    const h = (b) => Number(/h:(\d+)/.exec(b.box)[1]);
    const visible = c.length - 3;
    assert.equal(h(c[1]) + h(c[c.length - 1]), (total - visible) * ROW_H, `scrollTop ${scrollTop}`);
    assert.equal(h(c[1]), windowOf(t.window, total).start * ROW_H);
  }
});

test('tableView: header cells, sort marks, actionable/selected tokens', () => {
  const t = { ...tableInit(SPEC, ROWS), sort: { key: 'status', dir: 'desc' }, sel: 4 };
  const v = tableView(SPEC, t);
  const head = v.runs.content[0];
  assert.equal(head.box, 'row, mid, gap:2, clamp, pad:1, hairline, tint1');
  assert.deepEqual(head.children.map(h => h.name), ['runs-col-id', 'runs-col-status', 'runs-col-name']);
  assert.deepEqual(head.children.map(h => h.box), [
    'row, mid, between, fixed, w:60, h:20, clip, bare',
    'row, mid, between, fixed, w:80, h:20, clip, bare',
    'row, mid, between, fill, h:20, clip, bare',
  ]);
  assert.deepEqual(head.children.map(h => h.children), [['ID', ''], ['Status', '▼'], ['Name', '']]);
  assert.deepEqual(v.runs.content.slice(2, -1).map(r => r.name), ['runs-row-2', 'runs-row-1', 'runs-row-4', 'runs-row-3'], 'rows painted in sort order');
  for (const k of ['id', 'status', 'name']) assert.deepEqual(v[`runs-col-${k}`], { state: 'actionable' });
  assert.deepEqual(v['runs-row-4'], { state: 'actionable, selected' });
  assert.deepEqual(v['runs-row-1'], { state: 'actionable' });
  assert.equal(tableView(SPEC, { ...t, sort: { key: 'status', dir: 'asc' } }).runs.content[0].children[1].children[1], '▲');
  assert.equal(tableView(SPEC, { ...t, sel: '4' })['runs-row-4'].state, 'actionable, selected', 'sel compared via String()');
  assert.equal(tableView(SPEC, { ...t, sel: null })['runs-row-4'].state, 'actionable');
  assert.equal(tableView(SPEC, { ...t, sort: null }).runs.content[0].children[1].children[1], '');
});

test('tableView: only visible rows get state patches; rows off-window are absent', () => {
  const t = { ...tableInit(SPEC, many(2000)), window: { scrollTop: 1000 * ROW_H, clientHeight: 300 }, sel: 0 };
  const v = tableView(SPEC, t);
  assert.equal(v['runs-row-0'], undefined, 'selected row off-window: no patch (slot does not exist)');
  assert.deepEqual(v['runs-row-1000'], { state: 'actionable' });
  const names = Object.keys(v).filter(k => k.startsWith('runs-row-'));
  assert.equal(names.length, v.runs.content.length - 3);
});

test('composition: tiny machine + tableHandlers via step(); emit surfaces; view merges', () => {
  const M = validateMachine({ initial: 'ready', states: { ready: { 'runs.click': 'ready', 'runs.scroll': 'ready' } } });
  const handlers = { ...H };
  const view = (s) => ({ title: `${s.data.runs.rows.length} runs`, ...tableView(SPEC, s.data.runs) });
  let s = init(M, { runs: tableInit(SPEC, ROWS) }).status;
  let r = step(M, s, 'runs.click', click('runs-row-2'), handlers);
  assert.equal(r.status.state, 'ready');
  assert.equal(r.status.data.runs.sel, 2);
  assert.deepEqual(r.effects, [{ emit: 'runs.select', payload: ROWS[1] }]);
  r = step(M, r.status, 'runs.scroll', { name: 'runs', event: 'scroll', target: 'runs', path: ['runs', 'root'], scrollTop: 0, clientHeight: 120 }, handlers);
  assert.deepEqual(r.status.data.runs.window, { scrollTop: 0, clientHeight: 120 });
  r = step(M, r.status, 'runs.click', click('runs-col-name', 'runs-head'), handlers);
  const v = view(r.status);
  assert.equal(v.title, '4 runs');
  assert.equal(v.runs.content[0].name, 'runs-head');
  assert.deepEqual(v.runs.content.slice(2, -1).map(x => x.name), ['runs-row-1', 'runs-row-2', 'runs-row-4', 'runs-row-3']);
  assert.equal(v['runs-row-2'].state, 'actionable, selected');
  assert.equal(s.data.runs.sel, null, 'initial status untouched through the whole drive');
});

// ---- opt-in: filterable / exportable / paging (ground-truth parity for a
// results table that used to have all three) -- SPEC above stays untouched
// (no filterable/exportable/paging), so every test above proves the opt-in
// additions are invisible to a consumer that doesn't ask for them.

test('filterRows: substring match in ANY column, case-insensitive; empty text -> input unchanged', () => {
  const cols = SPEC.columns;
  assert.deepEqual(filterRows(ROWS, cols, 'BETA').map(r => r.id), [2], 'matches Beta via name, case-insensitive');
  assert.deepEqual(filterRows(ROWS, cols, 'done').map(r => r.id), [1, 4]);
  assert.deepEqual(filterRows(ROWS, cols, '  ').map(r => r.id), [1, 2, 3, 4], 'blank/whitespace-only -> no filter');
  assert.equal(filterRows(ROWS, cols, ''), ROWS, 'no filter -> same array, not a copy');
  assert.deepEqual(filterRows(ROWS, cols, 'zzz'), []);
});

test('toCSV: header + rows, RFC4180-ish quoting for comma/quote/newline/semicolon', () => {
  const cols = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }];
  assert.equal(toCSV(cols, [{ a: 1, b: 'x' }, { a: 2, b: 'y' }]), 'A,B\n1,x\n2,y');
  assert.equal(toCSV(cols, [{ a: 'a,b', b: 'he said "hi"' }]), 'A,B\n"a,b","he said ""hi"""');
  assert.equal(toCSV(cols, [{ a: 'line1\nline2', b: 'x;y' }]), 'A,B\n"line1\nline2","x;y"');
  assert.equal(toCSV(cols, [{ a: null, b: undefined }]), 'A,B\n,');
  assert.equal(toCSV([{ key: 'c' }], [{ c: 1 }]), 'c\n1', 'label falls back to key');
});

const FEP_SPEC = { name: 'results', rowKey: '__i', columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }],
  filterable: true, exportable: true, exportName: 'query-results', paging: 'pages', pageSize: 2 };
const fepRows = (n) => Array.from({ length: n }, (_, i) => ({ __i: i, a: `row${i}`, b: i % 2 ? 'odd' : 'even' }));

test('tableInit: filter/page only present when spec opts in', () => {
  assert.deepEqual(tableInit(SPEC, ROWS), { rows: ROWS, sort: null, sel: null, window: { scrollTop: 0, clientHeight: 0 } });
  const t = tableInit(FEP_SPEC, fepRows(5));
  assert.equal(t.filter, '');
  assert.equal(t.page, 1);
  const filterOnly = tableInit({ ...FEP_SPEC, paging: undefined }, []);
  assert.equal(filterOnly.filter, '');
  assert.equal('page' in filterOnly, false, 'paging not opted in -> no page key');
});

test('tableHandlers: opt-in trigger keys only appear when the spec asks for them', () => {
  assert.deepEqual(Object.keys(tableHandlers(SPEC)).sort(), ['runs.click', 'runs.scroll']);
  assert.deepEqual(Object.keys(tableHandlers(FEP_SPEC)).sort(),
    ['results-filter.input', 'results-pager.click', 'results-tools.click', 'results.click', 'results.scroll']);
});

test('<name>-filter.input: sets filter text, restarts paging at page 1', () => {
  const H2 = tableHandlers(FEP_SPEC);
  let s = { state: 'ready', data: { results: { ...tableInit(FEP_SPEC, fepRows(5)), page: 3 } } };
  const r = H2['results-filter.input'](s, { name: 'results-filter', event: 'input', value: 'odd' });
  assert.equal(r.status.data.results.filter, 'odd');
  assert.equal(r.status.data.results.page, 1);
});

test('<name>-tools.click: CSV/JSON export emits filtered+sorted (ALL pages), never touches status', () => {
  const H2 = tableHandlers(FEP_SPEC);
  const s = { state: 'ready', data: { results: { ...tableInit(FEP_SPEC, fepRows(5)), filter: 'odd', sort: { key: 'a', dir: 'desc' } } } };
  const path = (n) => ({ name: 'results-tools', event: 'click', target: n, path: [n, 'results-tools', 'root'] });
  const csv = H2['results-tools.click'](s, path('results-export-csv'));
  assert.equal(csv.status, s, 'export is a pure read, status untouched');
  assert.deepEqual(csv.effects, [{ emit: 'results.export', payload: {
    format: 'csv', filename: 'query-results.csv', mime: 'text/csv', text: 'A,B\nrow3,odd\nrow1,odd' } }]);
  const json = H2['results-tools.click'](s, path('results-export-json'));
  assert.deepEqual(JSON.parse(json.effects[0].payload.text), [{ __i: 3, a: 'row3', b: 'odd' }, { __i: 1, a: 'row1', b: 'odd' }]);
  assert.equal(json.effects[0].payload.filename, 'query-results.json');
  assert.equal(json.effects[0].payload.mime, 'application/json');
  const noHit = H2['results-tools.click'](s, { name: 'results-tools', event: 'click', target: 'x', path: ['results-tools', 'root'] });
  assert.equal(noHit.effects, undefined, 'a click elsewhere in the tools row is a no-op');
});

test('<name>-pager.click: prev/next clamp to [1, lastPage] against the FILTERED count', () => {
  const H2 = tableHandlers(FEP_SPEC);
  const path = (n) => ({ name: 'results-pager', event: 'click', target: n, path: [n, 'results-pager', 'root'] });
  let s = { state: 'ready', data: { results: { ...tableInit(FEP_SPEC, fepRows(5)), page: 1 } } };
  let r = H2['results-pager.click'](s, path('results-page-prev'));
  assert.equal(r.status.data.results.page, 1, 'already at page 1, prev clamps');
  r = H2['results-pager.click'](s, path('results-page-next'));
  assert.equal(r.status.data.results.page, 2);
  // 5 rows, pageSize 2 -> 3 pages unfiltered; filtered to the 2 "odd" rows -> 1 page only
  s = { state: 'ready', data: { results: { ...tableInit(FEP_SPEC, fepRows(5)), filter: 'odd', page: 1 } } };
  r = H2['results-pager.click'](s, path('results-page-next'));
  assert.equal(r.status.data.results.page, 1, 'next clamps to the filtered lastPage, not the unfiltered one');
});

test('tableView: paging="pages" -> exactly one page of rows, no spacers, <name>-pager patched', () => {
  const t = { ...tableInit(FEP_SPEC, fepRows(5)), page: 2 };
  const v = tableView(FEP_SPEC, t);
  assert.deepEqual(v.results.content.map(c => c.name ?? c.box), ['results-head', 'results-row-2', 'results-row-3']);
  assert.deepEqual(v['results-pager'].content[0], { box: 'hug', content: '3–4 of 5' });
  assert.deepEqual(v['results-page-prev'], { state: 'actionable' });
  assert.deepEqual(v['results-page-next'], { state: 'actionable' });
  const last = { ...tableInit(FEP_SPEC, fepRows(5)), page: 3 };
  const vLast = tableView(FEP_SPEC, last);
  assert.equal(vLast.results.content.length, 2, 'head + the single leftover row');
  assert.deepEqual(vLast['results-page-next'], { state: 'disabled' });
  const first = { ...tableInit(FEP_SPEC, fepRows(5)), page: 1 };
  assert.deepEqual(tableView(FEP_SPEC, first)['results-page-prev'], { state: 'disabled' });
});

test('tableView: filterable narrows rows/paging/count; exportable adds CSV/JSON buttons', () => {
  const t = { ...tableInit(FEP_SPEC, fepRows(5)), filter: 'odd' };
  const v = tableView(FEP_SPEC, t);
  assert.deepEqual(v.results.content.map(c => c.name), ['results-head', 'results-row-1', 'results-row-3']);
  const tools = v['results-tools'].content;
  assert.equal(tools[0].name, 'results-filter');
  assert.equal(tools[0].content, 'odd');
  assert.deepEqual(tools[1], { box: 'fill' });
  assert.deepEqual(tools[2], { box: 'hug', content: '2 of 5' });
  assert.deepEqual(tools.map(x => x.name ?? null).slice(3), ['results-export-csv', 'results-export-json']);
  assert.deepEqual(v['results-export-csv'], { state: 'actionable' });
  assert.deepEqual(v['results-export-json'], { state: 'actionable' });
  // no filter text yet -> no count span, just filter field + spacer + export buttons
  const empty = tableView(FEP_SPEC, tableInit(FEP_SPEC, fepRows(5)));
  assert.equal(empty['results-tools'].content.length, 4);
});

test('tableView: a spec with none of filterable/exportable/paging never touches <name>-tools/-pager', () => {
  const v = tableView(SPEC, tableInit(SPEC, ROWS));
  assert.equal('runs-tools' in v, false);
  assert.equal('runs-pager' in v, false);
});
