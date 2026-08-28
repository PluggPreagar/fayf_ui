# Spec — conditional resolve (env-scoped `extends`/`box` switch)

2026-08-28 · governed by [`CONSTITUTION.md`](../../../CONSTITUTION.md) C1–C10
· addendum to [2026-08-27-wireframe-ui-design.md](2026-08-27-wireframe-ui-design.md)

Status: **designed, not implemented**. Tracked as `TODO-4` in [`.ai/todo.md`](../../../.ai/todo.md).

## Motivation

Building `screens/math-trainer-dashboard.json` surfaced a real need: a screen
built for one canvas size will eventually need per-environment variation
(desktop nav rail vs mobile bottom tabs, a different primary-action part on
mobile, etc.). Full per-size screen duplication (a separate `screens/*.json`
per size) was considered and rejected — see Alternatives below.

## Vocabulary addition

New top-level category in `ui/vocabulary.json`, alongside `box`/`path`:

```
condition   desktop · mobile · dark · …   (registered, extensible — C2: no free-form strings)
```

Starting set illustrative only (`desktop`/`mobile`/`dark` used in examples
below) — grow the enum on demand (C7), same as any other dial.

## New reserved keys

Two, added to `RESERVED` in `test/node/parts_validate_test.js` alongside
`children`/`relation`/`motion`:

- `condition` — array of tokens on one candidate node. Missing = unconditioned
  default (matches any env).
- `conditional` — array of candidate node-objects (same shape as any
  `children` entry: `extends`/`box`/`content`/`name` all valid), sibling-level
  concept to `children`. `children` = all render, always. `conditional` =
  exactly one wins per env.

`extends` itself is untouched — always a plain string, everywhere, no
polymorphism. `conditional` entries use `extends` normally.

## Resolve algorithm

`resolve(doc, registry, env)` — `env`: array of active condition tokens.

1. For each `conditional` list: filter to candidates where
   `candidate.condition ⊆ env` (empty/missing `condition` ⊆ anything —
   always a candidate). This filtered set = the "relevant superset".
2. Winner = candidate with the **most** `condition` tokens (most specific).
3. Two candidates tie at the same specificity, both matching → **error**.
4. No candidate matches at all (no conditioned match, no unconditioned
   default) → **error**. No silent gaps (C10 spirit — matches C2's
   "unknown token → error, not tolerated").
5. The outer `conditional` node's own `name` (if any) is preserved on the
   winning candidate after substitution, so relation/motion lookups by name
   stay stable regardless of which candidate won.

`children` entries are unaffected — grouping/filtering is opt-in, only
triggered by the presence of a `conditional` key. Zero impact on existing
parts/screens.

## Cache

Memoize `resolve(id, env)`. Key = `(id, JSON.stringify(env))`, env
**unsorted** — duplicate cache entries for equivalent-but-differently-ordered
envs are acceptable (a missed hit, not a correctness bug). Do not spend
effort on minimal/canonical keys (explicitly out of scope for v1).

## Example

```json
{ "name": "button", "conditional": [
  { "condition": ["mobile","dark"], "extends": "component/fab.dark", "box": "w:20" },
  { "condition": ["mobile"], "extends": "component/floating-action-button" },
  { "extends": "atom/button.primary" } ] }
```

| env | superset | winner |
|---|---|---|
| `["mobile","dark"]` | rows 1 (2 tokens), 2 (1 token), 3 (0) | row 1 — most specific |
| `["mobile"]` | rows 2 (1 token), 3 (0) | row 2 |
| `[]` | row 3 only | row 3 |
| `["mobile","dark"]` + a hypothetical 4th row also `["mobile","dark"]` | rows 1 & 4 tie | **error** |

## Alternatives considered and rejected

- **Separate `screens/*.json` per canvas size** — no shared structure across
  sizes, every unrelated edit needs replicating N times. Rejected: doesn't
  scale past 2 sizes without drift.
- **Same-`name` sibling grouping in plain `children`, no new key** — array
  reads as "these N render" but means "pick 1 of N" — misleading shape.
  Rejected for the same reason `switch`/`select` lost to `conditional`/`cases`:
  syntax must say what it does.
- **`extends` string as object key** (`{"component/fab.dark": ["mobile","dark"]}`)
  — makes `extends` a second way to say "extends" (C2 violation), leaves no room
  for a candidate's own `box`/`content` overrides, and breaks the uniform
  `RESERVED`-key validation (keys become arbitrary ref strings). Rejected.
  Same objection compounds if `extends` itself is made polymorphic (string vs
  array-of-maps) — two meanings for one field name, silently switched by
  JSON type. Rejected harder.
- **`variants` / `switch` / `options` as the key name** — `variants` collides
  with the existing `type.variant` file-naming convention (C2, same name
  used for two concepts). `switch`/`select` read as verbs, breaking the
  noun-container pattern `children`/`relation`/`motion` all share. `options`
  implies a person choosing, but this resolves automatically at build time.
  Settled on `conditional`/`condition` — no collision, reads correctly as a
  pair, matches the noun-container pattern.
- **Ambiguity = always an error** (first draft) — rejected in favor of
  specificity-based selection (CSS-cascade-like): most-specific match wins
  deterministically; error is reserved for genuine ties, not for "more than
  one candidate merely matches."

## Open / deferred

- Full implementation of `resolve()`'s env parameter + grouping/specificity
  logic — not started.
- New node tests: C6 invariant under a non-empty `env`; ambiguous-tie error;
  missing-match error.
- Starting `condition` enum values beyond the illustrative `desktop`/
  `mobile`/`dark` — decide when the first real conditional screen is built.
