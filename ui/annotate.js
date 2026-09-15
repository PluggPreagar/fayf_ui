// ui/annotate.js -- Session -> Rede -> paragraph/sentence drill-down +
// per-sentence coverage badge + record panel (take-over/delete/re-run/
// export), L9 (C11). machines/annotate.json is the machine; handlers + view
// are pure; mountAnnotate only hands the already-rendered screens/annotate
// element to ui/machine.js.
//
// Ground truth reference (behaviour only, not code -- it's ui-kit/DOM):
// fayf_processor/frontend/annotate.js, 986 lines (EPIC-17), stories
// 17.1-17.6. This file now covers:
//   - STORY-17.1: session/Rede pickers, paragraph jump-list, per-sentence
//     coverage badges (unchanged from the original v1 pass).
//   - STORY-17.2: the record panel -- accepted/triage suggestions for the
//     selected sentence with an idempotent "Uebernehmen" take-over, plus the
//     full record list for the Rede.
//   - STORY-17.4: single-record delete, no edit-mode gate required.
//   - STORY-17.5: "Neuer Satz" -- re-run the LLM judgment for the selected
//     sentence; fresh candidates append to the suggestion list (never
//     replace), take-over works the same as any other candidate.
//   - STORY-17.6: gold export + validation findings, replacing the panel
//     with errors/warnings until "Zurueck" is clicked.
//   All four reuse the SAME generic artifact-PATCH mechanism ui/records.js's
//   Save already established (backend/api/artefacts.py's patch_step_output,
//   `record-annotate/<recordId>` is just another step output) -- no new
//   save path, matching the ground truth's own `Api.saveArtifact` reuse.
//
//   OUT of scope -- still deliberately deferred, not "dropped" the way a
//   KISS cut is; a genuinely larger, separate, not-yet-designable feature:
//     - the slot-form editor: closed-vocabulary Select fields for
//       schicht/typ/agent/praedikat/objekt/etc. (STORY-17.3) -- this repo's
//       `field` escape hatch (render.js/machine.js) only knows 'text' and
//       'textarea' today, no 'select'; a real dropdown control (native
//       <select>, cross-field-dependent options -- typ gated by schicht,
//       objekt reshaping into two selects when praedikat is BEWERTET) is a
//       separate, later C9 design decision, not improvised inside this pass.
//     - D4 anchor-mode (clicking text to set a record's src while editing)
//       -- has no consumer without the slot-form editor above (there is no
//       "open for editing" state in this pass), so it stays out with it.
//     - manual record creation (UC4) -- ground truth's own "Manuell" button
//       creates an all-slots-empty stub whose only purpose is to then be
//       filled in via the slot-form editor; without that editor a manually
//       created record can never be completed, so it would be a dead end,
//       not a real feature (no half-finished affordance added on purpose).
//
// Two pure utility functions are ported LOGIC-only (not code -- the ground
// truth is ui-kit/DOM, ineligible for direct reuse) from the ground truth's
// own `coverageSets`/`badgeFor`: same algorithm, same `"P<i>/S<j>"` id
// scheme (meaningful notation, kept identical on purpose). Likewise
// `padId`/`nextLocalId` (take-over id assignment) and the triage
// stub-building in `takeTriageStub` port the ground truth's own
// `nextLocalId`/`chooseTriage` logic verbatim. This repo's box model has no
// hover-tooltip mechanism for arbitrary text (unlike the ground truth's
// `tip`/data-tip) -- the tooltip is dropped, a plain-text legend covers it
// instead (v1 simplification, noted again at the legend itself).
//
// TREE is a flat paragraph jump-list (a plain array of rows built here in
// view(), like ui/query.js's chip rows) -- NOT a ui/tree.js or
// ui/filetree.js sub-controller instance; there is no group/open/select
// shape here, just "click a paragraph -> emit its index". Sentence rows are
// likewise plain, unnamed-EXCEPT-for-routing rows built inline in view() --
// each carries a `sentence-P<i>/S<j>` name purely so the shared `sentences`
// container's delegated click can route to it (ui/machine.js's own
// path/target payload), same "container owns the trigger, row name carries
// the address" pattern ui/table.js/ui/browse.js already use.
//
// status.data = { runs, runId, recordIds, recordId, segment, annotate,
//                  annotateVersion, selectedPs, freshSuggestions,
//                  annotatedBy, exportResult, panelMsg,
//                  loading: { segment, annotate }, error }
//   `segment`/`annotate` are each independently loaded (two parallel
//   fetches on a Rede pick, no shared "flow.ready" gate like dashboard.js's
//   three-fetch loading state) -- the tree/text panel render as soon as
//   `segment` arrives; badges upgrade once `annotate` also arrives. A failed
//   `annotate` fetch is NOT fatal (mirrors the ground truth's own
//   `state.annotate || { records: [], l3: [], skips: [] }` default) -- every
//   sentence just shows "offen" via coverageSets({})'s own empty fallback.
//   A failed `runs`/`rede` fetch is tolerated silently too (ground truth
//   parity: toast-and-continue: this repo has no toast mechanism, so
//   `panelMsg` -- a plain status-line string, not a toast -- covers the
//   panel-scoped failures (suggest/export/save) that need SOME feedback).
//   `selectedPs`/`freshSuggestions`/`exportResult`/`annotatedBy`/`panelMsg`
//   all reset on a new session/Rede pick, same as `segment`/`annotate`.
//
// DOM side-effect note: a tree row click can't itself scroll (a pure handler
// has no DOM access, C11) -- it only emits `paragraph.jump` with the
// paragraph index; the actual `scrollIntoView` is the PAGE's job via
// `onEmit`, same "DOM side-effects the machine can't itself do" reasoning
// ui/browse.js's consumer-level nav already established.
import annotateMachine from '../machines/annotate.json' with { type: 'json' };
import { mountMachine } from './machine.js';

