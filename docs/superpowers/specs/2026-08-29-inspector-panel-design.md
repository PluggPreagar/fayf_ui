# Spec — layout inspector/editor panel

2026-08-29 · governed by [`CONSTITUTION.md`](../../../CONSTITUTION.md) C1–C10
· addendum to [2026-08-27-wireframe-ui-design.md](2026-08-27-wireframe-ui-design.md)

Status: **implemented**.

## Motivation

Fit/layout bugs (C10) are currently found and fixed by hand: eyeball a
screen, guess which dial is wrong, edit the JSON, reload, repeat. An
inspector panel closes that loop in-browser — select a box on a screen
that's already live, see/adjust its dials against the real vocabulary,
export the fix. Selecting from a *live, already-rendered* screen
(rather than a fresh copy loaded into a separate tool page) matters:
the bug you're chasing is often only visible in real runtime state —
mid-quiz, a specific answer selected, a specific viewport size — not
in a freshly resolved static copy.

## Architecture

Page-mount layer, same bucket as `ui/quiz.js`/`ui/space-class.js`/
`ui/style-mode.js` — **not** a new Ln rung. `render`/`capture`
(L2) stay the only DOM writer/reader; the inspector only decides
*when* to call them and what to show.

| file | role |
|---|---|
| `ui/inspector.js` | Selection, form generation, scoped re-render, export. |
| `test/inspector_test.js` | Browser test (C7). |

No new page. Existing pages opt in with one call, same pattern as
`mountStyleToggle`:

```js
mountInspector(root, { sourceId: 'screens/quiz' });
```

(Implementation note: `inspector.html` was added as a test fixture page —
same role as `space-class.html`, a self-contained doc independent of the
real registry, driven by `test/inspector_test.js`. This is a minor,
testing-only deviation from this section's "no new page" — the thing
actually rejected below is a *product* page with a doc picker, not a
harness fixture.)

