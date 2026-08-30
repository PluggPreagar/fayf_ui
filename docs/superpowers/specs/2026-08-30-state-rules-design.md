# Spec — interaction state rules (mockup skin)

2026-08-30 · governed by [`CONSTITUTION.md`](../../../CONSTITUTION.md) C1–C10
· addendum to [2026-08-27-wireframe-ui-design.md](2026-08-27-wireframe-ui-design.md)

Status: **design decided, implementation pending**.

Source: Claude Design handoff, "Element state style rules" project,
`State Rules Wireframes.dc.html`. Verbatim copy:
[`docs/state-rules.reference.html`](../../state-rules.reference.html).

## Motivation

`ui/tokens.css` already codes 3 interaction states ad hoc — hover
(`.bx-actionable:hover`, brightness filter), focus
(`.bx-actionable:focus-visible`, dashed ring), disabled (`.bx-disabled`,
opacity) — plus one page-specific one, `.bx-selected` (quiz answer
choice, solid outline). Missing: pressed, loading, error, read-only.
The design doc supplies a systematic rule set for all 8. Adopting it now
prevents each new state from being invented ad hoc, one screen at a time.

## Decision — approach D (hybrid, one channel per state)

The doc offers 4 alternatives (A opacity ladder, B named colour per
state, C monochrome weight/elevation, D hybrid). **D chosen** — closest
to what's already shipped (hover=tint, focus=ring, engaged=outline are
each already a distinct channel, not shared), so this is convergence,
not a rewrite. Rejected alternatives and why: A's disabled(26%) risks
being confused with loading(50%) — the doc's own caveat, and this repo's
C10 fit-checks lean on screenshots where that ambiguity bites hardest;
B's 9 named colours contradicts C3 (repo has 4 colour tokens total
today: `--ink`, `--accent`, `--ok`, `--muted`); C is viable but a
bigger visual departure from the channels already in place for no
added clarity over D.

## Scope — skin-agnostic, same as today's states

The doc's 4 example palettes (apA–apD) are its own demo dressing, not
fayf_ui's wireframe/mockup split — don't confuse the two. Checked against
`tokens.css`: today's hover/focus/disabled/selected rules carry **no**
`[data-style="mockup"]` guard — they're plain `--ink`/`--accent`, which
render fine in both skins already (`--accent` is a base `:root` token,
not a mockup-only override; quiz's `.bx-wrong` already shows red in
wireframe mode). New states follow the same precedent: no skin gating.

## Scope — role-agnostic, not new component types

The doc demonstrates the rules across 6 component roles (primary/
secondary/tertiary button, link, checkbox, toggle, nav item) to prove
they don't collide. fayf_ui has no such roles yet — today there is one
generic mechanism, "actionable box" (`ui/actions.js`), used for anything
clickable regardless of visual role. **This spec extends that one
mechanism**, not the 6 roles — inventing button/checkbox/toggle/nav-item
as new L5/L7 parts is separate, unscoped work (would need its own spec).
Consequence: `engaged`/`read-only` states that only make sense for a
role fayf_ui doesn't have yet (e.g. toggle) are recorded here for
completeness but have no CSS to write until that role exists.

## Channel table (per C8: one word owns one job, no collision)

| state | channel | mechanism |
|---|---|---|
| default | — | `.bx-actionable` base look, unchanged |
| hover | tint | `filter:brightness(.94)` — **already shipped** |
| focus | ring | `outline:2px dashed var(--ink)`, `:focus-visible` only — **already shipped** |
| pressed | inset | `box-shadow:inset 0 2px 0 rgba(0,0,0,.22)` on `:active` |
| engaged (selected) | shape | solid outline, no radius change — **already shipped** as `.bx-selected` (quiz-specific class; this spec keeps it, doesn't rename it — C2 "one name" is satisfied per-concept, `.bx-selected` already *is* fayf_ui's name for "engaged") |
| disabled | opacity | `.bx-disabled`, `opacity:.45` — **already shipped**, doc's D-approach uses grey instead; kept as-is (repo precedent predates this doc, not worth an unforced rename) |
| loading | opacity + marker | new: `.bx-loading{opacity:.7;pointer-events:none}`; content-level "◌ " prefix is an authoring convention (screen JSON content string), not a CSS concern |
| error | border colour | new: `.bx-error{border-color:var(--accent)}` (+ a mockup-skin-specificity-matched duplicate, see `tokens.css`) — **not** `outline`, see finding below |
| read-only | edge | new: `.bx-readonly{opacity:.55;pointer-events:none}` — mirrors disabled's mechanism (inert) but a distinct class/name (C2: read-only and disabled are different concepts even if the CSS starts identical, per the doc's own row: links keep an (inert) affordance under read-only but drop it entirely under disabled) |

Rule, restated (doc's own words, kept — C1 prefers the source phrasing
over a paraphrase): **no two states share a channel**, so a focused +
pressed actionable box still visibly reads as both at once.

### Finding — `outline` was already a shared/contested channel

Verified live (browser, `state-rules.html`): tabbing focus onto a box
first drafted with `.bx-error{outline:...}` made the red ring vanish —
`:focus-visible`'s own `outline` rule has higher specificity and
`outline` doesn't stack across rules. Fixed by moving error to
`border-color` instead (a channel nothing else touches).

`.bx-selected` (engaged, quiz's answer-choice class) had the identical
collision — also `outline`, predating this doc. **Fixed** (same
session, follow-up round): moved to `border-left:4px solid var(--ink)`
— matches the doc's own "engaged owns a 4px left edge" description
more closely than the old outline ever did, and `box-sizing:border-box`
(global) means the extra border doesn't grow the box or trip C10's
nested-BBox rule. Now overlaps `.bx-error` on `border-left-color`
instead (both resolve to the same ink/accent-per-rule value, harmless
by convention — error is for buttons, selected is for quiz answers,
never the same element). `test/quiz_test.js`'s own assertions only
check `classList.contains('bx-selected')`, never the rule's pixel
geometry, so this was a safe visual-only change.

## Non-goals (this spec)

- New button/checkbox/toggle/nav-item parts (see role-agnostic note above).
- Wiring `pressed`/`loading`/`error`/`read-only` into any specific
  screen's content — this spec only adds the CSS classes and (where a
  state needs JS, i.e. `pressed`) the event wiring in `ui/actions.js`.
  Which screens *use* the new states is a separate, per-screen decision.
- Wireframe-skin equivalents — out of scope per "Scope — mockup skin only" above.
