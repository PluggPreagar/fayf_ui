# Spec — `luna` skin (THW-Lernkarten style) + fayf_processor option check

2026-09-09 · governed by [`CONSTITUTION.md`](../../../CONSTITUTION.md) C1–C10
· addendum to [2026-08-27-wireframe-ui-design.md](2026-08-27-wireframe-ui-design.md)
· builds on [2026-08-30-state-rules-design.md](2026-08-30-state-rules-design.md)

Status: **steps 1–9 shipped 2026-09-09** (skin + fonts + `ok`/`warn` + 3-way toggle,
proof `quiz.html?style=luna`, 6 variants). Steps 10–11 pending (decision 4 open). Deviations from the plan
below are marked **(shipped as)**.

Source: `D:\_project\202601_THW\thw_lernkarten.html` (external, ~1MB —
base64 fonts + images). Not copied verbatim: too heavy. Step 1 extracts its
`<style>` block only → `docs/luna.reference.css`.

## Motivation

- THW-Lernkarten = a finished, product-grade look. Real users, real content.
- fayf_ui has 2 skins: `wireframe` (structure) · `mockup` (Claude Design brand).
- Same mechanism, 3rd value → THW look reusable for every screen. Zero rewrite.
- Second goal: does fayf_ui fit `fayf_processor`? Answered below, §C.

## Decisions taken (C9, one at a time)

| # | question | decision | rejected |
|---|---|---|---|
| 1 | skin scope | **3rd skin `luna`** — `data-style="luna"` | replace mockup palette · separate stylesheet |
| 2 | fonts | **local woff2 `ui/fonts/`** (~230KB, OFL) | base64 inline (+310KB css) · system stack only |
| 3 | static amber/green fills | **`fill-tint` += `ok`, `warn`** (precedent: `brand`) | reuse `.bx-correct/.bx-wrong` statically (C2 alias) · drop them |

## Open decisions (ask when reached)

| # | question | when |
|---|---|---|
| 4 | THW card screen: extend `ui/quiz.js` schema (`mode:"self"`) vs new controller | step 9 |
| 5 | fayf_processor: option 1 (design tool) → spike 4 (bridge)? | after step 8 |

## A · Source inventory (THW → fayf_ui)

| axis | THW | fayf_ui today | luna |
|---|---|---|---|
| palette | blue `#00518c` · amber `#c97a00` · green `#1f7a4d` · bg `#e8edf1` · surface `#fff` · surface-2 `#dbe4ea` · border `#c3cfd8` · ink `#0f1c26` · ink-dim `#516272` · focus `#0b6fb3` | `--canvas --paper --ink --text --muted --accent --ok --tint0-3 --brand --brand-surf` | var block, table below |
| dark mode | `prefers-color-scheme` + `data-theme` | none | **out of scope** (YAGNI) |
| type | Saira Condensed 500/600/700 (display, uppercase) · Source Sans 3 400/500/600/700 (body) · JetBrains Mono 500/700 (meta) | `--prose` Architects Daughter · `--mono` | `--display --prose --mono` |
| radius | 6 · 8 · 10 · 14 · 20/pill | `rounded` = 3px hardcoded | `--r-rounded` var: 3px wf/mockup · 8px luna |
| border | 1px | 1px hairline · 1.5px solid | unchanged |
| shadow | 2-layer soft | mockup: `0 1px 2px` | luna: THW shadow on `.bx-solid` |
| hover | border → blue | `filter:brightness(.94)` | keep `filter` only — THW's hover border **not ported**: `border-color` is error's channel, `border-left-color` selected's (channel rule wins) |
| focus | `2px solid focus` | `2px dashed --ink` | luna: solid, `--focus` |
| pressed | `translateY(1px)` | inset shadow | keep inset (channel rule) |
| disabled | `.6` | `.45` | keep |
| correct | green tint + green border | green tint | keep |
| wrong | **amber** tint | **red** tint | luna: `--wrong: var(--warn)`; others `--accent` |
| raster | ad hoc | 4px | 4px |

