// ui/thw.js -- THW-Lernkarten ladder controller. Page-mount layer, same
// bucket as ui/quiz.js -- not part of the box/vocabulary model. Own
// controller by decision (luna spec, decision 4): the ladder's shape
// (self-check -> two multiple-choice rungs -> solution, points per rung,
// failed cards re-queued) is not a quiz mode, it's a different game.
//
// Source: D:\_project\202601_THW\thw_lernkarten.html (LEVELS, buildOptions,
// handleMcPick, advanceHint, resolveCard, renderResult). Ported: the ladder
// itself + session stats. NOT ported (spec, out of scope): XP/ranks/combo,
// localStorage progress, category chips, review sampling, FAQ.
import { createMachine } from './state-machine.js';
import { resolve } from './model.js';
import { render } from './render.js';
import { markActionable, setActionableDisabled, setActionableReadonly, setActionableLoading, setActionableError } from './actions.js';

export const LEVELS = [
  { key: 'a', label: 'Stufe A', points: 25 },
  { key: 'b', label: 'Stufe B', points: 15 },
  { key: 'c', label: 'Stufe C', points: 10 },
  { key: 'x', label: 'Lösung',  points: 5 },
];
const SOLUTION = LEVELS.length - 1;
// Same beat as the source: a wrong pick shows red/amber for a moment, then
// the ladder advances on its own -- no click needed.
export const WRONG_MS = 650;

// Fisher-Yates on a copy. `rnd` injectable so node tests are deterministic.
export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pure. Level 1 (Stufe B): 3 real peer titles from the same category --
// plausible, hard. Level 2 (Stufe C): 3 invented "fantasy" names from the
// content file -- easy to rule out. The correct title is always among the 4.
export function buildOptions(card, level, data, rnd = Math.random) {
  const pool = level === 2
    ? shuffle(data.fantasy[card.cat] ?? [], rnd).slice(0, 3)
    : shuffle(data.cards.filter(o => o.cat === card.cat && o.id !== card.id), rnd).slice(0, 3).map(o => o.title);
  return shuffle([...pool, card.title], rnd);
}

function part(ctx, node) { return render(resolve(node, ctx.reg)); }

function levelChip(level) {
  const lvl = LEVELS[level];
  const variant = level === 0 ? 'atom/chip.active' : level === SOLUTION ? 'atom/chip' : 'atom/chip.warn';
  return { name: 'level-pill', extends: variant, content: `${lvl.label} · ${lvl.points} Pkt` };
}

function optionNode(i, text) {
  return {
    name: `option-${i}`,
    extends: 'component/answer',
    children: [
      { name: `letter-${i}`, box: 'fixed, w:18, h:18, solid, mid, evenly, circle', content: String.fromCharCode(65 + i) },
      { box: 'hug', content: text },
    ],
  };
}

// Everything above the body: category, level pill, progress, prompt. Slots
// (`level`, `prompt`) are re-rendered from parts each time -- a code card
// gets the plate (atom/text.plate), a question card the title face.
function showCard(ctx) {
  const c = ctx.deck[ctx.pos];
  ctx.catLabelEl.textContent = ctx.data.categories?.[c.cat] ?? c.cat;
  ctx.levelEl.replaceChildren(part(ctx, levelChip(ctx.level)));
  ctx.promptEl.replaceChildren();
  if (c.type === 'code') {
    ctx.promptEl.append(
      part(ctx, { extends: 'atom/text.plate', content: c.front }),
      part(ctx, { extends: 'atom/text', content: 'Wofür steht dieses Kürzel?' }));
  } else {
    ctx.promptEl.append(part(ctx, { extends: 'atom/text.title', content: c.front }));
  }
  ctx.progressFillEl.style.width = `${Math.round(ctx.pos / ctx.deck.length * 100)}%`;
  ctx.progressLabelEl.textContent = `Karte ${ctx.pos + 1} / ${ctx.deck.length}`;
}

function updateStats(ctx) {
  ctx.statKnownEl.textContent = `${ctx.known} gewusst`;
  ctx.statAgainEl.textContent = `${ctx.again} nochmal`;
  ctx.statPointsEl.textContent = `${ctx.points} Punkte`;
}

