// ui/records.js -- run artefact browser controller, L9 (C11).
// machines/records.json is the machine; handlers + view are pure;
// mountRecords only hands the already-rendered screens/records element to
// ui/machine.js.
//
// One filetree sub-controller (ui/filetree.js) rides on status.data.tree --
// same driver, own slice, talks via triggers + emit. Ground truth reference
// (behaviour only, not code -- it's ui-kit/DOM):
// fayf_processor/frontend/records.js -- a step->record tree (master) + the
// selected record's JSON output (detail), with diff views and in-place
// editing in the full version.
//
// v1 scope (docs/superpowers/plans/2026-09-11-workspace-dashboard.md S6,
// "records" -- the first half of the records/run step, "run" -- the live SSE
// watch view -- is a separate, deferred engine gap):
//   - no "no run selected" run-picker mode -- this screen ASSUMES a run is
//     already chosen (`initialData(runId)` takes it as a parameter, unlike
//     every prior page's parameterless `initialData()`); a real consumer
//     supplies `?run_id=`, this repo's own fixture demo hardcodes
//     FIXTURE_RUN_ID.
//   - no named-channel-only step special case (a 3rd tree level for a step
//     whose type has ONLY named outputs) -- every step is a plain 2-level
//     step->record tree; a record under such a step just won't resolve in
//     this v1 (a real, accepted gap -- the ground truth itself only handles
//     it via a second metadata round-trip this v1 doesn't replicate).
//   - no diff views (vs pre-edit history, vs another run), no in-place
//     edit+save (version-guarded PATCH), no tags display, no "Re-run..."/
//     graph-jump buttons -- all deferred, same discipline as browse.html's
//     dropped edit.
//
// Unlike ui/browse.js's filetree usage, this tree is NEVER lazy: one
// run-metadata fetch (`run.json`) already knows every step id AND every
// record id (`run.record_ids`, the same list under every step, per the plan
// doc), so `run.loaded` builds every node with its children already
// populated -- a step's `children` is never `null`, a record leaf has no
// `children` key at all (matching ui/filetree.js's own "not a dir" shape).
// filetreeInit's own mount-mapping (`mounts.map(m => ({..., children:
// null}))`) is built for browse.html's lazy one-level-at-a-time case and
// would discard any pre-built children we handed it -- so this file only
// borrows filetreeInit's EMPTY shape (`{ nodes: [], sel: null, pendingPath:
// null }`) and overwrites `.nodes` with the fully-built tree, rather than
// routing already-populated nodes back through that mapping. filetreeHandlers
// and filetreeView are used completely unmodified either way -- they only
// ever read `t.nodes` / `t.sel` / `t.pendingPath`, they don't care how the
// nodes got there.
//
// status.data = { runId, runMeta: null | { run_id, pipeline, status,
//                  record_ids }, tree: filetreeStatus, detail: null | detail
//                  response, detailLoading, error }
import recordsMachine from '../machines/records.json' with { type: 'json' };
import { mountMachine } from './machine.js';
import { filetreeInit, filetreeHandlers, filetreeView } from './filetree.js';
import { detailBody } from './browse.js';

export { recordsMachine };

export const TREE = { name: 'tree' };
export const FIXTURE_URLS = { artifact: (path) => `/content/records/artifact/${path}.json` };
export const FIXTURE_RUN_ID = 'run-2026-09-11';   // matches content/records/run.json's own run.run_id

const NAV = ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'settings'];

// Pure. steps = { <stepId>: {...}, ... } (only the keys matter here), recordIds
// = the run's own record_ids (the SAME list under every step in this v1 --
// see the header's "named-channel-only step" simplification). One dir node
// per step, children already populated: one file node per record, path
// `${stepId}/${recordId}`, no `children` key (matches filetree's file-node
// convention, checked against ui/filetree.js).
function buildNodes(steps, recordIds) {
  return Object.keys(steps).map(stepId => ({
    name: stepId, path: stepId, kind: 'dir', open: false, loading: false, error: null,
    children: recordIds.map(recId => ({ name: recId, path: `${stepId}/${recId}`, kind: 'file' })),
  }));
}

// Pure. status.data at mount: nothing loaded, tree empty (no run metadata yet).
export function initialData(runId) {
  return { runId, runMeta: null, [TREE.name]: filetreeInit(TREE, []), detail: null, detailLoading: false, error: null };
}

const withData = (s, patch) => ({ ...s, data: { ...s.data, ...patch } });
const reset = (s) => ({ status: withData(s, { error: null }) });

