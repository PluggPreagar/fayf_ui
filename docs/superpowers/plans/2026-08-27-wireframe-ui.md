# Wireframe UI Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** JS wireframe UI library — box+path model, token config, JSON parts — per the ratified spec.

**Architecture:** 9-level ladder L0–L8. L0–L1 pure JS (node-testable), L2 the only DOM writer, L3–L4 path/relation/motion/handles, L5–L8 JSON only. Config = distinct token strings (C8). Round-trip invariant `diff(capture(render(resolve(d))), resolve(d)) == []`.

**Tech Stack:** vanilla ES modules · Python 3 stdlib `http.server` · `just` · `node --test` (node ≥ 22) · browser harness from `infopedia_php/test/`.

**Spec:** `docs/superpowers/specs/2026-08-27-wireframe-ui-design.md` — read it first. Constitution: `CONSTITUTION.md` (C1–C9, binding).

## Global Constraints

- No frameworks, no npm, no bundler, no pip installs (C4). Imports: relative paths only.
- Only `ui/render.js` (+`path.js` SVG) writes DOM (C5).
- Unknown token / duplicate dial per primitive = thrown error (C2, C8).
- Spelling: `center`, never `centre`. Vocabulary tokens exactly as in `ui/vocabulary.json`.
- Reserved node keys: `id extends $ref box content children name path from to relation motion`. Nothing else.
- `padN`/`gapN` = N×4 px. Ink `#222` at 1.5px. Palette per spec Tokens section.
- Node tests: `node --test test/node/*.js`. Browser tests: `/wrapper?test=<page>.html`.
- Plan deviation from spec, agreed: no `just build` — `server.py` serves `/registry.json` live (YAGNI).
- Commit after every task. Messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Skeleton — server, justfile, harness, smoke page

**Files:**
- Create: `server.py`, `justfile`, `index.html`, `test/index_test.js`, `.gitignore`
- Copy: `/home/martin/play/infopedia_php/test/harness.js`, `js_runner.js`, `tracer.js` → `test/` (verbatim, no edits)
- Test: `curl` assertions + browser smoke

**Interfaces:**
- Produces: `GET /wrapper?test=X.html` (injects `test/harness.js` + `test/js_runner.js` + `test/X_test.js` as module, before `</body>`), `GET /wrapper?trace=X.html` (injects `tracer.js`), `GET /registry.json` ({id → part doc} from `parts/` + `screens/`), `no-store` on `/test/ /ui/ /parts/ /screens/ /wrapper /registry.json`. justfile recipes `default serve ci validate test trace`.

- [ ] **Step 1: Copy harness verbatim**

```bash
mkdir -p test
cp /home/martin/play/infopedia_php/test/harness.js /home/martin/play/infopedia_php/test/js_runner.js /home/martin/play/infopedia_php/test/tracer.js test/
```

- [ ] **Step 2: Write `server.py`**

```python
#!/usr/bin/env python3
"""fayf_ui dev server -- stdlib only. Port of infopedia_php/wrapper.php.

/wrapper?test=X.html   serve X.html + test/harness.js + test/js_runner.js + test/X_test.js
/wrapper?trace=X.html  serve X.html + test/tracer.js
/registry.json         {id: doc} for every parts/**.json and screens/**.json
no-store on test/ ui/ parts/ screens/ wrapper registry.json (stale-asset trap)
"""
import argparse
import http.server
import json
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NO_STORE = ('/test/', '/ui/', '/parts/', '/screens/', '/wrapper', '/registry.json')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def end_headers(self):
        if self.path.split('?')[0].startswith(NO_STORE):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == '/wrapper':
            return self.wrapper(urllib.parse.parse_qs(url.query))
        if url.path == '/registry.json':
            return self.registry()
        return super().do_GET()

    def wrapper(self, q):
        mode = 'test' if 'test' in q else 'trace' if 'trace' in q else None
        if not mode:
            return self.reply(400, 'usage: /wrapper?test=X.html | /wrapper?trace=X.html')
        target = Path(q[mode][0]).name          # basename only -- no traversal
        if not target.endswith('.html'):
            return self.reply(400, f'target must be .html: {target}')
        page = ROOT / target
        if not page.is_file():
            return self.reply(404, f'not found: {target}')
        if mode == 'test':
            rel = f'test/{target[:-5]}_test.js'
            if not (ROOT / rel).is_file():
                return self.reply(404, f'missing: {rel}')
            inject = ('<script src="test/harness.js"></script>\n'
                      '<script src="test/js_runner.js"></script>\n'
                      f'<script type="module" src="{rel}"></script>')
        else:
            inject = '<script src="test/tracer.js"></script>'
        html = page.read_text(encoding='utf-8').replace('</body>', inject + '\n</body>')
        self.reply(200, html, 'text/html; charset=utf-8')

    def registry(self):
        reg = {}
        for base, prefix in (('parts', ''), ('screens', 'screens/')):
            d = ROOT / base
            for f in sorted(d.rglob('*.json')) if d.is_dir() else []:
                rid = prefix + f.relative_to(d).as_posix()[:-5]
                reg[rid] = json.loads(f.read_text(encoding='utf-8'))
        self.reply(200, json.dumps(reg), 'application/json')

    def reply(self, code, text, ctype='text/plain; charset=utf-8'):
        body = text.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8017)
    args = ap.parse_args()
    print(f'fayf_ui: http://127.0.0.1:{args.port}/index.html')
    http.server.ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
```

- [ ] **Step 3: Write `justfile`**

```make
port := env_var_or_default("PORT", "8017")

# List recipes
default:
    @just --list

# Dev server (Ctrl-C to stop)
serve:
    @echo "  app:    http://127.0.0.1:{{port}}/index.html"
    @echo "  tests:  http://127.0.0.1:{{port}}/wrapper?test=index.html"
    python3 server.py --port {{port}}

# All node tests -- L0-L1 model + parts conformance
ci:
    node --test test/node/*.js

# Parts/screens conformance only
validate:
    node --test test/node/parts_validate_test.js

# Print browser test URL for PAGE (server must be running)
test PAGE="index.html":
    @echo "http://127.0.0.1:{{port}}/wrapper?test={{PAGE}}"

# Print tracer URL for PAGE
trace PAGE="index.html":
    @echo "http://127.0.0.1:{{port}}/wrapper?trace={{PAGE}}"
```

- [ ] **Step 4: Write smoke `index.html` + failing test**

`index.html`:

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>fayf_ui</title>
</head>
<body>
<h1 id="smoke">fayf_ui</h1>
</body>
</html>
```

`test/index_test.js`:

```js
suite('smoke');
assert('page served with harness', document.getElementById('smoke').textContent, 'fayf_ui');
harnessFinish();
```

`.gitignore`:

```
__pycache__/
```

- [ ] **Step 5: Verify server + injection with curl**

```bash
python3 server.py --port 8017 &  sleep 1
curl -s http://127.0.0.1:8017/wrapper?test=index.html | grep -c 'test/harness.js\|test/index_test.js'   # expect 2 matching lines
curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:8017/wrapper?test=missing.html'                 # expect 404
curl -s -D- -o /dev/null http://127.0.0.1:8017/registry.json | grep -i 'no-store'                        # expect header
curl -s http://127.0.0.1:8017/registry.json                                                              # expect {}
kill %1
```

- [ ] **Step 6: Browser smoke** — `just serve`, open `/wrapper?test=index.html` via the browser pane, expect overlay `PASS page served with harness`.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: skeleton — stdlib server, justfile, browser harness"`

---

### Task 2: L0 — vocabulary + parse/print

**Files:**
- Create: `ui/vocabulary.json`, `ui/model.js`
- Test: `test/node/model_test.js`

**Interfaces:**
- Produces: `parse(tokens: string|string[], primitive='box') → dials` (throws on unknown token / duplicate dial), `print(dials, primitive='box') → string` (canonical order = vocabulary key order, then pad/gap, then numerics). Dials: enum dial → token string; `padN/gapN` → `{pad: N}`; `key:value` → `{key: Number}`.

- [ ] **Step 1: Write `ui/vocabulary.json`** (source of truth, C2)

```json
{
  "box": {
    "direction":  ["row", "stack", "overlay"],
    "size":       ["fixed", "fill", "hug", "aspect-locked", "clamped"],
    "align":      ["start", "mid", "end", "baseline", "stretch"],
    "distribute": ["packed", "between", "around", "evenly"],
    "position":   ["in-flow", "docked", "floating", "anchored", "sticky"],
    "place-h":    ["left", "center", "right"],
    "place-v":    ["top", "middle", "bottom"],
    "stroke":     ["bare", "hairline", "solid", "dashed"],
    "fill-tint":  ["tint0", "tint1", "tint2", "tint3"],
    "radius":     ["square", "rounded", "pill", "circle"],
    "overflow":   ["clip", "scroll"],
    "state":      ["disabled"]
  },
  "box_numeric": ["w", "h", "depth", "opacity", "rotate", "t"],
  "path": {
    "segment": ["straight", "elbow", "curve", "arc"],
    "dash":    ["solid", "dashed", "dotted"],
    "closed":  ["open", "closed"]
  },
  "path_numeric": ["weight", "trim-start", "trim-end", "t"]
}
```

Note: `fill` size-token vs `fill` dial-name collision is resolved by naming the dials `fill-tint`, `place-h`, `place-v` — dial names never appear in token strings, only in `dials` objects and CSS.

