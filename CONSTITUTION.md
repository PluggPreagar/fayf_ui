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
- `extends` = inheritance. `$ref` = reference.
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
