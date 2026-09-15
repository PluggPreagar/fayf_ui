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
// Real edit + Save, 2026-09-12: a genuine, tested backend endpoint
// (backend/api/artefacts.py's patch_step_output, PATCH /api/step/{run}/
// {step}/{record}, if_version optimistic concurrency) already existed --
// the OLD ui-kit frontend used it (frontend/api.js's saveArtifact), the
// migration to this repo just never wired it up.
//
// Diff view / tags / Re-run, 2026-09-14 (issue "records: no diff view, no
// cross-run compare, no edited/version badge, no tree filter"): the
// backend already had everything these three need (a genuinely dormant gap,
// not a missing-endpoint one) --
//   - Diff: GET /api/step/{run}/{step}/{record}/history already returns the
//     PATCH handler's own pre-edit backups ({history:[{ts,version,value}]},
//     newest first, capped at oldest+newest) -- ui/json-diff.js ports the
//     OLD frontend's own structural differ (json-diff.js) verbatim.
//   - Tags: GET .../{record}?include_meta=1 already threads EPIC-TAGS
//     lineage tags alongside version in the SAME envelope read -- this repo
//     doesn't build the query string (that's the consumer's `urls.artifact`
//     job, same layering as saveArtifact), just renders `detail.tags` if
//     the response happens to carry it.
//   - Re-run: a plain cross-page link (`emit('rerun.open', {run_id, stepId})`,
//     same shape nav.go/theme.toggle already use) to graph.html?run=&select= --
//     no new state at all, the consumer's onEmit does the actual navigate.
// Version/edited badge and a tree filter field are pure view()/data
// additions, no backend involvement.
//
// Still deliberately out of scope (documented, not silently dropped -- see
// this issue's own closing note): "Diff run..." (cross-run compare -- needs
// a same-pipeline finished-run PICKER, a real extra UI surface beyond the
// diff renderer itself), the named-channel-only step 3rd tree level (a
// pre-existing v1 gap, needs a second metadata round-trip this file has
// never made), and a "no run selected" in-page run-picker (this screen still
// assumes a run is already chosen -- a real architecture change, not a
// small addition).
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
//     it via a second metadata round-trip this v1 doesn't replicate). Same
//     reason Save only ever PATCHes `/api/step/...`, never `/api/channel/...`.
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
//                  record_ids }, allSteps, filterText,
//                  tree: filetreeStatus, detail: null | detail response
//                  (`.tags` present iff the consumer's urls.artifact asked
//                  for it), detailLoading, error, editText, saveMsg,
//                  diffMode, history: null | { loading, error, entries } }
//   `allSteps` is the raw `steps` map from the last run.loaded -- kept
//   around (not just folded into tree nodes) so a filter keystroke can
//   rebuild the tree from the SAME source without a re-fetch, same
//   "re-derive from the raw list" reasoning ui/issues.js's own
//   filterText/buildMaster keeps allIssues for.
import recordsMachine from '../machines/records.json' with { type: 'json' };
import { mountMachine } from './machine.js';
import { filetreeInit, filetreeHandlers, filetreeView } from './filetree.js';
import { detailBody, detailEditor } from './browse.js';
import { diffJson, fmtVal } from './json-diff.js';

export { recordsMachine };

export const TREE = { name: 'tree' };
// `saveArtifact` builds a PATCH {url, init} for `Api.saveArtifact`'s real
// shape (backend/api/artefacts.py's patch_step_output: {value, if_version}
// body against /api/step/{run}/{step}/{record}, {value, version} on 200,
// 409 on a stale if_version -- also 409 while the run is still in
// progress, PATCH only ever applies to a terminal run). `null` here (this
// repo's own fixture demo has no writable backend) means Save mutates
// status.data locally instead of firing a fetch -- same "no urls ->
// local-optimistic" convention ui/issues.js's status changes established,
// also used by ui/browse.js's own saveFile default.
export const FIXTURE_URLS = { artifact: (path) => `/content/records/artifact/${path}.json`, saveArtifact: null,
  history: (path) => `/content/records/history/${path}.json` };
