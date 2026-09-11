# Plan — workspace + dashboard on fayf_ui (TODO-9, C11)

**Aim.** One framework. fayf_ui = shape (boxes/paths/skins/inspector) + behaviour
(L9 controllers). fayf_processor = stub: screen refs · machine JSON · pure handlers ·
API glue. First target: the workspace shell + dashboard. Then page by page.

**Given.** luna skin ✓ · thw.js/quiz.js (proto-controllers) ✓ · vendoring pin ✓ ·
Embed both ways ✓ (TODO-189/190) · C11 amendment drafted (this round).

**Ground truth to replace** (processor `dashboard.js`, 214 lines):
Shell regions `head · menu · tree · detail · status` · NAV 9 items · Sections
"At a glance" (4 counts) · "Recent runs" (DataTable) · "Issues" (DataTable) ·
Commands `refresh · theme` · data = GET `/api/runs` `/api/pipelines` `/api/issues`.

## Steps — each shippable, tested, screenshot luna + wireframe

| S | what | where | form | proof |
|---|---|---|---|---|
| S0 | C11 amendment + ladder L9 | CONSTITUTION.md · CLAUDE.md | text | user review, commit |
| S1 ✓ | **machine controller** `ui/machine.js` — `step(machine, status, trigger, handlers) → {status, effects}` (pure) + `mountMachine(root, screen, machine, handlers, reg)` (binds `<data-name>.<event>`, runs effects `fetch/emit/timer`, re-renders slots from `status`) | fayf_ui | JS + `machines/*.json` schema in `vocabulary.json` | node: step + effects; browser: quiz re-based on a machine JSON, same tests green |
| S2 ✓ | **shell screen** `screens/shell.json` — regions as named slots: `ws-head` · `side-panel` (nav rail, `atom/nav-item` + `.bx-selected`) · `content` · `detail` · `status-bar`. THW's missing ws-head/side-panel land here, luna skin | fayf_ui | JSON | gallery invariant, C10 checklist, luna/wireframe shots |
| S3 ✓ | **table controller** `ui/table.js` — rows JSON → `stack` of `row`s, cells `fixed w`; windowed (`scroll` box, visible slice), sort, select → trigger `<name>.select`. Columns = part `component/table` | fayf_ui | JS + JSON | node: window math (2000 rows → ≤ 40 boxes); browser: sort/select/scroll |
| S4 ✓ | **dashboard screen** `screens/dashboard.json` = `extends screens/shell` + content: `at-a-glance` (4 `atom/chip` counts), `recent-runs` (table slot), `issues` (table slot); `machines/dashboard.json` (states `loading · ready · error`; effects 3× fetch); fixture `content/dashboard/*.json` | fayf_ui | JSON | gallery, node machine test, browser table tests |
| S5 | **processor stub** `frontend/fayf/dashboard.html` (~60 lines): screen refs · machine JSON · handlers (`status-dot` map, `e2e-deploy-` filter, counts) · effect targets `/api/…`. `fayf-skin.css`: luna aliases for repo tokens. Re-vendor pin | processor | HTML + JSON + handlers.js | `?test=1` parity with `dashboard.js` (counts, rows, nav, commands); old page kept as `dashboard-kit.html` until S6 done |
| S6 | **page by page** issues ✓ → list ✓ → browse ✓ (filetree ctrl) → records ✓ (filetree ctrl, reused) / run ✓ (new `stream` SSE effect) → profile ✓ → query ✓ (dynamic per-query table spec) → annotate ✓ (STORY-17.1 only, drill-down + coverage; full record editing deferred, needs `ui/form.js`) → graph last via `Embed` | both | | each: parity test, old page removed, nav points to new |

## Controller set (C11: one file each, no more)

| ctrl | status shape | triggers in | effects out | first consumer |
|---|---|---|---|---|
| machine | `{state, data}` | `<name>.<event>`, effect results | fetch · emit · timer | quiz (S1), dashboard (S4) |
| table | `{rows, sort, sel, window}` | header.click · row.click · scroll | emit `select` | dashboard (S3) |
| tree | `{nodes, open, sel}` | node.click · caret.click | emit `select` | browse (S6) |
| form | `{fields, dirty, errors}` | field.input · save.click | emit `submit` | records/run (S6) |
| layer | `{stack}` | open · close · esc | — | issues dialog (S6) |

## Rules carried from ui-kit (port, not copy)

- Commands = triggers with a name; `enabled(status)` = machine guard.
- sync/invalidate = re-render the smallest slot whose status changed (`diff` on status).
- Live polling = `timer` effect → `fetch` effect → trigger.
- Untrusted text → `content` (textContent). Never innerHTML.

## Not in this plan

- graph canvas (drag/zoom/wires) — Embed, decide after S6.
- inspector save-back (POST screen JSON).
- retiring `ui-kit.js` — only after the last page moved.

## Decisions taken (C9)

- Migration order: workspace + dashboard first, then page by page (user, 2026-09-11).
- Generic controllers in fayf_ui; consumers config + pure handlers only (user; challenged, holds with the pure-handler + Embed rules → C11).
- Controllers = L9 above screens, not L4 (they consume L8; C5 stays intact).
- Elm-style effects (user, 2026-09-11): handler returns `{status, effects}`; controller runs
  `fetch · emit · timer`; result = next trigger. Rejected: handler-side fetch (untestable).
- Sub-controllers = same driver on a sub-status, own machine JSON; talk via triggers/`emit`.
  No observer channel — lazy load = `node.expand` → `fetch` → `children.loaded`.

## Machine JSON — shape (S1 contract)

```json
{ "initial": "loading",
  "states": {
    "loading": { "enter": [ { "fetch": "/api/runs", "ok": "runs.loaded", "err": "runs.failed" } ],
                 "runs.loaded": "ready", "runs.failed": "error" },
    "ready":   { "refresh.click": "loading" },
    "error":   { "retry.click": "loading" } } }
```

- states = keys of `states`. No separate list (redundant). Transition target not a key → error (C2).
- `initial` explicit — C8 order-independent; key order never carries meaning.
- `states[s][trigger]` = next state. Handler `handlers[trigger](status, payload)` runs first, may add effects.
- `states[s].enter` = effects on every entry (start and re-entry from another state). Triggers carry a dot → no collision.
  A self-transition (`x.loaded: "loading"`) is a stay, not an entry: handler runs, `enter` does not
  (S4: three parallel fetches collect in `loading` without re-firing; same rule as the epoch below).
- effect kinds: `fetch {url, ok, err}` · `emit {trigger, payload}` (to parent) · `timer {ms, trigger}`
  · `send {trigger, payload}` (self, synchronous: a handler picks the transition, the table stays static).
- async effects belong to the state entry that started them; a result after leaving that state is dropped.
- inert trigger (known, not in the current state) = full no-op, handler not run.
- `root` = reserved trigger name for the mounted element. Guard disables controls only (trigger
  elements without trigger elements inside); surfaces never.
- view patch: `string | node | [node] | { content?, env?, state? }`; state tokens absolute per paint:
  `actionable selected correct wrong readonly loading error disabled hidden`.
- repaint morphs: same name + dials → element updated in place (identity, focus, refs survive).
- `<name>.scroll` trigger = the element's viewport matters: metrics delivered on every clientHeight
  change after a paint (first paint, resize, content arrival), then on real scroll events.
- sub-controller pattern (table): `tableInit` into `status.data[name]`, `...tableHandlers(spec)` into
  handlers, `<name>.click`/`<name>.scroll` self-transitions in the machine JSON, `...tableView(spec, t)`
  into the view result. Same driver, own status slice, talks via triggers + `emit` (C11).
- naming: DOM trigger = element name; effect trigger = source name (`flow.loaded`, `timer.paused`), never an element.
- test = `step(machine, status, trigger, payload, handlers)` → `{status, effects}`; compare JSON.

