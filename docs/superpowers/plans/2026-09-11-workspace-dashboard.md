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
| S6 | **page by page** issues ✓ → list → browse (tree ctrl) → records/run (form ctrl) → profile/query/annotate → graph last via `Embed` | both | | each: parity test, old page removed, nav points to new |

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
issues ✓ → list → browse (needs `ui/tree.js`, same sub-controller pattern as table) → records/run (needs `ui/form.js`)
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

### Known small items
- js_runner prints "Checks: 0" before async blocks (another session is fixing it — do not touch test/js_runner.js).
- shell ws-head `between` with 3 children centres the crumbs; luna nav icon dots faint (checklist #14 class).
- Browser pane tabs are shared between sessions/agents; verify in a fresh tab, count `OK :`/`FAIL:` after the last
  `─── TestRunner` marker. A hidden/backgrounded pane can report a mounted root's `clientWidth`/`clientHeight`/
  `scrollWidth`/`scrollHeight` as 0 while `getBoundingClientRect()` on the same element stays correct (confirmed
  live during the issues.html fit (C10) check) — front the tab before trusting a `clientWidth`-based fit assertion.
- `ui/vocabulary.json` has no flex-wrap dial (`wrap` is not a real box token) — a design note asking for a
  wrapping row of chips needs `scroll` (existing overflow token) instead; found while building issues.html's
  status-chip row (`ui/issues.js`).
- S6 issues.json fixed the side-panel "always shows Dashboard active" gap for itself only (children copied +
  `nav-issues` on `cluster/nav-item.active`) — `shell.json`/`dashboard.json` still highlight Dashboard on every
  screen; carry the same fix into them (and any future S6 screen) as a follow-up, not done here.

## Open (next C9, one at a time)

1. S5 skin: processor pages in luna, or keep repo tokens via alias (recommended: alias first, luna switchable).
2. S5 status colours per row: view `state` tokens (needs a `status:<x>` token family?) vs `fayf-skin.css` name-keyed rules.
