// ui/annotate.js -- Session -> Rede -> paragraph/sentence drill-down +
// per-sentence coverage badge, L9 (C11). machines/annotate.json is the
// machine; handlers + view are pure; mountAnnotate only hands the
// already-rendered screens/annotate element to ui/machine.js.
//
// Ground truth reference (behaviour only, not code -- it's ui-kit/DOM):
// fayf_processor/frontend/annotate.js, 986 lines (EPIC-17). That file's own
// header says: "Read-only in this story: coverage badge per sentence
// (Record/Skip/Triage-only/offen) ... this is a progress hint only" --
// describing STORY-17.1, the file's ORIGINAL scope, before 5 more stories
// (17.2-17.6) bolted record editing on top. THIS FILE IS EXACTLY THAT
// ORIGINAL STORY-17.1 SCOPE, nothing more:
//   IN scope:  pick a session (run), pick a Rede (speech) within it, see a
//              paragraph-level jump-list (coverage count per paragraph) + a
//              text panel showing every sentence with its coverage badge.
//              Read-only.
//   OUT of scope -- all deliberately deferred, not "dropped" the way a KISS
//   cut is; each is a genuinely larger, separate, not-yet-designable feature:
//     - the record/suggestion panel + "Uebernehmen" take-over (STORY-17.2)
//     - the slot-form editor: closed-vocabulary Select fields for
//       schicht/typ/agent/praedikat/objekt/etc. (STORY-17.3) -- needs a real
//       form controller, `ui/form.js`, which does not exist in this repo yet;
//       this is a separate, later C9 design decision, not improvised here
//     - D4 anchor-mode (clicking text to set a record's src while editing)
//     - record delete (STORY-17.4)
//     - "Neuer Satz" fresh-suggestion LLM re-run (STORY-17.5)
//     - gold export + validation findings (STORY-17.6)
//
// Two pure utility functions are ported LOGIC-only (not code -- the ground
// truth is ui-kit/DOM, ineligible for direct reuse) from the ground truth's
// own `coverageSets`/`badgeFor`: same algorithm, same `"P<i>/S<j>"` id
// scheme (meaningful notation, kept identical on purpose). This repo's box
// model has no hover-tooltip mechanism for arbitrary text (unlike the ground
// truth's `tip`/data-tip) -- the tooltip is dropped, a plain-text legend
// covers it instead (v1 simplification, noted again at the legend itself).
//
// TREE is a flat paragraph jump-list (a plain array of rows built here in
// view(), like ui/query.js's chip rows) -- NOT a ui/tree.js or
// ui/filetree.js sub-controller instance; there is no group/open/select
// shape here, just "click a paragraph -> emit its index".
//
// status.data = { runs, runId, recordIds, recordId, segment, annotate,
//                  loading: { segment, annotate }, error }
//   `segment`/`annotate` are each independently loaded (two parallel
//   fetches on a Rede pick, no shared "flow.ready" gate like dashboard.js's
//   three-fetch loading state) -- the tree/text panel render as soon as
//   `segment` arrives; badges upgrade once `annotate` also arrives. A failed
//   `annotate` fetch is NOT fatal (mirrors the ground truth's own
//   `state.annotate || { records: [], l3: [], skips: [] }` default) -- every
//   sentence just shows "offen" via coverageSets({})'s own empty fallback.
//   A failed `runs`/`rede` fetch is tolerated silently too (ground truth
//   parity: toast-and-continue: this repo has no toast mechanism, so it is a
//   genuine known gap, not a redesign).
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
export const FIXTURE_URLS = {
  runs: '/content/annotate/runs.json',
  run: (runId) => `/content/annotate/run-${runId}.json`,
  segment: (runId, recordId) => `/content/annotate/segment-${runId}-${recordId}.json`,
  annotate: (runId, recordId) => `/content/annotate/coverage-${runId}-${recordId}.json`,
};

const NAV = ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'settings'];
const SESSION_PREFIX = `${SESSION_PICKER}-`;
const REDE_PREFIX = `${REDE_PICKER}-`;
const TREE_PREFIX = `${TREE}-P`;

// Pure. status.data at mount: nothing loaded, nothing picked.
export function initialData() {
  return { runs: [], runId: null, recordIds: [], recordId: null, segment: null, annotate: null,
    loading: { segment: false, annotate: false }, error: null };
}

const withData = (s, patch) => ({ ...s, data: { ...s.data, ...patch } });
const asList = (p) => Array.isArray(p) ? p : [];
// Artifact-shaped responses may come wrapped ({value, version}) or bare --
// same adapter idiom ui/records.js's detail handling already established.
const wrapped = (p) => (p && typeof p === 'object' && 'value' in p) ? p.value : p;

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
      const next = withData(s, { runId, recordId: null, recordIds: [], segment: null, annotate: null,
        loading: { segment: false, annotate: false }, error: null });
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
        return { status: withData(s, { recordId: null, segment: null, annotate: null,
          loading: { segment: false, annotate: false }, error: null }) };
      }
      const next = withData(s, { recordId, segment: null, annotate: null,
        loading: { segment: true, annotate: true }, error: null });
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
    'annotate.loaded': (s, p) => ({ status: withData(s, { annotate: wrapped(p), loading: { ...s.data.loading, annotate: false } }) }),
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

    'btn-refresh.click': (s) => ({ status: s, effects: [{ fetch: urls.runs, ok: 'runs.loaded', err: 'runs.failed' }] }),
    'btn-theme.click': (s) => ({ status: s, effects: [{ emit: 'theme.toggle' }] }),
    ...Object.fromEntries(NAV.map(to => [`nav-${to}.click`, (s) => ({ status: s, effects: [{ emit: 'nav.go', payload: { to } }] })])),
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
      out.push({ box: 'row, mid, gap:1, hug',
        children: [ { box: 'fixed, w:16', content: badge }, { box: 'hug', content: s.text } ] });
    });
  });
  return out;
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
  return patches;
}

// Browser. `root` = the already-rendered screens/annotate element.
export function mountAnnotate(root, reg, opts = {}) {
  return mountMachine(root, root, annotateMachine, makeHandlers(opts.urls || FIXTURE_URLS), { reg, view, data: initialData(), ...opts });
}