// filetree handlers, wrapped: filetreeHandlers' own click keeps its pure
// dir-toggle / file-select behaviour (and its `${name}.select` emit) -- a
// record leaf here is always a "file" node kind-wise. This wrapper ALSO
// starts the detail fetch for a selected record, same shape as
// ui/issues.js's `selectingMaster`, but SIMPLER than ui/browse.js's dual-
// purpose wrapper: no lazy-load-on-expand branch at all, since children are
// never null in this tree -- a dir (step) click is always just the base
// toggle, no effect.
function selectingTree(urls) {
  const h = filetreeHandlers(TREE);
  const click = h[`${TREE.name}.click`];
  return {
    ...h,
    [`${TREE.name}.click`]: (s, p) => {
      const r = click(s, p);
      const selected = (r.effects || []).find(x => x.emit === `${TREE.name}.select`);
      if (!selected) return r;
      const next = withData(r.status, { detail: null, detailLoading: true });
      return { status: next, effects: [...r.effects, { fetch: urls.artifact(selected.payload.path), ok: 'detail.loaded', err: 'detail.failed' }] };
    },
  };
}

export function makeHandlers(urls = FIXTURE_URLS) {
  return {
    // payload shape mirrors GET /api/runs/{id}: { run: { run_id, pipeline,
    // status, record_ids }, steps: { <stepId>: {...}, ... } }.
    'run.loaded': (s, p) => {
      const run = (p && p.run) || null;
      const steps = (p && p.steps) || {};
      const recordIds = (run && run.record_ids) || [];
      const nodes = buildNodes(steps, recordIds);
      return { status: withData(s, { runMeta: run, [TREE.name]: { ...filetreeInit(TREE, []), nodes } }) };
    },
    'run.failed': (s, p) => ({ status: withData(s, { error: p && p.error }) }),
    ...selectingTree(urls),
    // payload = whatever the fixture/real endpoint returns -- a bare value or
    // { value, version }, not assumed which (view()'s adapter handles both,
    // same "wrapped" check the ground truth's own loadArtifact() makes).
    'detail.loaded': (s, p) => ({ status: withData(s, { detail: p, detailLoading: false }) }),
    'detail.failed': (s, p) => ({ status: withData(s, { detailLoading: false, error: p && p.error }) }),
    'btn-refresh.click': reset,
    'btn-retry.click': reset,
    'btn-theme.click': (s) => ({ status: s, effects: [{ emit: 'theme.toggle' }] }),
    ...Object.fromEntries(NAV.map(to => [`nav-${to}.click`, (s) => ({ status: s, effects: [{ emit: 'nav.go', payload: { to } }] })])),
  };
}

export const handlers = makeHandlers(FIXTURE_URLS);   // this repo's own default export

const RETRY = { name: 'btn-retry', box: 'row, mid, packed, pad:2, solid, rounded', content: 'Retry' };

// Pure. status -> { name: patch }. Object.entries order = paint order:
// content-level slots first, tree row patches last.
export function view(s) {
  const d = s.data;
  const t = d[TREE.name];
  const loading = s.state === 'loading';
  const selPath = t && t.sel != null ? t.sel : null;
  const patches = {
    'crumb-page': 'Records',
    'status-text': loading ? 'loading…' : s.state === 'error' ? `failed: ${d.error}` : `${d.runMeta ? d.runMeta.pipeline + ' · ' : ''}run ${d.runId}`,
    'detail-title': selPath || 'Select a record',
    // detailBody (ui/browse.js) expects { format, content }; the artifact
    // response is a bare value or { value, version } -- adapt it here, a
    // small call-site wrapper, not a change to browse.js's own contract.
    'detail-body': d.detail ? detailBody({ format: 'json', content: JSON.stringify(d.detail.value ?? d.detail) }) : d.detailLoading ? 'Loading…' : 'Select a record',
  };
  if (loading) {
    patches[TREE.name] = { content: [], state: 'loading' };
  } else if (s.state === 'error') {
    patches[TREE.name] = { content: [RETRY], state: '' };
    patches['btn-retry'] = { state: 'error' };
  } else {
    const tv = filetreeView(TREE, t);
    patches[TREE.name] = tv[TREE.name];
    Object.assign(patches, tv);
  }
  return patches;
}

// Browser. `root` = the already-rendered screens/records element.
export function mountRecords(root, reg, opts = {}) {
  return mountMachine(root, root, recordsMachine, makeHandlers(opts.urls || FIXTURE_URLS), { reg, view, data: initialData(opts.runId || FIXTURE_RUN_ID), ...opts });
}