export { annotateMachine };

export const SESSION_PICKER = 'session-picker';
export const REDE_PICKER = 'rede-picker';
export const TREE = 'tree';   // paragraph jump-list, NOT a filetree/tree.js instance -- a flat list of paragraphs, built inline in view() like query.js's chip rows, no sub-controller needed
// `saveAnnotate`/`suggest`/`exportGold` build `{url, init}` for a real
// mutating fetch (same shape ui/records.js's own `saveArtifact` builder
// uses) -- `null` here means the fixture demo has no writable backend / no
// real LLM / no real file-write, so the handlers below fall back to a local,
// deterministic result instead of firing a fetch (same "no urls -> local-
// optimistic" convention ui/records.js's Save and ui/issues.js's status
// changes already established).
export const FIXTURE_URLS = {
  runs: '/content/annotate/runs.json',
  run: (runId) => `/content/annotate/run-${runId}.json`,
  segment: (runId, recordId) => `/content/annotate/segment-${runId}-${recordId}.json`,
  annotate: (runId, recordId) => `/content/annotate/coverage-${runId}-${recordId}.json`,
  saveAnnotate: null,
  suggest: null,
  exportGold: null,
};

const NAV = ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'browse', 'query', 'annotate', 'profile'];
const SESSION_PREFIX = `${SESSION_PICKER}-`;
const REDE_PREFIX = `${REDE_PICKER}-`;
const TREE_PREFIX = `${TREE}-P`;

// Pure. status.data at mount: nothing loaded, nothing picked.
export function initialData() {
  return { runs: [], runId: null, recordIds: [], recordId: null, segment: null, annotate: null,
    annotateVersion: null, selectedPs: null, freshSuggestions: null, annotatedBy: '',
    exportResult: null, panelMsg: '',
    loading: { segment: false, annotate: false }, error: null };
}

const withData = (s, patch) => ({ ...s, data: { ...s.data, ...patch } });
const asList = (p) => Array.isArray(p) ? p : [];
// Artifact-shaped responses may come wrapped ({value, version}) or bare --
// same adapter idiom ui/records.js's detail handling already established.
const wrapped = (p) => (p && typeof p === 'object' && 'value' in p) ? p.value : p;
// Fields to clear on a new session/Rede pick -- the record panel's whole
// working set belongs to whichever Rede is currently open.
const PANEL_RESET = { selectedPs: null, freshSuggestions: null, annotatedBy: '', exportResult: null, panelMsg: '' };

// ---- coverage (ported LOGIC from fayf_processor/frontend/annotate.js's
// coverageSets/badgeFor -- see this file's header) ----
// ann = { records: [{src:[...]}], l3: [{src}], skips: [{src:[...]}] }
// (records/l3/skips may be missing/empty).
export function coverageSets(ann) {
  const recordSrc = {}, l3Src = {}, skipSrc = {};
  (ann.records || []).forEach(r => (r.src || []).forEach(s => { recordSrc[s] = true; }));
  (ann.l3 || []).forEach(m => { l3Src[m.src] = true; });
  (ann.skips || []).forEach(sk => (sk.src || []).forEach(s => { skipSrc[s] = true; }));
  return { recordSrc, l3Src, skipSrc };
}
// ps = "P<paragraph-index>/S<sentence-index>", e.g. "P0/S3" -- matches the
// ground truth's own id scheme exactly (meaningful notation, kept identical).
export function badgeFor(ps, sets) {
  if (sets.recordSrc[ps]) return { label: '✓', tip: 'Record erfasst' };
  if (sets.skipSrc[ps]) return { label: 's', tip: 'Übersprungen (Skip)' };
  if (sets.l3Src[ps]) return { label: '⚠', tip: 'Nur Triage-Markierung (L3), noch kein Record' };
  return { label: '·', tip: 'Offen — noch nicht bearbeitet' };
}

