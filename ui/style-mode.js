// ui/style-mode.js -- skin switch. State lives in the URL
// (?style=wireframe|mockup|luna), never in memory-only JS state, so a link
// is always reproducible/shareable/debuggable.
// wireframe = structure only (default) · mockup = Claude Design brand ·
// luna = THW-Lernkarten product look (docs/superpowers/specs/2026-09-09-luna-skin-design.md).
const PARAM = 'style';
const MODES = ['wireframe', 'mockup', 'luna'];
const DEFAULT = MODES[0];

function readMode() {
  const q = new URLSearchParams(location.search).get(PARAM);
  return MODES.includes(q) ? q : DEFAULT;
}

function applyMode(mode) {
  document.documentElement.dataset.style = mode;
}

function currentMode() {
  const m = document.documentElement.dataset.style;
  return MODES.includes(m) ? m : DEFAULT;
}

// Next skin in the cycle -- the toggle's label always names where a click
// goes, not where you are (same as the old binary label did).
function nextMode(mode) {
  return MODES[(MODES.indexOf(mode) + 1) % MODES.length];
}

export function initStyleMode() {
  const mode = readMode();
  applyMode(mode);
  return mode;
}

export function setStyleMode(mode) {
  if (!MODES.includes(mode)) throw new Error(`unknown style mode '${mode}'`);
  applyMode(mode);
  const url = new URL(location.href);
  url.searchParams.set(PARAM, mode);
  history.replaceState(null, '', url);
}

export function mountStyleToggle(target = document.body, { inline = false } = {}) {
  const btn = target.ownerDocument.createElement('button');
  btn.className = inline ? 'style-toggle style-toggle-inline' : 'style-toggle';
  const sync = () => { btn.textContent = nextMode(currentMode()); };
  sync();
  btn.addEventListener('click', () => {
    setStyleMode(nextMode(currentMode()));
    sync();
  });
  target.appendChild(btn);
  return btn;
}
