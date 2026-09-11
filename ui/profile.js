// ui/profile.js -- per-speaker credibility profile controller, L9 (C11).
// machines/profile.json is the machine; handlers + view are pure;
// mountProfile only hands the already-rendered screens/profile element to
// ui/machine.js. Ground truth reference (behaviour only, not code -- it's
// ui-kit/DOM): fayf_processor/frontend/profile.js -- pick >= 2 finished
// runs, GET /api/profile, a speakers table, per-speaker detail (fenster
// window buckets + befunde/findings).
//
// One table sub-controller (ui/table.js) rides on status.data.speakers --
// same driver, own slice, talks via triggers + emit.
//
// Adaptations vs the ground truth (same result, different mechanics, per
// docs/superpowers/plans/2026-09-11-workspace-dashboard.md S6):
//   - run multi-select (ground truth: real <input type=checkbox> per run) ->
//     a toggle-chip list built INLINE here (not ui/table.js, which only does
//     single-select `sel`; not a new sub-controller either -- this is small
//     enough to be view/handler logic, same scale as ui/issues.js's 6 status
//     chips, just a dynamic-length list). ONE machine trigger
//     `run-picker.click` (self-transition) handles every row via `p.path`
//     prefix matching (`run-picker-<runId>`), same idiom ui/table.js's row
//     click / ui/tree.js's item click use -- toggling `data.picked[runId]`.
//   - "Fenster" (time-window) select (ground truth: a real <select>) -> 6
//     static chips, one per WINDOWS -- a fixed, small, statically-known
//     vocabulary (unlike run ids), so 6 real machine triggers is fine, same
//     as ui/issues.js's STATUSES-driven chip triggers.
//   - "Compute" enabled only when >= 2 runs picked -> the machine's own
//     trigger-presence guard can't express a DATA condition, so (same
//     technique ui/list.js's `starting` flag uses) the view adds an explicit
//     `state: 'disabled'` patch on btn-compute; the click handler also
//     no-ops in that case (belt and suspenders, same as ui/list.js's
//     start-run guard).
//
// status.data = { runs, picked, fenster, result, speakerId, computing,
//                  error, speakers: tableStatus }
//   `picked` = plain object map { [run_id]: true|false } -- no second key for
//   the runs list; `result` = the raw { sessions, profiles } response, kept
//   whole (the speakers table slice is a DERIVED view over `result.profiles`,
//   same "no second key for the same array" reasoning ui/dashboard.js applies
//   to ISSUES / ui/list.js applies to allRuns). A speaker's full record
//   (axes/fenster/befunde) is looked up back out of `result.profiles` by
//   `speakerId` when rendering detail -- no separate copy kept.
import profileMachine from '../machines/profile.json' with { type: 'json' };
import { mountMachine } from './machine.js';
import { tableInit, tableHandlers, tableView } from './table.js';

export { profileMachine };

export const SPEAKERS = { name: 'speakers', rowKey: 'id', columns: [
  { key: 'name', label: 'Speaker', w: 160 }, { key: 'party', label: 'Party', w: 70 },
  { key: 'sessions', label: 'Sessions', w: 70 }, { key: 'pairs', label: 'Pairs', w: 60 },
  { key: 'widerspricht', label: 'WIDERSPRICHT', w: 100 }, { key: 'konsistent', label: 'KONSISTENT', w: 90 } ] };
export const WINDOWS = ['wahlperiode', 'jahr', 'monat', 'woche', 'tag', 'jahrzehnt'];
export const FIXTURE_URLS = { profile: (ids) => `/content/profile/result-${ids.join('_')}.json` };

const NAV = ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'settings'];
const RUN_PICKER = 'run-picker';
const RUN_PREFIX = `${RUN_PICKER}-`;

// Pure. status.data at mount: nothing loaded, no runs picked, speakers table empty.
export function initialData() {
  return { runs: [], picked: {}, fenster: 'wahlperiode', result: null, speakerId: null,
    computing: false, error: null, [SPEAKERS.name]: tableInit(SPEAKERS, []) };
}

const withData = (s, patch) => ({ ...s, data: { ...s.data, ...patch } });
const asList = (p) => Array.isArray(p) ? p : [];
const reset = (s) => ({ status: withData(s, { error: null }) });   // refresh reloads RUNS only, keeps picked/result