- [ ] **Step 2: Write failing tests** `test/node/model_test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, print } from '../../ui/model.js';

test('parse enum tokens', () => {
  assert.deepEqual(parse('row, hug, solid, rounded'),
    { direction: 'row', size: 'hug', stroke: 'solid', radius: 'rounded' });
});
test('parse list form', () => {
  assert.deepEqual(parse(['stack', 'fill']), { direction: 'stack', size: 'fill' });
});
test('padN gapN scale', () => {
  assert.deepEqual(parse('pad2, gap1'), { pad: 2, gap: 1 });
});
test('key:value numerics', () => {
  assert.deepEqual(parse('w:120, h:22, opacity:0.5'), { w: 120, h: 22, opacity: 0.5 });
});
test('place both axes', () => {
  assert.deepEqual(parse('floating, center, middle'),
    { position: 'floating', 'place-h': 'center', 'place-v': 'middle' });
});
test('unknown token throws', () => {
  assert.throws(() => parse('centre'), /unknown token 'centre'/);
});
test('duplicate dial throws', () => {
  assert.throws(() => parse('row, stack'), /duplicate dial 'direction'/);
});
test('path primitive', () => {
  assert.deepEqual(parse('curve, dashed, trim-end:0.35', 'path'),
    { segment: 'curve', dash: 'dashed', 'trim-end': 0.35 });
});
test('print canonical + round-trip', () => {
  const canon = 'row, hug, mid, solid, rounded, pad2, w:80';
  assert.equal(print(parse('w:80, pad2, rounded, solid, mid, hug, row')), canon);
  assert.deepEqual(parse(print(parse(canon))), parse(canon));
});
```

- [ ] **Step 3: Run — verify fails**: `node --test test/node/model_test.js` → FAIL (module not found).

- [ ] **Step 4: Write `ui/model.js` (L0 half)**

```js
// ui/model.js -- L0 parse/print, L1 resolve/diff. Pure: no DOM, no fs.
import vocabulary from './vocabulary.json' with { type: 'json' };

export function parse(tokens, primitive = 'box') {
  const list = Array.isArray(tokens) ? tokens
    : String(tokens).split(',').map(t => t.trim()).filter(Boolean);
  const dials = {};
  for (const tok of list) {
    const [dial, value] = tokenDial(tok, primitive);
    if (dial in dials) throw new Error(`duplicate dial '${dial}': '${tok}' vs '${dials[dial]}'`);
    dials[dial] = value;
  }
  return dials;
}

function tokenDial(tok, primitive) {
  const enums = vocabulary[primitive];
  if (!enums) throw new Error(`unknown primitive '${primitive}'`);
  for (const [dial, values] of Object.entries(enums))
    if (values.includes(tok)) return [dial, tok];
  const scale = primitive === 'box' && /^(pad|gap)(\d+)$/.exec(tok);
  if (scale) return [scale[1], Number(scale[2])];
  const kv = /^([a-z-]+):(-?\d*\.?\d+)$/.exec(tok);
  if (kv && vocabulary[`${primitive}_numeric`].includes(kv[1])) return [kv[1], Number(kv[2])];
  throw new Error(`unknown token '${tok}' for ${primitive}`);
}

export function print(dials, primitive = 'box') {
  const out = [];
  for (const dial of Object.keys(vocabulary[primitive]))
    if (dial in dials) out.push(dials[dial]);
  if (primitive === 'box')
    for (const dial of ['pad', 'gap'])
      if (dial in dials) out.push(`${dial}${dials[dial]}`);
  for (const dial of vocabulary[`${primitive}_numeric`])
    if (dial in dials) out.push(`${dial}:${dials[dial]}`);
  return out.join(', ');
}
```

- [ ] **Step 5: Run — verify passes**: `node --test test/node/model_test.js` → all PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(L0): vocabulary + parse/print"`

---

### Task 3: L1 — resolve/diff

**Files:**
- Modify: `ui/model.js` (append)
- Test: `test/node/resolve_test.js`

**Interfaces:**
- Consumes: `parse`, `print` (Task 2).
- Produces: `resolve(doc, registry={}) → node` — expands `extends`/`$ref` (both: registry lookup, parent-then-child per-dial merge; cycle + unknown-id throw; strips `id/extends/$ref`; parses token strings to dials; recurses `children`; child's `children` replaces parent's wholesale). `diff(a, b) → string[]` (empty = equal; entries `"path.to.key: a ≠ b"`). Content rule: node has `content` xor `children`.

- [ ] **Step 1: Write failing tests** `test/node/resolve_test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, diff } from '../../ui/model.js';

const reg = {
  'base/box': { id: 'base/box', box: 'stack, hug, bare, square' },
  'atom/button': { id: 'atom/button', extends: 'base/box',
    box: 'row, mid, packed, pad2, solid, rounded', content: 'Go' },
};

test('extends merges per dial', () => {
  const n = resolve(reg['atom/button'], reg);
  assert.equal(n.box.direction, 'row');      // child wins
  assert.equal(n.box.size, 'hug');           // parent survives
  assert.equal(n.content, 'Go');
  assert.equal(n.extends, undefined);
  assert.equal(n.id, undefined);
});
test('$ref with per-instance override', () => {
  const n = resolve({ $ref: 'atom/button', box: 'square', content: 'A' }, reg);
  assert.equal(n.box.radius, 'square');
  assert.equal(n.box.direction, 'row');
  assert.equal(n.content, 'A');
});
test('children resolve and replace wholesale', () => {
  const n = resolve({ box: 'row', children: [{ $ref: 'atom/button' }] }, reg);
  assert.equal(n.children[0].box.stroke, 'solid');
});
test('cycle throws', () => {
  const bad = { a: { id: 'a', extends: 'b' }, b: { id: 'b', extends: 'a' } };
  assert.throws(() => resolve(bad.a, bad), /cycle/);
});
test('unknown id throws', () => {
  assert.throws(() => resolve({ extends: 'nope' }, reg), /unknown id 'nope'/);
});
test('diff empty on equal, pathed on differ', () => {
  const a = resolve(reg['atom/button'], reg);
  const b = resolve(reg['atom/button'], reg);
  assert.deepEqual(diff(a, b), []);
  b.box.radius = 'pill';
  assert.deepEqual(diff(a, b), ['box.radius: "rounded" ≠ "pill"']);
});
```

- [ ] **Step 2: Run — verify fails**: `node --test test/node/resolve_test.js` → FAIL (resolve not exported).

- [ ] **Step 3: Append to `ui/model.js`**

```js
const toDials = (v, prim) => typeof v === 'string' ? parse(v, prim) : { ...v };

export function resolve(doc, registry = {}, seen = new Set()) {
  let node = { ...doc };
  const link = node.extends ?? node.$ref;
  if (link) {
    if (seen.has(link)) throw new Error(`cycle: ${[...seen, link].join(' -> ')}`);
    const base = registry[link];
    if (!base) throw new Error(`unknown id '${link}'`);
    const parent = resolve(base, registry, new Set([...seen, link]));
    node = mergeNode(parent, node);
  }
  delete node.extends; delete node.$ref; delete node.id;
  for (const prim of ['box', 'path'])
    if (node[prim] != null) node[prim] = toDials(node[prim], prim);
  if (node.content != null && node.children)
    throw new Error(`content xor children violated${node.name ? ` at '${node.name}'` : ''}`);
  if (node.children)
    node.children = node.children.map(c => resolve(c, registry, seen));
  return node;
}

function mergeNode(parent, child) {
  const out = { ...parent, ...child };
  for (const prim of ['box', 'path'])
    if (parent[prim] != null && child[prim] != null)
      out[prim] = { ...toDials(parent[prim], prim), ...toDials(child[prim], prim) };
  if (child.content != null && !child.children) delete out.children;
  if (child.children && parent.content != null && child.content == null) delete out.content;
  return out;
}

export function diff(a, b, at = '') {
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || typeof a !== typeof b) {
    return JSON.stringify(a) !== JSON.stringify(b)
      ? [`${at}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`] : [];
  }
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
    out.push(...diff(a[k], b[k], at ? `${at}.${k}` : k));
  return out;
}
```

- [ ] **Step 4: Run — verify passes**: `node --test test/node/*.js` → all PASS (Task 2 tests included).

- [ ] **Step 5: Commit** — `git commit -m "feat(L1): resolve with extends/\$ref per-dial merge, diff"`

---

### Task 4: L2 — tokens.css + render/capture

**Files:**
- Create: `ui/tokens.css`, `ui/render.js`, `render.html` (test page)
- Test: `test/render_test.js` (browser)

**Interfaces:**
- Consumes: `parse`, `print`, `resolve`, `diff`.
- Produces: `render(node, doc=document) → HTMLElement` — class `bx` + `bx-<token>` per enum dial (token-uniqueness ⇒ class-uniqueness), inline styles for numerics, `data-box` = `print(dials)`, `data-name`, pass-through `data-extra` (JSON of reserved keys `path from to relation motion`) so the invariant holds before stage 5. `capture(el) → node` — reads those attributes back; `content` from text when no `bx` children.

- [ ] **Step 1: Write `ui/tokens.css`**

```css
/* fayf_ui palette + box classes. One class per token: bx-<token>. */
:root {
  --canvas:#f0eee9; --paper:#fff; --ink:#222; --text:#111;
  --muted:#8a8579; --accent:#c0392b;
  --tint0:#f5f3ef; --tint1:#ecebe7; --tint2:#e8e6e0; --tint3:#d8d5cf;
  --dash:#999; --rule:#d5d2cc;
  --prose:'Architects Daughter',cursive;
  --mono:ui-monospace,Menlo,Consolas,monospace;
}
.bx { box-sizing:border-box; position:relative; display:flex; flex-direction:row;
      min-width:0; min-height:0; font:12px/1.3 var(--prose); color:var(--text); }
/* direction */
.bx-row{flex-direction:row} .bx-stack{flex-direction:column}
.bx-overlay{display:grid} .bx-overlay>.bx{grid-area:1/1}
/* size */
.bx-fixed{flex:none} .bx-hug{flex:none;width:fit-content;height:fit-content}
.bx-fill{flex:1 1 auto;align-self:stretch}
.bx-aspect-locked{aspect-ratio:1} .bx-clamped{flex:1 1 auto;max-width:max-content}
/* align (children, cross axis) */
.bx-start{align-items:flex-start} .bx-mid{align-items:center} .bx-end{align-items:flex-end}
.bx-baseline{align-items:baseline} .bx-stretch{align-items:stretch}
/* distribute (children, main axis) */
.bx-packed{justify-content:flex-start} .bx-between{justify-content:space-between}
.bx-around{justify-content:space-around} .bx-evenly{justify-content:space-evenly}
/* position + place. Rule: docked pairs with exactly one side token. */
.bx-docked,.bx-floating,.bx-anchored{position:absolute}
.bx-sticky{position:sticky;top:0}
.bx-docked.bx-left{left:0;top:0;bottom:0}  .bx-docked.bx-right{right:0;top:0;bottom:0}
.bx-docked.bx-top{top:0;left:0;right:0}    .bx-docked.bx-bottom{bottom:0;left:0;right:0}
.bx-floating.bx-left,.bx-anchored.bx-left{left:0}
.bx-floating.bx-right,.bx-anchored.bx-right{right:0}
.bx-floating.bx-top,.bx-anchored.bx-top{top:0}
.bx-floating.bx-bottom,.bx-anchored.bx-bottom{bottom:0}
.bx-center{left:50%;--tx:-50%} .bx-middle{top:50%;--ty:-50%}
.bx-center,.bx-middle{transform:translate(var(--tx,0),var(--ty,0))}
/* stroke */
.bx-bare{border:none} .bx-hairline{border:1px solid var(--ink)}
.bx-solid{border:1.5px solid var(--ink)} .bx-dashed{border:1.5px dashed var(--dash)}
/* fill-tint */
.bx-tint0{background:var(--tint0)} .bx-tint1{background:var(--tint1)}
.bx-tint2{background:var(--tint2)} .bx-tint3{background:var(--tint3)}
/* radius */
.bx-square{border-radius:0} .bx-rounded{border-radius:3px}
.bx-pill{border-radius:999px} .bx-circle{border-radius:50%}
/* overflow */
.bx-clip{overflow:hidden} .bx-scroll{overflow:auto}
/* state */
.bx-disabled{opacity:.45;pointer-events:none}
```

