// ui/list.js -- pipelines (list) controller, L9 (C11). machines/list.json is
// the machine; handlers + view are pure; mountList only hands the already-
// rendered screens/list element to ui/machine.js.
//
// Two table sub-controllers (ui/table.js) ride on status.data.pipelines and
// status.data.runs -- same driver, own slice, talk via triggers + emit.
// Clicking a pipeline row filters the runs table AND selects it as the
// "start a run" target; clicking a run row has nothing to show inline (it's
// a real page nav in the ground truth) -- it emits `run.open` instead of
// setting any local selection.
//
// "Start a run" (v1, docs/superpowers/plans/2026-09-11-workspace-dashboard.md
// S6, extended 2026-09-14 for issue "list: new-run form lost per-pipeline
// schema, no filter/pagination/export on runs table"): multi-row record-id
// entry (add/remove, `field:"text"` per row, ui/render.js) with ground-truth
// parity validation (reject "/"/"\\", block duplicates, require at least
// one id). Deliberately still out of scope (a real per-pipeline entry
// SCHEMA fetch + JSON-typed value rows + a bespoke "quick: run Bundestag
// session" shortcut form -- see .ai/todo.md and this issue's own closing
// note): those need a new backend endpoint (Api.pipelineSteps) this repo's
// fixture demo has no equivalent of, and are pipeline-specific conveniences
// rather than a gap in the generic record-id/run-starting flow itself.
// `makeHandlers(urls)` mirrors ui/issues.js's factory: `urls.startRun` is
// null in this repo's own fixture demo (local-optimistic), a real POST URL
// for a consumer.
//
// status.data = { allRuns, loaded: { pipelines, runs }, error,
//                  pipelineFilter: null | string,
//                  recordRows: string[], starting, startError,
//                  pipelines: tableStatus, runs: tableStatus }
//   recordRows: one entry per record-id row (never empty -- removing the
//   last row blanks it instead, same "always something to type into"
//   convenience EXAMPLES[0]/ui/query.js's own default seed uses).
//   PIPELINES.name/RUNS.name are 'pipelines'/'runs' (the screen's slot names,
//   C2 one name for the table's own DOM identity) -- the pipelines table is
//   never filtered, so its rows ARE the full list; no second key needed
//   there (same "no second key for the same array" reasoning ui/dashboard.js
//   applies to ISSUES). The runs table IS filtered by `pipelineFilter`, so
//   its rows are a derived VIEW, not the source of truth -- collapsing it to
//   one key (like ISSUES) would lose data the moment a filter is applied:
//   re-filtering to a different pipeline, or the always-a-total run count in
//   status-text (mirrors list.js's own subLine(), unaffected by the current
//   filter), both need the full list back. Kept separately as `data.allRuns`.
import listMachine from '../machines/list.json' with { type: 'json' };
import { mountMachine } from './machine.js';
import { tableInit, tableHandlers, tableView } from './table.js';

export { listMachine };

export const FIXTURE_URLS = { startRun: null };   // startRun:null = demo has no backend write (local-optimistic)

export const PIPELINES = { name: 'pipelines', rowKey: 'name', columns: [{ key: 'name', label: 'Pipeline' }] };
// filterable/exportable/paging: ground-truth parity (fayf_processor's old
// DataTable widget had all three on this exact table -- `filterable:true,
// export:true, exportName:'runs', paging:'pages', pageSize:12` -- see
// ui/table.js's own header for what each opt-in flag does).
export const RUNS = { name: 'runs', rowKey: 'run_id', columns: [
  { key: 'run_id', label: 'Run', w: 90 }, { key: 'pipeline', label: 'Pipeline', w: 180 },
  { key: 'status', label: 'Status', w: 90 }, { key: 'started_at', label: 'Started' } ],
  filterable: true, exportable: true, exportName: 'runs', paging: 'pages', pageSize: 12 };

const NAV = ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'browse', 'query', 'annotate', 'profile'];
const NO_LOADED = { pipelines: false, runs: false };

