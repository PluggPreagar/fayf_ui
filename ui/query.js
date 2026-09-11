// ui/query.js -- raw FQL query controller, L9 (C11). machines/query.json is
// the machine; handlers + view are pure; mountQuery only hands the already-
// rendered screens/query element to ui/machine.js. Ground truth reference
// (behaviour only, not code -- it's ui-kit/DOM): fayf_processor/frontend/
// query.js, 262 lines -- a textarea + optional run-scope selector + example-
// query chips + a results table, GET-only. Its own guided query-builder
// (dynamic From/Join/Where/Show/Group rows driven by Api.querySchema()) is
// deferred IN THE GROUND TRUTH ITSELF, not a v1 cut made here.
//
// ONE machine state (`ready`) -- no loading/error split, mirroring the ground
// truth's own tolerance: a failed runs-list fetch just keeps the page usable
// ("All runs"), and a QUERY failure is DATA (`data.error`), not a page mode.
//
// One table sub-controller (ui/table.js) rides on status.data.results, but
// UNLIKE every prior page (dashboard's RUNS/ISSUES, list's PIPELINES/RUNS,
// profile's SPEAKERS) its spec is NOT a fixed top-level constant -- a query's
// result columns vary per query (from the response's `columns` field, or
// derived from row keys, mirroring the ground truth's own `deriveColumns`).
// The spec is built fresh in the `query.loaded` handler and stored alongside
// the table's own status in `data.resultsSpec`; `results.click`/
// `results.scroll` look it up at call time (`tableHandlers` needs the SAME
// spec object that built the current `data.results`, per ui/table.js's own
// header contract -- there is no other way to give it one when it isn't a
// module-level constant).
//
// status.data = { runs, run, q, running, error, result, resultsSpec, results }
//   `run` = '' ("All runs") | a run_id -- single-select, like ui/profile.js's
//   run-picker chips but EXCLUSIVE (closer to a real <select>: clicking the
//   selected chip again clears it, clicking another replaces it outright,
//   never a toggle SET). `result` = the raw query response, kept whole;
//   `resultsSpec`/`results` are the table sub-controller's own slice, null
//   until a query actually runs (view() shows a prompt until then, mirroring
//   the ground truth's own "No query run yet.").
//
// Fixture-query-matching scheme (fixture-only concern, see FIXTURE_URLS.query
// below): free text can't be turned into a path, so the fixture URL is keyed
// off which EXAMPLE's exact query text `data.q` currently equals --
// `/content/query/result-<index>.json` for EXAMPLES[index], one level of
// indirection cheaper than tracking a separate `data.exampleIndex` since the
// example's own `q` string is already an exact, stable key. A query that
// doesn't match any EXAMPLES entry (free-typed, or an example whose own
// fixture file wasn't authored) falls back to `/content/query/result-none.json`,
// a path this repo deliberately does NOT ship -- the resulting 404 drives the
// machine's real `err` trigger (`query.failed`), the same "no fixture ->
// clean failure, not a crash" path a real API's own miss would take. A real
// consumer's `urls.query` needs none of this indexing:
//   (q, run) => '/api/query?q=' + encodeURIComponent(q) + (run ? '&run=' + encodeURIComponent(run) : '')
import queryMachine from '../machines/query.json' with { type: 'json' };
import { mountMachine } from './machine.js';
import { tableInit, tableHandlers, tableView } from './table.js';

export { queryMachine };

export const RUN_PICKER = 'run-picker';   // single-select chip toggle, like a checkbox but exclusive
export const EXAMPLES = [
  { label: 'reactions by party', q: 'reactions[party] > party' },
  { label: 'by expression', q: 'reactions[expression] > expression' },
  { label: 'who heckled', q: 'reactions[expression=Zuruf, party, person, utterance]' },
  { label: 'claim tenses', q: 'claims[tense] > tense' },
  { label: 'Zuruf x claim', q: 'reactions[expression=Zuruf] claims[tense, text]' },
  { label: 'future claims', q: 'claims[tense=Zukunft, subject, text]' },
];
const EXAMPLE_INDEX = (q) => EXAMPLES.findIndex(ex => ex.q === q);
export const FIXTURE_URLS = {
  runs: '/content/query/runs.json',
  // `run` is tacked on as a harmless `?run=` query string -- this repo's
  // static file server resolves the path and ignores the query string, so
  // the SAME fixture JSON is served either way (a real backend's own
  // urls.query, below, is what actually scopes by run); doing it this way
  // still makes the run selection visible on the actual fetch URL/effect,
  // rather than being silently dropped by the fixture layer.
  query: (q, run) => {
    const i = EXAMPLE_INDEX(q);
    const path = i >= 0 ? `/content/query/result-${i}.json` : '/content/query/result-none.json';
    return run ? `${path}?run=${encodeURIComponent(run)}` : path;
  },
};

