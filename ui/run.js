// ui/run.js -- single-run watch view, L9 (C11). machines/run.json is the
// machine; handlers + view are pure; mountRun only hands the already-
// rendered screens/run element to ui/machine.js. Second half of the S6
// "records/run" step (docs/superpowers/plans/2026-09-11-workspace-dashboard.md);
// records.html shipped first, this one waited on ui/machine.js's `stream`
// effect (SSE) -- a real engine gap, now shipped + tested (test/machine_test.js's
// "stream effect" blocks).
//
// Ground truth reference (behaviour only, not code -- it's ui-kit/DOM):
// fayf_processor/frontend/run.js -- status badge, pause/resume/cancel
// commands, a live SSE event log, a steps table.
//
// One table sub-controller (ui/table.js) rides on status.data.steps -- same
// driver, own slice, talks via triggers + emit. No filetree/tree here (no
// drill-down concept on this page, just a flat steps table).
//
// v1 scope (plan doc's "Scope for this v1"): IN -- status badge, pause/
// resume/cancel (real POST), a live-appending event log (raw JSONL, capped
// at 200, mirrors the ground truth's own appendLog cap), a steps table
// rebuilt on load AND again on a `run_finished` stream event (mirrors the
// ground truth's loadSnapshot()+connectEvents() split). OUT -- the legacy
// ?step_id/?record_id redirect to records.html (dropped, this repo's pages
// don't do ?-param URL sync anywhere); "View records"/"View on graph" and a
// steps-row click ARE in scope, but as simple `emit`s (`records.open`/
// `graph.open`), not real navigation -- a real consumer maps them to page
// nav, mirroring how `run.open` already works from ui/list.js/ui/records.js.
//
// status.data = { runId, pipeline, status, steps: tableStatus, log (array of
//                  raw JSONL strings, capped at 200), actioning: null | 'pause'
//                  |'resume'|'cancel', error }
//
// Machine JSON note (deviation from the plan doc's own illustrative block,
// both necessary corrections, not scope changes): (1) `ready` gained
// `"run.loaded": "ready"` / `"run.failed": "ready"` self-transitions -- the
// `run_finished`-triggered snapshot re-fetch below dispatches those same
// triggers while already in `ready`; without a `ready`-scoped entry they'd be
// full no-ops (a known-but-inert trigger runs no handler, C11), silently
// dropping the steps-table refresh. (2) `ready` gained
// `"btn-view-records.click"`/`"btn-view-graph.click"` -- the plan doc's own
// handler bullet list requires these two triggers but its literal machine
// JSON block omitted them; dispatching an undeclared trigger throws (C2).
//
// Fixture/URL convention note (for the fayf_processor sibling wiring the
// real API): the machine's own `enter` effects hardcode literal, single,
// non-parametrized paths (`/content/run/snapshot.json`, `/content/run/
// events.json`) -- same "one hardcoded demo run" simplification
// ui/records.js's machine already uses (`/content/records/run.json`, no
// runId in the path) -- because machine JSON is static data and this v1
// fixture demo only ever mounts one hardcoded FIXTURE_RUN_ID. FIXTURE_URLS
// below is the REAL, runId-parametrized contract shape a consumer needs
// (`snapshot(id)`, `events(id)`, `action(id, action)`); `.snapshot` is
// actually exercised by the `run_finished` handler's re-fetch effect (built
// dynamically inside a pure handler, unlike the machine's own static `enter`
// fetch) and `.action` by the three POST commands -- `.events` is declared
// for contract-shape completeness only (a real consumer's live stream is
// genuinely per-run) but unused by this v1's own wiring, since the stream
// effect can only be declared inside the machine JSON's static `enter`.
// `content/run/` therefore ships each of snapshot/events TWICE, byte-
// identical: once at the machine's own literal path, once at
// FIXTURE_URLS's runId-suffixed path -- cheap, deliberate duplication to
// satisfy both contracts at once, not a bug.
//
// Real consumer wiring: `urls.snapshot(id)` -> `GET /api/runs/{id}` (same
// shape ui/records.js already consumes: `{ run: { pipeline, status }, steps:
// { <stepId>: {...} } }`); `Api.events(id)` -> a real `EventSource('/api/runs/
// {id}/events')` in place of the machine's hardcoded stream URL; `urls.action(
// id, action)` -> `POST /api/runs/{id}/(pause|resume|cancel)`.
//
// Known simplification: this repo's dev server (server.py) is a plain
// `SimpleHTTPRequestHandler` with no `do_POST` -- a REAL pause/resume/cancel
// click against the live fixture demo gets a 501 from the server, which
// cleanly drives `action.failed` (no crash, `data.actioning` still clears).
// Unlike ui/list.js's "start a run" (`urls.startRun: null`, local-optimistic,
// engineered to dodge this), the plan doc explicitly asked for a real
// non-null `urls.action` here mirroring ui/list.js's POST-with-`init` idiom
// -- so this page's own fixture demo does NOT locally fake a success path;
// `test/run_test.js` exercises the real POST success/no-op paths via an
// injected `io.fetch` (`window.__mount`), same seam `test/list_test.js`'s
// error-path block already uses, rather than hitting the network.
import runMachine from '../machines/run.json' with { type: 'json' };
import { mountMachine } from './machine.js';
import { tableInit, tableHandlers, tableView } from './table.js';