## Handover — state on 2026-09-11, next session starts here

Done and committed in fayf_ui: S0–S4 (C11, machine.js, quiz re-base, shell, table, dashboard).
Node suite 143/143. Browser suites: machine 28 · quiz 112 · table 37 · shell 70 · dashboard 77 · gallery.
Pages: machine.html · table.html · shell.html · dashboard.html (`?style=luna|mockup|wireframe`, `?inspect=1`).

Controller contract (ui/machine.js header is the authority): machine JSON `initial` + `states{ enter?, <trigger>: <state> }`;
self-transition = stay (no enter); effects `fetch · emit · timer · send`, async ones scoped to the state entry;
view patches `string | node | [node] | {content, env, state}`; state tokens absolute per paint; `root` reserved;
guard disables controls only; `<name>.scroll` triggers get metrics on every clientHeight change; morph keeps identity.
Sub-controller pattern = ui/table.js (status slice + spread handlers + self-transitions + spread view).

### S5 — processor stub (next)
1. fayf_ui: commit, `just build`, push (user pushes; SSH key is passphrase-protected). Note the new HEAD sha.
2. fayf_processor `scripts/fetch_vendor_assets.py`: bump `FAYF_UI_SHA`, add to `FAYF_UI_FILES`: `ui/machine.js`, `ui/table.js`,
   `ui/dashboard.js`, `machines/dashboard.json` (+ `ui/icons.js`, `ui/actions.js` if not yet listed), re-vendor
   (`FAYF_UI_SRC=<local fayf_ui path>` works offline), regenerate `frontend/vendor/RECEIPT.json`.
3. `frontend/fayf/dashboard.html` (~60 lines): render vendored `screens/dashboard`; copy `machines/dashboard.json`
   → `frontend/fayf/machines/dashboard.json` with URLs `/api/runs` `/api/pipelines` `/api/issues`; handlers = vendored
   `ui/dashboard.js` handlers + processor glue: `nav.go` → `location.href = <page>.html`, `theme.toggle` → data-theme
   swap (the existing theme snippet), status-dot colour map (`failed→error`, `canceled→cancelled`, `paused→blocked`)
   as view state or a `fayf-skin.css` rule keyed by `[data-name^="recent-runs-row-"]`? — decide C9: prefer a view
   patch (`state`) over CSS. `fayf-skin.css`: luna aliases for repo tokens (decision open, see below).
4. Parity test `test/fayf_dashboard_test.js` (`?test=1` loader like `mockups/fayf.html`): counts equal `dashboard.js`'s
   (running/failed/pipelines w/o e2e-deploy/open issues), nav 6 + hrefs, refresh, tables rows, status line.
5. Keep `frontend/dashboard.html` (ui-kit) as `dashboard-kit.html` until S6 is through; index/nav points to the new page.
6. Processor todo: TODO-190 notes + new TODO row for the migration; docs/design-patterns.md entry
   "screen JSON + machine JSON + pure handlers; DOM only in fayf_ui".

### S6 — page by page
issues ✓ → list ✓ → browse ✓ → records ✓ / run ✓ → profile ✓ → query ✓ → annotate ✓ → graph last via `Embed`. Each:
parity test, old page removed, nav points to new.

**`field:"text"|"textarea"` shipped 2026-09-11** (see the "Known small items" note below for the full contract):
list.html's own deferred "start a run" is done with it. The real primitive gap for records/run is no longer "no
text input at all" — it's records.js's own much larger scope (step navigation, JSON diff/edit, 555 lines) and
run.js's SSE live event streaming (a different engine gap, not a `field` problem). Re-scope records/run properly
before starting it; it is not a same-size step as issues/list/browse were.

**issues shipped 2026-09-11**: `ui/tree.js` (new sub-controller, mirrors `ui/table.js` exactly — `treeInit`/
`treeHandlers`/`treeView` on `status.data[spec.name] = {rows, open, sel}`, group header click toggles
`open[group]`, item click selects + emits `<name>.select`, non-empty groups only in `groupOrder` order then
stray groups alphabetically); `machines/issues.json`; `ui/issues.js` (`STATUSES`, `MASTER` tree spec, `makeHandlers(urls)`
parametrized like table.js's spec since the status-write URL is per-issue/per-target-status; selecting-on-click
wraps `treeHandlers` like dashboard.js's `selecting()` wraps `tableHandlers`, adding a detail-fetch effect
alongside the emit); `screens/issues.json` (dashboard.json's full-duplicate pattern, side-panel children copied
with `nav-issues` on `cluster/nav-item.active`); fixtures `content/issues.json` + `content/issues/<id>.json`;
`issues.html`; `test/issues_test.js` (11 blocks) + `test/node/tree_test.js` (16) + `test/node/issues_machine_test.js`
(16) → node 172/172, registry 81 ids. Browser-verified live (screenshots + console sweep), all green. Full detail:
`.ai/todo.md` TODO-9 row.

