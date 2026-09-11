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
// S6): now possible via the `field:"text"` node property (ui/render.js,
// added for exactly this). ONE record id, no per-pipeline entry-schema, no
// JSON value rows, no "quick: Bundestag session" form -- all still out of
// scope (see .ai/todo.md). `makeHandlers(urls)` mirrors ui/issues.js's
// factory: `urls.startRun` is null in this repo's own fixture demo (local-
// optimistic), a real POST URL for a consumer.
//
// status.data = { allRuns, loaded: { pipelines, runs }, error,
//                  pipelineFilter: null | string,
//                  recordId, starting, startError,
//                  pipelines: tableStatus, runs: tableStatus }
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
export const RUNS = { name: 'runs', rowKey: 'run_id', columns: [
  { key: 'run_id', label: 'Run', w: 90 }, { key: 'pipeline', label: 'Pipeline', w: 180 },
  { key: 'status', label: 'Status', w: 90 }, { key: 'started_at', label: 'Started' } ] };

const NAV = ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'settings'];
const NO_LOADED = { pipelines: false, runs: false };

// Pure. status.data at mount: nothing loaded, both table slices empty.
export function initialData() {
  return { allRuns: [], loaded: { ...NO_LOADED }, error: null, pipelineFilter: null,
    recordId: '', starting: false, startError: null,
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
const buildRunsTable = (runs, filter, prevWindow) => ({
  ...tableInit(RUNS, filter ? runs.filter(r => r.pipeline === filter) : runs),
  sort: { key: 'started_at', dir: 'desc' },
  window: { scrollTop: 0, clientHeight: (prevWindow && prevWindow.clientHeight) || 0 },
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
        [RUNS.name]: buildRunsTable(r.status.data.allRuns, filter, r.status.data[RUNS.name].window),
        [PIPELINES.name]: { ...r.status.data[PIPELINES.name], sel: filter },
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
// id rows + Start). v1 KISS: ONE record id, no per-pipeline entry-schema
// (steps' own fillable param), no JSON value rows, no "quick: Bundestag
// session" convenience form -- all still out of scope (see .ai/todo.md).
// The pipeline to start is `data.pipelineFilter` (reusing the existing
// pipeline-row selection -- no second "which pipeline" concept). `urls.startRun`
// mirrors ui/issues.js's urls-factory pattern: null in this repo's own
// fixture demo (local-optimistic, no backend), a real POST URL for a
// consumer that configures one.
function startRunHandlers(urls) {
  return {
    'start-record-id.input': (s, p) => ({ status: withData(s, { recordId: (p && p.value) || '' }) }),
    'btn-start-run.click': (s) => {
      const d = s.data;
      const id = String(d.recordId || '').trim();
      if (!d.pipelineFilter || !id || d.starting) return { status: s };
      if (!urls.startRun) {
        // No backend configured -- pretend it started, same "local-optimistic"
        // shape ui/issues.js's status chips use when urls.status is null.
        return { status: withData(s, { starting: false, recordId: '', startError: null }),
          effects: [{ emit: 'run.open', payload: { run_id: `${d.pipelineFilter}-${id}` } }] };
      }
      return {
        status: withData(s, { starting: true, startError: null }),
        effects: [{ fetch: urls.startRun(d.pipelineFilter), init: { method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record_ids: [id], initial_inputs: {} }) },
          ok: 'start.saved', err: 'start.failed' }],
      };
    },
    'start.saved': (s, p) => ({ status: withData(s, { starting: false, recordId: '', startError: null }),
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
      const next = withData(s, { loaded, [PIPELINES.name]: tableInit(PIPELINES, pipelines.map(name => ({ name }))) });
      return { status: next, effects: ready(next) };
    },
    'runs.loaded': (s, p) => {
      const runs = asList(p);
      const loaded = flag(s, 'runs');
      const next = withData(s, { allRuns: runs, loaded, [RUNS.name]: buildRunsTable(runs, s.data.pipelineFilter, s.data[RUNS.name] && s.data[RUNS.name].window) });
      return { status: next, effects: ready(next) };
    },
    'pipelines.failed': (s, p) => ({ status: withData(s, { error: p && p.error }) }),
    'runs.failed':      (s, p) => ({ status: withData(s, { error: p && p.error }) }),
    'btn-refresh.click': reset,
    'btn-retry.click':   reset,
    'btn-theme.click': (s) => ({ status: s, effects: [{ emit: 'theme.toggle' }] }),
    ...Object.fromEntries(NAV.map(to => [`nav-${to}.click`, (s) => ({ status: s, effects: [{ emit: 'nav.go', payload: { to } }] })])),
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

// Pure. Stats about the CURRENT (possibly filtered) runs view -- there's no
// "select a run to inspect" concept here, so this always has something to
// show, unfiltered = all runs. A pipeline selected (pipelineFilter) also
// shows the "start a run" mini-form (v1: one record id, see startRunHandlers).
function detailBody(d) {
  const rows = (d[RUNS.name] && d[RUNS.name].rows) || [];
  const counts = {};
  for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1;
  const byCount = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const out = [fieldRow('Total runs', rows.length), ...byCount.map(([status, n]) => fieldRow(status, n))];
  if (!d.pipelineFilter) return out;
  out.push(
    { box: 'hug', content: 'Start a run' },
    { box: 'row, gap:1, hug', children: [
      { name: 'start-record-id', box: 'fixed, w:140, h:22, pad:1, solid, rounded', field: 'text', content: d.recordId },
      { name: 'btn-start-run', extends: 'atom/button.primary', content: d.starting ? 'Starting…' : 'Start run' } ] });
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
  // The guard (machine.js) already enables/disables start-record-id/btn-start-run
  // by trigger presence in the current state; `starting` needs an EXPLICIT
  // disable on top of that (both triggers stay valid in `ready` throughout).
  if (d.pipelineFilter && d.starting) {
    patches['start-record-id'] = { state: 'disabled' };
    patches['btn-start-run'] = { state: 'disabled' };
  }
  return patches;
}

// Browser. `root` = the already-rendered screens/list element.
export function mountList(root, reg, opts = {}) {
  return mountMachine(root, root, listMachine, makeHandlers(opts.urls || FIXTURE_URLS), { reg, view, data: initialData(), ...opts });
}