// ---- record panel (STORY-17.2/17.4/17.5) ----------------------------------

// Records whose `src` list includes `ps` (src is a LIST -- more than one
// accepted record per sentence is possible, several claims in one sentence).
function acceptedAt(annotate, ps) {
  return ((annotate && annotate.records) || []).filter(r => (r.src || []).includes(ps));
}
// Triage entries at `ps`, keeping each entry's index into the FULL triage
// array (not the filtered position) -- that index is what `panel.click`
// below decodes back, so it must stay stable regardless of which sentence
// is selected.
function triageAt(annotate, ps) {
  const out = [];
  ((annotate && annotate.triage) || []).forEach((entry, idx) => { if (entry.src === ps) out.push({ idx, entry }); });
  return out;
}
// "Neuer Satz" results (STORY-17.5): one suggest_frame response's
// `suggestions` array, each `{records, l3, triage}` -- flattened into one
// indexable list (ground truth's own freshCandidatesFor), tagged by kind so
// panelClick knows which stub-builder to use. Pure/deterministic given the
// same `freshSuggestions` -- view() and panelClick recompute it identically.
function freshFlat(freshSuggestions) {
  const out = [];
  (freshSuggestions || []).forEach(block => {
    (block.records || []).forEach(record => out.push({ kind: 'record', record }));
    (block.triage || []).forEach(entry => out.push({ kind: 'triage', entry }));
  });
  return out;
}

// <CODE>-<nn>, 2-digit zero-padded minimum (ported verbatim from the ground
// truth's own padId/nextLocalId) -- scans every record for the given code
// regardless of annotation_status, ids must stay unique across the whole file.
function padId(code, n) { let s = String(n); while (s.length < 2) s = '0' + s; return `${code}-${s}`; }
function nextLocalId(records, code) {
  let max = 0;
  (records || []).forEach(r => {
    const m = /^([A-Za-z0-9]+)-(\d+)$/.exec(r.id || '');
    if (m && m[1] === code) max = Math.max(max, parseInt(m[2], 10));
  });
  return padId(code, max + 1);
}
// Take-over of a triage entry (STORY-17.2's chooseTriage, ported verbatim):
// APPENDS a deliberately incomplete stub -- never removes/replaces the
// accepted record(s) already at the same src. Fills only the ONE slot the
// entry names (never a '?' slot -- that goes into anmerkung instead);
// annotation_status "manuell" signals the (deferred) slot-form editor would
// still need to complete it.
function takeTriageStub(entry, records, speakerCode) {
  const code = (speakerCode || 'REC').toUpperCase();
  const note = `aus Triage übernommen (${entry.grund || '(kein Grund)'})`;
  const stub = { id: nextLocalId(records, code), src: [entry.src], annotation_status: 'manuell' };
  if (entry.slot && entry.slot !== '?' && entry.vorschlag !== undefined) { stub[entry.slot] = entry.vorschlag; stub.anmerkung = note; }
  else if (entry.vorschlag !== undefined) { stub.anmerkung = `${note}; Vorschlag (Slot unklar): ${entry.vorschlag}`; }
  else { stub.anmerkung = note; }
  return stub;
}

// Every record-panel mutation funnels through here: `urls.saveAnnotate` real
// -> PATCH the artifact (same `/api/step/{run}/record-annotate/{recordId}`
// route ui/records.js's own Save already uses); `null` (fixture demo, no
// writable backend) -> update `annotate` locally, bumping a synthetic
// version, same "no urls -> local-optimistic" convention ui/records.js's
// Save falls back to.
function patchAnnotate(s, urls, nextValue) {
  const d = s.data;
  if (!urls.saveAnnotate) {
    return { status: withData(s, { annotate: nextValue, annotateVersion: (d.annotateVersion || 0) + 1, panelMsg: '' }), effects: [] };
  }
  const { url, init } = urls.saveAnnotate(d.runId, d.recordId, nextValue, d.annotateVersion);
  return { status: withData(s, { panelMsg: 'Saving…' }), effects: [{ fetch: url, init, ok: 'save.ok', err: 'save.err' }] };
}

