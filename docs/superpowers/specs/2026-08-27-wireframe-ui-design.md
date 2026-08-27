# Spec — fayf_ui wireframe UI library

2026-08-27 · governed by [`CONSTITUTION.md`](../../../CONSTITUTION.md) C1–C8

## Source

Claude Design project `70fcfe2c-96d2-40cf-ac6d-72c1e394d9a7`
"Wireframe UI components and notation" · read via `DesignSync` MCP.

Key file `Wireframe Component Vocabulary.dc.html`:

| turn | content |
|---|---|
| t12 | model — box + path, combinators, layers, 11 dials |
| t2 | 50 parts — 3 sheets: 13 structure · 14 controls · 23 content/notation |
| t11 | handles — proximity algorithm in `data-dc-script` |
| t1 | anatomy screen — 14 parts in place |

`support.js` = Claude Design canvas runtime, pulls React from unpkg → discarded (C4).
Verbatim copy of the doc → `docs/vocabulary.reference.html`.

## Model

2 primitives (`box` · `path`) → 3 combinators (`row` · `stack` · `overlay`)
→ 3 layers (`style` · `relation` · `motion`).
Part = saved preset of dials = JSON file. Never code, never a subclass.

## Ladder

One sequence. Ln uses < n only (C5). Decided 2026-08-27 (C9, 3 questions).

| L | what | from | form |
|---|---|---|---|
| L0 | vocabulary · `parse` · `print` | tokens | `vocabulary.json` + `model.js` (pure) |
| L1 | `resolve` · `diff` | L0 | `model.js` (pure) |
| L2 | `render` · `capture` | L1 + DOM | `render.js` + `tokens.css` — **only DOM writer** |
| L3 | `path` · `relation` · `motion` | L2 | 3 modules |
| L4 | `handles` | L2 + L3 | `handles.js` |
| L5 | atom — single box, no children | L0–L4 | JSON — button, badge, avatar, tag… |
| L6 | cluster — shared sub-assembly, not one of the 50 | L5 | JSON — labeled-row, cell, thumb+track… |
| L7 | component — named part with children | L5–L6 | JSON — field, table, scrollbar… |
| L8 | screen — viewport composition | L5–L7 | JSON — anatomy, gallery |

JS stops at L4. L0–L1 host-neutral → node tests. L2+ browser tests.

Classification rule (mechanical, no judgment): no children → atom;
children + not in the 50 → cluster; children + in the 50 → component;
viewport → screen.

`path` at L3: anchors to rendered box geometry → depends on render → C5.
Doc pairs box+path flat; deviation accepted, reversible.

`relation` data flow: reads **rendered** measures (rect, scroll) after
render, subscribes, writes dials back through render. Never raw DOM writes.

Handles need no new dial (doc, t11): handle = fixed box anchored to
edge/corner; reveal = relation observing the pointer.

## Vocabulary — box tokens

12 dials. Source of truth at runtime: `ui/vocabulary.json`.

```
direction   row · stack · overlay
size        fixed · fill · hug · aspect-locked · clamped
align       start · mid · end · baseline · stretch
distribute  packed · between · around · evenly
position    in-flow · docked · floating · anchored · sticky
place       left · center · right | top · middle · bottom
stroke      bare · hairline · solid · dashed
fill        tint0 · tint1 · tint2 · tint3
radius      square · rounded · pill · circle
overflow    clip · scroll
state       disabled
pad · gap   padN · gapN  =  N × 4px, any N  (pad2 = 8px)
```

Numeric (`key:value`): `t:` `trim:` `rotate:` `opacity:` `depth:` `w:` `h:`.

`place` legal only with `docked · floating · anchored · sticky`, never `in-flow`.
Validator enforces. `align` = children, axis-relative. `place` = self, absolute.

## Vocabulary — path tokens

```
anchors     free · edge · center · corner
segments    straight · elbow · curve · arc
stroke      solid · dashed · dotted  + weight: · cap: · join:
ends        start: · end:  of  none · arrow · dot · bar
closed      open · closed  (closed gains a fill)
trim        trim:0..1 start/end fraction (spinner, gauge)
label       a box anchored at t: along the path
```

## Dial mapping — doc's 11 → ours, complete ledger

| doc dial | ours | note |
|---|---|---|
| child | dropped | was a summary row of pad·gap·direction |
| direction | direction | = |
| size | size | = |
| align | align | `centre` → `mid` (axis-relative triple `start·mid·end`) |
| distribute | distribute | = |
| pad · gap | `padN` · `gapN` | rule N×4px, open-ended like doc's scale |
| position | position | = |
| depth | `depth:` numeric | **scrim: deferred** — add with modal (stage 4, sheet 3) |
| stroke·fill | split: stroke + fill | stroke `none` → `bare`; fill → `tint0–3` (sheets paint tints) |
| radius | radius | = |
| overflow | overflow | = |
| content | JSON key, not token | `nothing · text run · child boxes` |
| — | + `place` | 6 tokens, parameterizes docked/floating/anchored/sticky |
| — | + `state` | `disabled` only; grow on demand |

Spelling repo-wide: `center`, never `centre` (C2).

## Parametrization (C8)

Token string or list; order-independent; per-primitive uniqueness at load.

```json
{ "id": "parts/button", "extends": "base/box",
  "box": "row, mid, hug, pad2, solid, rounded", "content": "Go" }
```

