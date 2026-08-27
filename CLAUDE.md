# CLAUDE.md — fayf_ui

## Constitution — read first

[`CONSTITUTION.md`](CONSTITUTION.md) governs this repo. Highest precedence. Amendment only.

C1 output style · C2 vocabulary · C3 simple · C4 no frameworks
C5 reuse level below · C6 JSON canonical · C7 evidence · C8 parametrization

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

| L | What | From |
|---|---|---|
| L0 | `box` | DOM |
| L1 | `path` · `relation` · `motion` | L0 |
| L2 | `handles` | L0 + L1 |
| L3 | 50 parts (JSON) | L0–L2 |
| L4 | screens (JSON) | L3 |

JS stops at L2.

## Commands

```bash
just
```

`serve` · `test PAGE` · `trace PAGE` · `ci` · `build` · `validate`
