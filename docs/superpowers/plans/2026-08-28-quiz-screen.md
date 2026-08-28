# Quiz Screen + Generic State-Machine Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working quiz screen (1 question, 3-5 answers, single or
multiple choice, hint reveal, lock-in, paced colorized reveal, next)
driven by a small generic finite-state-machine controller.

**Architecture:** A generic FSM primitive (`ui/state-machine.js`) that
knows nothing about quizzes — states declare `enter`/`exit` hooks that
register/deregister whatever listeners (DOM click, timer) that state
needs, and a static `event -> nextState` table. Quiz-specific logic
(`ui/quiz.js`) defines the actual states/transitions, a pure `grade()`
function, and DOM wiring, reusing `ui/model.js`'s `resolve`/`render`
for every node it puts on screen — never hand-built DOM. Content
(question/answer/hint) lives in a new `content/` directory, separate
from the `parts/`/`screens/` vocabulary registry.

**Tech Stack:** Vanilla ES modules, `node:test` for node-side tests,
this repo's existing browser `TestRunner` harness for the live page.

**Spec:** [docs/superpowers/specs/2026-08-28-quiz-screen-design.md](../specs/2026-08-28-quiz-screen-design.md)

## Global Constraints

- Controller (`ui/state-machine.js`, `ui/quiz.js`) is a page-mount
  module, same bucket as `ui/actions.js`/`ui/icons.js` — NOT a new Ln
  rung in the ladder (CLAUDE.md).
- FSM primitive has no action-type DSL — `enter`/`exit` are plain
  functions; "navigate/toast/callback" are just what those functions
  do, not a mechanism the machine interprets.
- No new `box.state` dial values for selection/result — plain CSS
  classes (`bx-selected`/`bx-correct`/`bx-wrong`), same precedent as
  `bx-actionable` in `ui/actions.js`. `state:disabled` is reused as-is
  for "not yet applicable" controls (lock/next buttons at rest) — that
  matches its existing meaning; hint-panel visibility is a plain
  `style.display` toggle, not `disabled` (different concept: hidden
  content vs an inert control).
- Exactly one new color token: `--ok` (soft green) in `tokens.css`.
  Wrong reuses the existing `--accent`. Both applied as low-opacity
  background tints, not solid fills.
- Answer selector shape: `circle` for `mode:"single"`, `square` for
  `mode:"multiple"` (matches `component/radio-group`/`component/checkbox`
  convention) — composed per-answer, not by instantiating those parts.
- Correct/wrong icons: reuse `icon-done`/`icon-cancelled` from
  `ui/icons.js`'s existing sprite. No new icons.
- `content/quiz/lesson1.json`: `questions` is an array from day one.
  `mode` is `"single"` or `"multiple"` only — unknown value is an
  error, matching every other enum in this repo (C2).
- Multiple-choice grading is exact-match only: correct iff the
  selected set equals the correct set exactly. No partial credit.
- `PAUSE_MS` (900) is a plain JS constant in `ui/quiz.js`, not
  vocabulary, not a dial.

---

## File Structure

| file | status | responsibility |
|---|---|---|
| `ui/state-machine.js` | create | generic FSM primitive: `createMachine({states, initial, context})` |
| `test/node/state_machine_test.js` | create | node tests for the FSM primitive |
| `ui/quiz.js` | create | `grade(answers, selectedIndices)` (pure) + `mountQuiz(root, quizData)` (DOM wiring, uses the FSM) |
| `test/node/quiz_grade_test.js` | create | node tests for `grade()` |
| `content/quiz/lesson1.json` | create | one quiz's question/answer/hint data |
| `test/node/quiz_content_test.js` | create | node test: content file shape (mode enum, 3-5 answers, ≥1 correct) |
| `server.py` | modify | add `/content/` to `NO_STORE` |
| `ui/tokens.css` | modify | `--ok` token + `.bx-selected`/`.bx-correct`/`.bx-wrong` rules |
| `screens/quiz.json` | create | static shell: prompt, answers container, hint panel, hint/lock/next buttons |
| `quiz.html` | create | mounts the shell + `content/quiz/lesson1.json` + `ui/quiz.js` |
| `test/quiz_test.js` | create | browser test: hint reveal, single-choice flow, multiple-choice flow, pause gate, next/finish |