// Pure. Decodes a `panel.click` payload's path into exactly one of the four
// row actions (confirm/delete/take-triage/take-fresh) and builds the next
// `annotate` value -- a no-op {status:s} if nothing recognizable is in path
// (mirrors every other name-prefix router in this repo, e.g. ui/table.js's
// pager, ui/browse.js's node clicks).
function panelClick(s, p, urls) {
  const d = s.data;
  const path = (p && p.path) || [];
  const hit = (prefix) => path.find(n => n.startsWith(prefix));

  // "Zurück zur Rede" (STORY-17.6): the export-findings row rendered INSIDE
  // the same `panel` container (no separate always-visible button, mirrors
  // the ground truth's own showExportFindings reusing ref.textHost) -- so
  // this, too, arrives as a `panel.click` and must be checked before the
  // `!d.annotate` guard below (findings only ever show once annotate is
  // already loaded, but there is no reason to couple the two).
  if (hit('panel-export-back')) return { status: withData(s, { exportResult: null }) };

  if (!d.annotate) return { status: s };
  const confirmId = hit('panel-confirm-');
  if (confirmId) {
    const recordId = confirmId.slice('panel-confirm-'.length);
    // Never downgrades a record already further along (editiert/manuell) --
    // matches ground truth's chooseAccepted; re-clicking an already-
    // confirmed candidate is a harmless no-op PATCH (idempotent).
    const nextRecords = d.annotate.records.map(r => (r.id === recordId && r.annotation_status === 'vorgeschlagen')
      ? { ...r, annotation_status: 'bestaetigt' } : r);
    return patchAnnotate(s, urls, { ...d.annotate, records: nextRecords });
  }

  const deleteId = hit('panel-delete-');
  if (deleteId) {
    const recordId = deleteId.slice('panel-delete-'.length);
    const nextRecords = d.annotate.records.filter(r => r.id !== recordId);
    return patchAnnotate(s, urls, { ...d.annotate, records: nextRecords });
  }

  const triageHit = hit('panel-take-triage-');
  if (triageHit) {
    const idx = Number(triageHit.slice('panel-take-triage-'.length));
    const entry = (d.annotate.triage || [])[idx];
    if (!entry) return { status: s };
    const stub = takeTriageStub(entry, d.annotate.records, d.annotate.speaker_code);
    return patchAnnotate(s, urls, { ...d.annotate, records: [...(d.annotate.records || []), stub] });
  }

  const freshHit = hit('panel-take-fresh-');
  if (freshHit) {
    const idx = Number(freshHit.slice('panel-take-fresh-'.length));
    const c = freshFlat(d.freshSuggestions)[idx];
    if (!c) return { status: s };
    if (c.kind === 'record') {
      // Take-over of a fresh RECORD candidate (chooseFresh, ported): assigns
      // a fresh id, starts at "vorgeschlagen" (same status any seeded
      // suggestion starts at) -- and clears freshSuggestions afterward so
      // the just-chosen candidate stops appearing twice (once as the new
      // accepted record, once as its own now-stale "neu" listing).
      const code = (d.annotate.speaker_code || 'REC').toUpperCase();
      const stub = { ...c.record, id: nextLocalId(d.annotate.records, code), annotation_status: 'vorgeschlagen' };
      const r = patchAnnotate(s, urls, { ...d.annotate, records: [...(d.annotate.records || []), stub] });
      return { status: withData(r.status, { freshSuggestions: null }), effects: r.effects };
    }
    // 'triage': same stub-building as a plain triage take-over -- ground
    // truth's chooseTriage handles both shapes identically and, unlike
    // chooseFresh, does NOT clear freshSuggestions (kept here for parity).
    const stub = takeTriageStub(c.entry, d.annotate.records, d.annotate.speaker_code);
    return patchAnnotate(s, urls, { ...d.annotate, records: [...(d.annotate.records || []), stub] });
  }

  return { status: s };
}