```json
{ "id": "parts/segmented-control", "extends": "base/box",
  "box": "row, gap0, hug",
  "children": [
    { "$ref": "parts/button", "box": "square", "content": "A" },
    { "$ref": "parts/button", "box": "square", "content": "B" },
    { "$ref": "parts/button", "box": "square", "content": "C" } ] }
```

`extends` = inheritance · `$ref` = reference + per-instance overrides.
Merge per dial: child `stack` replaces parent `row`. Never concatenates.

Reserved node keys, fixed at stage 2 so stage-4 parts never get rewritten:

```
id · extends · $ref · box · content · children      in use from stage 2
name · path · from · to · relation · motion          reserved, shaped in stage 5
```

`name` = local id inside one part; path `from`/`to` and relations
address `name.edge` · `name.center` · `name.corner`.

### Variants

Named variant = preset parameterization of one type. Convention over
`extends` — no new mechanism (C3, C9-decided 2026-08-27).

```
id          type.variant          atom/button.primary
file        parts/atom/button.primary.json
rule        MUST extends its type (atom/button)
default     bare type id — smallest config wins
chains      type.variant.sub allowed, each extends the level above
```

```json
{ "id": "atom/button.primary", "extends": "atom/button", "box": "tint3" }
{ "id": "atom/button.ghost",   "extends": "atom/button", "box": "dashed" }
```

Validator: id containing `.` after the last `/` → `extends` must equal
the id up to the last `.`.

## Verbs (C6)

```
parse(tokens)  → dials      print(dials) → tokens (canonical order)
resolve(doc, registry) → flat tree      render(node) → DOM (L0 only)
capture(el)    → JSON       diff(a, b)  → changes (also the test assertion)
```

Invariant, every part and screen:

```
diff(capture(render(resolve(d))), resolve(d)) == empty
```

Honesty note: `render` stamps dials on the DOM, `capture` reads them back →
the invariant catches resolver/merge/serialization drift, **not** visual
correctness. Complement in `render_test.js`: computed-style spot checks —
`hug` → no fixed width · `docked,left` → inset 0 · `gap2` → 8px.

## Tokens (visual)

```
canvas #f0eee9 · paper #fff · ink #222 @1.5px · text #111
muted #8a8579 · accent #c0392b
tint0 #f5f3ef · tint1 #ecebe7 · tint2 #e8e6e0 · tint3 #d8d5cf
dashed #999 · dotted rule #d5d2cc
Architects Daughter (prose) + ui-monospace (labels)
radius 3px · space 4/8/12/16
```

## Handles (t11, verbatim algorithm)

- bands per handle: >84px → 0 · >34px → 10% · >13px → 50% · else targeted red
- speed EMA 0.72/0.28 · slow gate `1-(speed-0.04)/0.34`
- dwell: +0.14 / −0.34 per 100ms tick → ~0.7s to arm, fast sweep lights nothing
- square = resize · pill = move (ghost 15%) · border order R·M·R·M·R
- hits 44px, centre-to-centre · shed ≥280 R·M·R·M·R → 140–280 R·M·R → <140 R·M
- keyboard: focus reveals set at 50%; arrows move, modifier+arrows resize
- exceptions: splitter seam grip (dots = resize) · list left gutter (persistent, no pill)

## Repo

```
fayf_ui/
  justfile  server.py  index.html  CONSTITUTION.md  CLAUDE.md
  ui/      vocabulary.json  model.js  render.js  path.js
           relation.js  motion.js  handles.js  tokens.css
  parts/   base/box.json  atom/*.json  cluster/*.json  component/*.json
  screens/ anatomy.json
  test/    harness.js  js_runner.js  tracer.js  *_test.js
  docs/    vocabulary.reference.html  superpowers/specs/
```

## Server · justfile

`server.py` = python stdlib `http.server`. Ports `infopedia_php/wrapper.php`:

```
/wrapper?test=X.html    inject test/harness.js + test/X_test.js before </body>
/wrapper?trace=X.html   inject test/tracer.js
```

`no-store` on `test/` + `ui/` (stale-asset trap,
`infopedia_processor/backend/api/server.py:566`).

just recipes: `default` (list) · `serve` · `test PAGE` · `trace PAGE`
· `ci` · `build` · `validate`.
`ci`/`validate` headless under node (model layer is host-neutral).
`test PAGE` in browser via injector.

## Testing

`harness.js` · `js_runner.js` · `tracer.js` verbatim from `infopedia_php/test/`.
Test-first per module: `model_test.js` (node) · `render_test.js`
· `handles_test.js` · `parts_test.js` (browser).
Round-trip invariant over all 50 parts = the drift catcher.

## Stages

1. skeleton — server · justfile · harness · smoke page
2. L0–L1 — `vocabulary.json` + `model.js` (parse/print/resolve/diff)
   + invariant + reserved keys
3. L2 — `render.js` + `capture` + `tokens.css` + computed-style checks
4. L5–L7 — 50 parts as JSON, sheet by sheet, filed by classification rule
   (`sheet` kept as metadata field)
5. L3 — `path` · `relation` · `motion` (shapes the reserved keys)
6. L4 — `handles.js`
7. L8 — `screens/anatomy.json` — integration demo

Sequencing note: stage 4 before stage 5 → parts needing paths/relations
(scrollbar thumb, crossbox, spinner) land in two passes — boxes in 4,
paths/relations wired in 5.
