# Project TODO List

Still-open follow-up items. Adapted from `fayf_smartskills/.ai/todo.md`'s
extended format.

**Schema:** `ID | Title | Priority | Status | Comment | Dependencies | Created | Updated`
- **Priority:** `Critical` / `High` / `Medium` / `Low`.
- **Status:** `open` / `in-progress` / `blocked` / `done` / `dropped`.
- **Comment:** why the item exists, current thinking.
- **Dependencies:** comma-separated IDs this item can't usefully start before;
  empty when there's no real gating relationship.
- **Created / Updated:** `YYYY-MM-DD`.

Closing an item sets `Status: done`, `Updated`, then moves the row to
`.ai/archive.md` (newest-first) in the same change.

| ID | Title | Priority | Status | Comment | Dependencies | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TODO-1 | Author line-art icons for Shop/Training/Lecture/Free Learning | Medium | open | Only `icon-dashboard` ported so far (Heroicons v2 outline, MIT, via `infopedia_processor/frontend/icon-sprite.js`). Remaining 4 nav ids fall back to the `cluster/dot` placeholder in `parts/component/app-nav-rail.json`. Hand-author own line-art per that repo's own precedent (its `D-R4-INLINE` category icons), add to `ui/icons.js`'s `ICONS` list + sprite. | | 2026-08-28 | 2026-08-28 |
| TODO-2 | Wire real pointer-proximity rollout for the nav rail (closed → expanded on approach) | Medium | open | `component/app-nav-rail` (closed, icon-only) and `component/app-nav-rail.expanded` (icon+text) exist as static variants. The dynamic "roll out on approach" behavior needs a new L3 relation measure in `ui/relation.js` (today only `scroll-fraction` exists) — analogous to `component/scrollbar`'s existing `relation` usage, so the variant would still only declare it via JSON once the measure exists. | | 2026-08-28 | 2026-08-28 |
| TODO-3 | Build remaining workspace screens: Shop, Training, Lecture, Free Learning | Medium | open | Step1 shipped only `screens/math-trainer-dashboard.json`. Nav rail already scaffolds all 5 sections (4 disabled). Each new screen composes from existing L0-L7 parts, same pattern as the dashboard. | | 2026-08-28 | 2026-08-28 |
| TODO-4 | Implement conditional resolve — env-scoped `$ref`/`box` switch | Medium | open | Fully speced in `docs/superpowers/specs/2026-08-28-conditional-resolve-design.md`: new `conditional`/`condition` reserved keys, new `condition` vocabulary category, `resolve(doc, registry, env)` gains env param + specificity-based candidate pick, memoized. Needs new node tests (C6 invariant under non-empty env, ambiguous-tie error, missing-match error). Not started. | | 2026-08-28 | 2026-08-28 |