- [ ] **Step 2: Write test page `render.html`**

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>fayf_ui render tests</title>
<link rel="stylesheet" href="ui/tokens.css">
</head>
<body>
</body>
</html>
```

- [ ] **Step 3: Write failing browser test** `test/render_test.js`

```js
import { parse, resolve, diff } from '../ui/model.js';
import { render, capture } from '../ui/render.js';

suite('render — computed style (visual truth, not just round-trip)');
const host = document.createElement('div');
host.style.cssText = 'position:relative;width:400px;height:200px';
document.body.appendChild(host);

const a = render(resolve({ box: 'row, gap2, pad3, hug, solid' }));
host.appendChild(a);
let cs = getComputedStyle(a);
assert('gap2 = 8px', cs.gap, '8px');
assert('pad3 = 12px', cs.padding, '12px');
assert('solid = 1.5px border', cs.borderTopWidth, '1.5px');
assert('hug has no fixed width', a.style.width, '');

const b = render(resolve({ box: 'docked, left, fixed, w:40' }));
host.appendChild(b);
cs = getComputedStyle(b);
assert('docked left inset 0', cs.left, '0px');
assert('docked left spans height', cs.top + ' ' + cs.bottom, '0px 0px');
assert('w:40', cs.width, '40px');

suite('render — invariant');
const doc = { box: 'stack, hug, gap1, solid, rounded',
  children: [
    { name: 'label', box: 'fixed, w:40, h:6, tint2', },
    { box: 'row, mid, pad2, solid', content: 'Go' } ] };
const r = resolve(doc);
const el = render(r);
host.appendChild(el);
assert('diff(capture(render(resolve)), resolve) empty', diff(capture(el), r), []);

suite('render — reserved-key pass-through');
const p = resolve({ box: 'fixed, w:80, h:24', path: 'curve, solid', from: 'free:0,12', to: 'free:80,12' });
const pe = render(p);
host.appendChild(pe);
assert('path keys survive round-trip', diff(capture(pe), p), []);

harnessFinish();
```

- [ ] **Step 4: Run — verify fails**: `just serve`, open `/wrapper?test=render.html` → overlay FAIL (render.js missing).

- [ ] **Step 5: Write `ui/render.js`**

```js
// ui/render.js -- L2. The ONLY DOM writer (C5).
import { parse, print } from './model.js';

const PASSTHRU = ['path', 'from', 'to', 'relation', 'motion'];

export function render(node, doc = document) {
  const el = doc.createElement('div');
  const d = node.box ?? {};
  el.className = ['bx', ...Object.values(d).filter(v => typeof v === 'string').map(v => `bx-${v}`)].join(' ');
  if ('pad' in d) el.style.padding = `${d.pad * 4}px`;
  if ('gap' in d) el.style.gap = `${d.gap * 4}px`;
  if ('w' in d) el.style.width = `${d.w}px`;
  if ('h' in d) el.style.height = `${d.h}px`;
  if ('depth' in d) el.style.zIndex = d.depth;
  if ('opacity' in d) el.style.opacity = d.opacity;
  if ('rotate' in d) el.style.transform = `rotate(${d.rotate}deg)`;
  el.dataset.box = print(d, 'box');
  if (node.name) el.dataset.name = node.name;
  const extra = {};
  for (const k of PASSTHRU) if (node[k] != null) extra[k] = node[k];
  if (Object.keys(extra).length) el.dataset.extra = JSON.stringify(extra);
  if (node.content != null) el.textContent = node.content;
  for (const child of node.children ?? []) el.appendChild(render(child, doc));
  return el;
}

export function capture(el) {
  const node = {};
  if (el.dataset.name) node.name = el.dataset.name;
  if (el.dataset.box) node.box = parse(el.dataset.box, 'box');
  if (el.dataset.extra) {
    const extra = JSON.parse(el.dataset.extra);
    if (extra.path) extra.path = parse(print(extra.path, 'path'), 'path');
    Object.assign(node, extra);
  }
  const kids = [...el.children].filter(c => c.classList?.contains('bx'));
  if (kids.length) node.children = kids.map(capture);
  else if (el.textContent !== '') node.content = el.textContent;
  return node;
}
```

Note on `extra.path`: it is stored resolved (dials object) — `parse(print(...))` normalizes number types after JSON round-trip.

- [ ] **Step 6: Run — verify passes**: reload `/wrapper?test=render.html` → all PASS.

- [ ] **Step 7: Commit** — `git commit -m "feat(L2): render/capture + tokens.css, invariant green"`

---

### Task 5: Registry, gallery, base + clusters

**Files:**
- Create: `parts/base/box.json`, `parts/cluster/line.json`, `parts/cluster/dot.json`, `test/node/registry.js` (helper), `test/node/parts_validate_test.js`
- Modify: `index.html` (becomes the gallery), `test/index_test.js`
- Test: node conformance + browser gallery

**Interfaces:**
- Consumes: everything above; `/registry.json` (Task 1).
- Produces: `loadRegistry() → {id: doc}` (node, fs walk mirroring server route). Gallery page rendering every non-`base/` registry entry with an id label. Part id = path under `parts/` without `.json` (e.g. `atom/button`); screens prefixed `screens/`.

- [ ] **Step 1: Write base + clusters**

`parts/base/box.json`:

```json
{ "id": "base/box", "box": "stack, hug, bare, square" }
```

`parts/cluster/line.json` (placeholder text bar — the most reused sub-assembly):

```json
{ "id": "cluster/line", "extends": "base/box", "box": "fixed, w:64, h:7, tint2, rounded" }
```

`parts/cluster/dot.json`:

```json
{ "id": "cluster/dot", "extends": "base/box", "box": "fixed, w:8, h:8, tint3, circle" }
```

- [ ] **Step 2: Write node registry helper** `test/node/registry.js`

```js
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

export function loadRegistry(root = new URL('../../', import.meta.url).pathname) {
  const reg = {};
  for (const [base, prefix] of [['parts', ''], ['screens', 'screens/']])
    for (const f of globSync(`${base}/**/*.json`, { cwd: root }).sort())
      reg[prefix + f.slice(base.length + 1, -5)] = JSON.parse(readFileSync(`${root}/${f}`, 'utf-8'));
  return reg;
}
```

- [ ] **Step 3: Write failing conformance test** `test/node/parts_validate_test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, parse, print } from '../../ui/model.js';
import { loadRegistry } from './registry.js';

const RESERVED = new Set(['id', 'extends', '$ref', 'box', 'content', 'children',
  'name', 'path', 'from', 'to', 'relation', 'motion']);

function walkKeys(node, id) {
  for (const k of Object.keys(node))
    assert.ok(RESERVED.has(k), `${id}: unknown key '${k}'`);
  for (const c of node.children ?? []) walkKeys(c, id);
}

const reg = loadRegistry();

test('registry non-empty', () => assert.ok(Object.keys(reg).length >= 3));

test('every id matches its file path', () => {
  for (const [id, doc] of Object.entries(reg))
    if (doc.id !== undefined) assert.equal(doc.id, id, `id mismatch in ${id}`);
});

test('every part resolves, keys reserved, tokens print-stable', () => {
  for (const [id, doc] of Object.entries(reg)) {
    walkKeys(doc, id);
    const n = resolve(doc, reg);           // throws on unknown token/id/cycle
    if (n.box) assert.deepEqual(parse(print(n.box, 'box'), 'box'), n.box, id);
  }
});

test('classification rule holds', () => {
  const named = []; // filled task 6-8; rule checked structurally here
  for (const [id, doc] of Object.entries(reg)) {
    const n = resolve(doc, reg);
    if (id.startsWith('atom/'))   assert.ok(!n.children, `${id}: atom must have no children`);
    if (id.startsWith('screens/')) assert.ok(n.children?.length, `${id}: screen needs children`);
  }
});
```

- [ ] **Step 4: Run — verify current state**: `node --test test/node/parts_validate_test.js` → PASS (3 files, all conform). If FAIL, fix the JSON, not the test.

- [ ] **Step 5: Rewrite `index.html` as the gallery**

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>fayf_ui</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Architects+Daughter&display=swap" rel="stylesheet">
<link rel="stylesheet" href="ui/tokens.css">
<style>
  body{margin:0;background:var(--canvas);padding:28px;font-family:var(--mono)}
  h1{font:400 22px var(--prose);color:var(--text);margin:0 0 20px}
  .g-grid{display:flex;flex-wrap:wrap;gap:26px;align-items:flex-start}
  .g-item{display:flex;flex-direction:column;gap:7px}
  .g-label{font:600 10px var(--mono);color:var(--muted)}
  .g-stage{position:relative;background:var(--paper);border:1px solid var(--rule);
           border-radius:6px;padding:14px;min-width:60px;min-height:40px}
</style>
</head>
<body>
<h1 id="smoke">fayf_ui — parts</h1>
<div class="g-grid" id="gallery"></div>
<script type="module">
import { resolve } from './ui/model.js';
import { render } from './ui/render.js';
const reg = await (await fetch('/registry.json')).json();
const grid = document.getElementById('gallery');
for (const [id, doc] of Object.entries(reg).sort(([a], [b]) => a.localeCompare(b))) {
  if (id.startsWith('base/')) continue;
  const item = document.createElement('div'); item.className = 'g-item';
  const label = document.createElement('div'); label.className = 'g-label'; label.textContent = id;
  const stage = document.createElement('div'); stage.className = 'g-stage';
  stage.appendChild(render(resolve(doc, reg)));
  item.append(label, stage);
  grid.append(item);
}
document.body.dataset.ready = '1';
</script>
</body>
</html>
```