// Pure. (status, payload) -> { status, effects? }
export function makeHandlers(urls = FIXTURE_URLS) {
  return {
    'runs.loaded': (s, p) => ({ status: withData(s, { runs: asList(p) }) }),
    'runs.failed': (s) => ({ status: s }),   // tolerate silently -- no toast mechanism here, stays an empty list (known gap, ground truth toasts)

    [`${SESSION_PICKER}.click`]: (s, p) => {
      const hit = ((p && p.path) || []).find(n => n.startsWith(SESSION_PREFIX));
      if (!hit) return { status: s };
      const id = hit.slice(SESSION_PREFIX.length);
      const runId = s.data.runId === id ? null : id;   // clicking the same session again clears it (single-select, exclusive, like ui/query.js's RUN_PICKER)
      const next = withData(s, { runId, recordId: null, recordIds: [], segment: null, annotate: null, annotateVersion: null,
        loading: { segment: false, annotate: false }, error: null, ...PANEL_RESET });
      if (runId == null) return { status: next };
      return { status: next, effects: [{ fetch: urls.run(runId), ok: 'rede.loaded', err: 'rede.failed' }] };
    },
    'rede.loaded': (s, p) => ({ status: withData(s, { recordIds: (p && p.run && p.run.record_ids) || [] }) }),
    'rede.failed': (s) => ({ status: withData(s, { recordIds: [] }) }),

    [`${REDE_PICKER}.click`]: (s, p) => {
      const hit = ((p && p.path) || []).find(n => n.startsWith(REDE_PREFIX));
      if (!hit) return { status: s };
      const id = hit.slice(REDE_PREFIX.length);
      const recordId = s.data.recordId === id ? null : id;   // single-select, exclusive
      if (recordId == null) {
        return { status: withData(s, { recordId: null, segment: null, annotate: null, annotateVersion: null,
          loading: { segment: false, annotate: false }, error: null, ...PANEL_RESET }) };
      }
      const next = withData(s, { recordId, segment: null, annotate: null, annotateVersion: null,
        loading: { segment: true, annotate: true }, error: null, ...PANEL_RESET });
      // Parallel, independent (see header) -- unlike dashboard.js's 3-fetch
      // gate, there is no single "flow.ready" moment: the tree/text render
      // as soon as segment lands, badges upgrade separately once annotate lands.
      return { status: next, effects: [
        { fetch: urls.segment(s.data.runId, id), ok: 'segment.loaded', err: 'segment.failed' },
        { fetch: urls.annotate(s.data.runId, id), ok: 'annotate.loaded', err: 'annotate.failed' },
      ] };
    },

    'segment.loaded': (s, p) => ({ status: withData(s, { segment: wrapped(p), loading: { ...s.data.loading, segment: false } }) }),
    'segment.failed': (s, p) => ({ status: withData(s, { loading: { ...s.data.loading, segment: false }, error: p && p.error }) }),
    // annotateVersion (STORY-17.2's PATCH guard) comes off the same wrapped
    // response -- a bare (unwrapped) payload has no version, stays null.
    'annotate.loaded': (s, p) => ({ status: withData(s, { annotate: wrapped(p),
      annotateVersion: (p && typeof p === 'object' && p.version != null) ? p.version : null,
      loading: { ...s.data.loading, annotate: false } }) }),
    // Missing coverage data isn't fatal: the text panel just shows every
    // sentence as "offen" via coverageSets({})'s own empty-object fallback
    // (mirrors the ground truth's own `state.annotate || {records:[],l3:[],skips:[]}`).
    'annotate.failed': (s) => ({ status: withData(s, { loading: { ...s.data.loading, annotate: false } }) }),

    // Paragraph jump-list click: a pure handler can't scroll (C11) -- it only
    // emits the index; the page's onEmit does the real scrollIntoView.
    [`${TREE}.click`]: (s, p) => {
      const hit = ((p && p.path) || []).find(n => n.startsWith(TREE_PREFIX));
      if (!hit) return { status: s };
      const index = Number(hit.slice(TREE_PREFIX.length));
      return { status: s, effects: [{ emit: 'paragraph.jump', payload: { index } }] };
    },

    // Sentence row click (STORY-17.2, Task 17.2.3 parity): selects a
    // sentence for the record panel. `sentences` is the container's own
    // registered trigger (mirrors `tree.click`) -- individual rows carry a
    // `sentence-P<i>/S<j>` name purely for routing, matched here via path.
    // A paragraph-header row carries no such name, so clicking one is a
    // silent no-op (falls through to `if (!hit)`), same as any other
    // unnamed/unmatched click inside a delegated container.
    'sentences.click': (s, p) => {
      const hit = ((p && p.path) || []).find(n => n.startsWith('sentence-'));
      if (!hit) return { status: s };
      const ps = hit.slice('sentence-'.length);
      // A fresh suggestion belongs to the sentence it was requested for --
      // switching to a different sentence must not leak it into the new
      // one (ground truth: "don't leak into a new sentence").
      const freshSuggestions = s.data.selectedPs === ps ? s.data.freshSuggestions : null;
      return { status: withData(s, { selectedPs: ps, freshSuggestions, panelMsg: '' }) };
    },

    // Record panel click (take-over/confirm/delete) -- one shared container,
    // routed by name prefix on the clicked row (same "container owns the
    // trigger, row name carries the address" pattern ui/table.js/
    // ui/browse.js already use for their own row actions).
    'panel.click': (s, p) => panelClick(s, p, urls),

    // "Neuer Satz" (STORY-17.5, UC3): re-run the LLM judgment for exactly
    // the selected sentence. A no-op without a selection (mirrors the
    // ground truth's `enabled: () => !!state.selectedPs` command gate --
    // view() also disables the button in that state, this is the handler's
    // own defense-in-depth). Results are APPENDED via freshSuggestions, never
    // auto-applied -- taking one over still goes through panel.click like
    // any other candidate.
    'btn-suggest.click': (s) => {
      const d = s.data;
      if (!d.selectedPs) return { status: s };
      if (!urls.suggest) {
        // Fixture demo has no real LLM -- one canned, deterministic
        // suggestion so the take-over flow is still exercisable.
        const canned = [{ records: [{ typ: 'aussage', praedikat: 'IST', quelle: 'SPEAKER' }], l3: [], triage: [] }];
        return { status: withData(s, { freshSuggestions: canned, panelMsg: '' }) };
      }
      const { url, init } = urls.suggest(d.runId, d.recordId, d.selectedPs);
      return { status: withData(s, { panelMsg: 'Requesting a fresh suggestion…' }),
        effects: [{ fetch: url, init, ok: 'suggest.ok', err: 'suggest.err' }] };
    },
    'suggest.ok': (s, p) => ({ status: withData(s, { freshSuggestions: (p && p.suggestions) || [], panelMsg: '' }) }),
    'suggest.err': (s, p) => ({ status: withData(s, { panelMsg: `Neuer Vorschlag fehlgeschlagen: ${(p && p.error) || 'error'}` }) }),

    // PATCH round-trip ok/err (STORY-17.2/17.4's saveAnnotate/patchAnnotate,
    // below) -- only reachable when `urls.saveAnnotate` is real; the
    // fixture/local branch never fires these, it updates `annotate` inline.
    'save.ok': (s, p) => ({ status: withData(s, {
      annotate: (p && typeof p === 'object' && 'value' in p) ? p.value : p,
      annotateVersion: (p && typeof p === 'object' && p.version != null) ? p.version : s.data.annotateVersion,
      panelMsg: '' }) }),
    'save.err': (s, p) => ({ status: withData(s, { panelMsg: `Speichern fehlgeschlagen: ${(p && p.error) || 'error'}` }) }),

    // "Annotiert von" free-text input feeding Export (STORY-17.6) -- same
    // plain `field:"text"` escape hatch ui/records.js's editor/ui/table.js's
    // filter already use, no dialog primitive needed.
    'annotated-by.input': (s, p) => ({ status: withData(s, { annotatedBy: (p && p.value) ?? '' }) }),

    // Gold export + validation (STORY-17.6, UC7): renders + validates a
    // gold-Entwurf from the CURRENT record-annotate state. The Entwurf is
    // allowed to be imperfect (ground truth's F5) -- a coverage gap or slot
    // error still gets written, `exportResult.errors/warnings` just report
    // it; `view()` swaps the panel to show them until "Zurück" is clicked.
    'btn-export.click': (s) => {
      const d = s.data;
      const name = (d.annotatedBy || '').trim();
      if (!name) return { status: withData(s, { panelMsg: 'Bitte einen Namen angeben.' }) };
      if (!urls.exportGold) {
        return { status: withData(s, { exportResult: { path: '(local demo -- no file written)', errors: [], warnings: [] }, panelMsg: '' }) };
      }
      const { url, init } = urls.exportGold(d.runId, d.recordId, name);
      return { status: withData(s, { panelMsg: 'Exporting…' }), effects: [{ fetch: url, init, ok: 'export.ok', err: 'export.err' }] };
    },
    'export.ok': (s, p) => ({ status: withData(s, { exportResult: p, panelMsg: '' }) }),
    'export.err': (s, p) => ({ status: withData(s, { panelMsg: `Export fehlgeschlagen: ${(p && p.error) || 'error'}` }) }),

    'btn-refresh.click': (s) => ({ status: s, effects: [{ fetch: urls.runs, ok: 'runs.loaded', err: 'runs.failed' }] }),
    'btn-theme.click': (s) => ({ status: s, effects: [{ emit: 'theme.toggle' }] }),
    ...Object.fromEntries(NAV.map(to => [`nav-${to}.click`, (s) => ({ status: s, effects: [{ emit: 'nav.go', payload: { to } }] })])),
    'brand.click': (s) => ({ status: s, effects: [{ emit: 'nav.go', payload: { to: 'dashboard' } }] }),
  };
}