// Pure. status.data at mount: nothing loaded, both table slices empty.
// `pipelineFilter` (?pipeline= deep-link, ground-truth parity: OLD read the
// same param at load) can be seeded by the caller before pipelines/runs
// have even loaded -- pipelines.loaded/runs.loaded below both already
// re-derive their own table from whatever `pipelineFilter` is current.
export function initialData(pipelineFilter = null) {
  return { allRuns: [], loaded: { ...NO_LOADED }, error: null, pipelineFilter,
    recordRows: [''], starting: false, startError: null,
    [PIPELINES.name]: tableInit(PIPELINES, []), [RUNS.name]: tableInit(RUNS, []) };
}

const withData = (s, patch) => ({ ...s, data: { ...s.data, ...patch } });
const flag = (s, key) => ({ ...s.data.loaded, [key]: true });
const allLoaded = (loaded) => loaded.pipelines && loaded.runs;
const ready = (s) => allLoaded(s.data.loaded) ? [{ send: 'flow.ready' }] : [];
const reset = (s) => ({ status: withData(s, { loaded: { ...NO_LOADED }, error: null }) });
const asList = (p) => Array.isArray(p) ? p : [];

// Pure. Runs table slice for a given raw runs array + pipeline filter,
// newest first -- losing the runs table's own sort/scroll POSITION on a
// filter change is an accepted simplification (v1, see plan doc's Known
// small items). `clientHeight` is kept from `prevWindow` (when given) rather
// than reset to 0 with the rest of the window: it's a measurement of the
// scroll container's own size, not user-chosen scroll state, and ui/machine.js
// only re-delivers a `<name>.scroll` trigger when the real DOM height
// CHANGES -- a filter toggle repaints the same fixed-height box, so a hard
// reset to 0 would never get re-measured and windowing would wrongly fall
// back to its "not yet measured" ~1-viewport-row case until an unrelated
// resize happened to fire.
// `prev` (the table's own previous sub-status, when there is one) also
// carries over its filter text and sort across a rebuild -- a background
// refresh (runs.loaded) or a pipeline-filter change is a change of WHICH
// rows are in play, not a reason to clear what the user already typed into
// the runs-table's own search box; `page` always restarts at 1 (the old
// page number may not even exist in the new row set).
const buildRunsTable = (runs, filter, prev) => ({
  ...tableInit(RUNS, filter ? runs.filter(r => r.pipeline === filter) : runs),
  sort: (prev && prev.sort) || { key: 'started_at', dir: 'desc' },
  window: { scrollTop: 0, clientHeight: (prev && prev.window && prev.window.clientHeight) || 0 },
  filter: (prev && prev.filter) || '',
  page: 1,
});

// Pipelines table handlers, wrapped: the table's own click toggles selection
// (same row clicked again -> deselect); here that toggle IS the pipeline
// filter, so re-derive the runs table slice + the pipelines table's own
// `sel` from the new filter (not straight from the row, so a second click on
// the same row clears both).
function selectingPipeline() {
  const h = tableHandlers(PIPELINES);
  const click = h[`${PIPELINES.name}.click`];
  return {
    ...h,
    [`${PIPELINES.name}.click`]: (s, p) => {
      const r = click(s, p);
      const e = (r.effects || []).find(x => x.emit === `${PIPELINES.name}.select`);
      if (!e) return r;
      const filter = s.data.pipelineFilter === e.payload.name ? null : e.payload.name;
      const next = withData(r.status, {
        pipelineFilter: filter,
        [RUNS.name]: buildRunsTable(r.status.data.allRuns, filter, r.status.data[RUNS.name]),
        [PIPELINES.name]: { ...r.status.data[PIPELINES.name], sel: filter },
        // A different "start a run" target -- the previous pipeline's typed
        // rows/error don't carry over (ground-truth parity: OLD's own
        // loadEntrySchema() rebuilds entryRows from scratch on every pipeline
        // switch too).
        recordRows: [''], startError: null,
      });
      return { ...r, status: next };
    },
  };
}