- [ ] **Step 6: Rewrite browser test** `test/index_test.js` — gallery + full invariant sweep

```js
import { resolve, diff } from '../ui/model.js';
import { render, capture } from '../ui/render.js';

const tr = new TestRunner({ stopOnError: false });
tr.addBlock('gallery renders', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000, 100, 'gallery ready')
   .run(() => r.check(document.querySelectorAll('.g-item').length >= 2, 'items rendered'));
});
tr.addBlock('invariant over every registry entry', (r) => {
  r.run(async () => {
    const reg = await (await fetch('/registry.json')).json();
    for (const [id, doc] of Object.entries(reg)) {
      const n = resolve(doc, reg);
      const el = render(n);
      document.body.appendChild(el);
      const d = diff(capture(el), n);
      r.check(d.length === 0, `invariant ${id}`, `invariant ${id}: ${d.join('; ')}`);
      el.remove();
    }
  });
});
await tr.runBlocks();
```

- [ ] **Step 7: Run browser tests**: `/wrapper?test=index.html` → console summary `All passed` (TestRunner logs to console; check via browser pane console). Verify gallery shows `cluster/line`, `cluster/dot`.

- [ ] **Step 8: Commit** — `git commit -m "feat: registry route + gallery + base/clusters + conformance tests"`

---

### Task 6: Sheet 1 — 13 structure parts (L7)

**Files:**
- Create: 13 files under `parts/component/`
- Test: existing conformance + invariant suites (they sweep the registry — no new test code)

**Interfaces:**
- Consumes: `base/box`, `cluster/line`, `cluster/dot`.
- Produces: ids `component/viewport … component/status-bar` used by Task 12.

- [ ] **Step 1: Write the 13 JSON files** (filenames = `parts/component/<name>.json`)

```json
{ "id": "component/viewport", "extends": "base/box", "box": "stack, fixed, w:160, h:104, solid, rounded, clip",
  "children": [ { "box": "fixed, h:16, tint1" }, { "box": "fill" } ] }
```

```json
{ "id": "component/panel", "extends": "base/box", "box": "row, fixed, w:160, h:104, gap1",
  "children": [ { "box": "fixed, w:44, solid, rounded, tint1" }, { "box": "fill, solid, rounded" } ] }
```

```json
{ "id": "component/card", "extends": "base/box", "box": "stack, fixed, w:120, pad1, gap1, solid, rounded, clip",
  "children": [ { "box": "fixed, h:30, tint1" },
    { "$ref": "cluster/line", "box": "w:84" }, { "$ref": "cluster/line", "box": "w:56" } ] }
```

```json
{ "id": "component/splitter", "extends": "base/box", "box": "row, mid, fixed, w:160, h:96, gap1",
  "children": [ { "box": "fill, solid, rounded" },
    { "box": "stack, mid, evenly, fixed, w:10, h:28",
      "children": [ { "$ref": "cluster/dot", "box": "w:3, h:3" }, { "$ref": "cluster/dot", "box": "w:3, h:3" }, { "$ref": "cluster/dot", "box": "w:3, h:3" } ] },
    { "box": "fill, solid, rounded" } ] }
```

```json
{ "id": "component/layout-grid", "extends": "base/box", "box": "row, fixed, w:160, h:96, gap2",
  "children": [ { "box": "fill, dashed, tint0" }, { "box": "fill, dashed, tint0" },
    { "box": "fill, dashed, tint0" }, { "box": "fill, dashed, tint0" } ] }
```

```json
{ "id": "component/app-bar", "extends": "base/box", "box": "row, mid, between, fixed, w:200, h:26, pad2, solid, rounded",
  "children": [ { "box": "fixed, w:56, h:8, tint3, rounded" },
    { "box": "row, gap1", "children": [ { "$ref": "cluster/dot" }, { "$ref": "cluster/dot" } ] } ] }
```

```json
{ "id": "component/navigation-rail", "extends": "base/box", "box": "stack, fixed, w:36, h:120, pad1, gap1, solid, rounded",
  "children": [ { "box": "fixed, h:20, tint3, rounded" }, { "box": "fixed, h:20, tint1, rounded" },
    { "box": "fixed, h:20, tint1, rounded" }, { "box": "fixed, h:20, tint1, rounded" } ] }
```

```json
{ "id": "component/tab-set", "extends": "base/box", "box": "row, gap0, hug",
  "children": [ { "box": "row, mid, packed, fixed, w:40, h:20, solid, square, tint1", "content": "Ho" },
    { "box": "row, mid, packed, fixed, w:40, h:20, solid, square", "content": "Fi" },
    { "box": "row, mid, packed, fixed, w:40, h:20, solid, square", "content": "Do" } ] }
```

```json
{ "id": "component/breadcrumb-trail", "extends": "base/box", "box": "row, mid, gap1, hug",
  "children": [ { "box": "hug", "content": "Home" }, { "box": "hug", "content": "/" },
    { "box": "hug", "content": "Files" }, { "box": "hug", "content": "/" }, { "box": "hug", "content": "Doc" } ] }
```

```json
{ "id": "component/menu", "extends": "base/box", "box": "stack, fixed, w:90, pad1, gap1, solid, rounded",
  "children": [ { "box": "row, mid, fixed, h:16, pad1, tint1", "content": "Cut" },
    { "box": "row, mid, fixed, h:16, pad1", "content": "Copy" },
    { "box": "row, mid, fixed, h:16, pad1", "content": "Paste" } ] }
```

```json
{ "id": "component/pagination", "extends": "base/box", "box": "row, mid, gap1, hug",
  "children": [ { "box": "row, mid, packed, fixed, w:18, h:18, solid, rounded", "content": "‹" },
    { "box": "row, mid, packed, fixed, w:18, h:18, solid, rounded, tint1", "content": "1" },
    { "box": "row, mid, packed, fixed, w:18, h:18, solid, rounded", "content": "2" },
    { "box": "row, mid, packed, fixed, w:18, h:18, solid, rounded", "content": "›" } ] }
```

```json
{ "id": "component/scrollbar", "extends": "base/box", "box": "stack, fixed, w:8, h:100, tint1, pill, clip",
  "children": [ { "name": "thumb", "box": "fixed, w:8, h:34, tint3, pill" } ] }
```

```json
{ "id": "component/status-bar", "extends": "base/box", "box": "row, mid, between, fixed, w:200, h:16, pad1, tint1",
  "children": [ { "$ref": "cluster/line", "box": "w:48, h:5" }, { "$ref": "cluster/line", "box": "w:28, h:5" } ] }
```

- [ ] **Step 2: Run node conformance**: `just ci` → PASS (registry sweep covers new files).
- [ ] **Step 3: Run browser invariant**: `/wrapper?test=index.html` → console `All passed`; eyeball gallery vs `docs/vocabulary.reference.html` sheet 1 miniatures.
- [ ] **Step 4: Commit** — `git commit -m "feat(L7): sheet 1 — 13 structure parts"`

---

### Task 7: Sheet 2 — 14 action/data-entry parts (L5 + L7)

**Files:**
- Create: `parts/atom/button.json`, `parts/atom/icon-button.json`, `parts/atom/floating-action-button.json`, 11 files under `parts/component/`
- Test: existing sweeps

**Interfaces:**
- Produces: `atom/button` (consumed by segmented-control, toolbar, popover, anatomy).

- [ ] **Step 1: Write the 14 JSON files**

```json
{ "id": "atom/button", "extends": "base/box", "box": "row, mid, packed, pad2, solid, rounded", "content": "Go" }
```

```json
{ "id": "atom/icon-button", "extends": "base/box", "box": "row, mid, packed, fixed, w:22, h:22, solid, rounded", "content": "+" }
```

```json
{ "id": "atom/floating-action-button", "extends": "base/box", "box": "row, mid, packed, fixed, w:28, h:28, solid, circle, tint1", "content": "+" }
```

```json
{ "id": "component/segmented-control", "extends": "base/box", "box": "row, gap0, hug",
  "children": [ { "$ref": "atom/button", "box": "square", "content": "A" },
    { "$ref": "atom/button", "box": "square, tint1", "content": "B" },
    { "$ref": "atom/button", "box": "square", "content": "C" } ] }
```

```json
{ "id": "component/toolbar", "extends": "base/box", "box": "row, mid, gap1, pad1, hug, solid, rounded",
  "children": [ { "$ref": "atom/icon-button" }, { "$ref": "atom/icon-button", "content": "×" },
    { "box": "fixed, w:1, h:16, tint3" }, { "$ref": "atom/icon-button", "content": "▾" } ] }
```

```json
{ "id": "component/text-field", "extends": "base/box", "box": "stack, gap1, hug",
  "children": [ { "$ref": "cluster/line", "box": "w:40, h:6" },
    { "box": "row, mid, fixed, w:120, h:22, pad1, solid, rounded", "content": "|" },
    { "$ref": "cluster/line", "box": "w:70, h:5" } ] }
```

```json
{ "id": "component/select", "extends": "base/box", "box": "row, mid, between, fixed, w:120, h:22, pad1, solid, rounded",
  "children": [ { "$ref": "cluster/line", "box": "w:56" }, { "box": "hug", "content": "▾" } ] }
```