export const handlers = makeHandlers(FIXTURE_URLS);   // this repo's own default export

// A child run's own id names nothing a user would recognize -- label it
// against its parent instead (ground truth parity, load()'s own runOptions
// mapping in fayf_processor/frontend/annotate.js).
const sessionChip = (r) => ({ name: `${SESSION_PICKER}-${r.run_id}`, extends: 'atom/chip',
  content: r.parent_run_id ? `${r.parent_run_id} → ${r.pipeline} (Kind-Lauf)` : r.run_id });
const redeChip = (id) => ({ name: `${REDE_PICKER}-${id}`, extends: 'atom/chip', content: id });

function statusText(d) {
  if (!d.runId) return `${d.runs.length} session${d.runs.length === 1 ? '' : 's'}`;
  if (!d.recordId) return `${d.runId} · pick a Rede`;
  return `${d.runId} · ${d.recordId}`;
}

// Pure. paragraphs -> jump-list rows "P<i> <covered>/<total>" -- covered
// counts a sentence once it has EITHER a record or a skip (mirrors the
// ground truth's own fillTree, which does not count an L3-only marker as
// "covered" -- L3 is a triage hint, not a resolved unit).
function treeRows(paragraphs, sets) {
  return paragraphs.map((p, pi) => {
    const covered = p.sentences.filter((s, si) => sets.recordSrc[`P${pi}/S${si}`] || sets.skipSrc[`P${pi}/S${si}`]).length;
    return { name: `${TREE}-P${pi}`, box: 'row, mid, packed, pad:1, hug', content: `P${pi} ${covered}/${p.sentences.length}` };
  });
}

