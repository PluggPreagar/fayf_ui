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
| S3 | **table controller** `ui/table.js` — rows JSON → `stack` of `row`s, cells `fixed w`; windowed (`scroll` box, visible slice), sort, select → trigger `<name>.select`. Columns = part `component/table` | fayf_ui | JS + JSON | node: window math (2000 rows → ≤ 40 boxes); browser: sort/select/scroll |
| S4 | **dashboard screen** `screens/dashboard.json` = `extends screens/shell` + content: `at-a-glance` (4 `atom/chip` counts), `recent-runs` (table slot), `issues` (table slot); `machines/dashboard.json` (states `loading · ready · error`; effects 3× fetch); fixture `content/dashboard/*.json` | fayf_ui | JSON | gallery, node machine test, browser table tests |
| S5 | **processor stub** `frontend/fayf/dashboard.html` (~60 lines): screen refs · machine JSON · handlers (`status-dot` map, `e2e-deploy-` filter, counts) · effect targets `/api/…`. `fayf-skin.css`: luna aliases for repo tokens. Re-vendor pin | processor | HTML + JSON + handlers.js | `?test=1` parity with `dashboard.js` (counts, rows, nav, commands); old page kept as `dashboard-kit.html` until S6 done |
| S6 | **page by page** issues → list → browse (tree ctrl) → records/run (form ctrl) → profile/query/annotate → graph last via `Embed` | both | | each: parity test, old page removed, nav points to new |

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
- `states[s].enter` = effects on every entry (start and re-entry). Triggers carry a dot → no collision.
- effect kinds: `fetch {url, ok, err}` · `emit {trigger, payload}` (to parent) · `timer {ms, trigger}`
  · `send {trigger, payload}` (self, synchronous: a handler picks the transition, the table stays static).
- async effects belong to the state entry that started them; a result after leaving that state is dropped.
- inert trigger (known, not in the current state) = full no-op, handler not run.
- `root` = reserved trigger name for the mounted element. Guard disables controls only (trigger
  elements without trigger elements inside); surfaces never.
- view patch: `string | node | [node] | { content?, env?, state? }`; state tokens absolute per paint:
  `actionable selected correct wrong readonly loading error disabled hidden`.
- repaint morphs: same name + dials → element updated in place (identity, focus, refs survive).
- naming: DOM trigger = element name; effect trigger = source name (`flow.loaded`, `timer.paused`), never an element.
- test = `step(machine, status, trigger, payload, handlers)` → `{status, effects}`; compare JSON.

## Open (next C9, one at a time)

1. S5 skin: processor pages in luna, or keep repo tokens via alias (recommended: alias first, luna switchable).