```json
{ "id": "component/checkbox", "extends": "base/box", "box": "row, mid, gap1, hug",
  "children": [ { "box": "row, mid, packed, fixed, w:12, h:12, solid, square", "content": "✓" },
    { "$ref": "cluster/line", "box": "w:48" } ] }
```

```json
{ "id": "component/radio-group", "extends": "base/box", "box": "stack, gap1, hug",
  "children": [
    { "box": "row, mid, gap1", "children": [
      { "box": "row, mid, packed, fixed, w:10, h:10, solid, circle", "children": [ { "$ref": "cluster/dot", "box": "w:4, h:4" } ] },
      { "$ref": "cluster/line", "box": "w:48" } ] },
    { "box": "row, mid, gap1", "children": [
      { "box": "fixed, w:10, h:10, solid, circle" }, { "$ref": "cluster/line", "box": "w:36" } ] } ] }
```

```json
{ "id": "component/toggle-switch", "extends": "base/box", "box": "row, mid, end, fixed, w:26, h:14, solid, pill, tint1, pad0",
  "children": [ { "box": "fixed, w:10, h:10, tint3, circle" } ] }
```

Note: `end` here is `align`; main-axis push to the right needs `distribute` — use `between` with a spacer? No: keep one child + `row, mid` + `distribute` not needed — set `"box": "row, mid, fixed, w:26, h:14, solid, pill, tint1, pad0, evenly"` OFF-state variant left as-is; ON = the file above with the knob as the *second* child after a `fill` spacer:

```json
{ "id": "component/toggle-switch", "extends": "base/box", "box": "row, mid, fixed, w:26, h:14, solid, pill, tint1, pad0",
  "children": [ { "box": "fill" }, { "box": "fixed, w:10, h:10, tint3, circle" } ] }
```

Use this second form (spacer idiom — document it in the file order).

```json
{ "id": "component/slider", "extends": "base/box", "box": "overlay, mid, fixed, w:120, h:14",
  "children": [ { "box": "fixed, w:120, h:4, tint2, pill" },
    { "box": "floating, center, middle, fixed, w:10, h:10, solid, circle, tint0" } ] }
```

```json
{ "id": "component/numeric-stepper", "extends": "base/box", "box": "row, mid, gap0, hug",
  "children": [ { "$ref": "atom/icon-button", "box": "square", "content": "−" },
    { "box": "row, mid, packed, fixed, w:26, h:22, hairline, square", "content": "3" },
    { "$ref": "atom/icon-button", "box": "square", "content": "+" } ] }
```

```json
{ "id": "component/search-field", "extends": "base/box", "box": "row, mid, gap1, fixed, w:120, h:22, pad1, solid, pill",
  "children": [ { "box": "hug", "content": "⌕" }, { "$ref": "cluster/line", "box": "w:64, h:5" } ] }
```

```json
{ "id": "component/date-picker", "extends": "base/box", "box": "stack, gap1, pad1, hug, solid, rounded",
  "children": [
    { "box": "row, mid, between, fixed, w:96", "children": [
      { "box": "hug", "content": "‹" }, { "box": "hug", "content": "May" }, { "box": "hug", "content": "›" } ] },
    { "box": "row, gap1", "children": [
      { "$ref": "cluster/dot", "box": "w:9, h:9, tint1, square" }, { "$ref": "cluster/dot", "box": "w:9, h:9, tint1, square" },
      { "$ref": "cluster/dot", "box": "w:9, h:9, tint1, square" }, { "$ref": "cluster/dot", "box": "w:9, h:9, tint3, square" },
      { "$ref": "cluster/dot", "box": "w:9, h:9, tint1, square" }, { "$ref": "cluster/dot", "box": "w:9, h:9, tint1, square" },
      { "$ref": "cluster/dot", "box": "w:9, h:9, tint1, square" } ] },
    { "box": "row, gap1", "children": [
      { "$ref": "cluster/dot", "box": "w:9, h:9, tint1, square" }, { "$ref": "cluster/dot", "box": "w:9, h:9, tint1, square" },
      { "$ref": "cluster/dot", "box": "w:9, h:9, tint1, square" }, { "$ref": "cluster/dot", "box": "w:9, h:9, tint1, square" },
      { "$ref": "cluster/dot", "box": "w:9, h:9, tint1, square" }, { "$ref": "cluster/dot", "box": "w:9, h:9, tint1, square" },
      { "$ref": "cluster/dot", "box": "w:9, h:9, tint1, square" } ] } ] }
```

- [ ] **Step 2: Run node conformance**: `just ci` → PASS.
- [ ] **Step 3: Browser**: `/wrapper?test=index.html` → console `All passed`; eyeball vs sheet 2.
- [ ] **Step 4: Commit** — `git commit -m "feat(L5,L7): sheet 2 — 14 action/data-entry parts"`

---

### Task 8: Sheet 3 — 23 content/feedback/notation parts (box-only pass)

**Files:**
- Create: `parts/atom/`: `image-placeholder avatar chip badge tooltip annotation-marker flow-connector` (7) · `parts/component/`: `chart diagram data-table list-view tree-view filmstrip modal-dialog drawer popover toast inline-banner progress-indicator skeleton empty-state dimension-line title-block` (16)
- Test: existing sweeps

**Interfaces:**
- Produces: parts consumed by anatomy (Task 12); `path`/`relation`/`motion` keys carried as pass-through until Tasks 9–10.

- [ ] **Step 1: Write the 23 JSON files**

```json
{ "id": "atom/image-placeholder", "extends": "base/box", "box": "fixed, w:80, h:56, dashed, tint0",
  "path": "straight, solid", "from": "corner:tl", "to": "corner:br" }
```

```json
{ "id": "atom/avatar", "extends": "base/box", "box": "row, mid, packed, fixed, w:20, h:20, solid, circle, tint2", "content": "M" }
```

```json
{ "id": "atom/chip", "extends": "base/box", "box": "row, mid, gap1, pad1, hug, solid, pill", "content": "On" }
```

```json
{ "id": "atom/badge", "extends": "base/box", "box": "row, mid, packed, fixed, w:14, h:14, tint3, circle", "content": "4" }
```

```json
{ "id": "atom/tooltip", "extends": "base/box", "box": "row, mid, pad1, hug, solid, rounded, tint1", "content": "Tip" }
```

```json
{ "id": "atom/annotation-marker", "extends": "base/box", "box": "row, mid, packed, fixed, w:16, h:16, solid, circle, tint0", "content": "3" }
```

```json
{ "id": "atom/flow-connector", "extends": "base/box", "box": "fixed, w:80, h:24",
  "path": "curve, solid, weight:1.5", "from": "free:0,20", "to": "free:80,6" }
```

```json
{ "id": "component/chart", "extends": "base/box", "box": "row, end, gap1, fixed, w:100, h:60, pad1, solid, rounded",
  "children": [ { "box": "fill, h:22, tint2" }, { "box": "fill, h:36, tint3" },
    { "box": "fill, h:14, tint2" }, { "box": "fill, h:46, tint1" } ] }
```

```json
{ "id": "component/diagram", "extends": "base/box", "box": "row, mid, between, fixed, w:130, h:50, pad1",
  "children": [ { "name": "n1", "box": "fixed, w:26, h:18, solid, rounded" },
    { "name": "n2", "box": "fixed, w:26, h:18, solid, rounded, tint1" },
    { "name": "n3", "box": "fixed, w:26, h:18, solid, rounded" } ],
  "path": "elbow, solid", "from": "n1.edge:right", "to": "n2.edge:left" }
```

```json
{ "id": "component/data-table", "extends": "base/box", "box": "stack, gap0, fixed, w:160, solid, rounded, clip",
  "children": [
    { "box": "row, gap0, fixed, h:16, tint1", "children": [
      { "box": "fill, pad1, hairline" }, { "box": "fill, pad1, hairline" }, { "box": "fill, pad1, hairline" } ] },
    { "box": "row, gap0, fixed, h:14", "children": [
      { "box": "fill, pad1, hairline" }, { "box": "fill, pad1, hairline" }, { "box": "fill, pad1, hairline" } ] },
    { "box": "row, gap0, fixed, h:14", "children": [
      { "box": "fill, pad1, hairline" }, { "box": "fill, pad1, hairline" }, { "box": "fill, pad1, hairline" } ] },
    { "box": "row, gap0, fixed, h:14", "children": [
      { "box": "fill, pad1, hairline" }, { "box": "fill, pad1, hairline" }, { "box": "fill, pad1, hairline" } ] } ] }
```

```json
{ "id": "component/list-view", "extends": "base/box", "box": "stack, gap1, fixed, w:120",
  "children": [
    { "box": "row, mid, gap1, fixed, h:18, pad1, solid, rounded", "children": [
      { "$ref": "cluster/dot" }, { "$ref": "cluster/line", "box": "w:72" } ] },
    { "box": "row, mid, gap1, fixed, h:18, pad1, solid, rounded", "children": [
      { "$ref": "cluster/dot" }, { "$ref": "cluster/line", "box": "w:56" } ] },
    { "box": "row, mid, gap1, fixed, h:18, pad1, solid, rounded", "children": [
      { "$ref": "cluster/dot" }, { "$ref": "cluster/line", "box": "w:64" } ] } ] }
```

```json
{ "id": "component/tree-view", "extends": "base/box", "box": "stack, gap1, hug",
  "children": [
    { "box": "row, mid, gap1", "children": [ { "box": "hug", "content": "▾" }, { "$ref": "cluster/line", "box": "w:56" } ] },
    { "box": "row, mid, gap1, pad3", "children": [ { "box": "hug", "content": "▾" }, { "$ref": "cluster/line", "box": "w:44" } ] },
    { "box": "row, mid, gap1, pad6", "children": [ { "box": "hug", "content": "›" }, { "$ref": "cluster/line", "box": "w:36" } ] } ] }
```

Note: `pad3`/`pad6` indent whole rows — acceptable wireframe shorthand (pads all sides of an unstroked row).