// Pure. Every paragraph's sentences, badge glyph first. `badgesReady` false
// (data.annotate still loading) -> a neutral placeholder glyph, never blocks
// the text itself (ground truth parity: text shows immediately, badges catch up).
function sentenceRows(paragraphs, sets, badgesReady) {
  const out = [];
  paragraphs.forEach((p, pi) => {
    out.push({ box: 'hug', content: `Absatz P${pi}` });
    p.sentences.forEach((s, si) => {
      const ps = `P${pi}/S${si}`;
      const badge = badgesReady ? badgeFor(ps, sets).label : '…';
      out.push({ name: `sentence-${ps}`, box: 'row, mid, gap:1, clamp',
        children: [ { box: 'fixed, w:16', content: badge }, { box: 'fill', content: s.text } ] });
    });
  });
  return out;
}

// ---- record panel rows (STORY-17.2/17.4/17.5) ------------------------------

function summarizeRecord(r) {
  const parts = [r.typ, r.agent, r.praedikat, r.objekt].filter(Boolean);
  return parts.length ? parts.join(' ') : '(Slots noch leer)';
}
// Triage has two shapes (ground truth's summarizeTriage, ported): a rejected
// candidate carries vorschlag+slot (slot may be '?', the documented fallback
// when no quoted token was found); the "empty LLM answer" shape carries neither.
function summarizeTriage(entry) {
  const head = (entry.slot && entry.slot !== '?') ? `${entry.slot}: ${entry.vorschlag}`
    : (entry.vorschlag !== undefined ? `(Slot unklar): ${entry.vorschlag}` : '(kein Record extrahiert)');
  return `${head} — ${entry.grund || ''}`;
}
// One record row: summary + confirm/delete chips. "Übernehmen" on an
// already-confirmed record still renders (idempotent PATCH, ground truth
// parity) but relabels to "Bestätigt" so re-clicking reads as a no-op, not
// a live action.
function recordRow(r) {
  return { box: 'stack, gap:1, pad:1, hairline, rounded',
    children: [
      { box: 'hug', content: `${r.id}: ${summarizeRecord(r)} [${r.annotation_status || '?'}]` },
      { box: 'row, mid, gap:1, hug',
        children: [
          { name: `panel-confirm-${r.id}`, extends: 'atom/chip', content: r.annotation_status === 'vorgeschlagen' ? 'Übernehmen' : 'Bestätigt' },
          { name: `panel-delete-${r.id}`, extends: 'atom/chip', content: 'Löschen' } ] } ] };
}
// One triage/fresh-triage candidate row: summary + a single take-over chip
// (`name` is supplied by the caller -- `panel-take-triage-<idx>` for a plain
// triage entry, `panel-take-fresh-<i>` for a "Neuer Satz" one, same row shape).
function triageRow(entry, name, label = 'Triage') {
  return { box: 'stack, gap:1, pad:1, hairline, rounded',
    children: [
      { box: 'hug', content: `${label}: ${summarizeTriage(entry)}` },
      { name, extends: 'atom/chip', content: 'Übernehmen' } ] };
}
function freshRecordRow(record, name) {
  return { box: 'stack, gap:1, pad:1, hairline, rounded',
    children: [
      { box: 'hug', content: `neu: ${summarizeRecord(record)}` },
      { name, extends: 'atom/chip', content: 'Übernehmen' } ] };
}

// The `field:"text"` escape hatch is injected via a content-array patch, not
// declared statically in screens/annotate.json (mirrors ui/browse.js's own
// `detailEditor` -- a static screen node with `field` set trips
// test/node/parts_validate_test.js's reserved-key scan, which only ever
// walks the static registry/screens, never a runtime view() patch).
// `value` is `status.data.annotatedBy` itself, kept live by the
// `annotated-by.input` handler -- re-patching the SAME current value on
// every render is a no-op for the live DOM field, same as detailEditor's own
// editText round-trip.
function annotatedByField(value) {
  return [{ name: 'annotated-by', box: 'fill, pad:1, solid, rounded', field: 'text', content: value }];
}