// --- ask: Stufe A, self-check -----------------------------------------
function enterAsk(ctx, send) {
  ctx.level = 0;
  showCard(ctx);
  const row = part(ctx, { box: 'row, gap:2, clamp', children: [
    { name: 'btn-hint', extends: 'atom/button.hint', box: 'fill', content: 'Hinweis anzeigen → Stufe B' },
    { name: 'btn-know', extends: 'atom/button.know', box: 'fill', content: `Weiß ich · ${LEVELS[0].points} Pkt` },
  ] });
  ctx.bodyEl.replaceChildren(row);
  ctx.hintBtn = row.querySelector('[data-name="btn-hint"]');
  ctx.knowBtn = row.querySelector('[data-name="btn-know"]');
  [ctx.hintBtn, ctx.knowBtn].forEach(markActionable);
  ctx.onHint = () => { ctx.level = 1; send('hint'); };
  ctx.onKnow = () => send('know');
  ctx.hintBtn.addEventListener('click', ctx.onHint);
  ctx.knowBtn.addEventListener('click', ctx.onKnow);
}

function exitAsk(ctx) {
  ctx.hintBtn.removeEventListener('click', ctx.onHint);
  ctx.knowBtn.removeEventListener('click', ctx.onKnow);
}

// --- mc: Stufe B / C, multiple choice ---------------------------------
function enterMc(ctx, send) {
  const c = ctx.deck[ctx.pos];
  showCard(ctx);
  const options = buildOptions(c, ctx.level, ctx.data);
  ctx.rows = options.map((text, i) => part(ctx, optionNode(i, text)));
  ctx.rows.forEach(markActionable);
  const nextLabel = ctx.level === 1 ? 'Stufe C' : 'Lösung anzeigen';
  ctx.skipBtn = part(ctx, { name: 'btn-skip', extends: 'atom/button.hint', box: 'clamp', content: `Mehr Hinweis · ${nextLabel}` });
  markActionable(ctx.skipBtn);
  ctx.bodyEl.replaceChildren(...ctx.rows, ctx.skipBtn);

  // Climb one rung; past the last rung the card resolves as "Lösung".
  const advance = () => { ctx.level += 1; send(ctx.level >= SOLUTION ? 'solution' : 'hint'); };
  ctx.rowListeners = ctx.rows.map((row, i) => {
    const onPick = () => {
      // Real state-rules wiring: once picked, every option is read-only
      // (the call is made) and the skip button is disabled -- exactly what
      // the source did with `disabled`, made visible/inert the same way
      // quiz.js does on reveal.
      ctx.rows.forEach(r => setActionableReadonly(r, true));
      setActionableDisabled(ctx.skipBtn, true);
      if (options[i] === c.title) {
        row.classList.add('bx-correct');
        send('correct');
      } else {
        row.classList.add('bx-wrong');
        ctx.timer = setTimeout(advance, WRONG_MS);
      }
    };
    row.addEventListener('click', onPick);
    return [row, onPick];
  });
  ctx.onSkip = advance;
  ctx.skipBtn.addEventListener('click', ctx.onSkip);
}

function exitMc(ctx) {
  clearTimeout(ctx.timer);
  ctx.rowListeners.forEach(([row, fn]) => row.removeEventListener('click', fn));
  ctx.skipBtn.removeEventListener('click', ctx.onSkip);
}

