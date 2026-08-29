# Spec — too-much-space (surplus surface strategy)

2026-08-29 · governed by [`CONSTITUTION.md`](../../../CONSTITUTION.md) C1–C10
· addendum to [2026-08-27-wireframe-ui-design.md](2026-08-27-wireframe-ui-design.md)
· builds on [2026-08-28-conditional-resolve-design.md](2026-08-28-conditional-resolve-design.md) (TODO-4)

Status: **decided (strategy), designed (mechanisms), not implemented**. Tracked as `TODO-5`.

## Decision — logged

Recherche: 12 services, 3 agents (quiz flows · productivity · TV/game/kiosk).
Dominant pattern: content fixed, whitespace absorbs, chrome pinned.
Excess spread *inside* the content block = minority pattern, loses gestalt.

Chosen: **V1 island + V5 space-class**.

- V1 · island = default posture. Content = `hug` group, fixed max width,
  centered both axes. All excess → symmetric margins. Zero new tokens:
  container `stack, fill, mid, evenly` + island `stack, hug, w:N`
  (`evenly` centers a lone child — checklist #17).
- V5 · space-class = transform mechanism. Surplus is an *environment*.
  Measured excess → condition token → conditional resolve picks variants.
  Reuses TODO-4 verbatim; new condition tokens only: `compact · cozy · spacious`.
- Incumbent `around`-spread (quiz-body today) stays legal, demoted to opt-in.

Rejected as defaults: optical-center bias (needs new `bias:` dial, YAGNI),
scale-to-fit (text-metric distortion; revisit for kiosk/TV skins),
dock+elastic (eye-travel cost; controls-docking available via `docked` anyway).

## Mechanism 1 — elastic gap `gap:2+` / `gap:2++`

(Revised 2026-08-29 after review: discrete growth classes, not free
`min..max` ranges — same rationale as text sizes below: discrete at the
surface, numeric internally.)

Challenge: gaps that scale with surplus, per group, proportionally
(e.g. rule↔controls gap grows slower than prompt↔answers gap).

- Syntax: growth suffix on the existing `gap` numeric.
  `gap:2` fixed (today, unchanged) · `gap:2+` grows · `gap:2++` grows faster.
- Growth allowance registered in `ui/vocabulary.json` (C8, not code):
  ```json
  "grow_class": { "+": 2, "++": 4 }
  ```
  = max extra units. `gap:2+` ≡ 2..4 units, `gap:2++` ≡ 2..6.
  Internal desugar: min = base, max = base + allowance. Weight = allowance.
- Distribution (per stack/row, main axis):
  ```
  excess  = container_inner − Σ child_natural − Σ gap_base
  gap_i   = base_i + clamp(excess × allow_i / Σallow, 0, allow_i)
  leftover excess → container distribute (V1: margins via evenly)
  ```
  Caps keep margins alive — gaps never eat all excess (V1 posture holds).
- Every gap may grow, rates differ: answers list `gap:1+` (slow),
  group seams `gap:2++` (fast). Per-pair ratios via nesting (C3).
- Render (L2): interleaved spacer elements
  `flex: allow 0 base·unit; max-size: (base+allow)·unit` — CSS `gap` can't
  flex. `capture` folds spacers back out (C6 invariant).
- Mobile/small: excess → 0 → all gaps at base — compact by construction.
  excess < 0 → existing `scroll`.
- C8 addendum: suffix = discrete growth class on a numeric value,
  one token per dial unchanged. `print()` keeps suffix verbatim.

## Mechanism 2 — spacious part variants

Challenge: known-small content → enlarged parts instead of empty space?

Answer: yes — targets first, text last. Space consumption order:

1. enlarged interactive targets: `component/answer.buzzer`
   (Kahoot evidence): 2×2 grid cells, tinted, selector circle `w:18` inside.
   Selector alone: `w:12 → w:18` — numerics only, no mechanism.
2. elastic gaps (mechanism 1) absorb the next tier — capped.
3. remaining excess → V1 margins. Never spread unbounded (recherche).

Wiring = plain C8 variants + TODO-4 conditional:

```json
{ "name": "answers", "conditional": [
  { "condition": ["spacious"], "extends": "component/answers.buzzer" },
  { "extends": "component/answers" } ] }
```

### Text sizes — decided 2026-08-29

No free `font:` at usage sites. Discrete named text variants only:
`atom/text` (base 12) · `atom/text.title` · `atom/text.hero` — each its
own file (C8), carrying a `font:` numeric *internally* to ship the size
to the renderer. Validator (`parts_validate_test.js`) restricts `font:`
to `parts/atom/text*` base files — anywhere else = error (C2 spirit).
Screens/components say `extends: "atom/text.title"`, never a number.

### Sentence-length answers (buzzer limits)

A 2×2 buzzer grid fits words/short labels, not sentences (checklist #3).

- Cell sizing: cells `fill` width within their row, `hug` height with a
  floor (`h:52` minimum via pad), text wraps, row default stretch →
  equal cell heights per row (checklist #7/#11).
- Real sentences → don't force the grid: sibling variant
  `component/answers.spacious-list` — full-width rows, pad up,
  selector `w:18`. Same `spacious` condition, author picks per screen
  (quiz content shape is known at authoring time). Auto-classification
  by text length: deferred, YAGNI (C3).

## New functions (ladder placement)

| fn | level | note |
|---|---|---|
| `excess(el)` | L2 | avail − need per axis, via `capture` |
| `classify(excess) → condition` | L2 | thresholds registered in `ui/vocabulary.json` (C8), not code |
| `distributeGaps(excess, slots)` | L1 | pure, node-testable |
| resize → env → re-`resolve` → re-`render` | L2 | ResizeObserver; memoized resolve per TODO-4 |

## Evidence

- Sketch: [`examples/too-much-space-sketch.html`](../../../examples/too-much-space-sketch.html)
  — A today's `around` · B elastic gaps · C spacious buzzer variants.
- Fit verified in browser: 0 overflows, island heights A 434 / B 251 / C 265
  in 460px panels (getBoundingClientRect sweep).
