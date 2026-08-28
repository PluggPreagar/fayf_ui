// ui/style-mode.js -- wireframe/mockup skin switch. State lives in the URL
// (?style=wireframe|mockup), never in memory-only JS state, so a link is
// always reproducible/shareable/debuggable.
const PARAM = 'style';
const MODES = ['wireframe', 'mockup'];
const DEFAULT = MODES[0];

function readMode() {
  const q = new URLSearchParams(location.search).get(PARAM);
  return MODES.includes(q) ? q : DEFAULT;
}

function applyMode(mode) {
  document.documentElement.dataset.style = mode;
}

export function initStyleMode() {
  const mode = readMode();
  applyMode(mode);
  return mode;
}

export function setStyleMode(mode) {
  applyMode(mode);
  const url = new URL(location.href);
  url.searchParams.set(PARAM, mode);
  history.replaceState(null, '', url);
}

export function mountStyleToggle(doc = document) {
  const btn = doc.createElement('button');
  btn.className = 'style-toggle';
  const sync = () => {
    btn.textContent = document.documentElement.dataset.style === 'mockup' ? 'wireframe' : 'mockup';
  };
  sync();
  btn.addEventListener('click', () => {
    setStyleMode(document.documentElement.dataset.style === 'mockup' ? 'wireframe' : 'mockup');
    sync();
  });
  doc.body.appendChild(btn);
  return btn;
}
