# Project TODO Archive

Closed (`done`/`dropped`) entries moved out of `.ai/todo.md`. Newest first.
Same schema as `.ai/todo.md`.

| ID | Title | Priority | Status | Comment | Dependencies | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TODO-4 | Implement conditional resolve — env-scoped `extends`/`box` switch | Medium | done | Implemented per `docs/superpowers/specs/2026-08-28-conditional-resolve-design.md`: `condition` vocabulary category, `conditional`/`condition` reserved keys, `resolve(doc, registry, env, seen)` gains `env` param + specificity-based candidate pick (most `condition` tokens wins, tie/no-match both error, unknown token errors), outer `name` preserved on the winning candidate. 8 new node tests in `test/node/resolve_test.js`, all green. Memoization explicitly deferred (spec calls it out-of-scope for v1; no test demands it). | | 2026-08-28 | 2026-08-29 |