---

## Task 1: Generic state-machine primitive

**Files:**
- Create: `ui/state-machine.js`
- Test: `test/node/state_machine_test.js`

**Interfaces:**
- Produces: `createMachine({ states, initial, context = {} })` →
  `{ send(event, payload) => boolean, state: string (getter) }`.
  `states` shape: `{ [name]: { enter?(ctx, send, payload), exit?(ctx), on?: { [event]: nextStateName } } }`.
  `send` looks up `states[current].on[event]`; if undefined, no-op,
  returns `false`. Otherwise calls current state's `exit(ctx)` (if
  any), switches `current`, calls new state's `enter(ctx, send,
  payload)` (if any), returns `true`. `enter(initial)` runs once at
  creation.

- [ ] **Step 1: Write the failing test**

```js
// test/node/state_machine_test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMachine } from '../../ui/state-machine.js';

test('enters the initial state on creation', () => {
  const log = [];
  createMachine({
    states: { a: { enter: () => log.push('enter-a') } },
    initial: 'a',
  });
  assert.deepEqual(log, ['enter-a']);
});

test('send() transitions on a matching event, calls exit then enter', () => {
  const log = [];
  const m = createMachine({
    states: {
      a: { enter: () => log.push('enter-a'), exit: () => log.push('exit-a'), on: { go: 'b' } },
      b: { enter: () => log.push('enter-b') },
    },
    initial: 'a',
  });
  const ok = m.send('go');
  assert.equal(ok, true);
  assert.equal(m.state, 'b');
  assert.deepEqual(log, ['enter-a', 'exit-a', 'enter-b']);
});

test('send() with an unregistered event is a no-op', () => {
  const m = createMachine({
    states: { a: { on: { go: 'b' } }, b: {} },
    initial: 'a',
  });
  const ok = m.send('nope');
  assert.equal(ok, false);
  assert.equal(m.state, 'a');
});

test('context is shared and mutable across enter/exit hooks', () => {
  const seen = [];
  const m = createMachine({
    states: {
      a: { exit: (ctx) => { ctx.count = 1; }, on: { go: 'b' } },
      b: { enter: (ctx) => { seen.push(ctx.count); } },
    },
    initial: 'a',
    context: { count: 0 },
  });
  m.send('go');
  assert.deepEqual(seen, [1]);
});

test('enter receives the payload passed to send()', () => {
  let received = null;
  const m = createMachine({
    states: {
      a: { on: { go: 'b' } },
      b: { enter: (ctx, send, payload) => { received = payload; } },
    },
    initial: 'a',
  });
  m.send('go', { id: 42 });
  assert.deepEqual(received, { id: 42 });
});