### Token map (luna var block)

| fayf_ui var | THW value | note |
|---|---|---|
| `--canvas` | `#e8edf1` bg | |
| `--paper` | `#ffffff` surface | |
| `--tint0` | `#f4f7f9` | between bg and surface — invented step |
| `--tint1` | `#e8edf1` | = bg |
| `--tint2` | `#dbe4ea` | = surface-2 |
| `--tint3` | `#c3cfd8` | = border |
| `--ink` | `#c3cfd8` border | stroke colour, same role as mockup |
| `--text` | `#0f1c26` | |
| `--muted` | `#516272` | |
| `--rule` | `#c3cfd8` | |
| `--dash` | `#8fa2b1` | invented, between border and muted |
| `--brand` | `#00518c` | |
| `--brand-surf` | `#dbe9f4` | |
| `--ok` | `#1f7a4d` | |
| `--ok-surf` | `#d9efe1` | **new var** (all skins) |
| `--warn` | `#c97a00` | **new var** (all skins) |
| `--warn-surf` | `#fbe8cc` | **new var** (all skins) |
| `--accent` | `#c0392b` | unchanged (error red) |
| `--wrong` | `var(--warn)` | **new var**; wf/mockup = `var(--accent)` |
| `--focus` | `#0b6fb3` | **new var**; wf/mockup = `var(--ink)` |
| `--r-rounded` | `8px` | **new var**; wf/mockup = `3px` |
| `--display` | `'Saira Condensed', sans-serif` | **new var**; wf/mockup = `var(--prose)` |
| `--prose` | `'Source Sans 3', 'Segoe UI', system-ui, sans-serif` | |
| `--mono` | `'JetBrains Mono', ui-monospace, monospace` | |
| `--shadow` | `0 1px 2px rgba(15,28,38,.06), 0 8px 24px -12px rgba(15,28,38,.18)` | **new var** |

### `ok` / `warn` fill tokens (decision 3)

```
vocabulary.json  fill-tint: [tint0, tint1, tint2, tint3, brand, ok, warn]
tokens.css       .bx-ok{background:var(--tint3)}   .bx-warn{background:var(--tint3)}     /* wireframe: grey like brand */
                 :root[data-style="mockup"] .bx-ok{background:var(--ok-surf);color:var(--ok)}   (+ .bx-solid.bx-ok border)
                 :root[data-style="luna"]   same shape
```

Wireframe stays monochrome → `brand`/`ok`/`warn` indistinguishable there.
Intended: wireframe = structure only. Hover exclusion list
(`.bx-actionable:hover:not([class*="bx-tint"]):not(.bx-brand)`) gains
`:not(.bx-ok):not(.bx-warn)` — same bug class as brand round 5.

### Part mapping (THW class → fayf_ui part)

| THW | fayf_ui | action |
|---|---|---|
| `.chip` | `atom/chip` | exists |
| `.chip[aria-pressed]` | `atom/chip.active` | **new variant** — `brand` fill |
| `.status-pill` `.level-pill` | `atom/badge` | check pill radius; variants `.ok` `.warn` |
| `.stat` tile | `component/card` | check; else `component/stat` |
| `.progress-*` `.xp-*` | `component/progress-indicator` | exists |
| `.code-plate` | `atom/text.hero` + `brand` | **new variant** `text.plate` |
| `button.action.hintish` | `atom/button.hint` | **new variant** — `warn` |
| `button.action.knowish` | `atom/button.know` | **new variant** — `ok` |
| `.next-btn` | `atom/button.primary` | exists |
| `.ghost-btn` | `atom/button.ghost` | exists |
| `.mc-option` + `.letter` | `component/answer` | exists — selector child = letter content |
| `.result-panel` | stack of `atom/text*` | screen JSON only |
| `.done-banner` | `component/inline-banner` | exists |
| `.faq-item` `<details>` | — | **out of scope** (needs disclosure controller) |
| `.legal-footer` | — | out of scope |