// Pure. Full record-panel content: suggestions for the selected sentence
// (accepted/triage/fresh candidates, each with its own take-over chip) on
// top, the Rede's whole record list below -- mirrors the ground truth's
// fillPanel() layout (renderSuggestions then renderRecordRows), minus the
// (deferred) slot-form editor and its "Bearbeiten" toggle.
function panelRows(d) {
  const rows = [];
  const ann = d.annotate || { records: [], triage: [] };
  if (d.selectedPs) {
    const accepted = acceptedAt(ann, d.selectedPs);
    const triage = triageAt(ann, d.selectedPs);
    const flat = freshFlat(d.freshSuggestions);
    rows.push({ box: 'hug', content: `Vorschläge an ${d.selectedPs}` });
    if (!accepted.length && !triage.length && !flat.length) {
      rows.push({ box: 'hug', content: 'Keine Vorschläge für diesen Satz.' });
    }
    accepted.forEach(r => rows.push(recordRow(r)));
    triage.forEach(({ idx, entry }) => rows.push(triageRow(entry, `panel-take-triage-${idx}`)));
    flat.forEach((c, i) => rows.push(c.kind === 'record'
      ? freshRecordRow(c.record, `panel-take-fresh-${i}`)
      : triageRow(c.entry, `panel-take-fresh-${i}`, 'neu · Triage')));
  } else {
    rows.push({ box: 'hug', content: 'Satz wählen für Vorschläge.' });
  }
  rows.push({ box: 'hug', content: 'Alle Records dieser Rede' });
  const all = ann.records || [];
  if (!all.length) rows.push({ box: 'hug', content: 'Noch kein Record.' });
  all.forEach(r => rows.push(recordRow(r)));
  return rows;
}

// Pure. status -> { name: patch }. Object.entries order = paint order:
// content-level slots first, chip patches last.
export function view(s) {
  const d = s.data;
  const patches = {
    'crumb-page': 'Annotate',
    'status-text': statusText(d),
    'session-picker': { content: d.runs.map(sessionChip) },
    'rede-picker': d.runId ? { content: d.recordIds.map(redeChip) } : 'Pick a session first.',
  };
  for (const r of d.runs) patches[`${SESSION_PICKER}-${r.run_id}`] = { state: d.runId === r.run_id ? 'selected' : 'actionable' };
  if (d.runId) for (const id of d.recordIds) patches[`${REDE_PICKER}-${id}`] = { state: d.recordId === id ? 'selected' : 'actionable' };

  if (!d.segment) {
    patches['tree'] = 'Pick a Rede to see its paragraphs.';
    patches['sentences'] = 'Pick a Rede to see its text.';
  } else {
    const paragraphs = d.segment.content.paragraphs;
    const sets = coverageSets(d.annotate || { records: [], l3: [], skips: [] });
    patches['tree'] = { content: treeRows(paragraphs, sets) };
    patches['sentences'] = { content: sentenceRows(paragraphs, sets, !d.loading.annotate) };
  }

  // Record panel: gold-export findings (STORY-17.6) take over the whole
  // panel until "Zurück" is clicked; otherwise the normal suggestions +
  // record list (panelRows). "Neuer Satz" is disabled without a selected
  // sentence, "Export" without a seeded annotation to export.
  patches['btn-suggest'] = { state: d.selectedPs ? 'actionable' : 'disabled' };
  patches['btn-export'] = { state: d.annotate ? 'actionable' : 'disabled' };
  patches['annotated-by-host'] = { content: annotatedByField(d.annotatedBy) };
  patches['panel-msg'] = d.panelMsg || '';
  if (d.exportResult) {
    const rows = [{ name: 'panel-export-back', extends: 'atom/chip', content: '← Zurück zur Rede' }];
    if (!d.exportResult.errors.length && !d.exportResult.warnings.length) rows.push({ box: 'hug', content: 'Gültig — keine Befunde.' });
    d.exportResult.errors.forEach(e => rows.push({ box: 'hug', content: `Fehler: ${e}` }));
    d.exportResult.warnings.forEach(w => rows.push({ box: 'hug', content: `Hinweis: ${w}` }));
    rows.push({ box: 'hug', content: `→ ${d.exportResult.path}` });
    patches['panel'] = { content: rows };
  } else if (!d.segment) {
    patches['panel'] = 'Pick a Rede to see records.';
  } else {
    patches['panel'] = { content: panelRows(d) };
  }
  return patches;
}

// Browser. `root` = the already-rendered screens/annotate element.
export function mountAnnotate(root, reg, opts = {}) {
  return mountMachine(root, root, annotateMachine, makeHandlers(opts.urls || FIXTURE_URLS), { reg, view, data: initialData(), ...opts });
}