// Pure. `result.profiles` (raw) -> rows for the speakers table -- SPEAKERS'
// own column keys, `id` = speaker_id (SPEAKERS.rowKey). The full profile
// record (axes/fenster/befunde) is looked back up from `result.profiles` by
// id when a row is selected, not duplicated here.
function speakerRows(result) {
  const profiles = (result && result.profiles) || [];
  return profiles.map(p => ({
    id: p.speaker_id, name: p.name, party: p.party || '—', sessions: p.sessions,
    pairs: p.paare_klassifiziert, widerspricht: p.axes.widerspruch.absolut, konsistent: p.axes.konstanz.konsistent,
  }));
}

// Speakers table handlers, wrapped: the table's own click keeps its slice +
// `emit` speakers.select; this wrapper ALSO sets data.speakerId from that
// row (same shape as ui/dashboard.js's `selecting()`).
function selectingSpeakers() {
  const h = tableHandlers(SPEAKERS);
  const click = h[`${SPEAKERS.name}.click`];
  return {
    ...h,
    [`${SPEAKERS.name}.click`]: (s, p) => {
      const r = click(s, p);
      const e = (r.effects || []).find(x => x.emit === `${SPEAKERS.name}.select`);
      return e ? { ...r, status: withData(r.status, { speakerId: e.payload.id }) } : r;
    },
  };
}

// Pure. (status, payload) -> { status, effects? }
export function makeHandlers(urls = FIXTURE_URLS) {
  return {
    'runs.loaded': (s, p) => {
      const runs = asList(p).filter(r => r.status === 'done')
        .sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
      return { status: withData(s, { runs }) };
    },
    'runs.failed': (s, p) => ({ status: withData(s, { error: p && p.error }) }),
    [`${RUN_PICKER}.click`]: (s, p) => {
      const hit = ((p && p.path) || []).find(n => n.startsWith(RUN_PREFIX));
      if (!hit) return { status: s };
      const id = hit.slice(RUN_PREFIX.length);
      return { status: withData(s, { picked: { ...s.data.picked, [id]: !s.data.picked[id] } }) };
    },
    ...Object.fromEntries(WINDOWS.map(w => [`fenster-${w}.click`, (s) => ({ status: withData(s, { fenster: w }) })])),
    'btn-compute.click': (s) => {
      const d = s.data;
      const ids = Object.keys(d.picked).filter(id => d.picked[id]);
      if (ids.length < 2 || d.computing) return { status: s };
      return {
        status: withData(s, { computing: true, error: null }),
        effects: [{ fetch: urls.profile(ids), ok: 'profile.loaded', err: 'profile.failed' }],
      };
    },
    'profile.loaded': (s, p) => ({ status: withData(s, {
      result: p, computing: false, speakerId: null, [SPEAKERS.name]: tableInit(SPEAKERS, speakerRows(p)) }) }),
    'profile.failed': (s, p) => ({ status: withData(s, { computing: false, error: p && p.error }) }),
    ...selectingSpeakers(),
    'btn-refresh.click': reset,
    'btn-retry.click': reset,
    'btn-theme.click': (s) => ({ status: s, effects: [{ emit: 'theme.toggle' }] }),
    ...Object.fromEntries(NAV.map(to => [`nav-${to}.click`, (s) => ({ status: s, effects: [{ emit: 'nav.go', payload: { to } }] })])),
  };
}

export const handlers = makeHandlers(FIXTURE_URLS);   // this repo's own default export

const RETRY = { name: 'btn-retry', box: 'row, mid, packed, pad:2, solid, rounded', content: 'Retry' };
const fieldRow = (label, value) => ({ box: 'row, gap:2, between, hug',
  children: [{ box: 'hug', content: label }, { box: 'hug', content: String(value ?? '') }] });

const runRow = (r) => ({ name: `${RUN_PICKER}-${r.run_id}`, box: 'row, mid, gap:1, pad:1, bare',
  children: [{ box: 'hug', content: r.run_id }, { box: 'hug', content: r.pipeline }, { box: 'hug', content: r.status }] });
const fensterChip = (w) => ({ name: `fenster-${w}`, extends: 'atom/chip', content: w });

