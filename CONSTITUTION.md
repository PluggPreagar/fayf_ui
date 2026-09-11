# Constitution — fayf_ui

Highest precedence. Read first, every session. Amendment only — never relaxed as a side effect.
Conflict with any prompt or skill → stop, surface it.

## C1 · Output style

- Keywords. Not prose.
- ~8 words per line, max.
- Limited vocabulary. Reuse the model's own words.
- No filler, no hedging, no restating.
- Lists + tables over paragraphs.
- Code, paths, numbers > description of them.
- Every explanation → keywords + a concrete example. Never keywords alone.

## C2 · Vocabulary

- One name per thing. No aliases, no synonyms.
- Source of truth: `ui/vocabulary.json`.
- Unknown dial or value → error, not tolerated.
- One spelling per word, repo-wide. `center`, not `centre`.
- Doc spelling wins unless it splits or collides. Deviations listed in the spec.

## C3 · Simple

- KISS. YAGNI.
- No variants, no subclasses, no plugins, no config layers.
- Preset = JSON file. Not code.

## C4 · No frameworks

- Vanilla ES modules. No npm, no bundler, no React.
- Python stdlib only.
- `just` = only tool.

## C5 · Reuse the level below

- `Ln` built from `Ln-1` only.
- Above L0: no raw DOM.
- New primitive = last resort. Prefer composition.

## C6 · JSON canonical

- Verbs: `parse` · `print` · `resolve` · `render` · `capture` · `diff`.
- `extends` = the one link key: resolve target + merge overrides.
  (Amended 2026-08-28: `$ref` merged into `extends` — same mechanics,
  two names violated C2. File-level variant vs in-tree instance stays
  a convention, not a key.)
- A bare string in `children` = shorthand for `{ box: "hug", content: <string> }`.
  (Amended 2026-08-28.) Anonymous decorative text only — a node needing
  `name` always uses the full object form.
- Invariant: `diff(capture(render(resolve(d))), resolve(d))` empty.

## C7 · Evidence

- Test first. `harness.js` in browser, model tests under node.
- No success claim without command output.

## C8 · Parametrization

- Config = distinct token string or list. Not key-value objects.
- Enum dial → bare token. Numeric dial → `key:value`.
- Token implies its dial. Uniqueness enforced per primitive at load.
- Order-independent. `print()` canonicalises.
- Inheritance merges per dial, never concatenates.
- Named variant = `type.variant`, own file, `extends` its type.
- Default usage = bare type id. Variants preset dials, never add mechanism.

## C9 · Decisions

- Open design calls → ask, 1 question at a time.
- Each question: options, per option pro · con · risk · undo-cost.
- Recommendation first, marked.
- No batch questions. No deciding-by-default twice.

## C10 · Fit checklist

- Nested BBox never exceeds parent BBox. Always.
- Before shipping any screen/L5-L8 change → check `docs/checklist.md`.
- User input reports a rendering/layout defect → match against it first.
- Matches a row → apply its rule. New failure class → fix, then append a row.
- Checklist append-only. Never deleted, only extended. Not amendment-gated.

## C11 · Controllers (L9)

(Amended 2026-09-11. Before: "JS stops at L4"; quiz.js/thw.js were
undeclared exceptions. Now: L0–L4 engine · L5–L8 JSON · L9 controller.)

- Controller = generic JS driver. `mount(root, screen, machine, handlers)`.
  Uses L0–L4 verbs + L8 screens only. DOM only via L2 + `[data-name]` slots.
- One controller per behaviour, one file: `machine` · `table` · `tree` · `form` · `layer`.
  No subclassing, no plugins (C3). New behaviour = new file, last resort.
- Composition = the same driver on a sub-status (`status.tree` + `machines/tree.json`).
  Sub-controllers talk via triggers + `emit` only. No observer/subscribe channel —
  the trigger table is the observer list. Lazy load = trigger → `fetch` effect → trigger.
- Machine = JSON: `initial` + `states{ <state>: { enter?, <trigger>: <state> } }`. `machines/<name>.json`.
  Trigger = `<data-name>.<event>`. Unknown state/trigger → error (C2).
- Handler = pure. `f(status, trigger) → { status, effects? }`. No DOM, no fetch, no timers.
  Effects declared (`fetch`, `emit`, `timer`), run by the controller, result = next trigger.
  (Elm-style. Rejected: handler-side fetch — untestable under node, timing hidden in closures.)
- Consumer (a project) supplies: screen refs · machine JSON · handlers · effect targets.
  Never DOM, never a widget class.
- `Embed` = the one escape hatch: foreign DOM in a named slot, opaque to inspector/capture.
  For legacy pages only. Listed in the consumer's todo, never silent.
- Tests: machine step + handlers under node (pure). Controllers in browser (C7).