```json
{ "id": "component/filmstrip", "extends": "base/box", "box": "row, gap1, fixed, w:140, clip",
  "children": [ { "box": "fixed, w:32, h:24, tint1, rounded" }, { "box": "fixed, w:32, h:24, tint1, rounded" },
    { "box": "fixed, w:32, h:24, tint1, rounded" }, { "box": "fixed, w:32, h:24, tint1, rounded" } ] }
```

```json
{ "id": "component/modal-dialog", "extends": "base/box", "box": "overlay, fixed, w:160, h:104, clip, rounded",
  "children": [ { "box": "fill, tint3, opacity:0.55" },
    { "box": "floating, center, middle, stack, fixed, w:100, pad2, gap1, solid, rounded, tint0",
      "children": [ { "$ref": "cluster/line", "box": "w:64" }, { "$ref": "cluster/line", "box": "w:48" },
        { "box": "row, gap1, end", "children": [ { "$ref": "atom/button", "content": "OK" } ] } ] } ] }
```

```json
{ "id": "component/drawer", "extends": "base/box", "box": "overlay, fixed, w:160, h:104, solid, rounded, clip",
  "children": [ { "box": "fill, tint0" },
    { "box": "docked, right, fixed, w:56, tint1, hairline" } ] }
```

```json
{ "id": "component/popover", "extends": "base/box", "box": "stack, gap1, hug",
  "children": [ { "$ref": "atom/button", "name": "anchor", "content": "?" },
    { "name": "bubble", "box": "stack, pad1, gap1, solid, rounded, tint0, hug",
      "children": [ { "$ref": "cluster/line", "box": "w:56" }, { "$ref": "cluster/line", "box": "w:40" } ] } ] }
```

```json
{ "id": "component/toast", "extends": "base/box", "box": "row, mid, gap2, pad2, hug, solid, rounded, tint1",
  "children": [ { "$ref": "cluster/line", "box": "w:64" }, { "box": "hug", "content": "UNDO" } ] }
```

```json
{ "id": "component/inline-banner", "extends": "base/box", "box": "row, mid, gap1, fixed, w:160, pad1, solid, rounded, tint0",
  "children": [ { "box": "hug", "content": "!" }, { "$ref": "cluster/line", "box": "w:104" } ] }
```

```json
{ "id": "component/progress-indicator", "extends": "base/box", "box": "fixed, w:120, h:6, solid, pill, clip",
  "children": [ { "box": "fixed, w:70, h:6, tint3" } ] }
```

```json
{ "id": "component/skeleton", "extends": "base/box", "box": "stack, gap1, hug",
  "motion": "reveal",
  "children": [ { "$ref": "cluster/line", "box": "w:120" }, { "$ref": "cluster/line", "box": "w:90" },
    { "$ref": "cluster/line", "box": "w:60" } ] }
```

```json
{ "id": "component/empty-state", "extends": "base/box", "box": "stack, mid, gap1, fixed, w:120, h:80, pad2, dashed, rounded, evenly",
  "children": [ { "box": "fixed, w:24, h:24, dashed, circle" }, { "box": "hug", "content": "nothing yet" } ] }
```

```json
{ "id": "component/dimension-line", "extends": "base/box", "box": "row, mid, fixed, w:80, h:16",
  "path": "straight, solid, weight:1", "from": "edge:left", "to": "edge:right",
  "children": [ { "box": "fill" }, { "box": "hug, pad1", "content": "24" }, { "box": "fill" } ] }
```

```json
{ "id": "component/title-block", "extends": "base/box", "box": "stack, gap0, hug, pad1",
  "children": [ { "box": "hug", "content": "2.1 Checkout" }, { "box": "hug", "content": "desktop · v3" } ] }
```

- [ ] **Step 2: Run node conformance**: `just ci` → PASS (path keys pass reserved-key check; render passes them through).
- [ ] **Step 3: Browser**: `/wrapper?test=index.html` → `All passed`; eyeball vs sheet 3. Crossbox/connector strokes are absent until Task 9 — expected.
- [ ] **Step 4: Commit** — `git commit -m "feat(L5,L7): sheet 3 — 23 content parts (box-only pass)"`

---

### Task 9: L3 — path.js

**Files:**
- Create: `ui/path.js`
- Modify: `ui/render.js` (call `drawPaths` after mount), `index.html` (call `drawPaths(stage)` per gallery item)
- Test: `test/render_test.js` (append suite)

**Interfaces:**
- Consumes: rendered DOM with `data-extra` (Task 4), `data-name` lookups.
- Produces: `drawPaths(hostEl) → void` — for every descendant with `path` in `data-extra`, appends one absolutely-positioned `<svg class="px">` covering the host, draws the path. Anchor syntax in `from`/`to`: `free:X,Y` · `edge:left|right|top|bottom` (own box) · `corner:tl|tr|bl|br` · `NAME.edge:SIDE` · `NAME.center` · `NAME.corner:CC` (NAME = `data-name` within the same part root). Idempotent: removes previous `.px` before drawing.

- [ ] **Step 1: Append failing browser tests** to `test/render_test.js`

```js
suite('path — crossbox and connector');
import('../ui/path.js').then(async ({ drawPaths }) => {
  const reg = await (await fetch('/registry.json')).json();
  const { resolve } = await import('../ui/model.js');
  const { render } = await import('../ui/render.js');
  const ph = render(resolve(reg['atom/image-placeholder'], reg));
  host.appendChild(ph);
  drawPaths(ph);
  const svg = ph.querySelector('svg.px');
  assert('crossbox svg present', !!svg, true);
  const line = svg.querySelector('line, path');
  assert('crossbox stroke drawn', !!line, true);
  drawPaths(ph);
  assert('idempotent — one svg', ph.querySelectorAll('svg.px').length, 1);
  harnessFinish();
});
```

(Move the earlier `harnessFinish()` call to the end of this async block — one finish per page.)

- [ ] **Step 2: Run — verify fails**: `/wrapper?test=render.html` → FAIL (path.js missing).

- [ ] **Step 3: Write `ui/path.js`**

```js
// ui/path.js -- L3 stroke primitive. SVG overlay; anchors resolve against L2 boxes.
const NS = 'http://www.w3.org/2000/svg';

export function drawPaths(host) {
  host.querySelectorAll(':scope svg.px').forEach(s => s.remove());
  const nodes = [host, ...host.querySelectorAll('[data-extra]')]
    .filter(el => el.dataset.extra && JSON.parse(el.dataset.extra).path);
  for (const el of nodes) drawOne(el, host);
}

function drawOne(el, root) {
  const spec = JSON.parse(el.dataset.extra);
  const r = el.getBoundingClientRect();
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'px');
  svg.setAttribute('width', r.width); svg.setAttribute('height', r.height);
  svg.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:visible';
  const a = anchor(spec.from, el, root, r), b = anchor(spec.to, el, root, r);
  if (!a || !b) return;
  const d = spec.path ?? {};
  const seg = d.segment ?? 'straight';
  let dAttr;
  if (seg === 'elbow') {
    const mx = (a.x + b.x) / 2;
    dAttr = `M${a.x},${a.y} L${mx},${a.y} L${mx},${b.y} L${b.x},${b.y}`;
  } else if (seg === 'curve') {
    const dx = (b.x - a.x) / 2;
    dAttr = `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
  } else if (seg === 'arc') {
    const rr = Math.hypot(b.x - a.x, b.y - a.y);
    dAttr = `M${a.x},${a.y} A${rr},${rr} 0 0 1 ${b.x},${b.y}`;
  } else {
    dAttr = `M${a.x},${a.y} L${b.x},${b.y}`;
  }
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', dAttr);
  p.setAttribute('fill', d.closed === 'closed' ? 'var(--tint2)' : 'none');
  p.setAttribute('stroke', 'var(--ink)');
  p.setAttribute('stroke-width', d.weight ?? 1.5);
  if (d.dash === 'dashed') p.setAttribute('stroke-dasharray', '5 4');
  if (d.dash === 'dotted') p.setAttribute('stroke-dasharray', '1.5 3');
  if (d['trim-end'] != null || d['trim-start'] != null) {
    p.setAttribute('pathLength', 1);
    const s = d['trim-start'] ?? 0, e = d['trim-end'] ?? 1;
    p.setAttribute('stroke-dasharray', `${e - s} 1`);
    p.setAttribute('stroke-dashoffset', -s);
  }
  svg.appendChild(p);
  // arrow end (only end marker in the wireframe kit; dot/bar analogous, add on demand)
  if (spec.path?.end === undefined) { /* ends come via from/to spec keys later */ }
  el.appendChild(svg);
}

function anchor(ref, el, root, hostRect) {
  if (!ref) return null;
  let [scope, kind] = ref.includes('.') ? ref.split('.', 2) : [null, ref];
  let box = el;
  if (scope) {
    box = root.querySelector(`[data-name="${scope}"]`);
    if (!box) return null;
  }
  const b = box.getBoundingClientRect();
  const rel = { x: b.left - hostRect.left, y: b.top - hostRect.top, w: b.width, h: b.height };
  const [k, arg] = kind.split(':');
  if (k === 'free') { const [x, y] = arg.split(',').map(Number); return { x, y }; }
  if (k === 'center') return { x: rel.x + rel.w / 2, y: rel.y + rel.h / 2 };
  if (k === 'edge') return {
    left:   { x: rel.x, y: rel.y + rel.h / 2 },
    right:  { x: rel.x + rel.w, y: rel.y + rel.h / 2 },
    top:    { x: rel.x + rel.w / 2, y: rel.y },
    bottom: { x: rel.x + rel.w / 2, y: rel.y + rel.h },
  }[arg];
  if (k === 'corner') return {
    tl: { x: rel.x, y: rel.y }, tr: { x: rel.x + rel.w, y: rel.y },
    bl: { x: rel.x, y: rel.y + rel.h }, br: { x: rel.x + rel.w, y: rel.y + rel.h },
  }[arg];
  return null;
}
```

- [ ] **Step 4: Wire the gallery** — in `index.html` after `stage.appendChild(render(...))` add:

```js
import { drawPaths } from './ui/path.js';   // at top with other imports
drawPaths(stage);                            // after append, inside the loop
```

- [ ] **Step 5: Run — verify passes**: `/wrapper?test=render.html` all PASS; gallery shows crossbox on `atom/image-placeholder`, connector in `component/diagram`, `atom/flow-connector` curve, `component/dimension-line` rule.

- [ ] **Step 6: Capture unaffected**: `/wrapper?test=index.html` still `All passed` (svg has no `bx` class → capture ignores it).

- [ ] **Step 7: Commit** — `git commit -m "feat(L3): path.js — anchors, segments, trim, crossbox/connector wired"`

---

### Task 10: L3 — relation.js + motion.js

**Files:**
- Create: `ui/relation.js`, `ui/motion.js`
- Modify: `parts/component/scrollbar.json` (add relation), `index.html` (wire both)
- Test: `test/render_test.js` (append)

**Interfaces:**
- Consumes: rendered DOM, `data-extra`.
- Produces: `wireRelations(hostEl)` — relation spec `[{ "watch": "<name>|host", "measure": "scroll-fraction", "drive": "<name>", "map": "offset" }]`; scroll-fraction of watched element drives the driven element's `top` as a % of free track. `applyMotion(hostEl)` — `motion: "reveal"` fades children in stagger; `motion: "spin"` rotates; `drawOn(svgPath)` animates trim 0→1 (path only, per doc).

- [ ] **Step 1: Add relation to scrollbar** — `parts/component/scrollbar.json` becomes:

```json
{ "id": "component/scrollbar", "extends": "base/box", "box": "stack, fixed, w:8, h:100, tint1, pill, clip",
  "children": [ { "name": "thumb", "box": "fixed, w:8, h:34, tint3, pill" } ],
  "relation": [ { "watch": "host", "measure": "scroll-fraction", "drive": "thumb", "map": "offset" } ] }