test('states with no enter/exit defined at all do not throw', () => {
  const m = createMachine({ states: { a: { on: { go: 'b' } }, b: {} }, initial: 'a' });
  assert.doesNotThrow(() => m.send('go'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/node/state_machine_test.js`
Expected: FAIL — `Cannot find module '../../ui/state-machine.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// ui/state-machine.js -- generic FSM primitive. Knows nothing about any
// particular screen. A state's enter/exit register/deregister whatever
// listeners it needs (DOM click, timer, later a socket message) --
// all of them just call send(event, payload). No action-type DSL:
// "navigate"/"toast"/"callback" are just what enter/exit do, not a
// mechanism this module interprets.
export function createMachine({ states, initial, context = {} }) {
  let current = initial;
  const ctx = context;

  function send(event, payload) {
    const def = states[current];
    const next = def && def.on && def.on[event];
    if (next == null) return false;
    if (typeof def.exit === 'function') def.exit(ctx);
    current = next;
    const nextDef = states[current];
    if (nextDef && typeof nextDef.enter === 'function') nextDef.enter(ctx, send, payload);
    return true;
  }

  const initialDef = states[initial];
  if (initialDef && typeof initialDef.enter === 'function') initialDef.enter(ctx, send);

  return {
    send,
    get state() { return current; },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/node/state_machine_test.js`
Expected: PASS, 6/6

- [ ] **Step 5: Commit**

```bash
git add ui/state-machine.js test/node/state_machine_test.js
git commit -m "feat(ui): generic state-machine primitive for the quiz controller"
```

---

## Task 2: Pure grading function

**Files:**
- Create: `ui/quiz.js` (this task: only the `grade` export)
- Test: `test/node/quiz_grade_test.js`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `grade(answers, selectedIndices)` → `boolean`. `answers`:
  `Array<{ text: string, correct: boolean }>`. `selectedIndices`:
  `Iterable<number>` (array or Set) of indices into `answers`. Correct
  iff the set of selected indices exactly equals the set of indices
  where `answers[i].correct === true`.

- [ ] **Step 1: Write the failing test**

```js
// test/node/quiz_grade_test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { grade } from '../../ui/quiz.js';

const single = [
  { text: 'A', correct: true },
  { text: 'B', correct: false },
];

const multiple = [
  { text: '2', correct: true },
  { text: '4', correct: false },
  { text: '5', correct: true },
  { text: '9', correct: false },
];

test('single mode: selecting the correct answer passes', () => {
  assert.equal(grade(single, [0]), true);
});
test('single mode: selecting the wrong answer fails', () => {
  assert.equal(grade(single, [1]), false);
});
test('multiple mode: exact match of the correct set passes', () => {
  assert.equal(grade(multiple, [0, 2]), true);
});
test('multiple mode: exact match works with a Set too', () => {
  assert.equal(grade(multiple, new Set([2, 0])), true);
});
test('multiple mode: missing one correct answer fails', () => {
  assert.equal(grade(multiple, [0]), false);
});
test('multiple mode: an extra wrong answer selected fails', () => {
  assert.equal(grade(multiple, [0, 1, 2]), false);
});
test('multiple mode: nothing selected fails', () => {
  assert.equal(grade(multiple, []), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/node/quiz_grade_test.js`
Expected: FAIL — `Cannot find module '../../ui/quiz.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// ui/quiz.js -- quiz-specific controller. Page-mount layer, same
// bucket as ui/actions.js -- not part of the box/vocabulary model.
export function grade(answers, selectedIndices) {
  const correct = new Set(answers.map((a, i) => i).filter(i => answers[i].correct));
  const selected = new Set(selectedIndices);
  if (correct.size !== selected.size) return false;
  for (const i of correct) if (!selected.has(i)) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/node/quiz_grade_test.js`
Expected: PASS, 7/7

- [ ] **Step 5: Commit**

```bash
git add ui/quiz.js test/node/quiz_grade_test.js
git commit -m "feat(ui): pure grade() function for quiz answer checking"
```

---

## Task 3: Content data file + server support

**Files:**
- Create: `content/quiz/lesson1.json`
- Test: `test/node/quiz_content_test.js`
- Modify: `server.py:16`

**Interfaces:**
- Produces: `content/quiz/lesson1.json` — `{ id: string, questions: Array<{ prompt: string, mode: 'single'|'multiple', answers: Array<{text: string, correct: boolean}>, hint: string }> }`.
  This is the shape `ui/quiz.js` (Task 5) will `fetch()` and pass to `mountQuiz`.

- [ ] **Step 1: Write the failing test**

```js
// test/node/quiz_content_test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const doc = JSON.parse(readFileSync(new URL('../../content/quiz/lesson1.json', import.meta.url)));

test('content file has an id and a non-empty questions array', () => {
  assert.equal(typeof doc.id, 'string');
  assert.ok(Array.isArray(doc.questions) && doc.questions.length >= 1);
});

test('every question has a legal mode, 3-5 answers, and at least one correct', () => {
  for (const q of doc.questions) {
    assert.ok(['single', 'multiple'].includes(q.mode), `illegal mode '${q.mode}'`);
    assert.ok(q.answers.length >= 3 && q.answers.length <= 5, 'answers must be 3-5');
    assert.ok(q.answers.some(a => a.correct === true), 'needs at least one correct answer');
    assert.equal(typeof q.prompt, 'string');
    assert.equal(typeof q.hint, 'string');
    if (q.mode === 'single')
      assert.equal(q.answers.filter(a => a.correct).length, 1, 'single mode needs exactly one correct answer');
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/node/quiz_content_test.js`
Expected: FAIL — `ENOENT: no such file or directory, open '.../content/quiz/lesson1.json'`

- [ ] **Step 3: Create the content file**

```json
{ "id": "quiz/lesson1", "questions": [
  { "prompt": "Which of these are prime numbers?", "mode": "multiple",
    "answers": [
      { "text": "2", "correct": true },
      { "text": "4", "correct": false },
      { "text": "5", "correct": true },
      { "text": "9", "correct": false } ],
    "hint": "A prime number has exactly two divisors: 1 and itself." } ] }
```

Save as `content/quiz/lesson1.json`.

- [ ] **Step 4: Add `/content/` to the dev server's no-store list**

In `server.py`, line 16:

```python
NO_STORE = ('/test/', '/ui/', '/parts/', '/screens/', '/wrapper', '/registry.json')
```

becomes:

```python
NO_STORE = ('/test/', '/ui/', '/parts/', '/screens/', '/content/', '/wrapper', '/registry.json')
```

No route changes needed — `content/quiz/lesson1.json` is served by
`SimpleHTTPRequestHandler`'s default static-file handling already used
for every other real path (only `/wrapper` and `/registry.json` are
special-cased in `do_GET`).

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/node/quiz_content_test.js`
Expected: PASS, 2/2

- [ ] **Step 6: Commit**

```bash
git add content/quiz/lesson1.json test/node/quiz_content_test.js server.py
git commit -m "feat(content): quiz lesson1 data + server no-store support"
```

---

## Task 4: Visual tokens + screen shell

**Files:**
- Modify: `ui/tokens.css`
- Create: `screens/quiz.json`

**Interfaces:**
- Produces: CSS classes `.bx-selected`, `.bx-correct`, `.bx-wrong` and
  token `--ok`, consumed by `ui/quiz.js` (Task 5) via `classList`.
- Produces: `screens/quiz.json`, resolvable/renderable via the
  existing `resolve`/`render` pipeline, with these named nodes that
  Task 5 queries by `data-name`: `prompt`, `answers`, `hint-panel`,
  `hint-text`, `btn-hint`, `btn-lock`, `btn-next`.

- [ ] **Step 1: Add the token + classes to `ui/tokens.css`**

Add `--ok` next to the existing palette tokens (after `--accent` on
line 4):

```css
:root {
  --canvas:#f0eee9; --paper:#fff; --ink:#222; --text:#111;
  --muted:#8a8579; --accent:#c0392b; --ok:#2f7d4f;
  --tint0:#f5f3ef; --tint1:#ecebe7; --tint2:#e8e6e0; --tint3:#d8d5cf;
  --dash:#999; --rule:#d5d2cc;
  --prose:'Architects Daughter',cursive;
  --mono:ui-monospace,Menlo,Consolas,monospace;
}
```

Append at the end of the file, after the existing `.bx-actionable:hover`
rule:

```css
/* quiz answer states -- page-mount concern (ui/quiz.js), not a box
   dial: selection/result aren't part of the vocabulary model, same
   precedent as .bx-actionable above. Tints, not solid fills, per
   explicit "eye-friendly" correction during design. */
.bx-selected{outline:2px solid var(--ink);outline-offset:-2px}
.bx-correct{background:rgba(47,125,79,.16)}
.bx-wrong{background:rgba(192,57,43,.16)}
```

- [ ] **Step 2: Create the screen shell**

```json
{ "box": "stack, fill, clip, tint0, pad:3, gap:2",
  "children": [
    { "name": "prompt", "box": "hug", "content": "" },
    { "name": "answers", "box": "stack, gap:1, hug" },
    { "name": "hint-panel", "box": "row, mid, gap:1, fixed, w:280, pad:1, solid, rounded, tint0",
      "children": [
        { "box": "hug", "content": "!" },
        { "name": "hint-text", "box": "hug", "content": "" } ] },
    { "name": "controls", "box": "row, mid, gap:2, hug",
      "children": [
        { "name": "btn-hint", "extends": "atom/button", "content": "Hint" },
        { "name": "btn-lock", "extends": "atom/button.primary", "box": "disabled", "content": "Lock answer in" },
        { "name": "btn-next", "extends": "atom/button.primary", "box": "disabled", "content": "Next" } ] } ] }
```

Save as `screens/quiz.json`. `hint-panel` starts visible in the static
shell (its runtime `display:none` is set by `ui/quiz.js` at mount,
Task 5 — not baked into the JSON, since "not yet revealed" is a
runtime concern, not a layout default).

- [ ] **Step 3: Verify it's picked up by the existing parts/screens suite**

Run: `just ci`
Expected: PASS, all tests including the new `screens/quiz` entry
(`test/node/parts_validate_test.js` walks every file under `screens/**`
automatically — resolves, checks reserved keys, and since this id has
no `.` after its last `/`, the variant-naming test doesn't apply to it;
the classification test requires `screens/*` to have `children`, which
it does).

- [ ] **Step 4: Commit**

```bash
git add ui/tokens.css screens/quiz.json
git commit -m "feat(ui): quiz screen shell + --ok token and result/selection CSS"
```

---

## Task 5: Quiz DOM wiring (`mountQuiz`) + page

**Files:**
- Modify: `ui/quiz.js` (add `mountQuiz`, keep the existing `grade` export from Task 2)
- Create: `quiz.html`

**Interfaces:**
- Consumes: `createMachine` from `ui/state-machine.js` (Task 1);
  `grade` from this same file (Task 2); `resolve`/`render` from
  `ui/model.js`/`ui/render.js`; `mountIcons` from `ui/icons.js`.
- Produces: `mountQuiz(root, quizData)` → the created machine (mainly
  for tests to inspect `.state`). `root`: the rendered `screens/quiz`
  element. `quizData`: the parsed content JSON from Task 3's shape.

- [ ] **Step 1: Append the state definitions and `mountQuiz` to `ui/quiz.js`**

```js
// ui/quiz.js -- quiz-specific controller. Page-mount layer, same
// bucket as ui/actions.js -- not part of the box/vocabulary model.
import { createMachine } from './state-machine.js';
import { resolve } from './model.js';
import { render } from './render.js';
import { mountIcons } from './icons.js';

export function grade(answers, selectedIndices) {
  const correct = new Set(answers.map((a, i) => i).filter(i => answers[i].correct));
  const selected = new Set(selectedIndices);
  if (correct.size !== selected.size) return false;
  for (const i of correct) if (!selected.has(i)) return false;
  return true;
}

const PAUSE_MS = 900;

function answerNode(index, text, mode) {
  return {
    name: `answer-${index}`,
    box: 'row, mid, gap:1, hug, solid, rounded, pad:1',
    children: [
      { name: `selector-${index}`, box: `fixed, w:12, h:12, solid, ${mode === 'single' ? 'circle' : 'square'}` },
      { box: 'hug', content: text },
    ],
  };
}

function markNode(kind) {
  return { name: `icon-${kind}`, box: 'fixed, w:14, h:14' };
}

function enterAnswering(ctx, send) {
  const q = ctx.quizData.questions[ctx.qIndex];
  ctx.selected = new Set();
  ctx.promptEl.textContent = q.prompt;
  ctx.hintTextEl.textContent = q.hint;
  ctx.hintPanelEl.style.display = 'none';
  ctx.answersEl.replaceChildren();
  ctx.btnNext.classList.add('bx-disabled');
  ctx.btnLock.classList.toggle('bx-disabled', q.mode !== 'multiple');

  ctx.rowListeners = q.answers.map((a, i) => {
    const row = render(resolve(answerNode(i, a.text, q.mode)));
    ctx.answersEl.appendChild(row);
    const onClick = () => {
      if (q.mode === 'single') {
        ctx.selected = new Set([i]);
        send('lockIn');
      } else {
        if (ctx.selected.has(i)) ctx.selected.delete(i); else ctx.selected.add(i);
        row.classList.toggle('bx-selected', ctx.selected.has(i));
      }
    };
    row.addEventListener('click', onClick);
    return [row, onClick];
  });

  ctx.onHint = () => { ctx.hintPanelEl.style.display = ''; };
  ctx.hintBtn.addEventListener('click', ctx.onHint);

  ctx.onLock = q.mode === 'multiple' ? () => send('lockIn') : null;
  if (ctx.onLock) ctx.btnLock.addEventListener('click', ctx.onLock);
}

function exitAnswering(ctx) {
  ctx.rowListeners.forEach(([row, fn]) => row.removeEventListener('click', fn));
  ctx.hintBtn.removeEventListener('click', ctx.onHint);
  if (ctx.onLock) ctx.btnLock.removeEventListener('click', ctx.onLock);
}

function enterRevealed(ctx, send) {
  const q = ctx.quizData.questions[ctx.qIndex];
  const rows = [...ctx.answersEl.children];
  q.answers.forEach((a, i) => {
    const row = rows[i];
    if (a.correct) {
      row.classList.add('bx-correct');
      row.appendChild(render(resolve(markNode('done'))));
    } else if (ctx.selected.has(i)) {
      row.classList.add('bx-wrong');
      row.appendChild(render(resolve(markNode('cancelled'))));
    }
  });
  mountIcons(ctx.answersEl);

  ctx.timer = setTimeout(() => send('paused'), PAUSE_MS);
  ctx.onContinue = () => send('paused');
  ctx.root.addEventListener('click', ctx.onContinue, { once: true });
}

function exitRevealed(ctx) {
  clearTimeout(ctx.timer);
  ctx.root.removeEventListener('click', ctx.onContinue);
}

function enterNextReady(ctx) {
  ctx.btnNext.classList.remove('bx-disabled');
  ctx.onNext = () => {
    const isLast = ctx.qIndex + 1 >= ctx.quizData.questions.length;
    if (isLast) { ctx.send('finish'); }
    else { ctx.qIndex += 1; ctx.send('next'); }
  };
  ctx.btnNext.addEventListener('click', ctx.onNext);
}

function exitNextReady(ctx) {
  ctx.btnNext.removeEventListener('click', ctx.onNext);
}

function enterFinished(ctx) {
  ctx.btnNext.classList.add('bx-disabled');
}

const states = {
  answering:    { enter: enterAnswering, exit: exitAnswering, on: { lockIn: 'revealed' } },
  revealed:     { enter: enterRevealed,  exit: exitRevealed,  on: { paused: 'next-ready' } },
  'next-ready': { enter: enterNextReady, exit: exitNextReady, on: { next: 'answering', finish: 'finished' } },
  finished:     { enter: enterFinished },
};

export function mountQuiz(root, quizData) {
  const ctx = {
    quizData, qIndex: 0, root,
    promptEl: root.querySelector('[data-name="prompt"]'),
    answersEl: root.querySelector('[data-name="answers"]'),
    hintPanelEl: root.querySelector('[data-name="hint-panel"]'),
    hintTextEl: root.querySelector('[data-name="hint-text"]'),
    hintBtn: root.querySelector('[data-name="btn-hint"]'),
    btnLock: root.querySelector('[data-name="btn-lock"]'),
    btnNext: root.querySelector('[data-name="btn-next"]'),
  };
  const machine = createMachine({ states, initial: 'answering', context: ctx });
  ctx.send = machine.send;
  return machine;
}
```

Note: `ctx.send = machine.send` is assigned right after creation so
`enterNextReady`'s click handler (which needs to call `send('next')`
*or* `send('finish')` conditionally — something the static `on` table
alone can't express) can reach it; every other state gets `send`
handed directly as `enter`'s second argument from the primitive itself.

- [ ] **Step 2: Create the page**

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>fayf_ui — quiz</title>
<link href="https://fonts.googleapis.com/css2?family=Architects+Daughter&display=swap" rel="stylesheet">
<link rel="stylesheet" href="ui/tokens.css">
<style>html,body{height:100%;margin:0}
body{background:var(--canvas);display:flex}
.bx .ic{stroke:currentColor}</style>
</head>
<body>
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
mountQuiz(el, quizData);
document.body.dataset.ready = '1';
</script>
</body>
</html>
```

Save as `quiz.html`.

- [ ] **Step 3: Run the full node suite to make sure nothing broke**

Run: `just ci`
Expected: PASS (this task added no new node tests — `grade`/`state-machine`
are already covered by Tasks 1-2; this step just guards against a typo
breaking an existing import).

- [ ] **Step 4: Manual smoke check**

Run: `just serve`, then open `http://127.0.0.1:8017/quiz.html` in a
browser. Expected: the prompt "Which of these are prime numbers?" and
4 square selectors render; clicking one toggles a dark outline; "Lock
answer in" is enabled (multiple mode); clicking it colorizes 2·5 green
with a check icon and 4·9 stay neutral (only wrong *selections* turn
red); "Next" appears after ~900ms or an immediate click anywhere.

- [ ] **Step 5: Commit**

```bash
git add ui/quiz.js quiz.html
git commit -m "feat(quiz): DOM wiring + quiz.html page"
```

---

## Task 6: Browser test

**Files:**
- Create: `test/quiz_test.js`

**Interfaces:**
- Consumes: the global `TestRunner` (from `test/js_runner.js`, injected
  by `server.py`'s `/wrapper?test=quiz.html` route — same convention
  as `test/math-trainer_test.js`).

- [ ] **Step 1: Write the test**

```js
// test/quiz_test.js
const tr = new TestRunner({ stopOnError: false });

tr.addBlock('quiz: hint reveal and multiple-choice flow', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(() => {
     const root = document.querySelector('body > .bx');
     r.check(!!root, 'screen mounted');

     const hintPanel = root.querySelector('[data-name="hint-panel"]');
     r.check(getComputedStyle(hintPanel).display === 'none', 'hint starts hidden');
     root.querySelector('[data-name="btn-hint"]').click();
     r.check(getComputedStyle(hintPanel).display !== 'none', 'hint reveals on click');
     r.check(hintPanel.textContent.includes('divisors'), 'hint shows the real hint text');

     const answers = [...root.querySelectorAll('[data-name^="answer-"]')];
     r.check(answers.length === 4, 'renders 4 answers for lesson1');

     const lockBtn = root.querySelector('[data-name="btn-lock"]');
     r.check(!lockBtn.classList.contains('bx-disabled'), 'lock button enabled in multiple mode');

     answers[0].click(); // "2", correct
     answers[1].click(); // "4", wrong
     r.check(answers[0].classList.contains('bx-selected'), 'answer 0 marked selected');
     r.check(answers[1].classList.contains('bx-selected'), 'answer 1 marked selected');

     answers[1].click(); // deselect "4"
     r.check(!answers[1].classList.contains('bx-selected'), 'answer 1 deselect works');

     answers[2].click(); // "5", correct -- now selected = {0, 2}, the exact correct set
     lockBtn.click();

     r.check(answers[0].classList.contains('bx-correct'), 'correct answer 0 colorized correct');
     r.check(answers[2].classList.contains('bx-correct'), 'correct answer 2 colorized correct');
     r.check(!answers[1].classList.contains('bx-wrong'), 'unselected wrong answer 1 not marked wrong');
     r.check(!answers[3].classList.contains('bx-wrong'), 'unselected wrong answer 3 not marked wrong');
     r.check(!!answers[0].querySelector('use[href="#icon-done"]'), 'correct answer got the done icon');
   });
});

tr.addBlock('quiz: pause gate then next, click-to-continue skips the timer', (r) => {
  r.run(() => {
    const root = document.querySelector('body > .bx');
    const nextBtn = root.querySelector('[data-name="btn-next"]');
    r.check(nextBtn.classList.contains('bx-disabled'), 'next stays disabled immediately after reveal');
  })
  .run(() => { document.querySelector('body > .bx').click(); }) // click-to-continue, skip the 900ms wait
  .waitFor(() => {
    const nextBtn = document.querySelector('body > .bx [data-name="btn-next"]');
    return !nextBtn.classList.contains('bx-disabled');
  }, 1000, 50, 'next enabled after click-to-continue')
  .run(() => {
    const root = document.querySelector('body > .bx');
    root.querySelector('[data-name="btn-next"]').click();
    r.check(root.querySelector('[data-name="btn-next"]').classList.contains('bx-disabled'),
      'next disabled again -- lesson1 has only 1 question, so this was "finish"');
  });
});

await tr.runBlocks();
```

- [ ] **Step 2: Run it**

Start the dev server (`just serve`), then open
`http://127.0.0.1:8017/wrapper?test=quiz.html` in a browser (or the
Browser pane's `preview_start`/`navigate` tools, same as every other
`_test.js` file in this repo). Expected: page title becomes
`✓ N passed — fayf_ui — quiz`, console shows all `OK :` lines, zero
`FAIL`.

- [ ] **Step 3: Fix anything that fails**

If a check fails, read the console output's `expected`/`actual`,
find the mismatch against Task 5's `ui/quiz.js`, fix there (not in the
test — the test encodes the spec's behavior), rerun.

- [ ] **Step 4: Commit**

```bash
git add test/quiz_test.js
git commit -m "test(quiz): browser coverage for hint/lock-in/pause-gate/next flow"
```

---

## Self-Review Notes

- **Spec coverage:** architecture/states (Task 1, 5) · data shape +
  `content/` location (Task 3) · screen shell + part reuse (Task 4) ·
  result color/icon (Task 4 CSS, Task 5 markNode) · pause/click gate
  (Task 5 `enterRevealed`) · testing (Tasks 1, 2, 3 node; Task 6
  browser). No spec section without a task.
- **Type consistency checked:** `createMachine` signature (Task 1)
  matches every call site in Task 5 (`states`/`initial`/`context`,
  `send(event, payload)`, `ctx` passed to `enter`/`exit`). `grade`
  signature (Task 2) unchanged when re-exported from the same file in
  Task 5. `mountQuiz(root, quizData)` matches `quiz.html`'s call in
  Task 5 Step 2 and the test's expectations in Task 6.
- **No placeholders:** every step has literal code; no "similar to
  Task N", no "handle edge cases" left unspecified — the exact-match
  grading rule and the single-mode "exactly one correct" content
  constraint are both encoded directly in test assertions.
