# CLAUDE.md — fayf_ui

## Constitution — read first

[`CONSTITUTION.md`](CONSTITUTION.md) governs this repo. Highest precedence. Amendment only.

C1 output style · C2 vocabulary · C3 simple · C4 no frameworks
C5 reuse level below · C6 JSON canonical · C7 evidence · C8 parametrization
· C9 decisions 1-by-1

## What this is

JS wireframe UI library. Vocabulary source: Claude Design project
`70fcfe2c-96d2-40cf-ac6d-72c1e394d9a7` — "Wireframe UI components and notation".
Read via the `DesignSync` MCP. Verbatim copy: `docs/vocabulary.reference.html`.

## Model

2 primitives (`box` · `path`) → 3 combinators (`row` · `stack` · `overlay`)
→ 3 layers (`style` · `relation` · `motion`). `box` has 12 dials (doc's 11 + `state`).
Config = distinct token string: `"row, mid, hug, pad2, solid, rounded"` (C8).
Part = saved preset of dials = JSON file.
Spec: `docs/superpowers/specs/2026-08-27-wireframe-ui-design.md`.

## Ladder

One sequence, Ln uses < n (C5).

| L | what | form |
|---|---|---|
| L0 | vocabulary · parse · print | pure JS |
| L1 | resolve · diff | pure JS |
| L2 | render · capture | JS + DOM (only writer) |
| L3 | path · relation · motion | JS |
| L4 | handles | JS |
| L5 | atom — 1 box, no children | JSON |
| L6 | cluster — sub-assembly, not in the 50 | JSON |
| L7 | component — named part, children | JSON |
| L8 | screen | JSON |

JS stops at L4. L0–L1 test under node, L2+ in browser.

## Commands

```bash
just
```

`serve` · `test PAGE` · `trace PAGE` · `ci` · `build` · `validate`