```

- [ ] **Step 2: Append failing test** to `test/render_test.js`

```js
suite('relation — scrollbar thumb follows scroll');
{
  const { wireRelations } = await import('../ui/relation.js');
  const scroller = render(resolve({ box: 'stack, fixed, w:60, h:80, scroll', children:
    [{ box: 'fixed, h:400, tint0' }] }));
  const bar = render(resolve(reg['component/scrollbar'], reg));
  host.append(scroller, bar);
  wireRelations(bar, { host: scroller });
  scroller.scrollTop = 160;                       // 160 / (400-80) = 0.5
  await new Promise(r => setTimeout(r, 50));
  const thumb = bar.querySelector('[data-name="thumb"]');
  assert('thumb offset = 50% of free track (33px)', thumb.style.top, '33px');
}
suite('motion — reveal + draw-on');
{
  const { applyMotion, drawOn } = await import('../ui/motion.js');
  const sk = render(resolve(reg['component/skeleton'], reg));
  host.appendChild(sk);
  applyMotion(sk);
  assert('reveal class applied', sk.classList.contains('mx-reveal'), true);
}
```

- [ ] **Step 3: Run — verify fails**, then **Step 4: implement**

`ui/relation.js`:

```js
// ui/relation.js -- L3 observer layer. Reads rendered measures, writes via style only.
export function wireRelations(el, external = {}) {
  const extra = el.dataset.extra ? JSON.parse(el.dataset.extra) : {};
  for (const rel of extra.relation ?? []) {
    const src = rel.watch === 'host' ? (external.host ?? el)
      : el.querySelector(`[data-name="${rel.watch}"]`);
    const dst = el.querySelector(`[data-name="${rel.drive}"]`);
    if (!src || !dst) continue;
    if (rel.measure === 'scroll-fraction') {
      const update = () => {
        const f = src.scrollTop / Math.max(1, src.scrollHeight - src.clientHeight);
        const free = el.clientHeight - dst.offsetHeight;
        dst.style.position = 'relative';
        dst.style.top = `${Math.round(f * free)}px`;
      };
      src.addEventListener('scroll', update, { passive: true });
      update();
    }
  }
}
```

`ui/motion.js`:

```js
// ui/motion.js -- L3 motion presets: enter exit move reveal spin, draw-on (path only).
const CSS = `
@keyframes mx-in { from { opacity:0; transform:translateY(4px) } to { opacity:1; transform:none } }
@keyframes mx-spin { to { transform:rotate(360deg) } }
@keyframes mx-draw { to { stroke-dashoffset:0 } }
.mx-reveal > .bx { animation: mx-in .5s ease-out backwards }
.mx-reveal > .bx:nth-child(2) { animation-delay:.12s }
.mx-reveal > .bx:nth-child(3) { animation-delay:.24s }
.mx-enter { animation: mx-in .3s ease-out }
.mx-spin { animation: mx-spin 1s linear infinite }
`;
let injected = false;
function ensureCss() {
  if (injected) return;
  const s = document.createElement('style'); s.textContent = CSS;
  document.head.appendChild(s); injected = true;
}

export function applyMotion(el) {
  ensureCss();
  const extra = el.dataset.extra ? JSON.parse(el.dataset.extra) : {};
  if (extra.motion) el.classList.add(`mx-${extra.motion}`);
  el.querySelectorAll('[data-extra]').forEach(c => {
    const e = JSON.parse(c.dataset.extra);
    if (e.motion) { ensureCss(); c.classList.add(`mx-${e.motion}`); }
  });
}

export function drawOn(svgPath, ms = 600) {
  svgPath.setAttribute('pathLength', 1);
  svgPath.style.strokeDasharray = 1;
  svgPath.style.strokeDashoffset = 1;
  svgPath.style.animation = `mx-draw ${ms}ms ease-out forwards`;
}
```

- [ ] **Step 5: Wire gallery** — `index.html` loop: `wireRelations(stage.firstChild); applyMotion(stage.firstChild);` (imports at top).
- [ ] **Step 6: Run — verify passes**: `/wrapper?test=render.html` all PASS; `/wrapper?test=index.html` invariant still green (motion/relation live in `data-extra`, capture round-trips).
- [ ] **Step 7: Commit** — `git commit -m "feat(L3): relation observer + motion presets, scrollbar wired"`

---

### Task 11: L4 — handles.js

**Files:**
- Create: `ui/handles.js`, `handles.html` (demo page)
- Test: `test/handles_test.js`

**Interfaces:**
- Consumes: `render` (L2 — handles are boxes), pointer events.
- Produces: `attachHandles(el)` — adds squares (corners + edge mids) and move pills (t 0.25/0.75 on top edge) per doc t11; shedding by width (≥280 R·M·R·M·R · 140–280 R·M·R · <140 R·M); proximity engine (bands 84/34/13 px → opacity 0/.1/.5/1, targeted = `--accent`, speed EMA 0.72/0.28, slow gate `1-(speed-0.04)/0.34`, dwell ±0.14/−0.34 per 100 ms); keyboard: focus reveals set at 50%. `detachHandles(el)`. Exported for tests: `_engine` (singleton with `speed`, `settle`).

- [ ] **Step 1: Write demo page `handles.html`**

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>fayf_ui handles</title>
<link rel="stylesheet" href="ui/tokens.css">
<style>body{background:var(--canvas);padding:60px;display:flex;gap:40px}</style>
</head>
<body>
<script type="module">
import { resolve } from './ui/model.js';
import { render } from './ui/render.js';
import { attachHandles } from './ui/handles.js';
for (const w of [330, 200, 120]) {
  const el = render(resolve({ box: `stack, fixed, w:${w}, h:140, solid, pad3, gap2`,
    children: [ { box: 'fixed, h:7, tint2, rounded' }, { box: 'fixed, w:120, h:7, tint2, rounded' } ] }));
  document.body.appendChild(el);
  attachHandles(el);
}
document.body.dataset.ready = '1';
</script>
</body>
</html>
```

- [ ] **Step 2: Write failing test** `test/handles_test.js`

```js
import { attachHandles, _engine } from '../ui/handles.js';

const tr = new TestRunner({ stopOnError: false });
tr.addBlock('placement + shedding', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(() => {
     const [wide, mid, narrow] = document.querySelectorAll('.bx[data-handles]');
     r.check(wide.querySelectorAll('.hx-square').length === 8, '8 squares on wide');
     r.check(wide.querySelectorAll('.hx-pill').length === 2, '2 pills on wide (R·M·R·M·R)');
     r.check(mid.querySelectorAll('.hx-pill').length === 1, '1 pill at 140-280 (R·M·R)');
     r.check(narrow.querySelectorAll('.hx-pill').length === 0, '0 pills below 140 (R·M)');
     const sq = wide.querySelector('.hx-square');
     r.check(getComputedStyle(sq).opacity === '0', 'dormant = opacity 0');
   });
});
tr.addBlock('dwell gate arms only when slow', (r) => {
  r.run(() => {
    _engine.speed = 5; _engine.settle = 0;          // fast sweep
    r.check(_engine.gate() < 0.05, 'fast sweep lights nothing');
    _engine.speed = 0; _engine.settle = 1;          // dwelled
    r.check(_engine.gate() > 0.9, 'slow + settled arms');
  });
});
tr.addBlock('keyboard focus reveals at 50%', (r) => {
  r.run(() => {
    const wide = document.querySelector('.bx[data-handles]');
    wide.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    const sq = wide.querySelector('.hx-square');
    r.check(sq.style.opacity === '0.5', 'focus → 50%');
  });
});
await tr.runBlocks();
```

- [ ] **Step 3: Run — verify fails**: `/wrapper?test=handles.html` → FAIL.