export const FIXTURE_RUN_ID = 'run-2026-09-11';   // matches content/records/run.json's own run.run_id

const NAV = ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'browse', 'query', 'annotate', 'profile'];

// Pure. steps = { <stepId>: {...}, ... } (only the keys matter here), recordIds
// = the run's own record_ids (the SAME list under every step in this v1 --
// see the header's "named-channel-only step" simplification). One dir node
// per step, children already populated: one file node per record, path
// `${stepId}/${recordId}`, no `children` key (matches filetree's file-node
// convention, checked against ui/filetree.js).
//
// `filterText` (issue: "no tree 'Filter steps & records...' search field")
// keeps a step iff the step id OR at least one of its record ids contains it
// (case-insensitive); a kept step's OWN children are narrowed to just the
// matching records (or every record, if the STEP id itself is what matched).
// While filtering, a kept step force-opens (there's no point matching a step
// whose records stay hidden behind a collapsed folder) -- `prevNodes` (this
// tree's own nodes from the call before) supplies each step's open state the
// rest of the time, the same "read forward from whatever the last render
// left" trick ui/table.js's own sort/window carry-over uses, so a manual
// expand/collapse survives an unrelated rebuild (a filter keystroke, or a
// fresh run.loaded) without this pure function needing its own open-state
// bookkeeping. A step DROPPED entirely by a filter (no match anywhere) loses
// its open state along with it -- there's nothing left to carry it on, so it
// reverts to the default (closed) if it reappears once the filter clears.
function buildNodes(steps, recordIds, filterText, prevNodes) {
  const q = (filterText || '').trim().toLowerCase();
  const prevOpen = new Map((prevNodes || []).map(n => [n.path, n.open]));
  const nodes = [];
  for (const stepId of Object.keys(steps)) {
    const stepMatches = !q || stepId.toLowerCase().includes(q);
    const records = stepMatches ? recordIds : recordIds.filter(recId => recId.toLowerCase().includes(q));
    if (q && !records.length) continue;   // neither the step nor any of its records match -- drop it
    nodes.push({
      name: stepId, path: stepId, kind: 'dir',
      open: q ? true : (prevOpen.get(stepId) ?? false),
      loading: false, error: null,
      children: records.map(recId => ({ name: recId, path: `${stepId}/${recId}`, kind: 'file' })),
    });
  }
  return nodes;
}

// Pure. status.data at mount: nothing loaded, tree empty (no run metadata
// yet). `pendingSel` (?sel=/?step_id=+?record_id= deep-link, ground-truth
// parity -- OLD read the same params) is a "step/record" path to restore
// once run.loaded actually knows the tree shape; run.loaded below both
// expands that step and starts the SAME detail fetch a real click would.
export function initialData(runId, pendingSel = null) {
  return { runId, runMeta: null, allSteps: {}, filterText: '',
    [TREE.name]: filetreeInit(TREE, []), pendingSel,
    detail: null, detailLoading: false, error: null,
    editText: '', saveMsg: '', diffMode: false, history: null };
}

const withData = (s, patch) => ({ ...s, data: { ...s.data, ...patch } });
const reset = (s) => ({ status: withData(s, { error: null }) });

