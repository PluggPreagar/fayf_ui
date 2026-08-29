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
// ui/render.js:10), so a path here lines up with resolve()'s own provenance
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
    if (e.target.closest('.hx-square, .hx-pill')) return;
    const el = e.target.closest('.bx');
    if (!el || !rootEl.contains(el)) return;
    select(el);
  });

  return { select };
}