// Runs table handlers, wrapped: no local selection/detail state -- a run row
// click navigates away in the ground truth. Adds a `run.open` emit (a NEW
// trigger, like `nav.go`/`theme.toggle`) alongside the table's own emit.
function selectingRun() {
  const h = tableHandlers(RUNS);
  const click = h[`${RUNS.name}.click`];
  return {
    ...h,
    [`${RUNS.name}.click`]: (s, p) => {
      const r = click(s, p);
      const e = (r.effects || []).find(x => x.emit === `${RUNS.name}.select`);
      return e ? { ...r, effects: [...r.effects, { emit: 'run.open', payload: { run_id: e.payload.run_id } }] } : r;
    },
  };
}

// "Start a run" (ground truth: list.js's own form -- pipeline picker + record-
// id rows + Start). Multi-row record-id entry (add/remove), no per-pipeline
// entry-schema (steps' own fillable param) or JSON value rows, no "quick:
// Bundestag session" convenience form -- see this file's header + .ai/todo.md.
// The pipeline to start is `data.pipelineFilter` (reusing the existing
// pipeline-row selection -- no second "which pipeline" concept). `urls.startRun`
// mirrors ui/issues.js's urls-factory pattern: null in this repo's own
// fixture demo (local-optimistic, no backend), a real POST URL for a
// consumer that configures one.
//
// Row fields/buttons are NOT individually declared machine triggers (an
// unbounded "Add record" would need an unbounded trigger vocabulary, C2
// forbids that) -- they all route through ONE wrapping container's own
// `record-rows.input`/`.click`, the same "payload.path/.target names the
// actual leaf, the container is the only declared trigger" pattern
// ui/table.js's own column/row clicks already established.
const RECORD_ID_RE = /^record-id-(\d+)$/, RECORD_REMOVE_RE = /^record-remove-(\d+)$/;

function entryRowHandlers() {
  return {
    'record-rows.input': (s, p) => {
      const m = RECORD_ID_RE.exec((p && p.target) || '');
      if (!m) return { status: s };
      const rows = s.data.recordRows.slice();
      rows[Number(m[1])] = (p && p.value) ?? '';
      return { status: withData(s, { recordRows: rows }) };
    },
    'record-rows.click': (s, p) => {
      for (const n of (p && p.path) || []) {
        if (n === 'record-add') return { status: withData(s, { recordRows: [...s.data.recordRows, ''] }) };
        const m = RECORD_REMOVE_RE.exec(n);
        if (m) {
          const rows = s.data.recordRows.slice();
          rows.splice(Number(m[1]), 1);
          if (!rows.length) rows.push('');   // never fully empty -- always a row to type into
          return { status: withData(s, { recordRows: rows }) };
        }
      }
      return { status: s };
    },
  };
}