- [ ] **Step 4: Write `ui/handles.js`** (port of the doc's `data-dc-script`, verbatim constants)

```js
// ui/handles.js -- L4. Handle = fixed box on an edge/corner; reveal = relation
// observing the pointer (doc t11). No new dial. Constants verbatim from the doc.
import { render } from './render.js';
import { parse } from './model.js';

const SQ = 'floating, fixed, w:8, h:8, solid, square, tint0';
const PILL_W = 42;

export const _engine = {
  speed: 0, settle: 0, pt: null, raf: null, hosts: new Set(),
  gate() {
    const slow = Math.max(0, Math.min(1, 1 - (this.speed - 0.04) / 0.34));
    return slow * this.settle;
  },
};

function apply() {
  _engine.raf = null;
  const p = _engine.pt; if (!p) return;
  const gate = _engine.gate();
  for (const host of _engine.hosts) {
    if (host.dataset.kbd === '1') continue;                 // keyboard reveal wins
    for (const h of host.querySelectorAll('.hx-square, .hx-pill')) {
      const r = h.getBoundingClientRect();
      const dx = Math.max(r.left - p.x, 0, p.x - r.right);
      const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
      const d = Math.hypot(dx, dy);
      const band = d > 84 ? 0 : d > 34 ? 0.1 : d > 13 ? 0.5 : 1;
      const v = band * gate;
      const ghost = h.classList.contains('hx-pill') ? 0.15 * gate : 0;
      h.style.opacity = Math.max(v, ghost).toFixed(3);
      h.style.borderColor = v > 0.8 ? 'var(--accent)' : 'var(--ink)';
      h.style.background = h.classList.contains('hx-pill')
        ? (v > 0.8 ? 'var(--accent)' : 'var(--ink)') : 'var(--tint0)';
    }
  }
}

function onMove(e) {
  const now = performance.now();
  if (_engine.pt) {
    const dt = Math.max(now - _engine.pt.t, 8);
    const s = Math.hypot(e.clientX - _engine.pt.x, e.clientY - _engine.pt.y) / dt;
    _engine.speed = _engine.speed * 0.72 + s * 0.28;
  }
  _engine.pt = { x: e.clientX, y: e.clientY, t: now };
  if (!_engine.raf) _engine.raf = requestAnimationFrame(apply);
}

let started = false;
function start() {
  if (started) return; started = true;
  window.addEventListener('mousemove', onMove);
  setInterval(() => {
    _engine.speed *= 0.7;
    const s = Math.max(0, Math.min(1, 1 - (_engine.speed - 0.04) / 0.34));
    _engine.settle = s > 0.5 ? Math.min(1, _engine.settle + 0.14)
                             : Math.max(0, _engine.settle - 0.34);
    if (_engine.pt && !_engine.raf) _engine.raf = requestAnimationFrame(apply);
  }, 100);
}

export function attachHandles(el) {
  start();
  el.dataset.handles = '1';
  el.tabIndex = 0;
  const w = el.getBoundingClientRect().width;
  const pills = w >= 280 ? [0.25, 0.75] : w >= 140 ? [0.5] : [];
  const squares = [
    ['left', 'top'], ['center', 'top'], ['right', 'top'],
    ['left', 'middle'], ['right', 'middle'],
    ['left', 'bottom'], ['center', 'bottom'], ['right', 'bottom'],
  ];
  const CURSOR = { 'left top': 'nwse-resize', 'center top': 'ns-resize', 'right top': 'nesw-resize',
    'left middle': 'ew-resize', 'right middle': 'ew-resize',
    'left bottom': 'nesw-resize', 'center bottom': 'ns-resize', 'right bottom': 'nwse-resize' };
  for (const [h, v] of squares) {
    const s = render({ box: parse(`${SQ}, ${h}, ${v}`) });
    s.classList.add('hx-square');
    s.style.cssText += `;opacity:0;margin:-4px;transition:opacity .34s ease-out;cursor:${CURSOR[`${h} ${v}`]}`;
    el.appendChild(s);
  }
  for (const t of pills) {
    const p = render({ box: parse('floating, top, fixed, w:42, h:6, pill') });
    p.classList.add('hx-pill');
    p.style.cssText += `;left:${t * 100}%;margin-left:${-PILL_W / 2}px;top:-9px;opacity:0;background:var(--ink);transition:opacity .34s ease-out;cursor:move`;
    el.appendChild(p);
  }
  el.addEventListener('focusin', () => {
    el.dataset.kbd = '1';
    el.querySelectorAll('.hx-square, .hx-pill').forEach(h => { h.style.opacity = '0.5'; });
  });
  el.addEventListener('focusout', () => { delete el.dataset.kbd; });
  _engine.hosts.add(el);
}

export function detachHandles(el) {
  _engine.hosts.delete(el);
  delete el.dataset.handles;
  el.querySelectorAll('.hx-square, .hx-pill').forEach(h => h.remove());
}
```

- [ ] **Step 5: Run — verify passes**: `/wrapper?test=handles.html` → console `All passed`. Manual: approach a top edge slowly → dwell ~0.7 s → squares/pills fade in, red at 13 px; fast sweep → nothing.
- [ ] **Step 6: Invariant guard**: `/wrapper?test=index.html` still green (handles never attach in the gallery).
- [ ] **Step 7: Commit** — `git commit -m "feat(L4): handles — proximity reveal, shedding, keyboard, doc constants"`

---

### Task 12: L8 — anatomy screen + wrap-up

**Files:**
- Create: `screens/anatomy.json`, `anatomy.html`, `test/anatomy_test.js`, `README.md`
- Test: browser

**Interfaces:**
- Consumes: sheet parts by id, `drawPaths`, `wireRelations`, `applyMotion`.

- [ ] **Step 1: Write `screens/anatomy.json`** (doc t1 — the parts in place)

```json
{ "id": "screens/anatomy", "box": "stack, fixed, w:640, h:420, solid, rounded, clip, tint0",
  "children": [
    { "$ref": "component/app-bar", "box": "w:640, h:32, square, bare" },
    { "name": "body", "box": "row, fill",
      "children": [
        { "$ref": "component/navigation-rail", "box": "h:340, square, bare" },
        { "name": "work", "box": "stack, fill, pad3, gap2, scroll",
          "children": [
            { "box": "row, mid, between",
              "children": [
                { "$ref": "component/segmented-control" },
                { "$ref": "component/search-field" },
                { "$ref": "atom/button", "content": "New" } ] },
            { "$ref": "component/inline-banner", "box": "w:520" },
            { "box": "row, gap2",
              "children": [
                { "$ref": "atom/image-placeholder", "box": "w:180, h:110" },
                { "$ref": "component/chart", "box": "fill, h:110" } ] },
            { "$ref": "component/data-table", "box": "w:520" },
            { "$ref": "component/pagination" } ] },
        { "$ref": "component/scrollbar", "box": "h:340" } ] },
    { "$ref": "component/status-bar", "box": "w:640, square" },
    { "$ref": "component/toast", "box": "floating, center, bottom" },
    { "$ref": "atom/badge", "box": "floating, right, top" } ] }
```

- [ ] **Step 2: Write `anatomy.html`**

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>fayf_ui — anatomy</title>
<link href="https://fonts.googleapis.com/css2?family=Architects+Daughter&display=swap" rel="stylesheet">
<link rel="stylesheet" href="ui/tokens.css">
<style>body{background:var(--canvas);padding:40px;display:flex;justify-content:center}</style>
</head>
<body>
<script type="module">
import { resolve } from './ui/model.js';
import { render } from './ui/render.js';
import { drawPaths } from './ui/path.js';
import { wireRelations } from './ui/relation.js';
import { applyMotion } from './ui/motion.js';
const reg = await (await fetch('/registry.json')).json();
const el = render(resolve(reg['screens/anatomy'], reg));
document.body.appendChild(el);
drawPaths(el);
el.querySelectorAll('[data-extra]').forEach(n => wireRelations(n, { host: el.querySelector('[data-name="work"]') }));
applyMotion(el);
document.body.dataset.ready = '1';
</script>
</body>
</html>
```

- [ ] **Step 3: Write test** `test/anatomy_test.js`

```js
import { resolve, diff } from '../ui/model.js';
import { capture } from '../ui/render.js';

const tr = new TestRunner({ stopOnError: false });
tr.addBlock('anatomy renders 14 named parts', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(async () => {
     const root = document.querySelector('body > .bx');
     r.check(!!root, 'screen mounted');
     r.check(root.querySelectorAll('.bx').length > 40, 'composition is deep');
     const reg = await (await fetch('/registry.json')).json();
     const n = resolve(reg['screens/anatomy'], reg);
     const d = diff(capture(root), n);
     r.check(d.length === 0, 'screen invariant', `screen invariant: ${d.slice(0, 3).join('; ')}`);
   });
});
await tr.runBlocks();
```

- [ ] **Step 4: Run**: `/wrapper?test=anatomy.html` → `All passed`; eyeball vs doc t1 (app bar top, rail left, banner, crossbox+chart row, table, pagination, status bar, toast overlay).

- [ ] **Step 5: Write `README.md`**

```markdown
# fayf_ui

Wireframe UI library. Box + path, token config, JSON parts.
Governed by [CONSTITUTION.md](CONSTITUTION.md). Spec: [docs/superpowers/specs/2026-08-27-wireframe-ui-design.md](docs/superpowers/specs/2026-08-27-wireframe-ui-design.md).

    just serve     # http://127.0.0.1:8017/index.html  (gallery)
    just ci        # node tests: model + parts conformance
    just test PAGE # browser test URL (index / render / handles / anatomy)

Pages: `index.html` gallery · `anatomy.html` screen · `handles.html` proximity demo.
```

- [ ] **Step 6: Full sweep**: `just ci` → PASS; all four `/wrapper?test=` pages green.
- [ ] **Step 7: Commit** — `git commit -m "feat(L8): anatomy screen, README — spec complete"`

---

## Self-Review (done at write time)

- **Spec coverage:** model+verbs (T2–4) · registry/inheritance (T3, T5) · 50 parts = 13+14+23 (T6–8) · path (T9) · relation/motion (T10) · handles (T11) · anatomy (T12) · server/justfile/harness (T1) · invariant (T4, T5, T12) · computed-style checks (T4). Deferred per spec: scrim dial (modal uses overlay child — spec's "deferred" note satisfied), path `ends` markers beyond arrow (add on demand), drag behaviour on handles (doc specifies reveal, not drag).
- **Placeholder scan:** none — all code and JSON inline.
- **Type consistency:** `parse/print/resolve/diff` (model), `render/capture` (render), `drawPaths` (path), `wireRelations` (relation), `applyMotion/drawOn` (motion), `attachHandles/detachHandles/_engine` (handles) — names match across tasks.
- **Known judgment call:** `globSync` from `node:fs` requires node ≥ 22 (present: v25). If unavailable, replace with a 5-line recursive `readdirSync` walk.
