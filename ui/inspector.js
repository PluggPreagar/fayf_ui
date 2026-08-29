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
import { parse } from './model.js';
import { render, capture } from './render.js';
import vocabulary from './vocabulary.json' with { type: 'json' };

const ENUM_DIALS = Object.keys(vocabulary.box);
const NUMERIC_DIALS = vocabulary.box_numeric;
const PLACE_DIALS = ['place-h', 'place-v'];
const PLACE_REQUIRES = ['docked', 'floating', 'anchored', 'sticky'];

const style = document.createElement('style');
style.textContent = `
.ins-panel{position:fixed;top:0;right:0;bottom:0;z-index:9998;width:220px;overflow-y:auto;
  background:var(--paper);border-left:1px solid var(--rule);font:11px var(--mono);color:var(--text);padding:10px;
  pointer-events:none}
.ins-empty{color:var(--muted)}
.ins-source{color:var(--muted);margin-bottom:8px;word-break:break-word;pointer-events:auto}
.ins-field{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:4px;pointer-events:auto}
.ins-field select,.ins-field input{font:11px var(--mono);width:100px}
.ins-actions{display:flex;gap:6px;margin-top:8px;pointer-events:auto}
.ins-actions button{font:11px var(--mono);padding:3px 8px;border:1px solid var(--rule);border-radius:4px;
  background:var(--paper);color:var(--muted);cursor:pointer}
.ins-actions button:hover{color:var(--text);border-color:var(--dash)}
`;
document.head.appendChild(style);

// Child-index path from `root` to `el`, counting only real `.bx` nodes --
// matches how render()/capture() address children (spacers excluded, see
// ui/render.js:10), so a path here lines up with resolve()'s own provenance
// path (ui/model.js).
export function nodePath(el, root) {
  if (el === root) return [];
  const parent = el.parentElement;
  const siblings = [...parent.children].filter(c => c.classList?.contains('bx'));
  return [...nodePath(parent, root), siblings.indexOf(el)];
}

// Path strings are NOT a safe key for looking up provenance at lookup time:
// a path can be occupied by a static node at mount time and by a completely
// different runtime-inserted node later (e.g. math-trainer.html's
// work.replaceChildren() swaps a dashboard subtree for quiz content, reusing
// the same paths). A stale path-string Map can't distinguish "no entry" from
// "entry from before a swap", so it would misattribute the wrong file/path
// with full confidence.
//
// Instead, walk the initially-rendered tree exactly once, at mount time, and
// tag each element into a WeakMap keyed by element IDENTITY -- built here by
// reusing nodePath's own indexing (same '.bx'-only, depth-first scheme) so
// the walk lines up with resolve()'s provenance path exactly. Anything
// inserted later by other code (or the DOM being restructured outside the
// inspector's control) was never visited by this walk, so it simply has no
// entry -- by construction, never a stale or wrong one -- and correctly
// falls through to the honest "runtime-inserted, no static source" fallback.
export function tagProvenance(container, provenance, map = new WeakMap()) {
  if (provenance) {
    const nodes = [container, ...container.querySelectorAll('.bx')];
    for (const el of nodes) {
      const entry = provenance.get(nodePath(el, container).join('.'));
      if (entry) map.set(el, entry);
    }
  }
  return map;
}

export function describeProvenance(entry, sourceId = '(unknown source)') {
  if (!entry) return 'runtime-inserted, no static source';
  const loc = `${sourceId}, path ${entry.path.join('.') || '(root)'}`;
  return entry.extends ? `${loc}, extends ${entry.extends}` : loc;
}

export function exportPayload(el, sourceId, elementProvenance) {
  return { source: describeProvenance(elementProvenance?.get(el), sourceId), node: capture(el) };
}

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
  const fieldsEl = panel.querySelector('.ins-fields');

  let rootEl = container;
  let selected = null;
  // Tagged once, against the tree exactly as it stood at mount time -- see
  // tagProvenance's own comment for why identity (not path) is the key.
  const elementProvenance = tagProvenance(container, provenance);
  const controls = buildFields(fieldsEl, onChange);
  const copyBtn = panel.querySelector('.ins-copy');
  const downloadBtn = panel.querySelector('.ins-download');

  function select(el) {
    if (selected) { detachHandles(selected); selected.classList.remove('ins-selected'); }
    selected = el;
    selected.classList.add('ins-selected');
    attachHandles(selected);
    emptyEl.hidden = true;
    formEl.hidden = false;
    populateFields(controls, parse(selected.dataset.box || ''));
    sourceEl.textContent = describeProvenance(elementProvenance.get(selected), sourceId);
  }

  function onChange() {
    if (!selected?.isConnected) return;
    syncPlaceGuard(controls);
    detachHandles(selected);
    const captured = capture(selected);
    captured.box = readFields(controls);
    const fresh = render(captured);
    // Edit rule (spec): the edited node is still sourced from the same
    // path/file, just now with a local override -- so its provenance entry
    // carries over to the freshly rendered replacement by identity. A
    // genuine runtime swap done by other code (never routed through here)
    // has no entry to carry, so it still falls through to the fallback.
    const entry = elementProvenance.get(selected);
    if (entry) elementProvenance.set(fresh, entry);
    const wasRoot = selected === rootEl;
    selected.replaceWith(fresh);
    if (wasRoot) rootEl = fresh;
    select(fresh);
  }

  const clickTarget = rootEl.parentElement ?? rootEl;
  function handleClick(e) {
    if (e.target.closest('.hx-square, .hx-pill')) return;
    const el = e.target.closest('.bx');
    if (!el || !rootEl.contains(el)) return;
    select(el);
  }
  clickTarget.addEventListener('click', handleClick);

  copyBtn.addEventListener('click', () => {
    if (!selected?.isConnected) return;
    detachHandles(selected);
    navigator.clipboard?.writeText(JSON.stringify(exportPayload(selected, sourceId, elementProvenance), null, 2));
    attachHandles(selected);
  });
  downloadBtn.addEventListener('click', () => {
    if (!selected?.isConnected) return;
    detachHandles(selected);
    const json = JSON.stringify(exportPayload(selected, sourceId, elementProvenance), null, 2);
    attachHandles(selected);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${selected.dataset.name || 'node'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  function destroy() {
    if (selected) { detachHandles(selected); selected.classList.remove('ins-selected'); }
    clickTarget.removeEventListener('click', handleClick);
    panel.remove();
  }

  return { select, destroy };
}
