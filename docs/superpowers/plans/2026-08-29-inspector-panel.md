# Layout Inspector/Editor Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a developer select a box on a screen that's already live in the browser, adjust its dials through a form generated from the vocabulary, and export the result — closing the eyeball-guess-edit-reload loop used today for fit/layout bugs (C10).

**Architecture:** One new page-mount module (`ui/inspector.js`, same bucket as `ui/quiz.js`/`ui/space-class.js` — not a new Ln rung) mounted via an opt-in `mountInspector(root, opts)` call added to existing pages. `resolve()` (`ui/model.js`) gains an optional, default-off `provenance` side-channel so the panel can trace a selected node back to its screen file + JSON path. Editing a node re-renders only that node's own subtree (`capture()`+mutate+`render()`+`replaceWith()`), never the whole page, so mounting on a stateful screen (`quiz.html`) can't orphan listeners the page holds elsewhere.

**Tech Stack:** Vanilla ES modules, no build step (C4). Node's built-in `node:test`/`node:assert` for L0–L1 tests; this repo's own `TestRunner` (`test/js_runner.js`) + `test/harness.js` overlay for browser tests, served via `server.py`'s `/wrapper?test=X.html`.

**Spec:** [docs/superpowers/specs/2026-08-29-inspector-panel-design.md](../specs/2026-08-29-inspector-panel-design.md)

## Global Constraints