// Pure. The detail response is a bare value or { value, version } (view()'s
// adapter already handles both) -- this pulls just the text a Save needs to
// parse back, same JSON-pretty-print detailBody (ui/browse.js) already does.
function editTextFor(detail) {
  return detailBody({ format: 'json', content: JSON.stringify(detail && detail.value !== undefined ? detail.value : detail) });
}

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
      // A newly-selected record starts its own fresh diff/history state --
      // yesterday's "Diff" toggle/backups don't belong to today's record.
      const next = withData(r.status, { detail: null, detailLoading: true, diffMode: false, history: null });
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
      const nodes = buildNodes(steps, recordIds, s.data.filterText, null);
      let tree = { ...filetreeInit(TREE, []), nodes };
      // ?sel=/?step_id=(+?record_id=) deep-link restore (initialData's own
      // `pendingSel`) -- only consumed ONCE, here, then cleared: a step_id
      // alone just expands that step's folder, step_id+record_id ALSO
      // preselects it and starts the same detail fetch a real click would.
      const pending = s.data.pendingSel;
      let detailLoading = false;
      const effects = [];
      if (pending) {
        const [stepId, recId] = String(pending).split('/');
        if (steps[stepId] != null) {
          tree = { ...tree, nodes: tree.nodes.map(n => (n.path === stepId ? { ...n, open: true } : n)) };
          if (recId && recordIds.includes(recId)) {
            tree = { ...tree, sel: pending };
            detailLoading = true;
            effects.push({ fetch: urls.artifact(pending), ok: 'detail.loaded', err: 'detail.failed' });
          }
        }
      }
      return { status: withData(s, { runMeta: run, allSteps: steps, [TREE.name]: tree, pendingSel: null, detailLoading }), effects };
    },
    'run.failed': (s, p) => ({ status: withData(s, { error: p && p.error }) }),
    ...selectingTree(urls),
    // payload = whatever the fixture/real endpoint returns -- a bare value or
    // { value, version }, not assumed which (view()'s adapter handles both,
    // same "wrapped" check the ground truth's own loadArtifact() makes).
    'detail.loaded': (s, p) => ({ status: withData(s, { detail: p, detailLoading: false, editText: editTextFor(p), saveMsg: '' }) }),
    'detail.failed': (s, p) => ({ status: withData(s, { detailLoading: false, error: p && p.error }) }),
    'detail-editor.input': (s, p) => ({ status: withData(s, { editText: (p && p.value) ?? '' }) }),
    // Tree filter/search (issue: "Filter steps & records..."): re-derives
    // nodes from `allSteps` (the raw map, not the tree) -- same "no re-fetch
    // needed for a client-side filter" reasoning ui/issues.js's own
    // filterText/buildMaster keeps allIssues for.
    'tree-filter.input': (s, p) => {
      const filterText = (p && p.value) ?? '';
      const recordIds = (s.data.runMeta && s.data.runMeta.record_ids) || [];
      const nodes = buildNodes(s.data.allSteps, recordIds, filterText, s.data[TREE.name].nodes);
      return { status: withData(s, { filterText, [TREE.name]: { ...s.data[TREE.name], nodes } }) };
    },
    // Diff (issue: "no diff view against pre-edit history"): toggles the
    // detail panel between the editor and a read-only structural diff
    // (ui/json-diff.js) against the PATCH handler's own pre-edit backup
    // (GET .../history, at most one entry worth showing -- see that route's
    // own "oldest+newest, capped" doc). Gated to version > 1 (view() below
    // disables the button otherwise) -- version 1 has no pre-edit backup to
    // diff against by construction. History is fetched once per record and
    // cached in `history` (cleared on a new tree selection, selectingTree
    // above) -- toggling Diff off and back on again re-uses it, no re-fetch.
    'btn-diff.click': (s) => {
      const d = s.data;
      if (!d.detail || !(d.detail.version > 1)) return { status: s };
      if (d.diffMode) return { status: withData(s, { diffMode: false }) };
      if (d.history) return { status: withData(s, { diffMode: true }) };
      const t = d[TREE.name];
      return {
        status: withData(s, { diffMode: true, history: { loading: true, error: null, entries: [] } }),
        effects: [{ fetch: urls.history(String(t.sel)), ok: 'history.loaded', err: 'history.failed' }],
      };
    },
    'history.loaded': (s, p) => ({ status: withData(s, { history: { loading: false, error: null, entries: (p && p.history) || [] } }) }),
    'history.failed': (s, p) => ({ status: withData(s, { history: { loading: false, error: (p && p.error) || 'failed to load history', entries: [] } }) }),
    // "Re-run..." (issue: absent entirely): a plain cross-page link, same
    // shape nav.go/theme.toggle already use -- this file has no idea what
    // graph.html's own URL looks like, the CONSUMER's onEmit builds
    // `graph.html?run=&select=` from the payload (mirrors how ui/list.js's
    // `run.open` -> records.html?run_id= cross-link already works).
    'btn-rerun.click': (s) => {
      const t = s.data[TREE.name];
      if (t.sel == null) return { status: s };
      return { status: s, effects: [{ emit: 'rerun.open', payload: { run_id: s.data.runId, stepId: String(t.sel).split('/')[0] } }] };
    },
    // Save: the run must be terminal and the record selected -- both already
    // guaranteed by how this screen gets here (v1 has no "run in progress"
    // path at all), so the only real client-side guard is that the typed
    // text is still valid JSON (the backend stores a real parsed value, not
    // a string -- patch_step_output's own `new_value: Any`).
    'btn-save.click': (s) => {
      const d = s.data;
      if (!d.detail) return { status: s, effects: [] };
      let value;
      try { value = JSON.parse(d.editText); }
      catch (e) { return { status: withData(s, { saveMsg: `Save failed: invalid JSON (${e.message})` }), effects: [] }; }
      const t = d[TREE.name];
      if (!urls.saveArtifact) {
        const version = (d.detail && d.detail.version != null ? d.detail.version : 0) + 1;
        return { status: withData(s, { detail: { value, version }, editText: editTextFor({ value, version }), saveMsg: 'Saved (local)' }) };
      }
      const [stepId, recordId] = String(t.sel).split('/');
      const { url, init } = urls.saveArtifact(d.runId, stepId, recordId, value, d.detail && d.detail.version);
      return { status: withData(s, { saveMsg: 'Saving…' }), effects: [{ fetch: url, init, ok: 'save.ok', err: 'save.err' }] };
    },
    'save.ok': (s, p) => ({ status: withData(s, { detail: p, editText: editTextFor(p), saveMsg: 'Saved' }) }),
    'save.err': (s, p) => ({ status: withData(s, { saveMsg: `Save failed: ${(p && p.body && p.body.error) || (p && p.error) || 'error'}` }) }),
    'btn-refresh.click': reset,
    'btn-retry.click': reset,
    'btn-theme.click': (s) => ({ status: s, effects: [{ emit: 'theme.toggle' }] }),
    ...Object.fromEntries(NAV.map(to => [`nav-${to}.click`, (s) => ({ status: s, effects: [{ emit: 'nav.go', payload: { to } }] })])),
    'brand.click': (s) => ({ status: s, effects: [{ emit: 'nav.go', payload: { to: 'dashboard' } }] }),
  };
}

