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
| S6 | **page by page** issues ✓ → list ✓ → browse ✓ (filetree ctrl) → records/run (form ctrl) → profile/query/annotate → graph last via `Embed` | both | | each: parity test, old page removed, nav points to new |

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
issues ✓ → list ✓ → browse ✓ → records/run (needs `ui/form.js`)
→ profile/query/annotate → graph last via `Embed`. Each: parity test, old page removed, nav points to new.

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
- list.html v1 is browse-only: no "start a run" form (dynamic per-pipeline record-id/value rows + a JSON textarea for
  object-typed entry params) and no "quick: run Bundestag session" form (one text field + JSON-object composition +
  record-id sanitization) — both fundamentally need real text input, which fayf_ui's box/path model doesn't have.
  Earmarked `ui/form.js` (plan doc's controller table) for when records/run (next S6 page) needs it anyway.
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

## Open (next C9, one at a time)

1. S5 skin: processor pages in luna, or keep repo tokens via alias (recommended: alias first, luna switchable).
2. S5 status colours per row: view `state` tokens (needs a `status:<x>` token family?) vs `fayf-skin.css` name-keyed rules.