## B · Steps

| # | step | files | test |
|---|---|---|---|
| 1 | extract THW `<style>` → `docs/luna.reference.css` | docs | — |
| 2 | new vars in base `:root` (`--ok-surf --warn --warn-surf --wrong --focus --r-rounded --display --shadow`), mockup unchanged visually | `ui/tokens.css` | state-rules + quiz suites green, screenshots identical |
| 3 | `.bx-rounded{border-radius:var(--r-rounded)}` · `.bx-wrong{…var(--wrong)…}` · focus ring `var(--focus)` | `ui/tokens.css` | same |
| 4 | fonts: Python stdlib script decodes 9 base64 blocks → `ui/fonts/*.woff2` · `@font-face` block · one-off script, not kept. **(shipped as)** 5 files, not 9: THW embedded byte-identical files for every Source Sans weight and both JetBrains weights (SHA256-verified) → one file each with a `font-weight` range; Saira has 3 real cuts | `ui/fonts/` `tokens.css` | `document.fonts.check()` |
| 5 | `:root[data-style="luna"]` var block (token map above) + luna-only rules: solid focus, display face on `.bx-brand/.bx-ok/.bx-warn` + `[data-name="prompt"]`, `.bx-solid` shadow via `--shadow`. Every mockup "realistic rendering" rule became an explicit `mockup, luna` selector list (not `:not(wireframe)` — fixture pages without `data-style` must stay wireframe) | `ui/tokens.css` | **(shipped as)** 2 blocks in `test/state-rules_test.js`, no new fixture page (C3): every var resolves per skin · wireframe/mockup pinned to pre-luna values (3px, red wrong, ink focus, old shadow) · luna 8px/amber/Saira · fonts loaded · selector-list rules present |
| 6 | `MODES = ['wireframe','mockup','luna']`, toggle cycles, label = next mode | `ui/style-mode.js` | inspector/math-trainer toggle tests |
| 7 | vocabulary `ok` `warn` + CSS + hover exclusion | `ui/vocabulary.json` `tokens.css` | node `model_test`, gallery invariant, hover regression |
| 8 | **proof**: `quiz.html?style=luna` screenshot vs THW | — | visual, C7 evidence. **(found live)** the committed `ui/quiz.js` tints the hint *panel* on reveal (user edit, "color hint-panel not hint-text") but still reset the *text*'s classes on re-entry → question 2's panel stayed amber. Fixed (`enterAnswering` resets `hintPanelEl`), test asserts the reset; dead `[data-name="hint-text"]` colour rules removed |
| 9 | variants: `chip.active` `button.hint` `button.know` `text.plate` `badge.ok` `badge.warn` | `parts/` | **(shipped as)** `chip.active` `chip.ok` `chip.warn` `button.hint` `button.know` `text.plate` — THW's status/level pills are small pill *labels*, i.e. `atom/chip` (hug, pill, pad:1), not `atom/badge` (a fixed 14px count circle); `badge.*` would have been the wrong type. Windows `test/node/registry.js` bug fixed on the way (`fileURLToPath` + separator normalisation) → `parts_validate`/`answer_variant` finally run here: node 76/76 · gallery 71/71 |
| 10 | decision 4 → `screens/thw-card.json` + `thw.html` (+ `content/thw/*.json`) | screens, content | `test/thw_test.js` |
| 11 | channel audit × 3 skins | `test/state-rules_test.js` | extend |
| 12 | `.ai/todo.md` TODO-7 rounds · checklist row if a fit bug surfaces | docs | — |

Effort: 1–6 ≈ 1 session · 7–9 ≈ 1 · 10–11 ≈ 1–2.

### Known tradeoffs

- **Font reflow on toggle.** Mockup deliberately keeps `--prose` (tokens.css
  comment: 6–8px hug-width jumps). Luna changes families → every `hug` box
  reflows when toggling. Accepted: luna = product skin, not a compare skin.