export const handlers = makeHandlers(FIXTURE_URLS);   // this repo's own default export

const RETRY = { name: 'btn-retry', box: 'row, mid, packed, pad:2, solid, rounded', content: 'Retry' };

// Pure. A tiny label/value pair for the inspect panel -- stacked, not a row
// (list.js/dashboard.js's fieldRow puts label+value side by side, but that's
// too cramped for a real pipeline name in a 160px-wide column).
const inspectRow = (label, value) => ({ box: 'stack, gap:0, hug',
  children: [{ box: 'hug', content: label }, { box: 'hug', content: String(value ?? '—') }] });

// Pure. `d.history.entries[0]` (the newest backup = the pre-edit state) vs
// the current value, rendered as plain +/−/~ marked lines -- same format
// the OLD ground truth's renderDiffRows used (fmtVal's own 120-char cap,
// capped at 400 rows here too; a real diff blowing past that is its own
// signal something's off, not something to render in full).
const DIFF_MARK = { added: '+', removed: '−', changed: '~' };
function diffRowText(r) {
  const shown = r.kind === 'changed' ? `${fmtVal(r.oldV)}  →  ${fmtVal(r.newV)}` : fmtVal(r.kind === 'removed' ? r.oldV : r.newV);
  return `${DIFF_MARK[r.kind]} ${r.path}  ${shown}`;
}
function diffContent(d) {
  const h = d.history;
  if (!h || h.loading) return 'Loading history…';
  if (h.error) return `No history for this artifact -- ${h.error}`;
  if (!h.entries.length) return 'No history for this artifact -- backups appear once the output has been edited.';
  const prev = h.entries[0];
  const rows = diffJson(prev.value, d.detail.value);
  const headline = { box: 'hug', content: `v${prev.version ?? '?'} (${prev.ts})  →  v${d.detail.version} (current)` };
  if (!rows.length) return [headline, { box: 'hug', content: 'No differences.' }];
  return [headline, ...rows.slice(0, 400).map(r => ({ box: 'hug', content: diffRowText(r) })),
    ...(rows.length > 400 ? [{ box: 'hug', content: `… ${rows.length - 400} more` }] : [])];
}