const NAV = ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'settings'];
const RUN_PREFIX = `${RUN_PICKER}-`;
// screens/query.json's container slot MUST be named exactly 'example' (not
// 'examples') -- ui/machine.js's click routing matches a trigger by an exact
// ancestor NAME (`${n}.${ev}` in `known`), never a prefix; a single chip's
// own name ('example-0') never matches the 'example.click' trigger by
// itself, only the CONTAINER's name does, same as RUN_PICKER ('run-picker')
// above. Individual chips are 'example-<index>' -- EXAMPLE_PREFIX (used by
// the HANDLER's own p.path prefix search below) is a separate concern from
// the container/trigger name and must keep its trailing '-' so it never
// matches the container's own bare name.
const EXAMPLE_PREFIX = 'example-';
const RESULTS = { name: 'results' };   // fixed slot/table name; columns vary per query (see header)

// Pure. status.data at mount: no runs, no query run yet -- q seeded to the
// first example, same "always something typed" default the ground truth's
// own textarea ships with.
export function initialData() {
  return { runs: [], run: '', q: EXAMPLES[0].q, running: false, error: null,
    result: null, resultsSpec: null, results: null };
}

const withData = (s, patch) => ({ ...s, data: { ...s.data, ...patch } });
const asList = (p) => Array.isArray(p) ? p : [];

// Pure. `rows` -> column names in first-seen order, mirrors the ground
// truth's own `deriveColumns` (used only when a response omits `columns`).
export function deriveColumns(rows) {
  const seen = new Set(), cols = [];
  for (const row of rows || []) for (const k of Object.keys(row || {})) if (!seen.has(k)) { seen.add(k); cols.push(k); }
  return cols;
}
// Pure. Untrusted cell value -> display text (objects JSON.stringify'd,
// null/undefined -> '', mirrors the ground truth's own `cellText`).
export function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch (e) { return String(v); } }
  return String(v);
}

// Pure. A query response's rows/columns -> { spec, rows } for the results
// table sub-controller. `__i` = synthetic row index (table.js's rowKey).
function buildResults(payload) {
  const rows = asList(payload && payload.rows);
  const cols = (payload && payload.columns && payload.columns.length) ? payload.columns : deriveColumns(rows);
  const spec = { name: RESULTS.name, rowKey: '__i', columns: cols.map(c => ({ key: c, label: c })) };
  const built = rows.map((row, i) => {
    const out = { __i: i };
    for (const c of cols) out[c] = cellText(row[c]);
    return out;
  });
  return { spec, rows: built };
}

function runQuery(s, urls) {
  const q = String(s.data.q || '').trim();
  if (!q || s.data.running) return { status: s };
  return {
    status: withData(s, { running: true, error: null }),
    effects: [{ fetch: urls.query(s.data.q, s.data.run), ok: 'query.loaded', err: 'query.failed' }],
  };
}

// Pure. (status, payload) -> { status, effects? }
export function makeHandlers(urls = FIXTURE_URLS) {
  return {
    'runs.loaded': (s, p) => ({ status: withData(s, { runs: asList(p) }) }),
    'runs.failed': (s) => ({ status: s }),   // tolerate silently -- page stays scoped to "All runs" (ground truth parity)

    [`${RUN_PICKER}.click`]: (s, p) => {
      const hit = ((p && p.path) || []).find(n => n.startsWith(RUN_PREFIX));
      if (!hit) return { status: s };
      const id = hit.slice(RUN_PREFIX.length);
      return { status: withData(s, { run: s.data.run === id ? '' : id }) };
    },
    'example.click': (s, p) => {
      const hit = ((p && p.path) || []).find(n => n.startsWith(EXAMPLE_PREFIX));
      if (!hit) return { status: s };
      const i = Number(hit.slice(EXAMPLE_PREFIX.length));
      const ex = EXAMPLES[i];
      if (!ex) return { status: s };
      return runQuery(withData(s, { q: ex.q }), urls);   // set the text AND run it, ground-truth parity
    },
    'fql.input': (s, p) => ({ status: withData(s, { q: (p && p.value) ?? '' }) }),
    'btn-run.click': (s) => runQuery(s, urls),

    'query.loaded': (s, p) => {
      if (p && p.error) return { status: withData(s, { error: p.error, result: null, running: false }) };
      const { spec, rows } = buildResults(p);
      return { status: withData(s, {
        result: p, resultsSpec: spec, results: tableInit(spec, rows), running: false, error: null }) };
    },
    'query.failed': (s, p) => ({ status: withData(s, { running: false, error: (p && p.error) || 'request failed' }) }),

    // The table sub-controller's spec is dynamic (see header) -- can't spread
    // tableHandlers(SOME_CONSTANT) at makeHandlers()-build time, so these two
    // triggers look the current spec up from status at call time instead.
    // Guarded: the results slot renders a prompt string (no table) until a
    // query has actually run, so resultsSpec is null and these can't yet
    // fire from a real click -- see ui/table.js's own header contract (same
    // spec object that built data.results must be the one passed back in).
    'results.click': (s, p) => {
      const spec = s.data.resultsSpec;
      return spec ? tableHandlers(spec)[`${spec.name}.click`](s, p) : { status: s };
    },
    'results.scroll': (s, p) => {
      const spec = s.data.resultsSpec;
      return spec ? tableHandlers(spec)[`${spec.name}.scroll`](s, p) : { status: s };
    },

    'btn-refresh.click': (s) => ({ status: s, effects: [{ fetch: urls.runs, ok: 'runs.loaded', err: 'runs.failed' }] }),
    'btn-theme.click': (s) => ({ status: s, effects: [{ emit: 'theme.toggle' }] }),
    ...Object.fromEntries(NAV.map(to => [`nav-${to}.click`, (s) => ({ status: s, effects: [{ emit: 'nav.go', payload: { to } }] })])),
  };
}

