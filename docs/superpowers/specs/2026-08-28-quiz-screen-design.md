# Spec — quiz screen + generic state-machine controller

2026-08-28 · governed by [`CONSTITUTION.md`](../../../CONSTITUTION.md) C1–C10
· addendum to [2026-08-27-wireframe-ui-design.md](2026-08-27-wireframe-ui-design.md)

Status: **designed, not implemented**.

## Motivation

First interactive, multi-step screen in the repo. Everything built so far
(dashboard, anatomy) is static layout + inert/no-op action wiring
(`ui/actions.js`). A quiz needs real state: hint reveal, answer
selection, lock-in, colorized reveal, a paced pause, next-question
advance — driven by a controller, not scattered click handlers.

The controller itself is explicitly requested as a *generic* mechanism
(register/deregister listeners per state, any event source — UI click
today, a timer, later network — triggering any action: navigate,
toast, a plain callback), not a quiz-only helper. Rejected building it
quiz-only (contradicts the explicit ask); rejected a two-module
bus+FSM split (no current need for routing independent of state,
C3 KISS — see Alternatives).

## Architecture

Two new modules, one new page. Same "page-mount, not vocabulary model"
bucket as `ui/actions.js`/`ui/icons.js`/`ui/style-mode.js` — sits beside
them, **not** a new Ln rung. `ui/model.js`'s `resolve`/`render` are
still the only way any DOM gets built (C5); the controller only decides
*when* to call them and what to listen for.

| file | role |
|---|---|
| `ui/state-machine.js` | Generic FSM primitive. `createMachine({states, initial})` → `{send(event, payload), state}`. Each state entry: `{ enter(ctx), exit(ctx), on: {eventName: nextState} }`. `enter`/`exit` are plain functions — a state that needs a DOM click registers it in `enter`, removes it in `exit`; a state that needs a timer does the same with `setTimeout`/`clearTimeout`. No action-type DSL: "navigate", "toast", "callback" are just what a plain function does, not a mechanism the machine knows about. |
| `ui/quiz.js` | Quiz-specific. Defines the states below, loads one question from the content JSON, renders the shell's dynamic parts (answers list) via `resolve`/`render`, wires DOM → `machine.send(...)`. Exports a pure `grade(answers, selectedIds)` function, kept separate from DOM code so it's node-testable. |
| `quiz.html` | New page, same shape as `math-trainer.html`: mounts `screens/quiz.json`'s static shell, hands the rendered root + registry to `ui/quiz.js`. |

## States

```
answering    (initial)
             hint click            → reveal hint text, no transition
             mode:"single"  answer click        → revealed
             mode:"multiple" answer click       → toggle that answer's selection, stays
             mode:"multiple" "Lock answer in"   → revealed
             exit: deregister every answer/hint/lock listener this state registered

revealed     enter: colorize + icon every answer (correct/wrong), per §Result
             enter: arm BOTH — setTimeout(PAUSE_MS) and a click-to-continue
                     on the revealed panel — whichever fires first → next-ready
             exit: clear whichever of {timeout, click listener} did not fire

next-ready   enter: show/enable the "Next" button
             "Next" click → answering (load next question) | finished (none left)

finished     terminal — Next disabled, no further transitions
```

`PAUSE_MS` — a plain constant in `ui/quiz.js` (not vocabulary, not a
dial). Purpose: guarantee the colorized/iconized answer is on screen
for a minimum beat before the learner can move on, while still letting
an impatient click skip the wait early — exactly the register/
deregister-per-state pattern the controller exists for.

## Data — new `content/` directory

Sibling to `parts/`/`screens/`, not swept into the parts/screens
registry (`test/node/registry.js` loads only `parts/**` and
`screens/**` — untouched). Content = quiz questions/answers/hints;
layout vocabulary never describes this data, matching C2's separation
of "what a screen contains" from "how a box looks."

```json
{ "id": "quiz/lesson1", "questions": [
  { "prompt": "Which of these are prime?", "mode": "multiple",
    "answers": [ { "text": "2", "correct": true },
                 { "text": "4", "correct": false },
                 { "text": "5", "correct": true },
                 { "text": "9", "correct": false } ],
    "hint": "A prime number has exactly two divisors: 1 and itself." } ] }
```