function startRunHandlers(urls) {
  return {
    ...entryRowHandlers(),
    'btn-start-run.click': (s) => {
      const d = s.data;
      if (!d.pipelineFilter || d.starting) return { status: s };
      // Ground-truth parity validation (OLD's own startRun()): "/"/"\\" are
      // rejected outright (record ids double as filesystem path segments
      // downstream -- "_" is the sanctioned separator, e.g. 21_67), and a
      // duplicate id is refused rather than silently deduped, both as a
      // real error message the user sees, not a silent drop. Blank rows
      // (untouched "Add record" rows) are just skipped, not an error.
      const seen = new Set(), ids = [];
      for (const raw of d.recordRows) {
        const id = String(raw || '').trim();
        if (!id) continue;
        if (/[/\\]/.test(id)) return { status: withData(s, { startError: `record id "${id}" can't contain "/" or "\\" -- use "_" (e.g. 21_67)` }) };
        if (seen.has(id)) return { status: withData(s, { startError: `duplicate record id: ${id}` }) };
        seen.add(id); ids.push(id);
      }
      if (!ids.length) return { status: withData(s, { startError: 'add at least one record id' }) };
      if (!urls.startRun) {
        // No backend configured -- pretend it started, same "local-optimistic"
        // shape ui/issues.js's status chips use when urls.status is null.
        // No real per-run id to synthesize for a MULTI-record start, so this
        // fixture-only path (never hit by a real consumer, which always
        // configures urls.startRun) just uses the first id.
        return { status: withData(s, { starting: false, recordRows: [''], startError: null }),
          effects: [{ emit: 'run.open', payload: { run_id: `${d.pipelineFilter}-${ids[0]}` } }] };
      }
      return {
        status: withData(s, { starting: true, startError: null }),
        effects: [{ fetch: urls.startRun(d.pipelineFilter), init: { method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record_ids: ids, initial_inputs: {} }) },
          ok: 'start.saved', err: 'start.failed' }],
      };
    },
    'start.saved': (s, p) => ({ status: withData(s, { starting: false, recordRows: [''], startError: null }),
      effects: [{ emit: 'run.open', payload: { run_id: p && p.run_id } }] }),
    'start.failed': (s, p) => ({ status: withData(s, { starting: false, startError: (p && p.error) || 'failed to start' }) }),
  };
}

// Pure. (status, payload) -> { status, effects? }
export function makeHandlers(urls = FIXTURE_URLS) {
  return {
    'pipelines.loaded': (s, p) => {
      const pipelines = asList(p);
      const loaded = flag(s, 'pipelines');
      // `sel` mirrors s.data.pipelineFilter (not just the row-click path in
      // selectingPipeline below) so a ?pipeline= deep-link seeded into
      // initialData() shows that row selected once the real list arrives.
      const next = withData(s, { loaded, [PIPELINES.name]: { ...tableInit(PIPELINES, pipelines.map(name => ({ name }))), sel: s.data.pipelineFilter } });
      return { status: next, effects: ready(next) };
    },
    'runs.loaded': (s, p) => {
      const runs = asList(p);
      const loaded = flag(s, 'runs');
      const next = withData(s, { allRuns: runs, loaded, [RUNS.name]: buildRunsTable(runs, s.data.pipelineFilter, s.data[RUNS.name]) });
      return { status: next, effects: ready(next) };
    },
    'pipelines.failed': (s, p) => ({ status: withData(s, { error: p && p.error }) }),
    'runs.failed':      (s, p) => ({ status: withData(s, { error: p && p.error }) }),
    'btn-refresh.click': reset,
    'btn-retry.click':   reset,
    'btn-theme.click': (s) => ({ status: s, effects: [{ emit: 'theme.toggle' }] }),
    ...Object.fromEntries(NAV.map(to => [`nav-${to}.click`, (s) => ({ status: s, effects: [{ emit: 'nav.go', payload: { to } }] })])),
    'brand.click': (s) => ({ status: s, effects: [{ emit: 'nav.go', payload: { to: 'dashboard' } }] }),
    ...selectingPipeline(),
    ...selectingRun(),
    ...startRunHandlers(urls),
  };
}

export const handlers = makeHandlers(FIXTURE_URLS);   // this repo's own default export

const RETRY = { name: 'btn-retry', box: 'row, mid, packed, pad:2, solid, rounded', content: 'Retry' };
const fieldRow = (label, value) => ({ box: 'row, gap:2, between, hug',
  children: [{ box: 'hug', content: label }, { box: 'hug', content: String(value ?? '') }] });

// Pure. `d` = status.data -- mirrors list.js's own subLine(). Total counts,
// unaffected by the current filter (pipelines table is never filtered;
// `allRuns` is the full list `runs`'s table slice was derived from).
const subLine = (d) => `${d.allRuns.length} runs · ${d[PIPELINES.name].rows.length} pipelines` + (d.pipelineFilter ? ` · filtered: ${d.pipelineFilter}` : '');