export const handlers = makeHandlers(FIXTURE_URLS);   // this repo's own default export

const runChip = (r) => ({ name: `${RUN_PICKER}-${r.run_id}`, extends: 'atom/chip', content: r.run_id });
const exampleChip = (ex, i) => ({ name: `${EXAMPLE_PREFIX}${i}`, extends: 'atom/chip', content: ex.label });

// Pure. `d` = status.data -- mirrors the ground truth's own `subLine()`.
function statusText(d) {
  if (d.running) return 'Running…';
  if (d.error) return d.error;
  const r = d.result;
  if (!r) return 'Enter an FQL query and run it.';
  const shown = (r.rows || []).length;
  if (r.grouped) return `${shown} group${shown === 1 ? '' : 's'} · ${r.total} rows`;
  const capped = r.total > shown ? ` — showing first ${shown}` : '';
  return `${r.total} match${r.total === 1 ? '' : 'es'}${capped}`;
}

// Pure. status -> { name: patch }. Object.entries order = paint order:
// content-level slots first, chip/table row patches last.
export function view(s) {
  const d = s.data;
  const patches = {
    'crumb-page': 'Query',
    'status-text': statusText(d),
    // The FQL box has to be a real <input>/<textarea> (field:'textarea'), and
    // parts_validate_test.js's closed static-JSON key vocabulary (C2) doesn't
    // allow `field` in screens/query.json itself -- same reason
    // ui/list.js's `start-record-id` field is never in screens/list.json
    // either. `fql-row` is the plain static container; the field node named
    // `fql` (matching the `fql.input` trigger) is built here and nested into
    // it via a content patch, same "field only ever comes from a view()
    // patch" pattern list.js's detailBody() established.
    'fql-row': { content: [{ name: 'fql', box: 'fill, pad:1, solid, rounded', field: 'textarea', content: d.q }] },
    'btn-run': { content: d.running ? 'Running…' : 'Run query', state: d.running ? 'disabled' : 'actionable' },
    [RUN_PICKER]: { content: d.runs.map(runChip) },
    'example': { content: EXAMPLES.map(exampleChip) },
  };
  for (const r of d.runs) patches[`${RUN_PICKER}-${r.run_id}`] = { state: d.run === r.run_id ? 'selected' : 'actionable' };
  EXAMPLES.forEach((ex, i) => { patches[`${EXAMPLE_PREFIX}${i}`] = { state: d.q === ex.q ? 'selected' : 'actionable' }; });
  if (d.error) {
    patches[RESULTS.name] = d.error;
  } else if (!d.results) {
    patches[RESULTS.name] = 'No query run yet.';
  } else {
    const tv = tableView(d.resultsSpec, d.results);
    // slot patch before row/col patches (re-assigning keeps a key's position)
    patches[RESULTS.name] = tv[RESULTS.name];
    Object.assign(patches, tv);
  }
  return patches;
}

// Browser. `root` = the already-rendered screens/query element.
export function mountQuery(root, reg, opts = {}) {
  return mountMachine(root, root, queryMachine, makeHandlers(opts.urls || FIXTURE_URLS), { reg, view, data: initialData(), ...opts });
}