`questions` is an array from day one (this sketch ships with one entry)
so "next question" has somewhere real to go without a data-shape
migration later. `mode`: `"single"` | `"multiple"` — no other values
(C2: unknown → error, matching every other enum in this repo).

`content/quiz/lesson1.json` fetched directly by `ui/quiz.js` (`fetch`),
no registry indirection — one file per quiz, loaded by explicit path,
same as `math-trainer.html` already does for `/registry.json`.

`server.py`: add `/content/` to `NO_STORE` (same stale-asset-trap
reasoning as `/parts/`, `/screens/`).

## Screen shell — `screens/quiz.json`

Static shell only: prompt slot, an empty named answers container, the
hint panel/button, "Lock answer in" button (rendered but only reachable
in `multiple` mode — inert otherwise, `state:disabled` mockup, same
convention as an unbuilt nav item), "Next" button. `ui/quiz.js` renders
one answer row per JSON answer into the answers container at
question-load time, through `resolve`/`render` — never hand-built DOM.

## Reuse, not new parts

- Answer selector shape: `circle` for `mode:"single"`, `square` for
  `mode:"multiple"` — the same radio-vs-checkbox convention already in
  `component/radio-group`/`component/checkbox`, composed per-answer
  rather than instantiating either whole part (both bake in a fixed
  2-row demo, not dynamic per-answer text).
- Hint panel: `component/inline-banner` (`!` + text row already
  exists) — reveal is a plain show/hide, no new part.
- Buttons: `atom/button` / `atom/button.primary` (Hint, Lock answer in,
  Next) — same as the dashboard's existing primary action.

## Result — color + icon

One new token, not two: `--ok` (soft green) added to `tokens.css`;
wrong reuses the existing `--accent` (already a red, used today for
hover/handles). Both applied as a **muted background tint at low
opacity** — not a solid fill — per explicit correction: eye-friendly,
not a jarring pass/fail color. Icon: `icon-done` (check) for correct,
`icon-cancelled` (x) for wrong — the exact glyphs from the job-lifecycle
icon set (2026-08-28), zero new icons.

## Testing

- `test/node/`: unit tests for `state-machine.js` (transition table
  drives `state` correctly, `enter`/`exit` called exactly once per
  transition, unregistered event is a no-op) and for the pure `grade`
  function (single/multiple mode, partial-credit-free: multiple mode
  is exact-match-required, i.e. `revealed` marks the whole question
  right only if selected set == correct set — no partial states in
  this sketch).
- Browser test (`test/quiz_test.js`, same harness as
  `math-trainer_test.js`): hint reveal, single-choice click → revealed
  colorized, multiple-choice select+lock → revealed colorized, pause
  gate (fake-timer or just assert `next-ready` unreached before
  `PAUSE_MS` and reached after), next advances/finishes.

## Alternatives considered and rejected

- **Two-module bus + FSM split** — a generic pub/sub bus decoupled from
  a separate state-machine engine. Rejected for v1: nothing today needs
  event routing independent of state; `machine.send()` is already
  source-agnostic (a future network handler calls the same method a
  click handler does). Revisit only if a second consumer genuinely
  needs routing without state (C3, YAGNI).
- **Quiz-specific controller, no shared module** — contradicts the
  explicit ask for a *central*, reusable controller. Rejected outright.
- **New bespoke quiz parts** (`component/answer-option`,
  `component/hint-panel`) — rejected in favor of composing existing
  parts/primitives; grows the 50-part vocabulary for one screen's need
  when `radio-group`/`checkbox`/`inline-banner`/`button` already cover
  the shapes needed.
- **Two new result colors** (fresh red + green tokens) — rejected;
  `--accent` already is a red. Only `--ok` is genuinely new.

## Open / deferred

- Full implementation — not started.
- `finished` state's UI (what shows when there are no more questions)
  — sketch only needs Next disabled; a real "quiz complete" treatment
  is out of scope until a multi-question quiz actually exists.
- Timer-sourced or network-sourced events beyond the `revealed` pause
  gate — no other consumer yet; the FSM primitive supports it, nothing
  else uses it today.