// Pure. One record-id row: a real field:"text" input + a remove button.
// Names are POSITIONAL (record-id-<i>/record-remove-<i>), not stable per
// logical row -- removing row 0 shifts row 1 into "record-id-0" etc, same
// as any index-keyed list without its own persistent row id. Acceptable
// here: a row holds nothing but in-progress typed text, so a shift losing
// morph()'s DOM-identity optimization for the shifted rows (a fresh
// re-render instead of an in-place update) is invisible to the user.
const entryRow = (val, i) => ({ box: 'row, gap:1, hug', children: [
  { name: `record-id-${i}`, box: 'fixed, w:140, h:22, pad:1, solid, rounded', field: 'text', content: val },
  { name: `record-remove-${i}`, extends: 'atom/button', content: '✕' } ] });

// Pure. Stats about the CURRENT (possibly filtered) runs view -- there's no
// "select a run to inspect" concept here, so this always has something to
// show, unfiltered = all runs. A pipeline selected (pipelineFilter) also
// shows the "start a run" mini-form (multi-row record ids, see
// startRunHandlers/entryRowHandlers).
function detailBody(d) {
  const rows = (d[RUNS.name] && d[RUNS.name].rows) || [];
  const counts = {};
  for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1;
  const byCount = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const out = [fieldRow('Total runs', rows.length), ...byCount.map(([status, n]) => fieldRow(status, n))];
  if (!d.pipelineFilter) return out;
  out.push(
    { box: 'hug', content: 'Start a run' },
    { name: 'record-rows', box: 'stack, gap:1, hug', children: [
      ...d.recordRows.map(entryRow),
      { name: 'record-add', extends: 'atom/button', content: '+ Add record' } ] },
    { name: 'btn-start-run', extends: 'atom/button.primary', content: d.starting ? 'Starting…' : 'Start run' });
  if (d.startError) out.push({ box: 'hug', content: d.startError });
  return out;
}

// Pure. status -> { name: patch }. Object.entries order = paint order:
// content-level slots first, table row patches last.
export function view(s) {
  const d = s.data;
  const loading = s.state === 'loading';
  const patches = {
    'crumb-page': 'Pipelines',
    'status-text': loading ? 'loading…' : s.state === 'error' ? `failed: ${d.error}` : subLine(d),
    'detail-title': d.pipelineFilter ? `Pipeline: ${d.pipelineFilter}` : 'Pipelines',
    'detail-body': detailBody(d),
  };
  if (loading) {
    patches[PIPELINES.name] = { content: [], state: 'loading' };
    patches[RUNS.name] = { content: [], state: 'loading' };
  } else if (s.state === 'error') {
    patches[PIPELINES.name] = { content: [RETRY], state: '' };
    patches['btn-retry'] = { state: 'error' };
    patches[RUNS.name] = { content: [], state: '' };
  } else {
    const pipelines = tableView(PIPELINES, d[PIPELINES.name]), runs = tableView(RUNS, d[RUNS.name]);
    // both slot patches before any row/col patch (re-assigning keeps a key's position)
    patches[PIPELINES.name] = pipelines[PIPELINES.name];
    patches[RUNS.name] = runs[RUNS.name];
    Object.assign(patches, pipelines, runs);
  }
  // The guard (machine.js) already enables/disables record-rows/btn-start-run
  // by trigger presence in the current state; `starting` needs an EXPLICIT
  // disable on top of that (both triggers stay valid in `ready` throughout).
  // Disabling the 'record-rows' container inerts every row field/remove
  // button plus Add-record inside it in one patch (tokens.css's bx-disabled
  // is pointer-events:none, which cascades to descendants) -- no need to
  // enumerate each row individually.
  if (d.pipelineFilter && d.starting) {
    patches['record-rows'] = { state: 'disabled' };
    patches['btn-start-run'] = { state: 'disabled' };
  }
  return patches;
}

// Browser. `root` = the already-rendered screens/list element.
export function mountList(root, reg, opts = {}) {
  return mountMachine(root, root, listMachine, makeHandlers(opts.urls || FIXTURE_URLS), { reg, view, data: initialData(), ...opts });
}