// Pure. status -> { name: patch }. Object.entries order = paint order:
// content-level slots first, tree row patches last.
export function view(s) {
  const d = s.data;
  const t = d[TREE.name];
  const loading = s.state === 'loading';
  const selPath = t && t.sel != null ? t.sel : null;
  // Generic, schema-agnostic metadata about the SELECTION -- deliberately not
  // per-record-type field splitting (session_nr/speaker_name/etc, only known
  // for THIS run's step types), which the header comment already scopes out
  // of v1 (no diff views), same discipline.
  const [stepId, recordId] = selPath ? selPath.split('/') : [null, null];
  const version = d.detail && d.detail.version != null ? d.detail.version : null;
  // "v3 - edited" (issue: "version shown only as a plain row, no callout") --
  // v1 has no pre-edit backup by construction (nothing to have edited FROM),
  // so only version > 1 earns the "edited" callout.
  const versionBadge = version != null ? ` · v${version}${version > 1 ? ' (edited)' : ''}` : '';
  const tagEntries = d.detail && d.detail.tags && typeof d.detail.tags === 'object' ? Object.entries(d.detail.tags) : [];
  const patches = {
    'crumb-page': 'Records',
    'status-text': loading ? 'loading…' : s.state === 'error' ? `failed: ${d.error}` : `${d.runMeta ? d.runMeta.pipeline + ' · ' : ''}run ${d.runId}`,
    'detail-title': (selPath || 'Select a record') + versionBadge,
    'detail-body': { content: d.diffMode ? diffContent(d) : (d.detail ? detailEditor(d.editText) : (d.detailLoading ? 'Loading…' : 'Select a record')) },
    'btn-save': { state: d.detail ? 'actionable' : 'disabled' },
    'btn-diff': { content: d.diffMode ? 'Back' : 'Diff', state: version > 1 ? 'actionable' : 'disabled' },
    'btn-rerun': { state: selPath ? 'actionable' : 'disabled' },
    'tags-row': { content: tagEntries.map(([k, v]) => ({ extends: 'atom/chip', content: `${k}=${v}` })) },
    // filter-issues/fql established the same "a real field:'text' node only
    // ever comes from a view() patch" pattern (C2: screens/*.json's own
    // closed static-JSON vocabulary can't declare `field` itself).
    'tree-tools': { content: [{ name: 'tree-filter', box: 'fill, pad:1, solid, rounded', field: 'text', content: d.filterText }] },
    'save-msg': d.saveMsg || '',
    'inspect-body': selPath ? [
      inspectRow('Step', stepId),
      inspectRow('Record', recordId),
      inspectRow('Run', d.runId),
      ...(d.runMeta ? [inspectRow('Pipeline', d.runMeta.pipeline)] : []),
      ...(version != null ? [inspectRow('Version', version)] : []),
    ] : 'Select a record',
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