export { runMachine };

export const STEPS = { name: 'steps', rowKey: 'step', columns: [
  { key: 'step', label: 'Step', w: 160 }, { key: 'status', label: 'Status', w: 90 }, { key: 'records', label: 'Records' } ] };
export const FIXTURE_URLS = { snapshot: (runId) => `/content/run/snapshot-${runId}.json`, events: (runId) => `/content/run/events-${runId}.json`, action: (runId, action) => `/content/run/action-${runId}-${action}.json` };
export const FIXTURE_RUN_ID = 'run-2026-09-11';   // matches content/run/snapshot.json's own run.run_id

// Non-terminal event types that carry no explicit `status` field -- mirrors
// the ground truth's own EVENT_STATUS_BY_TYPE map exactly (run.js:39-42).
const EVENT_STATUS_BY_TYPE = { run_started: 'running', run_paused: 'paused', run_pausing: 'pausing', run_resumed: 'running', run_canceling: 'canceling' };
const NAV = ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'settings'];
const LOG_CAP = 200;

// Pure. status.data at mount: nothing loaded, steps table empty, no log.
export function initialData(runId) {
  return { runId, pipeline: null, status: null, [STEPS.name]: tableInit(STEPS, []), log: [], actioning: null, error: null };
}

const withData = (s, patch) => ({ ...s, data: { ...s.data, ...patch } });
const reset = (s) => ({ status: withData(s, { error: null }) });

// Pure. Append one raw JSONL line, capped at the last LOG_CAP entries
// (oldest dropped) -- mirrors the ground truth's own appendLog() cap
// (run.js:89: `while (kids.length > 200) kids.shift()`).
function appendLog(s, line) {
  const log = [...s.data.log, line];
  if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
  return log;
}

// Pure. steps = { <stepId>: {...}, ... } (GET /api/runs/{id}'s own shape) ->
// one table row per step, mirroring the ground truth's own fillSteps():
// records = Object.keys(s.records).length if present, else s.records_total || 0.
function buildStepsRows(steps) {
  return Object.keys(steps || {}).map(stepId => {
    const info = steps[stepId] || {};
    const records = info.records ? Object.keys(info.records).length : (info.records_total || 0);
    return { step: stepId, status: info.status || '—', records: String(records) };
  });
}

// Steps table handlers, wrapped: the table's own click keeps its pure select
// (+ `steps.select` emit) -- a step ALWAYS navigates away in the ground
// truth, so no local selection state is added, just a further `records.open`
// emit alongside it (mirrors ui/list.js's `selectingRun`).
function selectingSteps() {
  const h = tableHandlers(STEPS);
  const click = h[`${STEPS.name}.click`];
  return {
    ...h,
    [`${STEPS.name}.click`]: (s, p) => {
      const r = click(s, p);
      const e = (r.effects || []).find(x => x.emit === `${STEPS.name}.select`);
      return e ? { ...r, effects: [...r.effects, { emit: 'records.open', payload: { run_id: s.data.runId, step_id: e.payload.step } }] } : r;
    },
  };
}

// One pause/resume/cancel command: no-op while another action is already in
// flight; else marks it actioning + fires the POST (mirrors ui/list.js's
// POST-with-`init` idiom exactly, no body needed for these three).
function action(name, urls) {
  return (s) => {
    if (s.data.actioning) return { status: s };
    return {
      status: withData(s, { actioning: name }),
      effects: [{ fetch: urls.action(s.data.runId, name), init: { method: 'POST' }, ok: 'action.done', err: 'action.failed' }],
    };
  };
}