- **`wrong` hue per skin.** THW amber ≠ fayf_ui red. Var, not unification.
- **Focus channel.** Solid vs dashed — still `outline`, still one channel.
  Channel rule from state-rules spec holds.
- **Wireframe can't show `ok`/`warn`/`brand` apart.** By design.

## C · fayf_processor — option check

### Facts

- `frontend/`: vanilla multi-page, no npm, no bundler. `ui-kit/` (EPIC-15):
  widgets + token vocab `align valign weight tone density border size inset gap`.
- `design-tokens.css` vendored, **read-only** below marker. CG-DS1–5 strict:
  token-only colours/spacing/type · focus = `box-shadow` ring · 44px targets.
- `frontend/mockups/*.html` = hand-written design-delta pages. Load
  `design-tokens.css` only. CG-DS-exempt by precedent.
- `docs/screen_flows.md`: "Sketches are text-only wireframes".
- Both on **4px raster**: `pad:2` ≡ `inset2` ≡ 8px. `row stack mid` shared words.
- Both JSON-spec driven: `capture()` ↔ `UI.project()`.
- Zero references to fayf_ui. No open processor TODO touches it (CG9 checked).

### Conflicts (if fayf_ui CSS shipped as product CSS)

| rule | fayf_ui | fit |
|---|---|---|
| CG-DS2/3 raw px | `pad*4px` · `font:px` · radius px | ✗ |
| CG-DS4 focus | `outline`, no `box-shadow` ring | ✗ |
| CG-DS1 palette | own vars | ✓ **if** skin aliases `--color-*` |
| vocabularies | `pad` vs `inset` · dials vs tokens | bridge table, never merge |
| module format | ESM + `import … with {type:'json'}` | ✓ modern browsers |

### Options

| opt | what | pro | con | risk |
|---|---|---|---|---|
| **1 design tool** ★ | vendor `ui/`+`parts/` → `frontend/vendor/fayf_ui/` + `RECEIPT.json` (existing convention) · skin `processor` aliasing `--color-*` · port `mockups/badges.html` as screen JSON | CG-DS exempt (mockups precedent) · inspector + skin toggle free · CG-DS1 single truth kept | vendored copy drifts | low |
| 2 flow wireframes | `screen_flows.md` → screens JSON | renderable flows | authoring cost | low |
| 3 runtime lib replacing ui-kit | — | — | ui-kit has widgets/commands/tables fayf_ui lacks · CG-DS ✗ | **high — not now** |
| 4 bridge | `capture()` JSON → `UI.project()` spec via dial→token map | 4px raster 1:1 · design→product handoff | converter upkeep | med — **1-day spike** |

Recommendation: **1 → spike 4**. Sequence: after step 8 (luna proof) so
the `processor` skin reuses the same var-block mechanism twice-proven.
Gate: processor CG7 (constitution spine + `frontend_developer.md`) and
its `communication-formats.md` before any edit there.

## Found live during step 8 (unrelated to luna, fixed in the same round)

- `render()` wrote `data-box` unconditionally (`""` for a box-less node) while
  `capture()` read it by truthiness → `box:""` (legal, zero dials) and
  "no box" both came back `undefined`. Gallery invariant on `screens/quiz`
  (hint-text `box:""`) failed. Fixed: write only when `node.box != null`,
  read by presence. Same bug class + fix shape as the earlier `content:""`
  (`dataset.hasContent`). Regression suite added to `test/render_test.js`.

## Out of scope (logged, not planned)

dark-mode axis · `<details>` disclosure part · XP/rank/streak logic ·
FAQ/legal footer · THW media (mp4/jpg/pdf) · dark THW palette.

## Tests summary (C7)

- `test/skin_test.js` new — per skin: all vars resolve, fonts loaded, `--r-rounded` applied.
- `test/state-rules_test.js` — channel audit × 3 skins.
- Existing: quiz · math-trainer · anatomy · index gallery · node 66/66 — every step.
- Visual: `quiz.html?style=luna` vs THW screenshot (step 8).