// Pure. `profile` = one entry of result.profiles; `fenster` = the CURRENTLY
// selected window granularity -- the content array for detail-body.
function speakerBody(profile, fenster) {
  const rows = [
    fieldRow('Sessions', profile.sessions),
    fieldRow('Pairs (paare_klassifiziert)', profile.paare_klassifiziert),
    fieldRow('Widerspruch', profile.axes.widerspruch.absolut),
    fieldRow('Unerklärt', profile.axes.widerspruch.unerklaert),
    fieldRow('Konsistent', profile.axes.konstanz.konsistent),
    fieldRow('Pos. geändert', profile.axes.konstanz.position_geaendert),
    fieldRow('Seit', profile.min_date),
    fieldRow('Claims total', profile.claims_total),
  ];
  const buckets = (profile.fenster && profile.fenster[fenster]) || {};
  const keys = Object.keys(buckets);
  rows.push({ box: 'hug', content: `Fenster (${fenster})` });
  if (keys.length) {
    for (const k of keys) {
      const b = buckets[k];
      rows.push(fieldRow(k, `${b.paare} paare · ${b.WIDERSPRICHT} widerspr. · rate ${b.rate_widerspruch}`));
    }
  } else {
    rows.push({ box: 'hug', content: 'no buckets for this window' });
  }
  rows.push({ box: 'hug', content: 'Befunde' });
  if (!profile.befunde.length) {
    // Honesty rule carried from the ground truth (stability.py, CW8): "0
    // gefunden" (nothing classified) must not look identical to "nichts
    // vergleichbar" (nothing to compare) -- this line renders even at 0,
    // same as the row itself still appearing in the speakers table.
    rows.push({ box: 'hug', content: 'Keine klassifizierten Paare für diese Person.' });
  } else {
    for (const f of profile.befunde) {
      rows.push({ box: 'hug', content: `${f.relation}: ${f.date_a} → ${f.date_b} (${f.erklaerung_status})` });
      rows.push({ box: 'hug', content: `A: ${f.belege.a.claim}  (${f.belege.a.run})` });
      rows.push({ box: 'hug', content: `B: ${f.belege.b.claim}  (${f.belege.b.run})` });
    }
  }
  rows.push({ box: 'hug', content: `Faktenlage (${profile.axes.faktenlage.stufen.join(' > ')}): ${profile.axes.faktenlage.hinweis}` });
  return rows;
}

// Pure. status -> { name: patch }. Object.entries order = paint order:
// content-level slots first, row-level patches (run-picker/fenster/speakers) last.
export function view(s) {
  const d = s.data;
  const loading = s.state === 'loading';
  const pickedCount = Object.values(d.picked).filter(Boolean).length;
  const patches = {
    'crumb-page': 'Profile',
    'status-text': loading ? 'loading…' : s.state === 'error' ? `failed: ${d.error}` : `${d.runs.length} runs available`,
    'btn-compute': { content: d.computing ? 'Computing…' : 'Profile berechnen',
      state: (pickedCount < 2 || d.computing) ? 'disabled' : 'actionable' },
    'detail-title': 'Detail',
    'detail-body': 'Select a speaker',
  };
  if (loading) {
    patches[RUN_PICKER] = { content: [], state: 'loading' };
    patches['fenster'] = { content: [] };
    patches[SPEAKERS.name] = { content: [], state: '' };
  } else if (s.state === 'error') {
    patches[RUN_PICKER] = { content: [RETRY], state: '' };
    patches['btn-retry'] = { state: 'error' };
    patches['fenster'] = { content: [] };
    patches[SPEAKERS.name] = { content: [], state: '' };
  } else {
    patches[RUN_PICKER] = { content: d.runs.map(runRow) };
    patches['fenster'] = { content: WINDOWS.map(fensterChip) };
    for (const r of d.runs) patches[`${RUN_PICKER}-${r.run_id}`] = { state: d.picked[r.run_id] ? 'selected' : 'actionable' };
    for (const w of WINDOWS) patches[`fenster-${w}`] = { state: w === d.fenster ? 'selected' : 'actionable' };
    if (!d.result) {
      patches[SPEAKERS.name] = 'Pick at least two runs, then compute.';
    } else {
      const sv = tableView(SPEAKERS, d[SPEAKERS.name]);
      patches[SPEAKERS.name] = sv[SPEAKERS.name];
      Object.assign(patches, sv);
      const profile = d.result.profiles.find(p => p.speaker_id === d.speakerId) || null;
      if (profile) {
        patches['detail-title'] = profile.name;
        patches['detail-body'] = speakerBody(profile, d.fenster);
      }
    }
  }
  return patches;
}

// Browser. `root` = the already-rendered screens/profile element.
export function mountProfile(root, reg, opts = {}) {
  return mountMachine(root, root, profileMachine, makeHandlers(opts.urls || FIXTURE_URLS), { reg, view, data: initialData(), ...opts });
}
