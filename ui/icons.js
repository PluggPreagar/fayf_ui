// ui/icons.js -- page-level icon overlay. NOT part of the box/vocabulary model
// (C2: unknown dial errors; no icon dial exists). Parts/screens stay pure
// vocabulary -- every nav row is a plain cluster/dot. This module finds rows
// named "icon-<id>" after render and drops a real <use> into any dot whose id
// is in ICONS, leaving the rest as dot placeholders. Mount-page concern only,
// same layer as anatomy.html's wireRelations/applyMotion wiring.
//
// icon-dashboard ported verbatim from infopedia_processor/frontend/icon-sprite.js
// (Heroicons v2 outline, MIT: github.com/tailwindlabs/heroicons).
// Remaining nav ids (shop, training, lecture, free) have no icon yet -- see
// .ai/todo.md TODO-1 -- and keep rendering as the dot fallback.

const SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
  <symbol id="icon-dashboard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 0 1-1.125-1.125v-3.75ZM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-8.25ZM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-2.25Z" />
  </symbol>
</svg>`;

export const ICONS = ['dashboard'];

let injected = false;
function ensureSprite(doc) {
  if (injected) return;
  doc.body.insertAdjacentHTML('beforeend', SPRITE);
  injected = true;
}

export function mountIcons(root, doc = document) {
  ensureSprite(doc);
  for (const id of ICONS) {
    const dot = root.querySelector(`[data-name="icon-${id}"]`);
    if (!dot) continue;
    dot.textContent = '';
    dot.insertAdjacentHTML('beforeend',
      `<svg class="ic" viewBox="0 0 24 24" width="12" height="12"><use href="#icon-${id}"></use></svg>`);
    dot.style.background = 'none';
    dot.style.color = getComputedStyle(dot).borderColor || 'currentColor';
  }
}