// --- result: solution shown, points booked ----------------------------
function enterResult(ctx, send) {
  const c = ctx.deck[ctx.pos];
  const success = ctx.level < SOLUTION;
  const lvl = LEVELS[ctx.level];
  ctx.points += lvl.points;
  if (success) ctx.known += 1;
  else { ctx.again += 1; ctx.deck.push(c); } // failed card comes back this round
  updateStats(ctx);
  showCard(ctx); // level pill now names the rung it was resolved on
  ctx.nextBtn = part(ctx, { name: 'btn-next', extends: 'atom/button.primary', box: 'clamp', content: 'Weiter →' });
  markActionable(ctx.nextBtn);
  ctx.bodyEl.replaceChildren(
    part(ctx, { name: 'answer-title', extends: 'atom/text.title', content: c.title }),
    part(ctx, { name: 'answer-detail', extends: 'atom/text', content: c.detail }),
    part(ctx, { name: 'points-line', extends: success ? 'atom/chip.ok' : 'atom/chip.warn',
      content: `+${lvl.points} Punkte · ${lvl.label}` }),
    ctx.nextBtn);
  ctx.onNext = () => {
    ctx.pos += 1;
    send(ctx.pos >= ctx.deck.length ? 'finish' : 'next');
  };
  ctx.nextBtn.addEventListener('click', ctx.onNext);
}

function exitResult(ctx) {
  ctx.nextBtn.removeEventListener('click', ctx.onNext);
}

// --- finished ----------------------------------------------------------
function enterFinished(ctx) {
  ctx.progressFillEl.style.width = '100%';
  ctx.progressLabelEl.textContent = 'Runde abgeschlossen';
  ctx.levelEl.replaceChildren();
  ctx.promptEl.replaceChildren(part(ctx, { extends: 'atom/text.title', content: 'Runde geschafft.' }));
  ctx.bodyEl.replaceChildren(part(ctx, { name: 'done-text', extends: 'atom/text',
    content: `Diese Runde: ${ctx.known} gewusst, ${ctx.again} nochmal üben, ${ctx.points} Punkte gesamt.` }));
}

const states = {
  ask:      { enter: enterAsk,    exit: exitAsk,    on: { hint: 'mc', know: 'result' } },
  mc:       { enter: enterMc,     exit: exitMc,     on: { hint: 'mc', correct: 'result', solution: 'result' } },
  result:   { enter: enterResult, exit: exitResult, on: { next: 'ask', finish: 'finished' } },
  finished: { enter: enterFinished },
};

export function mountThw(root, data, reg = {}) {
  // Same lone-fixed-child centering override as ui/quiz.js's quiz-body --
  // fill's align-self:stretch on the parent pins it to the cross-axis start.
  const cardBody = root.querySelector('[data-name="card-body"]');
  if (cardBody) cardBody.style.alignSelf = 'center';
  const ctx = {
    data, reg, root,
    deck: data.cards.slice(), pos: 0, level: 0,
    known: 0, again: 0, points: 0,
    catLabelEl: root.querySelector('[data-name="cat-label"]'),
    levelEl: root.querySelector('[data-name="level"]'),
    progressFillEl: root.querySelector('[data-name="progress-fill"]'),
    progressLabelEl: root.querySelector('[data-name="progress-label"]'),
    promptEl: root.querySelector('[data-name="prompt"]'),
    bodyEl: root.querySelector('[data-name="body"]'),
    statKnownEl: root.querySelector('[data-name="stat-known"]'),
    statAgainEl: root.querySelector('[data-name="stat-again"]'),
    statPointsEl: root.querySelector('[data-name="stat-points"]'),
  };
  updateStats(ctx);
  const machine = createMachine({ states, initial: 'ask', context: ctx });
  ctx.send = machine.send;
  return machine;
}

// Fetch + mount with the same loading/error wiring as ui/quiz.js's
// mountQuizFromUrl: `body` sits empty during the fetch (loading), a failed
// fetch leaves an actionable Retry (error) instead of a dead screen.
export async function mountThwFromUrl(root, url, reg = {}) {
  const bodyEl = root.querySelector('[data-name="body"]');
  setActionableLoading(bodyEl, true);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setActionableLoading(bodyEl, false);
    return mountThw(root, data, reg);
  } catch (err) {
    setActionableLoading(bodyEl, false);
    const retryBtn = render(resolve({ box: 'row, mid, packed, pad:2, solid, rounded', content: 'Retry' }));
    markActionable(retryBtn);
    setActionableError(retryBtn, true);
    retryBtn.addEventListener('click', () => mountThwFromUrl(root, url, reg), { once: true });
    bodyEl.replaceChildren(retryBtn);
    return null;
  }
}
