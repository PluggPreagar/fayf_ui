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
| TODO-1 | Author line-art icons for Shop/Training/Lecture/Free Learning | Medium | open | Only `icon-dashboard` ported so far (Heroicons v2 outline, MIT, via `infopedia_processor/frontend/icon-sprite.js`). Remaining 4 nav ids fall back to `ui/icons.js`'s shared `icon-placeholder` glyph (dashed-circle outline). Hand-author own line-art per that repo's own precedent (its `D-R4-INLINE` category icons), add to `ui/icons.js`'s `ICONS` list + sprite -- each replaces the placeholder glyph automatically once listed. | | 2026-08-28 | 2026-08-28 |
| TODO-2 | Wire real pointer-proximity rollout for the nav rail (closed → expanded on approach) | Medium | open | `component/app-nav-rail` (closed, icon-only) and `component/app-nav-rail.expanded` (icon+text) exist as static variants. The dynamic "roll out on approach" behavior needs a new L3 relation measure in `ui/relation.js` (today only `scroll-fraction` exists) — analogous to `component/scrollbar`'s existing `relation` usage, so the variant would still only declare it via JSON once the measure exists. | | 2026-08-28 | 2026-08-28 |
| TODO-3 | Build remaining workspace screens: Shop, Training, Lecture, Free Learning | Medium | open | Step1 shipped only `screens/math-trainer-dashboard.json`. Nav rail already scaffolds all 5 sections (4 disabled). Each new screen composes from existing L0-L7 parts, same pattern as the dashboard. | | 2026-08-28 | 2026-08-28 |
| TODO-5 | Implement too-much-space: V1 island default + V5 space-class, elastic `gap:min..max`, spacious variants | Medium | in-progress | Shipped so far (all green, `node --test test/node/*.js` + browser harness, incl. registry-wide invariant sweep + `quiz_test.js` interaction suite): `atom/text`/`.title`/`.hero` (`font:` numeric, validator-restricted, wired into `screens/quiz.json`'s `prompt`); gap growth-suffix parse/print (`gap:2` fixed · `gap:2+` · `gap:2++`, `grow_class` in vocabulary); pure `distributeGrowth(slots, excess)` in `ui/model.js` (L1, node-tested, kept as the documented/oracle model even though the shipped mechanism uses native CSS); **L2 render wiring is now done** — `ui/render.js`'s `gapSpacer()` interleaves real spacer elements (flex-grow=allowance, max-size=cap) instead of the CSS `gap` property whenever a box's gap dial is growth-suffixed, so native flexbox handles growth/capping/redistribution continuously with zero JS measurement or ResizeObserver; spacers carry no `bx` class so `capture()` already excludes them for free (round-trip invariant holds). Wired into `screens/quiz.json`'s `quiz-body` (`gap:2++`, its 4 static top-level children) — verified via `getComputedStyle` (spacers cap at 24px, zero overflow) and the full quiz interaction suite. Discovered + logged as checklist #18: a growth-suffixed gap on a container whose children are appended dynamically at runtime (e.g. `answersEl`) silently loses ALL spacing — so `answers`'s own internal gap stays fixed `gap:1`, not migrated. NOT yet done: `component/answers.buzzer` / `.spacious-list` variants (no `component/answers` base exists — `answers` is still inline) and space-class auto-classification (`compact`/`cozy`/`spacious` picked by measured excess, riding on TODO-4). Sketch: `examples/too-much-space-sketch.html`. Design: `docs/superpowers/specs/2026-08-29-too-much-space-design.md`. Checklist: `docs/checklist.md` #18. | TODO-4 (done) | 2026-08-29 | 2026-08-29 |