`root` is the DOM element the page already rendered — works whether
that came from a plain `resolve()+render()` (`anatomy.html`) or a
stateful mount (`quiz.html`'s state machine). `sourceId` is the
registry id the page resolved to build `root`, supplied by the page
itself (it already knows this).

## Provenance — `resolve()` tracks source, opt-in

"Which JSON file/path defines this on-screen node" needs threading
through `resolve()`, since `extends` merging (`ui/model.js`) already
discards that information once a node is flattened. Added as a new,
default-off parameter — every existing call site (dozens, incl. node
tests) is untouched, and the node objects `render`/`capture` round-trip
(C6 invariant) are never mutated, so this carries zero risk to
existing behavior:

```js
resolve(doc, registry, env, seen, path = [], provenance)
```

When a caller passes a `Map` as `provenance`, `resolve()` records one
entry per node, at the point it already knows the `extends` link and
just before deleting it:

```js
provenance.set(path.join('.'), { path, extends: link ?? null });
```

Recursing into `children` passes `[...path, i]`. The inspector
combines a looked-up entry with the caller-supplied `sourceId` to
show, e.g., *"screens/quiz.json, path 2.1.0, extends atom/button"*.

A node with no entry (path never resolved through a `provenance`-aware
call — e.g. DOM inserted at runtime, per checklist #18's dynamic
answer rows) shows "runtime-inserted, no static source" instead of
silently guessing. Honest fallback, not a hard requirement that every
node have provenance.

## Edit rule

An edit always adds/updates a `box` override **at the node's own path
in the currently-open screen file** — never the shared `extends`
target. One node, one file, no action-at-a-distance across every other
usage of the base part. (If the practical need for "edit the base part
itself, affecting every instance" ever comes up, that's a distinct,
separately-scoped feature — not silently defaulted to here.)

## Selection

Click delegation on `root`. `event.target.closest('.bx')` → the
selected element. Highlight via **outline**, not border (checklist
#16 — never shift layout of the very thing you're inspecting):

```css
.ins-selected { outline: 2px solid var(--accent); outline-offset: -2px; }
```

`attachHandles()`/`detachHandles()` (existing L4) reused for the
existing hover-proximity affordance on the selected element only.
**No drag-to-resize in v1** — the squares stay visual/selection-
adjacent, as they are today; wiring drag to actually change `w`/`h`
is a distinct, separately-scoped feature (needs pointer-delta → dial-
unit conversion, out of scope here).

## Edit form

One panel, generated from `ui/vocabulary.json` — never hardcoded, so
it can't drift from the source of truth (C2):

- One `<select>` per `box` enum dial (`direction`, `size`, `align`,
  `distribute`, `position`, `place-h`, `place-v`, `stroke`,
  `fill-tint`, `radius`, `overflow`, `state`), options = that dial's
  legal tokens + a leading "—" (unset — removes the key entirely).
- One number `<input>` per `box_numeric` dial (`w`, `h`, `pad`, `gap`,
  `depth`, `opacity`, `rotate`, `font`), blank = unset.
- `gap` gets one extra 3-way selector (none / `+` / `++`) alongside its
  number input — the only numeric dial with a growth suffix
  (`vocabulary.json`'s `grow_class`).
- `place-h`/`place-v` controls are disabled/hidden unless `position`
  is one of `docked|floating|anchored|sticky` — mirrors `parse()`'s own
  runtime rule (`ui/model.js`), so the form can never produce a
  combination `parse()` would reject.

On selection, the form is populated from `parse(selectedEl.dataset.box)`.
Chrome (form, buttons, panel layout) is plain HTML/CSS, matching
existing page-mount precedent (`index.html`'s `.g-grid`,
`style-mode.js`'s toggle button) — not built from `box`/`row`/`stack`;
dogfooding form controls through the layout vocabulary doesn't fit the
model.

## Re-render — scoped to the edited subtree

On any form change, rebuild the selected node's `box` dials object,
then:

```js
const captured = capture(selectedEl);   // this node + its own descendants
captured.box = newDials;
const fresh = render(captured);
selectedEl.replaceWith(fresh);
// reselect: attachHandles(fresh), add .ins-selected, fresh becomes selectedEl
```

Deliberately scoped to the **selected node's own subtree**, not the
whole page. An earlier draft of this design re-captured and
re-rendered the entire mounted root on every dial change — on a
stateful page like `quiz.html`, that would replace DOM elements the
state machine already holds listeners/references on *outside* the
edited node, silently breaking the quiz mid-edit. Scoping to the
selected subtree leaves everything outside it untouched.

**Known limitation, not solved here:** if the edited node's own
descendants carry live-wired state (e.g. a selected-answer highlight
inside the node being resized), that state resets on replace, since a
fresh subtree is rendered from `capture()`'s static snapshot.
Acceptable for a layout tool; not silently pretended away.

## Export

Client-side only, no server write (`server.py` stays GET-only — a
write endpoint is a real new backend surface, out of scope for a
layout tool):

- **Copy** — `capture(selectedEl)` → JSON → clipboard.
- **Download** — same JSON as a `Blob` via `<a download>`.
- Both labeled with the provenance breadcrumb (sourceId + path) when
  available, so the exported JSON is easy to place correctly by hand.

## Testing

- Browser test (`test/inspector_test.js`, same harness as
  `quiz_test.js`): mount on a fixture doc, click a nested box → form
  populated with its current dials; change an enum dial → element's
  class list updates, siblings/ancestors elsewhere in the tree
  unaffected (asserts scoped re-render, not whole-root replace); change
  `gap` growth selector → `data-box` round-trips correctly; export
  produces JSON matching `capture(selectedEl)`.
- `ui/model.js`'s node tests get new `resolve()` cases: `provenance`
  omitted → identical output to today (regression guard for the
  default-off param); `provenance` supplied → path/extends recorded
  correctly through an `extends` chain and through `children` nesting.

## Alternatives considered and rejected

- **Dedicated `inspector.html` page with a doc picker**, loading a
  fresh `resolve()` of a chosen registry entry. Rejected: the bug
  you're chasing usually only exists in a screen's live runtime state
  (mid-quiz, a specific selection), which a freshly loaded static copy
  doesn't have.
- **Server-side save-to-file** (a `PUT`/`POST` endpoint in `server.py`
  overwriting the source JSON directly). Rejected for v1: first write
  surface in a currently read-only dev server, real risk of
  overwriting uncommitted local edits or the wrong file. Client-side
  copy/download is safer and sufficient.
- **Whole-stage recapture-and-render on every edit.** Rejected after
  reconsidering the "attach to a live screen" requirement — breaks
  state-machine-driven pages like `quiz.html` by replacing elements
  outside the edited node. Scoped subtree re-render instead.
- **Raw token-string textbox instead of a per-dial form.** Rejected:
  no discoverability of legal values, and a typo becomes a hard
  `parse()` error (C2) with no guidance. A generated form can't
  produce an illegal token by construction.
- **Breadcrumb/tree-list selection instead of click-to-select.**
  Rejected for v1: click-to-select on the real render is more direct
  and reuses existing `handles.js` affordance; a tree list is
  additional UI surface with no current need (C3).

## Open / deferred

- Full implementation — not started.
- Drag-to-resize via the handle squares.
- Server-side save-to-file.
- Editing the shared `extends` base part directly (today: always a
  local override at the node's own path).