**list shipped 2026-09-11** (the Pipelines page): browse-only v1, no new sub-controller — built entirely from two
`ui/table.js` instances (`PIPELINES` one-column picker, `RUNS` same columns as dashboard's but ALL runs not just
recent). `machines/list.json` (loading: 2 parallel fetches, reusing dashboard's own `content/dashboard/{pipelines,runs}.json`
fixtures — no new fixture files); `ui/list.js` (`PIPELINES`/`RUNS` specs, `initialData`, `handlers`, `view`, `mountList`).
Clicking a pipeline row toggles `data.pipelineFilter` and re-derives the runs table; clicking a run row adds a NEW
`run.open` emit (payload `{run_id}`) alongside the table's own `select` emit — no local selection, a run click is a
real page nav in the ground truth. Detail panel shows stats on the CURRENT (possibly filtered) view: total runs +
per-status counts, sorted by count desc. `screens/list.json` (dashboard.json's structure, issues.json's side-panel
override pattern for `nav-pipelines`); `list.html`; `test/node/list_machine_test.js` (12 tests) + `test/list_test.js`
(9 blocks) → node 184/184, registry 82 ids. Browser-verified live (console OK/FAIL sweep, all green).
**Real bug found + fixed while building this, not a pre-existing issue**: `PIPELINES.name === 'pipelines'` and
`RUNS.name === 'runs'` collide with the natural "raw fetched list" key names the spec's own pseudocode used —
`{ pipelines: [], ..., [PIPELINES.name]: tableInit(...) }` is a real object-literal key collision (last write wins),
so a literal implementation silently loses the raw runs array the instant the table slice is written, breaking
(a) re-filtering to a *second*, different pipeline (nothing left to filter from) and (b) status-text's always-a-total
run count once a filter is active. Fixed by keeping the raw fetched runs list under a distinctly-named `data.allRuns`
(pipelines needed no such fix — that table is never filtered, so its rows always equal the full list, same "no
second key for the same array" reasoning `ui/dashboard.js` already applies to ISSUES). **Second real bug, found via
the browser suite only** (the node suite can't see it — it's about `ui/machine.js`'s DOM-height re-measurement, not
pure state): rebuilding the runs table slice via `tableInit()` on every pipeline-filter click resets `window` to
`{scrollTop:0, clientHeight:0}`; `ui/machine.js`'s `measureScroll()` only re-delivers a `<name>.scroll` trigger when
the container's REAL DOM height changes, and a filter toggle repaints the same fixed-height box — so the reset
`clientHeight:0` was never getting re-measured, and the runs table stayed stuck at ~9 rows (windowOf's "not yet
measured" fallback) instead of a full ~20-row window after clearing a filter. This same latent bug likely also
affects `ui/dashboard.js`'s own refresh path (its `runs.loaded` handler does the identical `tableInit()`-on-every-load
reset) — untested there (its refresh block only checks stats/status-text, not row count), not fixed there per this
task's explicit "do not touch dashboard.js" scope; flagged as a follow-up. Fixed in `ui/list.js` only: `buildRunsTable`
now takes an optional `prevWindow` and carries its `clientHeight` forward (still resets `scrollTop` to 0) on both the
filter-toggle and the `runs.loaded` re-derive paths.

**browse shipped 2026-09-11**: third S6 page, the files explorer. New sub-controller `ui/filetree.js` — genuinely
different shape from `ui/tree.js` (that one is a flat GROUPED list built for issues.js; this is a recursive, N-level,
lazily-loaded directory tree, a new file rather than a modification). `t = status.data[spec.name] = { nodes, sel,
pendingPath }`, `node = { name, path, kind, open, loading, error, children }` (`children === null` = not yet fetched,
`[]` = fetched-and-empty). `filetreeHandlers` is pure and NEVER decides to fetch — a dir click only ever toggles
`open`; the fetch decision (and the single-in-flight-fetch guard via `pendingPath`) is entirely the consumer's job,
same "sub-controller stays pure, consumer wraps the click handler" pattern `ui/issues.js`'s `selectingMaster` and
`ui/list.js`'s `selectingPipeline`/`selectingRun` already established. `setChildren`/`setLoading`/`setError` splice a
NEW status at any depth via a small recursive `mapNode` helper, input untouched. `machines/browse.json` (loading: 1
fetch `/content/browse/mounts.json` → ready/error; `tree.click`/`level.loaded`/`level.failed`/`file.loaded`/
`file.failed` self-transitions in ready; nav/theme/refresh same shape as issues/list). `ui/browse.js`: `TREE` spec,
`FIXTURE_URLS` (`level`/`file`, see path convention below), `selectingTree(urls)` wraps `filetreeHandlers` — a file
click adds a `file.loaded`-bound fetch effect (+ `detail`/`detailLoading` reset); a dir click that just opened a
still-unfetched node (children `null`, `pendingPath` `null`) additionally sets `pendingPath` and adds a
`level.loaded`-bound fetch effect; any other dir click (already loaded, or a second dir while one is pending) is just
the base toggle, no effect. `level.loaded`'s handler maps the raw fixture/API `entries` (`{type,name,path,
has_children?}`) into filetree's own node shape, reconstructing each child's `path` as `pendingPath + '/' + entry.name`
(the entry's own `path` field is ignored — this repo's internal path convention, not the real API's). `detailBody`
(exported, pure): JSON pretty-printed (`JSON.stringify(JSON.parse(content), null, 2)`, raw string on a parse failure),
everything else passed through as-is; split on `'\n'`; each line's leading run of spaces replaced by the same count
of U+00A0 (NBSP) — regular spaces collapse under default `white-space:normal`, NBSP does not, so indentation survives
with zero CSS/dial changes (no `white-space:pre`, no new vocabulary dial, per the task's explicit constraint); capped
at 500 lines + a trailing `'… truncated'` row; rendered as one `{box:'hug', content:line}` row inside `detail-body`'s
own `stack, gap:0, fill` box (screens/browse.json uses `gap:0` here, not `gap:1` like issues/list's field-row detail
panels, since these are raw text lines not field rows). `detail-title` shows the SELECTED node's path (`tree.sel`,
set synchronously by the file click) rather than anything from the file response payload (which has no `path` field
of its own, `{format, content, hash, writable}`) — verified live this shows immediately on click, before the fetch
resolves. `screens/browse.json` (dashboard.json's structure; side-panel deliberately left as the untouched default —
see Known small items below); `content/browse/` fixtures: `mounts.json` (2 mounts) + a genuinely 3-level-deep tree
under `runs/` (`run-2026-09-01/{logs/{stdout.log,stderr.log}, result.json}`, `run-2026-09-05/result.json`,
`README.md`) + 2-level under `backend/` (`config/{settings.yaml,secrets.json}`, `app.py`) — exercises real recursion,
not a flat one-level demo. `browse.html`; `test/node/filetree_test.js` (15 tests) + `test/node/browse_machine_test.js`
(19 tests) → node 218/218, registry 83 ids. Browser-verified live (screenshots + full `?test=browse.html` console
sweep, 60/60 checks green): mount expand, 2-level-deep subdirectory expand (proves real recursion), file select with
visible NBSP-indented pretty JSON, collapse/re-expand without re-fetching, error/retry, nav/theme, C10 fit, luna skin,
C2. **Fixture path convention** (for the fayf_processor sibling wiring the real API): a filetree node's `path` is
`<mount>` for a mount root, `<mount>/<sub/path...>` nested (the real API's `mount` + `path` params concatenated with
one `'/'`); `FIXTURE_URLS.level(path)` → `` `/content/browse/level/${path}.json` ``, `FIXTURE_URLS.file(path)` →
`` `/content/browse/file/${path}.json` `` — e.g. `runs/run-2026-09-01` → `content/browse/level/runs/run-2026-09-01.json`,
`backend/app.py` → `content/browse/file/backend/app.py.json` (the doubled `.json.json` on a file that's already
`.json` is intentional and matches this repo's existing convention, `content/issues/<id>.json`). The real two-part
call is recovered by splitting on the FIRST `'/'`: `mount = path.split('/')[0]`, `rest = path.slice(mount.length + 1)`
(`rest === ''` for a mount root) — that's `GET /api/browse/{mount}/tree?path=<rest>` / `GET /api/browse/{mount}/file?path=<rest>`.
**Deviations from the spec, flagged**: none structural — the one judgment call was `detail-body`'s box using `gap:0`
(spec didn't pin this exactly, said "inside a `stack, gap:0, fill` container" which matches what was shipped) rather
than issues/list's `gap:1`, since raw text lines read better tight, not field-row-spaced.

**records shipped 2026-09-11**: fourth S6 page, "records" (the first half of the records/run step — "run", the live
SSE watch view, stays deferred separately, a different engine gap). No new sub-controller — the ONLY genuinely new
thing vs. browse.html is that every node in this tree is already known from one run-metadata fetch, so it's built
fully-populated up front rather than lazily: `ui/filetree.js`/`ui/machine.js` untouched, reused exactly as shipped.
`machines/records.json` (loading: 1 fetch `/content/records/run.json` → ready/error; `tree.click`/`detail.loaded`/
`detail.failed` self-transitions in ready — a per-record fetch failure never demotes the whole screen to the
top-level `error` state, that's reserved for the run-metadata fetch itself; nav/theme/refresh same shape as
browse/issues/list). `ui/records.js`: `TREE` spec, `FIXTURE_URLS.artifact(path)` → `` `/content/records/artifact/${path}.json` ``,
`FIXTURE_RUN_ID` (`'run-2026-09-11'`, matches `content/records/run.json`'s own `run.run_id`) — `initialData(runId)`
takes a PARAMETER, unlike every prior page's parameterless `initialData()`, since a consumer must know which run
before mounting (real nav supplies `?run_id=`). `buildNodes(steps, recordIds)` (new, local to records.js): one `dir`
node per step, `children` already an array of `file` nodes (no `children` key on those, matching filetree's own
"not a dir" convention) — built directly rather than routed through `filetreeInit`'s own mount-mapping helper, since
that helper hardcodes `children: null` for every entry (correct for browse.html's lazy one-level-at-a-time case,
wrong for a tree whose whole shape is already known); `filetreeInit(TREE, [])`'s empty shape is still reused for the
`{ sel: null, pendingPath: null }` frame, only `.nodes` is supplied directly — `filetreeHandlers`/`filetreeView`
consume the result completely unmodified either way (they only ever read `t.nodes`/`t.sel`/`t.pendingPath`, never
care how nodes got there). `selectingTree(urls)` wraps `filetreeHandlers` — SIMPLER than `ui/browse.js`'s dual-
purpose wrapper: no lazy-load-on-expand branch at all (a step/dir click is always just the base toggle, zero
effects), a record/file click adds a `detail.loaded`-bound fetch alongside the tree's own `select` emit, same shape
as `ui/issues.js`'s `selectingMaster`. Detail pane reuses `ui/browse.js`'s exported `detailBody` DIRECTLY (imported,
not reimplemented) via a small call-site adapter — `detailBody({ format: 'json', content: JSON.stringify(detail.value
?? detail) })` — since the artifact response is `{ value, version }` here (this repo's fixture + the real API's
`include_meta` shape) rather than browse.html's raw-file `{ format, content }`. `screens/records.json` (dashboard/
issues.json's structure, `nav-records` on `cluster/nav-item.active`). Fixtures `content/records/run.json` (3 steps ×
3 record_ids = 9 leaves) + `content/records/artifact/<step>/<record>.json` for 4 of those 9 (2 under `ingest`, 1
each under `nlp-parse`/`index`, one of them nested/multi-line to exercise `detailBody`'s NBSP indentation properly)
— the other 5 combinations have no fixture file on purpose, proving a clean `detail.failed` (404) path. `records.html`;
`test/node/records_machine_test.js` (15 tests, mirrors `browse_machine_test.js`, simpler — no pendingPath/single-
fetch-guard concept since nothing is lazy) + `test/records_test.js` (9 blocks, mirrors `browse_test.js`) → node
236/236 (was 221), registry 84 ids. Browser-verified live (`?test=records.html` console sweep, all green after the
last `─── TestRunner` marker, per the pane-sharing note below; screenshots confirm step→record tree expand + JSON
detail render). **Known simplifications** (v1 scope, all explicitly bounded by the task): no "no run selected"
run-picker mode (`initialData(runId)` assumes the consumer already knows it; a real page redirects to Pipelines
instead of porting the picker table); no named-channel-only step special case (every step is a plain 2-level
step→record tree — a record under a step whose type has ONLY named outputs just won't resolve in this v1, a real,
accepted gap the ground truth itself only handles via a second metadata round-trip); no diff views (vs pre-edit
history, vs another run) and no in-place edit+save (version-guarded PATCH) — both real, larger features, deferred
same as browse.html's dropped edit; no tags display, no "Re-run…"/graph-jump buttons — cosmetic/navigational extras,
skipped. **For the fayf_processor sibling wiring the real API**: artifact response shape assumed is `{ value,
version }` (NOT a bare value) — if the real `GET /api/artifact/{run}/{path}` sometimes returns a bare value instead,
the view-layer adapter's `detail.value ?? detail` already falls back to treating the whole payload as the value, so
either shape works without a records.js change; `FIXTURE_URLS.artifact(path)` → `` `/content/records/artifact/${path}.json` ``,
recovered against the real two-part call the same way browse.html's convention works (`path` = `step/record`, i.e.
first path segment is the step id).

**profile shipped 2026-09-11**: fifth S6 page, per-speaker credibility profiles across runs (ground truth reference:
`fayf_processor/frontend/profile.js`, 242 lines — behaviour only, not copied). No new sub-controller: one
`ui/table.js` instance (`SPEAKERS`) for the results table; the two ground-truth form controls that don't map onto an
existing controller (a run multi-select checkbox list, a fenster `<select>`) are ported as pure view/handler logic
inline in `ui/profile.js`, same scale as `ui/issues.js`'s 6 status chips — no new primitive, no C9 amendment needed.
`machines/profile.json` (loading: 1 fetch `/content/profile/runs.json` → ready/error; `run-picker.click` self-
transition handles every run row via ONE trigger + `p.path` prefix matching (`run-picker-<runId>`, same idiom
`ui/table.js`'s row click / `ui/tree.js`'s item click use) since run ids are dynamic-length and not known until
fetch; `fenster-<window>.click` × 6 are real per-value triggers since `WINDOWS` is a small, static, compile-time-known
vocabulary, same reasoning `ui/issues.js`'s `STATUSES`-driven chips use; `btn-compute.click`/`profile.loaded`/
`profile.failed`; `speakers.click`/`speakers.scroll` for the table sub-controller). `ui/profile.js`: `SPEAKERS` table
spec, `WINDOWS`, `FIXTURE_URLS.profile(ids) = /content/profile/result-${ids.join('_')}.json`, `makeHandlers(urls)`
factory (same pattern as `ui/issues.js`/`ui/list.js` — the compute-fetch URL depends on runtime-picked ids, a dynamic-
URL need). `status.data = { runs, picked, fenster, result, speakerId, computing, error, speakers: tableStatus }` —
`picked` is a plain `{ [run_id]: true|false }` map (Compute reads `Object.keys(picked).filter(Boolean)`, in click
order, same object-insertion-order reasoning the ground truth's own `Object.keys(state.picked)` relies on); `result`
is the raw `{ sessions, profiles }` response kept whole, the speakers table's rows are a DERIVED mapped view over
`result.profiles` (no second copy — same "no second key for the same array" reasoning `ui/dashboard.js` applies to
ISSUES / `ui/list.js` applies to `allRuns`); a selected speaker's full record (axes/fenster/befunde) is looked back up
out of `result.profiles` by `speakerId` when rendering detail, not duplicated. Compute's own guard (`ids.length < 2`
or already computing → no-op, no fetch) is belt-and-suspenders with the view's explicit `state:'disabled'` patch on
`btn-compute` (the machine's trigger-presence guard can't express a DATA condition — same technique `ui/list.js`'s
`starting` flag uses). Content (wide) hosts the run-picker + fenster chips + Compute + the 6-column speakers table;
detail (fixed `w:280`, same width as every other S6 page) hosts the SELECTED speaker's findings (fenster bucket rows
for the CURRENT window + befunde rows) — chosen over the reverse (results in detail) because a 6-column table
(160+70+70+60+100+90 px) doesn't fit a 280px panel, and this page has no separate "small side detail" need the way
issues/browse do since there's exactly one selection concept (a speaker row). Ground truth's "0 gefunden must not
look identical to nichts vergleichbar" honesty rule (stability.py, CW8) carried over literally: a 0-`paare_klassifiziert`
speaker still gets a full row in the speakers table and a "Keine klassifizierten Paare für diese Person." line in its
detail, not a silently-empty panel. `screens/profile.json` (dashboard.json's structure). **Side-panel left at its
untouched default (Dashboard marked active), NOT `nav-profile`**: checked `parts/component/side-panel.json` and every
existing page's own `NAV` constant first, per the task's explicit instruction — this repo's shared NAV set is still
the 6-item S4/S5 simplification (`dashboard/pipelines/graph/records/issues/settings`), no `nav-profile` item exists to
mark active, same pre-existing gap already logged for `shell.json`/`dashboard.json`/`browse.json` (issues.json/
list.json each fixed it locally for their OWN nav item, browse.json/profile.json can't). Fixtures: `content/profile/
runs.json` (8 runs — 4 done with distinct `run_id`/`pipeline`/`started_at`, 2 running, 2 failed) + `content/profile/
result-run-2026-09-08_run-2026-09-03.json` (the two newest done runs, matching `FIXTURE_URLS.profile`'s id-join —
4 speakers, varied party/pairs/befunde, incl. `sp-lindner` at `paare_klassifiziert:0` with empty `befunde`).
`profile.html`; `test/node/profile_machine_test.js` (19 tests) + `test/profile_test.js` (10 blocks) → node 255/255,
registry 85 ids. Browser-verified live (`?test=profile.html` console sweep, all green; also driven manually via
`javascript_tool` in both wireframe and luna skins — run-picker/fenster/compute/speakers-table/detail all render and
update correctly). **One real C10 fit bug found + fixed while building this**: the ground truth's own literal chip-
list box strings (`run-picker` as `stack, gap:1, fill`, `fenster` as a bare `hug` row) both overflowed `content`'s
actual measured width in this environment (`run-picker`'s 3-cell rows have unbounded text width; `fenster`'s 6 pill
chips as a `hug` row don't wrap) — `content`'s `scrollWidth` came out wider than its `clientWidth` (checklist #10).
Fixed by giving `run-picker` a bounded, scrollable container (`stack, gap:1, fixed, h:160, scroll, solid, rounded`,
the same fixed-height-plus-scroll idiom every other page's table container already uses) and `fenster` the `scroll`
overflow token (identical fix to `ui/issues.js`'s own `detail-status` chip row, which hit the exact same class of
overflow for the same reason — a `hug` row of several pill chips not fitting a bounded panel). Both are deviations
from this task's illustrative box strings, not from its behavior spec; noted here per C10's own append-then-log rule
(no new checklist row needed — matches existing rows #10/no.-`wrap`-token precedent from issues.html, not a new
failure class). **Also found while writing the browser test**: an early draft named the static label above the
run-picker `run-picker-title` — a real substring-prefix collision with the dynamic `run-picker-<runId>` row names
(harmless functionally, since `ui/machine.js` routes clicks by DOM ancestry not name-prefix search, but it broke a
`qa('[data-name^="run-picker-"]')`-style assertion, the SAME idiom `test/list_test.js`'s `rowsOf()` helper and this
page's own click handler rely on) — renamed to `picker-title` before shipping.

**query shipped 2026-09-11**: sixth S6 page, a raw FQL query tool over the JSON artefacts (ground truth reference:
`fayf_processor/frontend/query.js`, 262 lines — behaviour only, not copied — a textarea + optional run-scope selector
+ example-query chips + a results table, GET-only; its own guided query-builder driven by `Api.querySchema()` is
deferred IN THE GROUND TRUTH ITSELF, not a v1 cut made here). `machines/query.json` is deliberately simpler than
every prior page: ONE state (`ready`), no loading/error split — the ground truth's own design tolerates a failed
runs-list fetch gracefully (toasts, keeps working scoped to "All runs") and treats a QUERY error as DATA
(`res.error`), not a page-level mode, so there is no `loading`/`error` machine state to model here at all. No new
sub-controller: one `ui/table.js` instance for the results grid, but genuinely UNLIKE every prior page (dashboard's
`RUNS`/`ISSUES`, list's `PIPELINES`/`RUNS`, profile's `SPEAKERS`), its spec is not a fixed top-level constant — a
query result's own columns vary per query (from the response's `columns` field, or derived from row keys, mirroring
the ground truth's own `deriveColumns`/`cellText`). The spec is built fresh inside the `query.loaded` handler and
stored in `status.data.resultsSpec` alongside the table's own `status.data.results` (`tableInit(spec, rows)`);
`results.click`/`results.scroll` look the current spec up from status at call time rather than closing over a
module-level constant, since `tableHandlers(spec)`/`tableView(spec, t)` both take `spec` explicitly per call.
`ui/query.js`: `RUN_PICKER` (single-select run chip, exclusive — clicking the selected run again clears it to "All
runs", clicking another replaces it outright, never a toggle-SET the way profile.js's multi-pick works), `EXAMPLES`
(6 static chips, ground-truth-identical query strings), `FIXTURE_URLS` (documented fixture-query-matching scheme:
since free-typed FQL text can't be turned into a path the way other pages built one from an id, the fixture URL is
keyed off which `EXAMPLES` entry `data.q` currently equals exactly — `/content/query/result-<index>.json`; `run` is
tacked on as a harmless `?run=` query string the static file server ignores when resolving the path, so the run
selection is still visible on the actual fetch URL/effect without needing a second fixture per run; a query that
matches no `EXAMPLES` entry — free-typed, or an example whose own fixture wasn't authored — falls back to
`/content/query/result-none.json`, a path this repo deliberately does not ship, so the resulting 404 drives the
real `err` trigger cleanly, same as a real API's own miss would; the real consumer's own `urls.query` needs none of
this indexing: `(q, run) => '/api/query?q=' + encodeURIComponent(q) + (run ? '&run=' + encodeURIComponent(run) : '')`,
`urls.runs` is just `/api/runs` per this repo's existing convention), `makeHandlers(urls)` factory (same pattern
`ui/issues.js`/`ui/list.js`/`ui/profile.js` established). `screens/query.json` (dashboard.json's ws-head/status-bar
pattern) — **one deliberate structural deviation from every other S6 page**: no `detail` side panel at all (every
prior page kept the 3-column `side-panel`/`content`/`detail` body, even when, like browse.json/profile.json, it left
`detail` at a plain default) — this page has no "select a row, see its detail elsewhere" concept the other pages
share (issues/browse/profile/records all have one), the query RESULT itself is the thing being inspected, and a
results table with a genuinely dynamic column count needs the full content width more than a decorative 280px panel
would earn its keep. Everything (run-picker chips, example chips, the FQL field, Run, results) lives in `content`.
**Real bug found + fixed while building this, caught only by the full node suite, not by writing the code**:
`test/node/parts_validate_test.js`'s closed static-JSON key vocabulary (C2's `RESERVED` set) does not include
`field` — same reason `ui/list.js`'s `start-record-id` field node is never written into `screens/list.json` itself,
only built inside `view()`'s content patch. First draft put `field:'textarea'` directly on a `fql` node inside
`screens/query.json`, which fails that invariant; fixed by making `screens/query.json`'s `fql-row` a plain static
container (`content: ""`) and building the real field node (named `fql`, matching the `fql.input` trigger) inside
`ui/query.js`'s `view()` as a content patch on `fql-row`, exactly mirroring list.js's own established pattern.
**Second real bug, found only by a live `.click()` on the actual rendered DOM element per this task's explicit
"be extra careful, a past round's real bug was only caught by manual click-through" instruction — the automated
node suite and a shallow browser assertion on class names alone would NOT have caught it**: the example-chip
container was named `examples` (plural, matching its title label "Examples") in `screens/query.json`, while the
machine trigger is `example.click` (singular). `ui/machine.js`'s click routing matches a trigger by an EXACT
ancestor data-name (never a prefix) walking up from the click target — neither the container (`examples`) nor an
individual chip (`example-0`) equals `example`, so no candidate trigger was ever found and every real example-chip
click silently no-op'd; state happened to still look plausible at rest (the click did fire on a genuinely
`bx-actionable` element with no thrown error), so only checking the RESULT of a real click (results table
populated, fql textarea changed) exposed it, not just checking that the chip existed and had the right CSS classes.
Fixed by renaming the container to `example` (singular, exact match) — mirrors `RUN_PICKER`'s own
container-name-equals-trigger-name pattern (`run-picker` the container, `run-picker-<id>` the chips) exactly; the
lesson generalizes to any future page adding a new generic (non-per-item) chip-row trigger. Fixtures:
`content/query/runs.json` (5 runs) + `content/query/result-0.json` (`EXAMPLES[0]` "reactions by party", `grouped:
true`) + `content/query/result-2.json` (`EXAMPLES[2]` "who heckled", flat, 4 columns incl. a long `utterance` text
column proving long text renders fine with `ui/table.js`'s plain equal-`fill` column width, no `WIDE_RE`-style
special-casing needed). `query.html`; `test/node/query_machine_test.js` (20 tests) + `test/query_test.js` (10
blocks) → node 275/275 (was 255), registry 86 ids. Browser-verified live: automated `?test=query.html` console
sweep all green, PLUS a manual pass driving real `.click()` calls on the actual rendered chips/textarea/button in
both wireframe and luna skins (the second real bug above was caught exactly this way, not by the automated suite
alone — screenshots confirm run-picker/example selection, a rendered 4-column results table, and single-select
toggle-clear all work against the live DOM). **v1 simplifications** (same KISS discipline as every prior S6 page,
all noted here and in `.ai/todo.md`'s TODO-9 row): no `?q=&run=` deep-link URL sync (same class of drop as
browse.html's own `?mount=&path=&at=`); the query runs ONLY on an explicit `btn-run` click, never on textarea
blur/commit (the ground truth also runs on textarea "commit" — typing here just updates `data.q`); no per-column
custom/wide-column widths (`ui/table.js`'s existing default: every column gets equal `fill` width, no `w` set,
in place of the ground truth's `WIDE_RE` heuristic); no client-side result filtering/export (ground truth's
`DataTable` had `filterable`/`export` built in, same class of drop as prior pages' table simplifications). The
ground truth's own guided query-builder (dynamic From/Join/Where/Show/Group rows driven by `Api.querySchema()`) is
NOT ported — already deferred in the ground truth itself, not a cut made here.

**annotate shipped 2026-09-11**: seventh S6 page, Session -> Rede -> paragraph/sentence drill-down with a
per-sentence coverage badge (ground truth reference: `fayf_processor/frontend/annotate.js`, 986 lines, EPIC-17 --
behaviour only, not copied). **Scope is STORY-17.1 ONLY** — the ground truth's own header comment says
"Read-only in this story: coverage badge per sentence ... this is a progress hint only", describing the file's
ORIGINAL scope before 5 more stories (17.2-17.6) bolted record editing on top. Everything past that — the
record/suggestion panel + "Übernehmen" take-over (STORY-17.2), the slot-form editor with closed-vocabulary
Select fields (STORY-17.3, needs a real form controller `ui/form.js` this repo does not have — a separate,
later C9 design decision, not improvised here), D4 anchor-mode, record delete (STORY-17.4), "Neuer Satz"
fresh-suggestion LLM re-run (STORY-17.5), gold export + validation findings (STORY-17.6) — all stay on the old
ui-kit page, explicitly NOT attempted even partially. Two pure utility functions (`coverageSets`/`badgeFor`)
are ported LOGIC-only (the ground truth is ui-kit/DOM, ineligible for direct reuse) with the exact same
`"P<i>/S<j>"` id scheme (meaningful notation, kept identical). No new sub-controller: the paragraph jump-list
(`TREE = 'tree'`) is a flat array of rows built inline in `view()`, like `ui/query.js`'s chip rows — explicitly
NOT a `ui/tree.js`/`ui/filetree.js` instance (no group/open/select shape needed). `machines/annotate.json`:
single `ready` state (mirrors `machines/query.json`'s own no-loading/no-error-split reasoning — a failed
runs/rede fetch is tolerated silently, ground truth parity). `ui/annotate.js`: `SESSION_PICKER`/`REDE_PICKER`
single-select exclusive chip pickers (same toggle-clear idiom as `ui/query.js`'s `RUN_PICKER`) — picking a
session fetches its Reden (`urls.run`, a NEW factory entry); picking a Rede fires TWO PARALLEL, INDEPENDENT
fetches (`urls.segment`/`urls.annotate`, no shared "flow.ready" gate the way dashboard.js's 3-fetch loading
state has) — the tree + sentence text render as soon as segment lands, badges upgrade separately (a neutral
`…` placeholder glyph meanwhile) once annotate also lands, exactly mirroring the ground truth's own
"text shows immediately, badges catch up" behaviour. `status.data = { runs, runId, recordIds, recordId,
segment, annotate, loading: {segment, annotate}, error }`. `screens/annotate.json` (query.json's structure —
no `detail` side panel, no `nav-annotate` side-panel item since this repo's shared NAV set is still the 6-item
S4/S5 simplification): title + session-picker + rede-picker + a two-column body (`tree`, narrow paragraph
jump-list + `sentences`, wide text/badge panel) + a static plain-text `legend` line (this repo's box model has
no hover-tooltip mechanism for arbitrary text, unlike the ground truth's `tip`/data-tip — dropped, the legend
covers it, v1 simplification). Fixtures `content/annotate/` — `runs.json` (4 sessions, one a child run with
`parent_run_id`, labeled `${parent_run_id} → ${pipeline} (Kind-Lauf)` exactly like the ground truth's own
`load()`) + `run-run-2026-09-08.json` (2 Reden) + `segment-run-2026-09-08-rede-1.json` (3 paragraphs/6
sentences, real-looking German fragments) + `coverage-run-2026-09-08-rede-1.json` (exercises all 4 badge kinds
across the 6 sentences: ✓ record, s skip, ⚠ L3-only, · offen ×3). `annotate.html`;
`test/node/annotate_machine_test.js` (20 tests) + `test/annotate_test.js` (9 blocks) → node 295/295 (was 275),
registry 87 ids. Browser-verified live: automated `?test=annotate.html` console sweep all green, PLUS a manual
pass driving real `.click()` calls on the actual rendered chips/tree-row/skin-toggle (session pick -> rede
chips appear -> rede pick -> tree + all 6 sentence badges render correctly -> tree row click emits
`paragraph.jump` with the right index -> same-chip click clears cleanly), in both wireframe and luna skins.
**One real bug found + fixed by that manual pass, not by the automated suite alone** (same class of miss the
task's own brief warned about, from the query.html round): a sentence badge cell's box string was
`'fixed, w:16, hug'` — TWO tokens (`fixed` and `hug`) for the same `size` dial in one string, which C8 forbids
(one token per dial, "uniqueness enforced per primitive at load"). This threw inside `render()` the first time
a rede was picked; `ui/machine.js`'s `paint()` has no try/catch around its patch loop, so the exception fired
mid-paint, right after the `tree` patch had already applied but before the `sentences` patch could — the tree
counts rendered correctly while the whole text/badge panel silently stayed frozen on its "Pick a Rede..."
placeholder, with only a console `Uncaught (in promise)` to show for it. The automated test caught this
immediately as a "0 sentence rows" FAIL, but manual DOM inspection (console error read via
`read_console_messages`) is what pinned the exact root cause fast. Fixed by dropping the redundant `hug`
(`'fixed, w:16'`). **v1 simplifications** (all explicitly bounded by the task, same KISS discipline as every
prior S6 page): no hover tooltip on coverage badges (plain-text legend instead, no primitive change); no
record/suggestion panel, no slot-form editor, no D4 anchor mode, no record delete, no fresh-suggestion re-run,
no gold export (all STORY-17.2 through 17.6, genuinely larger/separate features, not improvised); `runs.failed`/
`rede.failed` fail silently into an empty list/prompt rather than surfacing a toast (this repo's L9 controllers
have no toast mechanism, same known gap every prior page's failed-fetch path already carries); no `?run=&rede=`
deep-link URL sync (same class of drop as browse.html's own `?mount=&path=&at=`); no `nav-annotate` side-panel
item (this repo's shared NAV set is still the 6-item S4/S5 simplification). **For the fayf_processor sibling
wiring the real API**: `urls.run(id)` -> `GET /api/runs/{id}` (`Api.run`, already used by `ui/records.js`);
`urls.segment(runId, recordId)` -> `GET /api/step/{run}/segment/{recordId}` (`Api.artifact(runId,
'segment/'+recordId)`); `urls.annotate(runId, recordId)` -> `POST /api/annotate/{run}/{record}/seed` (no body —
idempotent lazy-seeding, treat as the read path for coverage data, not a mutating write to avoid); the machine's
own `enter` effect hardcodes `/content/annotate/runs.json` (swap for `/api/runs?include_children=1` the same way
every prior page's machine JSON gets its real URL substituted) — `include_children=1` is required specifically
for this page (a per-speech child run's OWN `record_ids` only exist at that granularity, ground truth's own
"annotate child session" issue note). `ui/annotate.js`'s exports a sibling controller needs: `SESSION_PICKER`,
`REDE_PICKER`, `TREE`, `FIXTURE_URLS` (shape reference only), `coverageSets`/`badgeFor` (pure, portable as-is),
`makeHandlers(urls)`, `initialData()`, `view`, `mountAnnotate(root, reg, opts)`.

**run shipped 2026-09-11**: sixth S6 page, closing out the records/run pair — a live run-watch view (status
badge, pause/resume/cancel, a live SSE event log, a steps table via `ui/table.js`). The one real new engine
capability this page needed shipped FIRST, ahead of the page itself: `ui/machine.js` gained a `stream` effect
(`{ stream: url, ok, err? }`) — opens a real `EventSource`, every message dispatches `ok` with the parsed JSON
body (raw string if it doesn't parse); unlike `fetch`/`timer` (fire once), a stream stays open across many
dispatches, closed only when the state that opened it ends — tracked per-epoch (`openStreams`: epoch ->
`Set<EventSource>`), swept the instant the epoch advances, same "belongs to the state entry that started it"
rule fetch/timer already follow, now with a real `.close()` instead of a silent drop. `opts.io.EventSource` is
the injectable seam, mirroring `opts.io.fetch`/`setTimeout`. Verified with a fake `EventSource` class in
`test/machine_test.js` (2 new blocks: open/multiple-messages/close-on-transition/dropped-after-close, and
error delivery) BEFORE `ui/run.js` was built — so the page itself needed zero engine work. `machines/run.json`:
`loading` (1 fetch, the run snapshot) → `ready`, whose OWN `enter` opens the event stream (fires on every real
entry into `ready`, including after a refresh cycles back through `loading` — a deliberate, accepted difference
from the ground truth, which only ever wires one `EventSource` at page load and never reconnects; reconnecting
on refresh reads as an improvement, not a regression). `ui/run.js`: `STEPS` table spec, `FIXTURE_URLS`
(`snapshot`/`events`/`action`), `initialData(runId)` (parametrized like `ui/records.js`), `makeHandlers(urls)` —
pause/resume/cancel POST via `init:{method:'POST'}` (same idiom `ui/list.js`'s start-a-run uses), a `run.event`
handler updates `data.status` from the message (mirrors the ground truth's own `EVENT_STATUS_BY_TYPE` map) and
appends to a 200-capped log (oldest dropped first), `run_finished` re-fetches the snapshot to refresh the steps
table. A steps-row click and the two head buttons ("View records"/"View on graph") all emit real page-nav
triggers (`records.open`/`graph.open`) — no local selection kept, matching the ground truth's own real-navigation
behavior. The fixture demo fakes SSE via its OWN `opts.io.EventSource` class in `run.html`'s bootstrap script
(NOT in `ui/machine.js`) that replays a scripted JSON array of events on an interval — a test double at the same
seam every page's `opts.io.fetch` already is; a real consumer just points `urls.events` at a genuine
`EventSource('/api/runs/{id}/events')` and needs no such class. Node 320/320 (was 295), browser `run_test.js` all
green in a fresh tab — the fake-stream replay visibly changes the status badge over real wall-clock time,
pause/resume/cancel buttons track the current status correctly (disabled combinations per status, mirroring the
ground truth's own `enabled()` callbacks via an explicit view-patch since the machine's own state-based guard
can't express a data condition), a steps row click emits `records.open {run_id, step_id}`. Registry 88 ids.
**Two necessary corrections to the machine JSON beyond the task's own illustrative block**: `ready` gained
`"run.loaded": "ready"` / `"run.failed": "ready"` self-transitions — the `run_finished`-triggered snapshot
re-fetch dispatches those same triggers while already in `ready`; without a `ready`-scoped entry they would be
full no-ops (C11: a known-but-inert trigger runs no handler), silently dropping the steps-table refresh. `ready`
also gained `"btn-view-records.click"`/`"btn-view-graph.click"` — required by the handler bullet list but missing
from the given JSON block, and dispatching an undeclared trigger throws (C2). **One real C10 fit bug found +
fixed**: 6 command buttons + the user block in `head-actions` overflowed `ws-head` in this environment's measured
viewport (a between-justified row with no shrink) — fixed by `head-actions`' `gap:2` to `gap:1`, a `pad:1` box
override on each of the 6 buttons, and shortening the two ghost nav buttons' labels ("View records" to "Records",
"View on graph" to "Graph") — verified via live `getBoundingClientRect()` measurement, not a formula (checklist #4).
**Testing note**: the fake-stream browser test block initially polled the RENDERED status-text for the transient
`paused` state (only ~1 replay tick wide, `run_resumed` follows immediately) — flaky under this environment's
actual timer cadence (looser than the nominal 400ms), caught by running the suite twice, not by a single green
run. Made robust by polling `ctl.status.data.log` content (a permanent record once written) instead of the
fast-moving rendered value, with generous timeouts; the pause/resume/cancel button-reactivity assertion (which
DOES need the rendered class list) uses a deterministic direct `ctl.dispatch('run.event', ...)` instead of racing
the real replay. **Real manual click-through** (a live `Pause` click against the actual, unmocked dev server)
confirms the server.py limitation noted below drives a clean `action.failed` (`HTTP 501`), no crash, `actioning`
still clears. **v1 simplifications**: the legacy `?step_id`/`?record_id` deep-link redirect is dropped (no
`?`-param URL sync exists anywhere in this repo yet); pause/resume/cancel against this repo's own `server.py`
(a plain `SimpleHTTPRequestHandler`, no `do_POST`) always 501s in the live fixture demo — unlike `ui/list.js`'s
`urls.startRun: null` local-optimistic dodge, this page's `urls.action` is genuinely non-null per the task's own
spec, so `test/run_test.js` exercises the real POST success/no-op paths via an injected `io.fetch` instead (same
seam `test/list_test.js`'s error-path block already uses). **For the fayf_processor sibling**: `urls.snapshot(runId)` -> `GET /api/runs/{id}` (`Api.run`, already
used by `ui/records.js`); `urls.events(runId)` -> a real `EventSource` on `Api.events(id)`'s own URL
(`/api/runs/{id}/events`), no fake-replay class needed there; `urls.action(runId, action)` -> `POST
/api/runs/{id}/(pause|resume|cancel)` (`Api.runAction`) — a genuine mutating write (pauses/resumes/cancels a
real pipeline), do not exercise for real in an automated test against shared dev data, same judgment call the
issues page's status-POST test made.

### Known small items
- js_runner prints "Checks: 0" before async blocks (another session is fixing it — do not touch test/js_runner.js).
- shell ws-head `between` with 3 children centres the crumbs; luna nav icon dots faint (checklist #14 class).
- Browser pane tabs are shared between sessions/agents; verify in a fresh tab, count `OK :`/`FAIL:` after the last
  `─── TestRunner` marker. A hidden/backgrounded pane can report a mounted root's `clientWidth`/`clientHeight`/
  `scrollWidth`/`scrollHeight` as 0 while `getBoundingClientRect()` on the same element stays correct (confirmed
  live during the issues.html fit (C10) check, and again on list.html's fit block) — front the tab before trusting a
  `clientWidth`-based fit assertion.
- `ui/vocabulary.json` has no flex-wrap dial (`wrap` is not a real box token) — a design note asking for a
  wrapping row of chips needs `scroll` (existing overflow token) instead; found while building issues.html's
  status-chip row (`ui/issues.js`).
- S6 issues.json fixed the side-panel "always shows Dashboard active" gap for itself only (children copied +
  `nav-issues` on `cluster/nav-item.active`) — `shell.json`/`dashboard.json` still highlight Dashboard on every
  screen; list.json applied the same fix for `nav-pipelines`, so the gap now remains only in `shell.json`/`dashboard.json`.
- **`field:"text"|"textarea"` shipped 2026-09-11** (KISS, no C9 amendment — a plain node property, not a 13th dial):
  `ui/render.js` renders a real `<input>`/`<textarea>` instead of a div, `content`/a string view-patch become `.value`.
  `ui/machine.js` gained `payload.value` on input/change events. Real bug caught live and fixed same day: `morph()`
  (the array-content repaint path) never synced `.value` — only the direct string-patch path did — so a field
  nested inside other view-returned nodes (list.html's start-a-run form, built inline like issues.html's status
  chips) silently never picked up typed-then-repainted content; `morph()` now special-cases INPUT/TEXTAREA the same
  way `paintContent`'s string branch does. `ui/list.js` used the primitive to finish "start a run" v1: one
  record-id field + Start button, shown when a pipeline is selected (reuses `pipelineFilter`, no second selection
  concept); gained a `makeHandlers(urls)` factory (`urls.startRun` null = local-optimistic here, real POST for a
  consumer) — same pattern `ui/issues.js` established for `urls.status`/`urls.detail`.
- list.html's "start a run" v1 still has no per-pipeline entry-schema (a pipeline's own fillable param + JSON
  textarea for object-typed values) and no "quick: run Bundestag session" form — both real, larger features (dynamic
  multi-row entry, JSON authoring) deferred past this KISS-scoped slice, not blocked on a missing primitive anymore.
- list.html's runs table shows ALL runs (unfiltered by pipeline, or filtered to one pipeline via a row click) with no
  free-text/status filter and no export — ground truth's `DataTable` had `filterable`/`export`/paging; out of scope
  for the same reason as issues.html's dropped filter (no real text-input primitive yet).
- A pipeline-filter change resets the runs table's sort/scroll POSITION to defaults (newest-first, scrolled to top) —
  `clientHeight` is deliberately carried forward (see the bug note above), only `scrollTop`/`sort`/`sel` reset; an
  accepted v1 simplification, not a follow-up.
- `ui/dashboard.js`'s own refresh path likely shares the same "table rows reset via `tableInit()` -> stuck at ~9-row
  windowOf fallback until an unrelated resize" bug list.js hit and fixed locally (see the bug note above) — not
  fixed there (out of this task's scope, `dashboard_test.js`'s refresh block doesn't check row count so it's
  unnoticed today); flagged as a follow-up for whoever next touches `ui/dashboard.js`.
- browse.html v1 (files explorer) ships READ only, same as the ground truth's own deferred scope: no file editing/
  save. Also out of scope, all explicitly bounded by the task: structural JSON table projection + drill-down
  breadcrumbs (ground truth's `UI.project`/`UI.build`, bespoke and large), the artefact-grouping heuristic that folds
  `<prefix>_<hash>.<ext>` siblings into synthetic groups (cosmetic de-noising, every entry shown as-is instead), and
  deep-link URL sync (`?mount=&path=&at=`).
- `ui/filetree.js`'s `pendingPath` allows only ONE directory fetch in flight at a time — a click on a second,
  not-yet-loaded directory while one is pending still toggles that node's `open` flag (so it visibly "opens" empty)
  but starts no fetch; clicking it again once the first finishes retries. Deliberate v1 limit: true concurrent-fetch
  tracking would need the fetch response to echo back which path it was for, which the real API doesn't do.
- browse.html has no `nav-browse`/`nav-files` side-panel item, since this repo's shared NAV set is still the
  6-item S4/S5 simplification (`dashboard/pipelines/graph/records/issues/settings`, not the real 9 destinations) —
  `screens/browse.json` uses `component/side-panel`'s untouched default (Dashboard marked active), the same
  pre-existing "always shows Dashboard active" gap already logged above for `shell.json`/`dashboard.json` (issues.json
  and list.json each fixed it locally for their OWN nav item; browse.json can't, since no `nav-browse` item exists to
  mark active).
- browse.html's detail pane caps rendered content at 500 lines (a trailing `'… truncated'` row beyond that) — bounded
  like the real tree-level API's own entry cap, not configurable in this v1.
- records.html has no "no run selected" run-picker mode — `initialData(runId)` assumes a run is already chosen; the
  processor sibling redirects to its Pipelines page instead when `?run_id=` is absent, rather than porting the
  ground truth's run-picker `DataTable`.
- records.html flattens every step to a plain 2-level step→record tree — the ground truth's named-channel-only step
  special case (a 3rd tree level per-record, needed only for a step whose type has ONLY named outputs) is not
  ported; a record under such a step simply won't resolve in this v1 (accepted gap, ground truth itself only
  handles it via a second metadata round-trip this v1 doesn't replicate).
- records.html ships READ only, same discipline as browse.html: no diff views (vs pre-edit history, vs another run
  of the same pipeline), no in-place edit+save (version-guarded PATCH), no tags display, no "Re-run…"/graph-jump
  buttons — all real, larger features/cosmetic extras, deferred.
- records.html's "run" counterpart (the live SSE event-stream watch view) shipped 2026-09-11 — see the "run
  shipped" note above; the records/run pair is now complete.
- run.html's pause/resume/cancel always 501 against this repo's own `server.py` (no `do_POST`) — a real click
  drives a clean `action.failed`, no crash, but never actually succeeds in the live fixture demo; `test/run_test.js`
  exercises the real POST success/no-op paths via an injected `io.fetch` instead. run.html has no `?step_id`/
  `?record_id` legacy redirect (dropped, no `?`-param URL sync exists anywhere in this repo).
- query.html has no `?q=&run=` deep-link URL sync (same class of drop as browse.html's `?mount=&path=&at=`); Run
  fires only on an explicit button click, never on textarea blur/commit like the ground truth's own textarea
  "commit" event (typing just updates `data.q`); no per-column custom/wide-column widths (`ui/table.js`'s plain
  equal-`fill` default for every result column, in place of the ground truth's `WIDE_RE` heuristic); no client-side
  result filtering/export (ground truth's `DataTable` had `filterable`/`export`). The ground truth's own guided
  query-builder (`Api.querySchema()`-driven From/Join/Where/Show/Group rows) is not ported — already deferred in the
  ground truth itself, not a v1 cut made here.
- query.html has no `detail` side panel — the only S6 page to drop it outright rather than leave it at a default —
  since there is no "select a row, see detail elsewhere" concept here (the query result IS the detail); everything
  lives in `content`.
- annotate.html is STORY-17.1 ONLY (read-only paragraph/sentence drill-down + coverage badge) — record editing,
  the slot-form editor, D4 anchor mode, record delete, "Neuer Satz" re-run, and gold export (STORY-17.2 through
  17.6) all stay on the old ui-kit page; none were even partially attempted (STORY-17.3 in particular needs a
  real form controller, `ui/form.js`, which does not exist in this repo yet — a separate, later C9 decision).
- annotate.html has no hover tooltip on a coverage badge (this repo's box model has no arbitrary-text-on-hover
  mechanism) — a plain-text legend line covers it instead, no new primitive.
- annotate.html's `runs.failed`/`rede.failed` fail silently (empty session list / "Pick a session first." prompt)
  rather than surfacing a toast — this repo's L9 controllers have no toast mechanism, the same known gap every
  prior page's failed-fetch path already carries (ground truth itself toasts-and-continues).
- annotate.html has no `?run=&rede=` deep-link URL sync (same class of drop as browse.html's `?mount=&path=&at=`)
  and no `nav-annotate` side-panel item (this repo's shared NAV set is still the 6-item S4/S5 simplification).

## Open (next C9, one at a time)

1. S5 skin: processor pages in luna, or keep repo tokens via alias (recommended: alias first, luna switchable).
2. S5 status colours per row: view `state` tokens (needs a `status:<x>` token family?) vs `fayf-skin.css` name-keyed rules.
