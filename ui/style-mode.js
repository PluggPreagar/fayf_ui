// ui/style-mode.js -- skin switch. State lives in the URL
// (?style=wireframe|mockup|luna|luna-flat), never in memory-only JS state,
// so a link is always reproducible/shareable/debuggable.
// wireframe = structure only (default) · mockup = Claude Design brand ·
// luna = THW-Lernkarten product look (docs/superpowers/specs/2026-09-09-luna-skin-design.md) ·
// luna-flat = luna, borders/shadows flattened -- regions read via tint +
// spacing/position only (same token palette, ui/tokens.css's own luna-flat block).
const PARAM = 'style';
const MODES = ['wireframe', 'mockup', 'luna', 'luna-flat'];
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

// Carries the current skin forward across a real page navigation (each
// frontend/fayf/*.html page is a separate document load, no SPA router --
// without this, following any nav-rail link or row click silently resets
// the skin to wireframe on the next page unless that page's OWN url
// happens to already carry ?style=). An explicit style already present in
// `href` wins and is never overridden; the default mode is left off the
// URL, same as readMode()'s own treatment of an absent param.
export function styleHref(href) {
  const url = new URL(href, location.href);
  if (!url.searchParams.has(PARAM)) {
    const mode = currentMode();
    if (mode !== DEFAULT) url.searchParams.set(PARAM, mode);
  }
  return url.pathname.split('/').pop() + url.search + url.hash;
}

// grouped: a plain static flex child (no fixed/absolute positioning) sized
// to sit inside a `cluster/button-group` (e.g. status-right's status-buttons),
// rather than floating over a page corner (default) or the status bar's own
// area (inline). Mutually exclusive with `inline` -- pick one destination.
export function mountStyleToggle(target = document.body, { inline = false, grouped = false } = {}) {
  const btn = target.ownerDocument.createElement('button');
  btn.className = grouped ? 'style-toggle style-toggle-grouped' : inline ? 'style-toggle style-toggle-inline' : 'style-toggle';
  const sync = () => { btn.textContent = nextMode(currentMode()); };
  sync();
  btn.addEventListener('click', () => {
    setStyleMode(nextMode(currentMode()));
    sync();
  });
  target.appendChild(btn);
  return btn;
}