- C2 vocabulary: `ui/vocabulary.json` is the only source of legal dial/value tokens; the form must be generated from it, never hardcoded.
- C4 no frameworks: vanilla ES modules, Python stdlib only, `just` as the only tool runner.
- C5 reuse the level below: `render`/`capture` (`ui/render.js`, L2) stay the only DOM writer/reader; the inspector only decides when to call them.
- C6 JSON canonical / round-trip invariant: `diff(capture(render(resolve(d))), resolve(d))` must stay empty. The new `provenance` param on `resolve()` must never be written onto the node objects that flow into `render`/`capture` — it's a side-channel (a `Map`), never a node property.
- C10 fit checklist: nested BBox never exceeds parent BBox; `.ins-selected` must use `outline`, not `border` (checklist #16 — a border participates in box-model layout, an outline never does).

---

## Task 1: `resolve()` tracks source path + `extends` link (provenance)

**Files:**
- Modify: `ui/model.js:62-89` (the `resolve` function)
- Test: `test/node/resolve_test.js`

**Interfaces:**
- Produces: `resolve(doc, registry = {}, env = [], seen = new Set(), path = [], provenance)` — two new trailing params, both optional, zero behavior change when omitted. When `provenance` is a `Map`, `resolve()` sets one entry per node: `provenance.set(path.join('.'), { path, extends: link ?? null })`, where `path` is the array of child-indices from the top-level call to that node, and `link` is the `extends` id that node itself declared (or `null`).

- [ ] **Step 1: Write the failing tests**

Append to `test/node/resolve_test.js` (it already imports `resolve, diff` from `../../ui/model.js` and has a `reg` fixture with `base/box`/`atom/button`/`atom/button.primary` — reuse both):

```js
test('provenance: omitted param is a no-op, resolve() output unchanged', () => {
  const withMap = resolve(reg['atom/button'], reg, [], new Set(), [], new Map());
  const without = resolve(reg['atom/button'], reg);
  assert.deepEqual(withMap, without);
});
test('provenance: records path + extends for every node, path threads through children', () => {
  const doc = { box: 'row', children: [
    { extends: 'atom/button', name: 'a' },
    { box: 'hug', content: 'plain' },
  ] };
  const provenance = new Map();
  resolve(doc, reg, [], new Set(), [], provenance);
  assert.deepEqual(provenance.get(''), { path: [], extends: null });
  assert.deepEqual(provenance.get('0'), { path: [0], extends: 'atom/button' });
  assert.deepEqual(provenance.get('1'), { path: [1], extends: null });
});
test('provenance: nested children get multi-segment paths', () => {
  const doc = { box: 'stack', children: [
    { box: 'row', children: [ { box: 'hug', content: 'x' }, { box: 'hug', content: 'y' } ] },
  ] };
  const provenance = new Map();
  resolve(doc, reg, [], new Set(), [], provenance);
  assert.deepEqual(provenance.get('0.0'), { path: [0, 0], extends: null });
  assert.deepEqual(provenance.get('0.1'), { path: [0, 1], extends: null });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/node/resolve_test.js`
Expected: FAIL — 3 new tests fail (`provenance.get(...)` calls throw or return `undefined` since `resolve()` doesn't accept/use the new params yet; the deepEqual against `undefined` fails).

- [ ] **Step 3: Implement**

In `ui/model.js`, change the `resolve` signature and add the recording line right before `delete node.extends;` (which is exactly where `link` is still known), and thread `path`/`provenance` through the `children.map` call:

```js
export function resolve(doc, registry = {}, env = [], seen = new Set(), path = [], provenance) {
  if (typeof doc === 'string') doc = { box: 'hug', content: doc };
  if (doc.conditional) {
    const winner = pickConditional(doc.conditional, env);
    const merged = { ...doc, ...winner };
    delete merged.conditional;
    delete merged.condition;
    if (doc.name != null) merged.name = doc.name;
    doc = merged;
  }
  let node = { ...doc };
  const link = node.extends;
  if (link) {
    if (seen.has(link)) throw new Error(`cycle: ${[...seen, link].join(' -> ')}`);
    const base = registry[link];
    if (!base) throw new Error(`unknown id '${link}'`);
    const parent = resolve(base, registry, env, new Set([...seen, link]));
    node = mergeNode(parent, node);
  }
  if (provenance) provenance.set(path.join('.'), { path, extends: link ?? null });
  delete node.extends;
  for (const prim of ['box', 'path'])
    if (node[prim] != null) node[prim] = toDials(node[prim], prim);
  if (node.content != null && node.children)
    throw new Error(`content xor children violated${node.name ? ` at '${node.name}'` : ''}`);
  if (node.children)
    node.children = node.children.map((c, i) => resolve(c, registry, env, seen, [...path, i], provenance));
  return node;
}
```

Note the recursive call that resolves the `extends` target (`resolve(base, registry, env, new Set([...seen, link]))`) deliberately does **not** get `path`/`provenance` — it's resolving a different document (the base part), and this node's own `provenance.set(...)` call right after already records the correct, most-local `extends` link for this path. Threading `provenance` into that call too would just get overwritten by the following line — pure noise.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/node/resolve_test.js`
Expected: PASS, all tests including the 3 new ones.

- [ ] **Step 5: Run full node suite (regression)**

Run: `just ci`
Expected: all PASS — the new params are additive/optional, every existing call site (dozens across `ui/`, `test/node/`) is unaffected.

- [ ] **Step 6: Commit**

```bash
git add ui/model.js test/node/resolve_test.js
git commit -m "feat(model): resolve() tracks source path + extends link (opt-in provenance)"
```

---

## Task 2: `ui/inspector.js` — mount, click-to-select, highlight, provenance display

**Files:**
- Create: `ui/inspector.js`
- Create: `inspector.html` (fixture page, same role as `space-class.html` — self-contained doc, not tied to the real registry)
- Create: `test/inspector_test.js`
- Modify: `ui/tokens.css` (append one rule)

**Interfaces:**
- Consumes: `attachHandles`/`detachHandles` from `ui/handles.js` (existing, unchanged).
- Produces: `nodePath(el, root) → number[]`, `describeProvenance(path, sourceId, provenance) → string`, `mountInspector(container, { sourceId, provenance } = {}) → { select(el) }`.

- [ ] **Step 1: Add the `.ins-selected` rule to `ui/tokens.css`**

Append after the existing `.bx-selected{...}` rule (around line 127 — that class is quiz's own answer-selection styling, a different concept; the inspector needs its own class so the two never collide):

```css
.ins-selected{outline:2px solid var(--accent);outline-offset:-2px}
```

- [ ] **Step 2: Write `ui/inspector.js` (selection + provenance only)**

```js
// ui/inspector.js -- page-mount layer, live-screen dial inspector/editor.
// Selects a node already on screen, shows/edits its dials via a form
// generated from vocabulary.json, exports capture()'d JSON. Re-render on
// edit is scoped to the selected node's own subtree -- never touches DOM
// outside it, so it's safe to mount on a stateful page (e.g. quiz.html)
// without breaking listeners/references the page holds elsewhere.
//
// Precondition: `container` (the rendered root passed to mountInspector)
// must already be attached to the document -- click delegation binds to
// its parent once, at mount time, so editing the root's own dials (which
// replaces `container` itself) doesn't orphan the listener.
import { attachHandles, detachHandles } from './handles.js';

const style = document.createElement('style');
style.textContent = `
.ins-panel{position:fixed;top:0;right:0;bottom:0;z-index:9998;width:220px;overflow-y:auto;
  background:var(--paper);border-left:1px solid var(--rule);font:11px var(--mono);color:var(--text);padding:10px}
.ins-empty{color:var(--muted)}
.ins-source{color:var(--muted);margin-bottom:8px;word-break:break-word}
.ins-field{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:4px}
.ins-field select,.ins-field input{font:11px var(--mono);width:100px}
.ins-actions{display:flex;gap:6px;margin-top:8px}
.ins-actions button{font:11px var(--mono);padding:3px 8px;border:1px solid var(--rule);border-radius:4px;
  background:var(--paper);color:var(--muted);cursor:pointer}
.ins-actions button:hover{color:var(--text);border-color:var(--dash)}
`;
document.head.appendChild(style);

// Child-index path from `root` to `el`, counting only real `.bx` nodes --
// matches how render()/capture() address children (spacers excluded, see
// checklist #18), so a path here lines up with resolve()'s own provenance
// path (ui/model.js).
export function nodePath(el, root) {
  if (el === root) return [];
  const parent = el.parentElement;
  const siblings = [...parent.children].filter(c => c.classList?.contains('bx'));
  return [...nodePath(parent, root), siblings.indexOf(el)];
}

export function describeProvenance(path, sourceId = '(unknown source)', provenance) {
  const entry = provenance?.get(path.join('.'));
  if (!entry) return 'runtime-inserted, no static source';
  const loc = `${sourceId}, path ${entry.path.join('.') || '(root)'}`;
  return entry.extends ? `${loc}, extends ${entry.extends}` : loc;
}

function buildPanel() {
  const panel = document.createElement('div');
  panel.className = 'ins-panel';
  panel.innerHTML = `
    <div class="ins-empty">Select a box to inspect.</div>
    <div class="ins-form" hidden>
      <div class="ins-source"></div>
      <div class="ins-fields"></div>
      <div class="ins-actions">
        <button type="button" class="ins-copy">Copy JSON</button>
        <button type="button" class="ins-download">Download JSON</button>
      </div>
    </div>`;
  return panel;
}

export function mountInspector(container, { sourceId, provenance } = {}) {
  const panel = buildPanel();
  document.body.appendChild(panel);
  const emptyEl = panel.querySelector('.ins-empty');
  const formEl = panel.querySelector('.ins-form');
  const sourceEl = panel.querySelector('.ins-source');

  let rootEl = container;
  let selected = null;

  function select(el) {
    if (selected) { detachHandles(selected); selected.classList.remove('ins-selected'); }
    selected = el;
    selected.classList.add('ins-selected');
    attachHandles(selected);
    emptyEl.hidden = true;
    formEl.hidden = false;
    sourceEl.textContent = describeProvenance(nodePath(selected, rootEl), sourceId, provenance);
  }

  (rootEl.parentElement ?? rootEl).addEventListener('click', (e) => {
    const el = e.target.closest('.bx');
    if (!el || !rootEl.contains(el)) return;
    select(el);
  });

  return { select };
}
```

- [ ] **Step 3: Create the fixture page `inspector.html`**

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>fayf_ui — inspector</title>
<link rel="stylesheet" href="ui/tokens.css">
<style>html,body{margin:0;background:var(--canvas)}</style>
</head>
<body>
<script type="module">
import { resolve } from './ui/model.js';
import { render } from './ui/render.js';
import { mountInspector } from './ui/inspector.js';

// Deliberately minimal fixture doc, independent of the real registry --
// same "self-contained fixture" precedent as space-class.html. Exercises
// mountInspector() against a small but real nested tree (extends + a
// plain child), not tied to any real screen. See test/inspector_test.js.
const reg = {
  'base/box': { box: 'stack, hug, bare, square' },
  'atom/button': { extends: 'base/box', box: 'row, mid, packed, pad:2, solid, rounded', content: 'Go' },
};
const doc = { box: 'row, mid, pad:2, gap:2', name: 'root', children: [
  { extends: 'atom/button', name: 'a' },
  { box: 'hug, pad:1', name: 'b', content: 'plain' },
] };
const provenance = new Map();
const resolved = resolve(doc, reg, [], new Set(), [], provenance);
const el = render(resolved);
document.body.appendChild(el);
mountInspector(el, { sourceId: 'fixture/doc', provenance });
document.body.dataset.ready = '1';
</script>
</body>
</html>
```

- [ ] **Step 4: Write `test/inspector_test.js`**

```js
const tr = new TestRunner({ stopOnError: false });

tr.addBlock('click-to-select highlights exactly one node, shows provenance', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(() => {
     const root = document.querySelector('.bx[data-name="root"]');
     const a = root.querySelector('[data-name="a"]');
     a.click();
     r.check(a.classList.contains('ins-selected'), 'clicked node gets .ins-selected');
     r.check(document.querySelector('.ins-empty').hidden, 'empty state hidden after selection');
     const source = document.querySelector('.ins-source').textContent;
     r.check(source.includes('fixture/doc'), 'shows sourceId', source);
     r.check(source.includes('path 0'), 'shows the node\'s path', source);
     r.check(source.includes('extends atom/button'), 'shows the extends link', source);
   })
   .run(() => {
     const root = document.querySelector('.bx[data-name="root"]');
     const b = root.querySelector('[data-name="b"]');
     b.click();
     r.check(b.classList.contains('ins-selected'), 'newly clicked node selected');
     r.check(!root.querySelector('[data-name="a"]').classList.contains('ins-selected'), 'previous selection cleared');
     const source = document.querySelector('.ins-source').textContent;
     r.check(!source.includes('extends'), 'b has no extends link (plain node)', source);
     r.check(!source.includes('runtime-inserted'), 'b still has static provenance (no extends != no provenance)', source);
   });
});

await tr.runBlocks();
```

- [ ] **Step 5: Run and verify — browser test**

Start the dev server: `just serve` (or confirm it's already running), then open the test URL: `just test inspector.html` prints it — navigate the Browser pane to `http://127.0.0.1:8017/wrapper?test=inspector.html`.
Expected: overlay shows both checks in the block passing, summary line reads all passed (e.g. "6/6 passed" — 3 checks in the first `.run`, 3 in the second, adjust the exact count to what the overlay actually reports).

- [ ] **Step 6: Commit**

```bash
git add ui/inspector.js ui/tokens.css inspector.html test/inspector_test.js
git commit -m "feat(inspector): click-to-select on a live screen, provenance breadcrumb"
```

---

## Task 3: Per-dial edit form, generated from `vocabulary.json`

**Files:**
- Modify: `ui/inspector.js`
- Modify: `test/inspector_test.js`

**Interfaces:**
- Consumes: `vocabulary.box` (enum dials), `vocabulary.box_numeric` (numeric dials), `parse` from `ui/model.js` — all existing, unchanged.
- Produces: internal `buildFields(container, onChange) → controls` and `populateFields(controls, dials)` (not exported — `mountInspector` is still the only public entry point plus `nodePath`/`describeProvenance` from Task 2). Each field row carries `data-dial="<dial-name>"`; a numeric row's own value input has class `ins-value`, and `gap`'s extra growth-suffix select has class `ins-growth` — this is the querying convention later tasks' and tests' `panel.querySelector('[data-dial="w"] .ins-value')`-style lookups rely on.

- [ ] **Step 1: Write the failing test**

Append to `test/inspector_test.js`:

```js
tr.addBlock('form reflects the selected node\'s dials, incl. gap growth + place guard', (r) => {
  r.run(() => {
    const root = document.querySelector('.bx[data-name="root"]');
    root.querySelector('[data-name="a"]').click();
    const panel = document.querySelector('.ins-panel');
    r.check(panel.querySelector('[data-dial="direction"] select').value === 'row', 'direction=row (child override wins)');
    r.check(panel.querySelector('[data-dial="size"] select').value === 'hug', 'size=hug (survives from base/box)');
    r.check(panel.querySelector('[data-dial="align"] select').value === 'mid', 'align=mid');
    r.check(panel.querySelector('[data-dial="pad"] .ins-value').value === '2', 'pad=2');
    r.check(panel.querySelector('[data-dial="place-h"] select').disabled, 'place-h disabled: position not set');
    r.check(panel.querySelector('[data-dial="place-v"] select').disabled, 'place-v disabled: position not set');
  })
  .run(() => {
    const root = document.querySelector('.bx[data-name="root"]');
    root.click(); // root itself: box 'row, mid, pad:2, gap:2' -- gap is a plain fixed value
    const panel = document.querySelector('.ins-panel');
    r.check(panel.querySelector('[data-dial="gap"] .ins-value').value === '2', 'gap value=2');
    r.check(panel.querySelector('[data-dial="gap"] .ins-growth').value === '', 'gap growth=fixed (no suffix)');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run in the Browser pane: reload `http://127.0.0.1:8017/wrapper?test=inspector.html`.
Expected: FAIL — `panel.querySelector('[data-dial="direction"] select')` is `null` (no fields exist yet), so `.value` throws / the check fails.

- [ ] **Step 3: Implement**

In `ui/inspector.js`, add the vocabulary import and the field-generation/population functions. Add near the top, right after the `attachHandles`/`detachHandles` import:

```js
import { parse } from './model.js';
import vocabulary from './vocabulary.json' with { type: 'json' };

const ENUM_DIALS = Object.keys(vocabulary.box);
const NUMERIC_DIALS = vocabulary.box_numeric;
const PLACE_DIALS = ['place-h', 'place-v'];
const PLACE_REQUIRES = ['docked', 'floating', 'anchored', 'sticky'];
```

Add these functions after `describeProvenance` (before `buildPanel`):

```js
function buildFields(container, onChange) {
  const controls = {};
  for (const dial of ENUM_DIALS) {
    const row = document.createElement('label');
    row.className = 'ins-field';
    row.dataset.dial = dial;
    row.textContent = dial;
    const select = document.createElement('select');
    select.appendChild(new Option('—', ''));
    for (const tok of vocabulary.box[dial]) select.appendChild(new Option(tok, tok));
    select.addEventListener('change', onChange);
    row.appendChild(select);
    container.appendChild(row);
    controls[dial] = select;
  }
  for (const dial of NUMERIC_DIALS) {
    const row = document.createElement('label');
    row.className = 'ins-field';
    row.dataset.dial = dial;
    row.textContent = dial;
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'ins-value';
    input.addEventListener('input', onChange);
    row.appendChild(input);
    if (dial === 'gap') {
      const growth = document.createElement('select');
      growth.className = 'ins-growth';
      growth.appendChild(new Option('fixed', ''));
      growth.appendChild(new Option('+', '+'));
      growth.appendChild(new Option('++', '++'));
      growth.addEventListener('change', onChange);
      row.appendChild(growth);
      controls.gapGrowth = growth;
    }
    container.appendChild(row);
    controls[dial] = input;
  }
  return controls;
}

function syncPlaceGuard(controls) {
  const allowed = PLACE_REQUIRES.includes(controls.position.value);
  for (const dial of PLACE_DIALS) {
    controls[dial].disabled = !allowed;
    if (!allowed) controls[dial].value = '';
  }
}

function populateFields(controls, dials) {
  for (const dial of ENUM_DIALS) controls[dial].value = dials[dial] ?? '';
  for (const dial of NUMERIC_DIALS) {
    if (dial === 'gap') {
      const raw = dials.gap;
      const m = typeof raw === 'string' ? /^(\d+)(\+{1,2})$/.exec(raw) : null;
      controls.gap.value = m ? m[1] : (raw ?? '');
      controls.gapGrowth.value = m ? m[2] : '';
      continue;
    }
    controls[dial].value = dials[dial] ?? '';
  }
  syncPlaceGuard(controls);
}
```

Then update `mountInspector` to build the fields and populate them on selection:

```js
export function mountInspector(container, { sourceId, provenance } = {}) {
  const panel = buildPanel();
  document.body.appendChild(panel);
  const emptyEl = panel.querySelector('.ins-empty');
  const formEl = panel.querySelector('.ins-form');
  const sourceEl = panel.querySelector('.ins-source');
  const fieldsEl = panel.querySelector('.ins-fields');

  let rootEl = container;
  let selected = null;
  const controls = buildFields(fieldsEl, () => {});

  function select(el) {
    if (selected) { detachHandles(selected); selected.classList.remove('ins-selected'); }
    selected = el;
    selected.classList.add('ins-selected');
    attachHandles(selected);
    emptyEl.hidden = true;
    formEl.hidden = false;
    populateFields(controls, parse(selected.dataset.box || ''));
    sourceEl.textContent = describeProvenance(nodePath(selected, rootEl), sourceId, provenance);
  }

  (rootEl.parentElement ?? rootEl).addEventListener('click', (e) => {
    const el = e.target.closest('.bx');
    if (!el || !rootEl.contains(el)) return;
    select(el);
  });

  return { select };
}
```

(The `() => {}` no-op passed to `buildFields` is replaced with the real `onChange` handler in Task 4 — the fields exist and populate correctly now, they just don't do anything on edit yet.)

- [ ] **Step 4: Run to verify it passes**

Reload `http://127.0.0.1:8017/wrapper?test=inspector.html` in the Browser pane.
Expected: PASS, including the two new checks blocks.

- [ ] **Step 5: Commit**

```bash
git add ui/inspector.js test/inspector_test.js
git commit -m "feat(inspector): per-dial edit form generated from vocabulary.json"
```

---

## Task 4: Live edit → scoped subtree re-render

**Files:**
- Modify: `ui/inspector.js`
- Modify: `test/inspector_test.js`

**Interfaces:**
- Consumes: `render`, `capture` from `ui/render.js` (existing, unchanged).
- Produces: internal `readFields(controls) → dials` and the wired `onChange`/`select` closures inside `mountInspector` (still no new public exports beyond Task 2/3's).

This is the task that proves the design's central safety claim: editing a node must never disturb DOM outside that node's own subtree.

- [ ] **Step 1: Write the failing test**

Append to `test/inspector_test.js`:

```js
tr.addBlock('editing a dial scopes re-render to the selected subtree only', (r) => {
  r.run(() => {
    const root = document.querySelector('.bx[data-name="root"]');
    const bBefore = root.querySelector('[data-name="b"]');
    root.querySelector('[data-name="a"]').click();
    const panel = document.querySelector('.ins-panel');
    const radiusSelect = panel.querySelector('[data-dial="radius"] select');
    radiusSelect.value = 'circle';
    radiusSelect.dispatchEvent(new Event('change'));

    const aAfter = root.querySelector('[data-name="a"]');
    r.check(aAfter.classList.contains('bx-circle'), 'edited node re-rendered with the new dial');
    r.check(aAfter.classList.contains('ins-selected'), 'edited node is re-selected after replace');
    r.check(root.querySelector('[data-name="b"]') === bBefore, 'sibling untouched -- same DOM reference, not replaced');
  });
});

tr.addBlock('gap growth suffix round-trips through the form into data-box', (r) => {
  r.run(() => {
    const root = document.querySelector('.bx[data-name="root"]');
    root.click();
    const panel = document.querySelector('.ins-panel');
    panel.querySelector('[data-dial="gap"] .ins-growth').value = '+';
    panel.querySelector('[data-dial="gap"] .ins-growth').dispatchEvent(new Event('change'));
    const rootAfter = document.querySelector('.bx[data-name="root"]');
    r.check(rootAfter.dataset.box.includes('gap:2+'), 'growth suffix applied to data-box', rootAfter.dataset.box);
  });
});

tr.addBlock('place-h/place-v are cleared and disabled when position is unset via the form', (r) => {
  r.run(() => {
    const root = document.querySelector('.bx[data-name="root"]');
    root.querySelector('[data-name="b"]').click();
    const panel = document.querySelector('.ins-panel');
    const positionSelect = panel.querySelector('[data-dial="position"] select');
    positionSelect.value = 'floating';
    positionSelect.dispatchEvent(new Event('change'));
    r.check(!panel.querySelector('[data-dial="place-h"] select').disabled, 'place-h enabled once position=floating');
    positionSelect.value = '';
    positionSelect.dispatchEvent(new Event('change'));
    r.check(panel.querySelector('[data-dial="place-h"] select').disabled, 'place-h disabled again once position cleared');
    const bAfter = root.querySelector('[data-name="b"]');
    r.check(!bAfter.dataset.box.includes('floating'), 'position was cleared, not left stale on the node', bAfter.dataset.box);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Reload `http://127.0.0.1:8017/wrapper?test=inspector.html` in the Browser pane.
Expected: FAIL — form fields exist (Task 3) but changing them does nothing yet (`onChange` is still a no-op), so none of `aAfter.classList.contains('bx-circle')` / the gap suffix / the position-guard checks pass.

- [ ] **Step 3: Implement**

In `ui/inspector.js`, add the `render, capture` import at the top:

```js
import { render, capture } from './render.js';
```

Add `readFields` after `populateFields`:

```js
function readFields(controls) {
  const dials = {};
  for (const dial of ENUM_DIALS) if (controls[dial].value) dials[dial] = controls[dial].value;
  for (const dial of NUMERIC_DIALS) {
    if (dial === 'gap') {
      if (controls.gap.value !== '')
        dials.gap = controls.gapGrowth.value ? `${controls.gap.value}${controls.gapGrowth.value}` : Number(controls.gap.value);
      continue;
    }
    if (controls[dial].value !== '') dials[dial] = Number(controls[dial].value);
  }
  return dials;
}
```

Rewrite `mountInspector` to wire real editing, wrapping `select`/a new `onChange` as function declarations (hoisted, so they can reference each other regardless of definition order) and passing `onChange` into `buildFields`:

```js
export function mountInspector(container, { sourceId, provenance } = {}) {
  const panel = buildPanel();
  document.body.appendChild(panel);
  const emptyEl = panel.querySelector('.ins-empty');
  const formEl = panel.querySelector('.ins-form');
  const sourceEl = panel.querySelector('.ins-source');
  const fieldsEl = panel.querySelector('.ins-fields');

  let rootEl = container;
  let selected = null;
  const controls = buildFields(fieldsEl, onChange);

  function select(el) {
    if (selected) { detachHandles(selected); selected.classList.remove('ins-selected'); }
    selected = el;
    selected.classList.add('ins-selected');
    attachHandles(selected);
    emptyEl.hidden = true;
    formEl.hidden = false;
    populateFields(controls, parse(selected.dataset.box || ''));
    sourceEl.textContent = describeProvenance(nodePath(selected, rootEl), sourceId, provenance);
  }

  function onChange() {
    if (!selected) return;
    syncPlaceGuard(controls);
    const captured = capture(selected);
    captured.box = readFields(controls);
    const fresh = render(captured);
    const wasRoot = selected === rootEl;
    selected.replaceWith(fresh);
    if (wasRoot) rootEl = fresh;
    select(fresh);
  }

  (rootEl.parentElement ?? rootEl).addEventListener('click', (e) => {
    const el = e.target.closest('.bx');
    if (!el || !rootEl.contains(el)) return;
    select(el);
  });

  return { select };
}
```

- [ ] **Step 4: Run to verify it passes**

Reload `http://127.0.0.1:8017/wrapper?test=inspector.html` in the Browser pane.
Expected: PASS, including all three new blocks.

- [ ] **Step 5: Run the full node suite (regression, capture/render untouched)**

Run: `just ci`
Expected: all PASS — Task 4 only adds calls to existing `render`/`capture`, doesn't modify them.

- [ ] **Step 6: Commit**

```bash
git add ui/inspector.js test/inspector_test.js
git commit -m "feat(inspector): live edit re-renders only the selected node's own subtree"
```

---

## Task 5: Export — copy to clipboard + download JSON

**Files:**
- Modify: `ui/inspector.js`
- Modify: `test/inspector_test.js`

**Interfaces:**
- Produces: `exportPayload(el, root, sourceId, provenance) → { source: string, node: object }` (exported, testable directly without simulating clipboard/download).

- [ ] **Step 1: Write the failing test**

Append to `test/inspector_test.js`. This test imports the new export directly rather than clicking the (unautomatable) clipboard/download buttons — add the import at the top of the file if not already present, and the block itself anywhere after the fixture is ready:

```js
import { exportPayload } from '../ui/inspector.js';
```

```js
tr.addBlock('exportPayload: JSON matches capture(), labeled with the provenance breadcrumb', (r) => {
  r.run(() => {
    const root = document.querySelector('.bx[data-name="root"]');
    const a = root.querySelector('[data-name="a"]');
    const payload = exportPayload(a, root, 'fixture/doc', null); // provenance omitted here on purpose
    r.check(payload.source === 'runtime-inserted, no static source',
      'no provenance map passed -> honest fallback text', payload.source);
    r.check(payload.node.name === 'a', 'node.name matches capture() output');
    r.check(payload.node.box.direction === 'row', 'node.box matches capture() output');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Reload `http://127.0.0.1:8017/wrapper?test=inspector.html` in the Browser pane.
Expected: FAIL — `exportPayload` is not exported yet, so the import itself throws (module fails to load) or the call is `undefined`.

- [ ] **Step 3: Implement**

Add to `ui/inspector.js`, right after `describeProvenance`:

```js
export function exportPayload(el, root, sourceId, provenance) {
  return { source: describeProvenance(nodePath(el, root), sourceId, provenance), node: capture(el) };
}
```

Update `buildPanel`'s markup was already written with `.ins-copy`/`.ins-download` buttons in Task 2 (no change needed there). Wire them in `mountInspector` — add these lines after the `const controls = buildFields(...)` line and before the `root`-click listener:

```js
  const copyBtn = panel.querySelector('.ins-copy');
  const downloadBtn = panel.querySelector('.ins-download');
```

And add these two listeners right after the `(rootEl.parentElement ?? rootEl).addEventListener('click', ...)` block, before `return { select };`:

```js
  copyBtn.addEventListener('click', () => {
    if (!selected) return;
    navigator.clipboard?.writeText(JSON.stringify(exportPayload(selected, rootEl, sourceId, provenance), null, 2));
  });
  downloadBtn.addEventListener('click', () => {
    if (!selected) return;
    const json = JSON.stringify(exportPayload(selected, rootEl, sourceId, provenance), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${selected.dataset.name || 'node'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
```

- [ ] **Step 4: Run to verify it passes**

Reload `http://127.0.0.1:8017/wrapper?test=inspector.html` in the Browser pane.
Expected: PASS, including the new export block. Also manually click "Copy JSON" and "Download JSON" once with a node selected and confirm no console errors (`read_console_messages`) — clipboard/download side effects themselves aren't asserted by the automated test (headless clipboard access is unreliable), this manual check is the coverage for those two buttons actually firing.

- [ ] **Step 5: Commit**

```bash
git add ui/inspector.js test/inspector_test.js
git commit -m "feat(inspector): export selected node as JSON (copy + download), provenance-labeled"
```

---

## Task 6: Wire `mountInspector` into real pages

**Files:**
- Modify: `quiz.html`
- Modify: `test/quiz_test.js`
- Modify: `math-trainer.html`
- Modify: `anatomy.html`

**Interfaces:**
- Consumes: `mountInspector` from `ui/inspector.js` (Tasks 2–5, complete).

This task validates the design's core motivation for real: the inspector must work — and must not break the app — on `quiz.html`, the one screen in the repo with real interactive state (a running `createMachine` FSM, listeners the state machine itself owns). The other two pages are static/simpler and get a lighter check.

- [ ] **Step 1: Wire `quiz.html`**

Current script (full file, for context):

```html
<script type="module">
import { resolve } from './ui/model.js';
import { render } from './ui/render.js';
import { initStyleMode, mountStyleToggle } from './ui/style-mode.js';
import { mountQuiz } from './ui/quiz.js';
initStyleMode();
const reg = await (await fetch('/registry.json')).json();
const el = render(resolve(reg['screens/quiz'], reg));
document.body.appendChild(el);
mountStyleToggle(el, { inline: true });
const quizData = await (await fetch('/content/quiz/lesson1.json')).json();
mountQuiz(el, quizData, reg);
document.body.dataset.ready = '1';
</script>
```

Replace it with:

```html
<script type="module">
import { resolve } from './ui/model.js';
import { render } from './ui/render.js';
import { initStyleMode, mountStyleToggle } from './ui/style-mode.js';
import { mountQuiz } from './ui/quiz.js';
import { mountInspector } from './ui/inspector.js';
initStyleMode();
const reg = await (await fetch('/registry.json')).json();
const provenance = new Map();
const el = render(resolve(reg['screens/quiz'], reg, [], new Set(), [], provenance));
document.body.appendChild(el);
mountStyleToggle(el, { inline: true });
mountInspector(el, { sourceId: 'screens/quiz', provenance });
const quizData = await (await fetch('/content/quiz/lesson1.json')).json();
mountQuiz(el, quizData, reg);
document.body.dataset.ready = '1';
</script>
```

(Answer rows `mountQuiz` inserts later are built through `ui/quiz.js`'s own separate `resolve()`/`render()` calls, which don't get this same `provenance` map — selecting one in the inspector will honestly show "runtime-inserted, no static source", which is exactly the documented fallback for checklist #18-style dynamically-inserted content, not a bug.)

- [ ] **Step 2: Write the regression test proving quiz interactivity survives an inspector edit**

Append to `test/quiz_test.js`. Add the import at the top alongside the existing ones:

```js
import { mountInspector } from '../ui/inspector.js';
```

Add this near the other synthetic-mount blocks (the file already declares `let synthetic = null;` and `let syntheticPause = null;` for isolated mounts — follow the same pattern):

```js
let inspectorSynthetic = null;

tr.addBlock('quiz: inspector edit on a live quiz does not break its interactivity', (r) => {
  r.run(() => {
    (async () => {
      const reg = await (await fetch('/registry.json')).json();
      const container = document.createElement('div');
      container.id = 'synthetic-inspector-quiz';
      document.body.appendChild(container);
      const freshRoot = render(resolve(reg['screens/quiz'], reg));
      container.appendChild(freshRoot);
      const quizData = {
        id: 'quiz/synthetic-inspector', questions: [
          { prompt: 'Pick the right one', mode: 'single',
            answers: [
              { text: 'A', correct: false },
              { text: 'B', correct: true } ],
            hint: 'synthetic inspector hint' } ] };
      mountQuiz(freshRoot, quizData, reg);
      mountInspector(freshRoot, { sourceId: 'screens/quiz' });
      inspectorSynthetic = { container, freshRoot };
    })();
  })
  .waitFor(() => inspectorSynthetic !== null, 3000, 50, 'synthetic inspector quiz mounted')
  .run(() => {
    const { freshRoot } = inspectorSynthetic;
    const answersBefore = [...freshRoot.querySelectorAll('[data-name^="answer-"]')];
    r.check(answersBefore.length === 2, 'renders 2 answers before any inspector edit');

    // select+edit a node that is NOT any answer row -- the hint panel's box
    // -- via the inspector, exactly like a real debugging session would.
    const hintPanel = freshRoot.querySelector('[data-name="hint-panel"]');
    hintPanel.click();
    r.check(hintPanel.classList.contains('ins-selected'), 'inspector selected the hint panel');
    const panel = document.querySelector('.ins-panel');
    const radiusSelect = panel.querySelector('[data-dial="radius"] select');
    radiusSelect.value = 'pill';
    radiusSelect.dispatchEvent(new Event('change'));
    const hintPanelAfter = freshRoot.querySelector('[data-name="hint-panel"]');
    r.check(hintPanelAfter.classList.contains('bx-pill'), 'hint panel re-rendered with the edited dial');
    r.check(hintPanelAfter !== hintPanel, 'hint panel is a fresh element after the scoped re-render');

    // quiz interactivity must still work after the edit: answer click ->
    // revealed, still driven by the SAME state machine wired at mount time.
    const answersAfter = [...freshRoot.querySelectorAll('[data-name^="answer-"]')];
    r.check(answersAfter.length === 2, 'answers untouched by an edit elsewhere in the tree');
    answersAfter[1].click(); // "B", correct, single mode locks in immediately
    r.check(answersAfter[1].classList.contains('bx-correct'),
      'quiz state machine still responds correctly after an unrelated inspector edit');

    inspectorSynthetic.container.remove();
  });
});
```

- [ ] **Step 3: Run and verify — `quiz.html`'s test suite**

Navigate the Browser pane to `http://127.0.0.1:8017/wrapper?test=quiz.html`.
Expected: all blocks PASS, including the new one. Then navigate to plain `http://127.0.0.1:8017/quiz.html` (no `?test=`), take a screenshot, click an answer, click the "Hint" button, and confirm both the normal quiz flow and the inspector panel (right-side, click any box) work side by side with no console errors (`read_console_messages`).

- [ ] **Step 4: Wire `math-trainer.html`**

Add the import (alongside the existing ones) and three lines. Current relevant lines:

```js
const reg = await (await fetch('/registry.json')).json();
const el = render(resolve(reg['screens/math-trainer-dashboard'], reg));
document.body.appendChild(el);
```

Replace with:

```js
const reg = await (await fetch('/registry.json')).json();
const provenance = new Map();
const el = render(resolve(reg['screens/math-trainer-dashboard'], reg, [], new Set(), [], provenance));
document.body.appendChild(el);
mountInspector(el, { sourceId: 'screens/math-trainer-dashboard', provenance });
```

And add `import { mountInspector } from './ui/inspector.js';` to the import list at the top of the script.

- [ ] **Step 5: Wire `anatomy.html`**

Current relevant lines:

```js
const reg = await (await fetch('/registry.json')).json();
const el = render(resolve(reg['screens/anatomy'], reg));
document.body.appendChild(el);
drawPaths(el);
```

Replace with:

```js
const reg = await (await fetch('/registry.json')).json();
const provenance = new Map();
const el = render(resolve(reg['screens/anatomy'], reg, [], new Set(), [], provenance));
document.body.appendChild(el);
mountInspector(el, { sourceId: 'screens/anatomy', provenance });
drawPaths(el);
```

And add `import { mountInspector } from './ui/inspector.js';` to the import list at the top of the script.

- [ ] **Step 6: Run and verify — `math-trainer.html` and `anatomy.html`**

Navigate the Browser pane to `http://127.0.0.1:8017/wrapper?test=math-trainer.html`, confirm all PASS (regression — this task didn't touch `ui/quiz.js` or the dashboard/quiz-swap logic, just added the inspector alongside it). Then open plain `http://127.0.0.1:8017/math-trainer.html`, click a box in the dashboard (confirm the panel shows `screens/math-trainer-dashboard, path ...`), click "Start" to embed the quiz, click a box inside the embedded quiz work area, confirm selection still works there too, no console errors.
Repeat for `http://127.0.0.1:8017/wrapper?test=anatomy.html` (all PASS) and plain `http://127.0.0.1:8017/anatomy.html` (click a box, confirm panel shows `screens/anatomy, path ...`, no console errors).

- [ ] **Step 7: Full regression — entire suite**

Run: `just ci`
Expected: all PASS.
Navigate the Browser pane to `http://127.0.0.1:8017/wrapper?test=index.html`.
Expected: all PASS (gallery unaffected — index.html was not touched).

- [ ] **Step 8: Commit**

```bash
git add quiz.html math-trainer.html anatomy.html test/quiz_test.js
git commit -m "feat(inspector): wire mountInspector into quiz.html, math-trainer.html, anatomy.html"
```

---

## Self-Review

**Spec coverage** — every section of `docs/superpowers/specs/2026-08-29-inspector-panel-design.md` maps to a task:
- Architecture / page-mount, opt-in `mountInspector` → Task 2, Task 6.
- Provenance / `resolve()` param → Task 1.
- Edit rule (local override, never the `extends` target) → satisfied by construction: `onChange` always writes `captured.box` on the *selected element's own* captured subtree, never touches `registry`/the base part.
- Selection, outline highlight, `handles.js` reuse → Task 2.
- Edit form (per-dial, gap growth, place guard) → Task 3.
- Scoped subtree re-render → Task 4.
- Export (copy/download, provenance-labeled) → Task 5.
- "Not in v1" items (drag-to-resize, server save) → correctly absent from every task.

**Placeholder scan** — no TBD/TODO, every step has runnable code, every test has real assertions (no "test the above" stubs).

**Type consistency** — checked across tasks: `mountInspector(container, { sourceId, provenance })` signature identical Tasks 2–6; `nodePath(el, root)`, `describeProvenance(path, sourceId, provenance)`, `exportPayload(el, root, sourceId, provenance)` signatures match their call sites in every later task; `controls[dial]` / `data-dial` / `.ins-value` / `.ins-growth` naming introduced in Task 3 is used identically in Tasks 4–6's tests; `resolve(doc, registry, env, seen, path, provenance)` param order from Task 1 matches every call site added in Task 6.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-29-inspector-panel.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
