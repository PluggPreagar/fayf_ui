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

const PRESETS = ['enter', 'exit', 'move', 'reveal', 'spin'];
function checkMotion(m) {
  if (!PRESETS.includes(m)) throw new Error(`unknown motion '${m}'`);
}

export function applyMotion(el) {
  ensureCss();
  const extra = el.dataset.extra ? JSON.parse(el.dataset.extra) : {};
  if (extra.motion) { checkMotion(extra.motion); el.classList.add(`mx-${extra.motion}`); }
  el.querySelectorAll('[data-extra]').forEach(c => {
    const e = JSON.parse(c.dataset.extra);
    if (e.motion) { checkMotion(e.motion); ensureCss(); c.classList.add(`mx-${e.motion}`); }
  });
}

export function drawOn(svgPath, ms = 600) {
  svgPath.setAttribute('pathLength', 1);
  svgPath.style.strokeDasharray = 1;
  svgPath.style.strokeDashoffset = 1;
  svgPath.style.animation = `mx-draw ${ms}ms ease-out forwards`;
}