export function makeHandlers(urls = FIXTURE_URLS) {
  return {
    // payload mirrors GET /api/runs/{id}: { run: { pipeline, status },
    // steps: { <stepId>: {...}, ... } } -- same shape ui/records.js already
    // consumes. `window` carried forward (not reset to 0) across a rebuild,
    // same fix ui/list.js's buildRunsTable applies -- ui/machine.js only
    // re-measures a `<name>.scroll` trigger when the container's real DOM
        // height changes, so a hard reset would wrongly stick at "unmeasured".
    'run.loaded': (s, p) => {
      const run = (p && p.run) || {};
      const steps = (p && p.steps) || {};
      const prevWindow = s.data[STEPS.name] && s.data[STEPS.name].window;
      return { status: withData(s, {
        pipeline: run.pipeline ?? s.data.pipeline,
        status: run.status ?? s.data.status,
        [STEPS.name]: { ...tableInit(STEPS, buildStepsRows(steps)), window: prevWindow || { scrollTop: 0, clientHeight: 0 } },
      }) };
    },
    'run.failed': (s, p) => ({ status: withData(s, { error: p && p.error }) }),
    ...selectingSteps(),
    // One parsed SSE message (ui/machine.js's stream effect already JSON.parse
    // MID it). Raw form appended to the log; status updated from an explicit
    // `payload.status` (wins) or the type map, only when either is present --
    // a generic progress line with neither leaves `data.status` untouched.
    'run.event': (s, p) => {
      const log = appendLog(s, JSON.stringify(p));
      const status = (p && p.status) || (p && EVENT_STATUS_BY_TYPE[p.type]) || s.data.status;
      const next = withData(s, { log, status });
      if (p && p.type === 'run_finished') {
        // mirrors the ground truth's own loadSnapshot() call on this event
        return { status: next, effects: [{ fetch: urls.snapshot(s.data.runId), ok: 'run.loaded', err: 'run.failed' }] };
      }
      return { status: next };
    },
    'run.streamFailed': (s) => ({ status: withData(s, { log: appendLog(s, '[error] event stream error') }) }),
    'btn-pause.click': action('pause', urls),
    'btn-resume.click': action('resume', urls),
    'btn-cancel.click': action('cancel', urls),
    'action.done': (s) => ({ status: withData(s, { actioning: null, log: appendLog(s, `[action] ${s.data.actioning}`) }) }),
    'action.failed': (s, p) => ({ status: withData(s, { actioning: null, error: p && p.error }) }),
    'btn-refresh.click': reset,
    'btn-retry.click': reset,
    'btn-theme.click': (s) => ({ status: s, effects: [{ emit: 'theme.toggle' }] }),
    'btn-view-records.click': (s) => ({ status: s, effects: [{ emit: 'records.open', payload: { run_id: s.data.runId } }] }),
    'btn-view-graph.click': (s) => ({ status: s, effects: [{ emit: 'graph.open', payload: { run: s.data.runId } }] }),
    ...Object.fromEntries(NAV.map(to => [`nav-${to}.click`, (s) => ({ status: s, effects: [{ emit: 'nav.go', payload: { to } }] })])),
  };
}

export const handlers = makeHandlers(FIXTURE_URLS);   // this repo's own default export

const RETRY = { name: 'btn-retry', box: 'row, mid, packed, pad:2, solid, rounded', content: 'Retry' };
const LOG_RENDER_CAP = 50;   // rendering cap only -- data.log itself holds up to 200

// Pure. status -> { name: patch }. Object.entries order = paint order:
// content-level slots first, table row patches last.
export function view(s) {
  const d = s.data;
  const loading = s.state === 'loading';
  const patches = {
    'crumb-page': 'Run',
    'status-text': loading ? 'loading…'
      : s.state === 'error' ? `failed: ${d.error}`
      : `${d.pipeline ? d.pipeline + ' · ' : ''}run ${d.runId} · ${d.status || '—'}`,
  };
  if (loading) {
    patches[STEPS.name] = { content: [], state: 'loading' };
    patches['event-log'] = [];
  } else if (s.state === 'error') {
    patches[STEPS.name] = { content: [RETRY], state: '' };
    patches['btn-retry'] = { state: 'error' };
    patches['event-log'] = [];
  } else {
    const tv = tableView(STEPS, d[STEPS.name]);
    patches[STEPS.name] = tv[STEPS.name];
    Object.assign(patches, tv);
    // rendering cap only (last ~50), not a second data cap -- data.log stays 200
    patches['event-log'] = d.log.slice(-LOG_RENDER_CAP).map(line => ({ box: 'hug', content: line }));
    // machine.js's guard already enables pause/resume/cancel by trigger
    // presence in `ready` (always true) -- it can't express a DATA condition,
    // so mirror the ground truth's own enabled() callbacks here explicitly
    // (same technique ui/list.js's `starting` flag uses on btn-start-run).
    patches['btn-pause'] = { state: d.status === 'running' ? '' : 'disabled' };
    patches['btn-resume'] = { state: d.status === 'paused' ? '' : 'disabled' };
    patches['btn-cancel'] = { state: (d.status === 'running' || d.status === 'paused') ? '' : 'disabled' };
  }
  return patches;
}

// Browser. `root` = the already-rendered screens/run element.
export function mountRun(root, reg, opts = {}) {
  return mountMachine(root, root, runMachine, makeHandlers(opts.urls || FIXTURE_URLS), { reg, view, data: initialData(opts.runId || FIXTURE_RUN_ID), ...opts });
}
