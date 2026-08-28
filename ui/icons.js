// ui/icons.js -- page-level icon overlay. NOT part of the box/vocabulary model
// (C2: unknown dial errors; no icon dial exists). Parts/screens stay pure
// vocabulary -- every nav row is a plain cluster/dot. This module finds rows
// named "icon-<id>" after render and drops a real <use> into every one:
// its own specific glyph if listed in ICONS, else a shared placeholder glyph
// (a dashed circle -- this system's own "dashed = not yet built" convention,
// checklist #12: a placeholder needs a real stroke to stay legible, a flat
// tinted dot alone doesn't). Every slot's own background/border is cleared
// either way -- only the chip around it (tint1/tint3, active vs disabled)
// draws a ring/fill; the icon itself is what carries the slot's contrast.
// Mount-page concern only, same layer as anatomy.html's wireRelations/
// applyMotion wiring.
//
// icon-dashboard ported verbatim from infopedia_processor/frontend/icon-sprite.js
// (Heroicons v2 outline, MIT: github.com/tailwindlabs/heroicons).
// Remaining nav ids (shop, training, lecture, free) have no real icon yet --
// see .ai/todo.md TODO-1 -- and render the shared placeholder glyph until
// one is authored.
//
// run/pause/blocked/cancelled/done: hand-drawn line-art (this repo, no
// external source). Two DIFFERENT vocabularies, deliberately not always
// same-spelled: box.state (a status) vs icon id (a depicted action/glyph,
// shared with any manual control that needs the same glyph -- e.g. a
// "Start" button reuses icon "run", never a bespoke second play glyph).
// Mapping, state -> icon id (only these two differ):
//   running -> icon-run   paused -> icon-pause
//   blocked -> icon-blocked   cancelled -> icon-cancelled   done -> icon-done

const PLACEHOLDER = 'placeholder';

const SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
  <symbol id="icon-dashboard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 0 1-1.125-1.125v-3.75ZM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-8.25ZM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-2.25Z" />
  </symbol>
  <symbol id="icon-run" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
  </symbol>
  <symbol id="icon-pause" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 5.25v13.5M17.25 5.25v13.5" />
  </symbol>
  <symbol id="icon-blocked" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="12" cy="12" r="8.25" /><path stroke-linecap="round" d="M6.6 6.6l10.8 10.8" />
  </symbol>
  <symbol id="icon-cancelled" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
  </symbol>
  <symbol id="icon-done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </symbol>
  <symbol id="icon-${PLACEHOLDER}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="12" cy="12" r="8.25" stroke-dasharray="3 3" />
  </symbol>
</svg>`;

export const ICONS = ['dashboard', 'run', 'pause', 'blocked', 'cancelled', 'done'];

let injected = false;
function ensureSprite(doc) {
  if (injected) return;
  doc.body.insertAdjacentHTML('beforeend', SPRITE);
  injected = true;
}

export function mountIcons(root, doc = document) {
  ensureSprite(doc);
  for (const dot of root.querySelectorAll('[data-name^="icon-"]')) {
    const id = dot.dataset.name.slice('icon-'.length);
    const useId = ICONS.includes(id) ? id : PLACEHOLDER;
    dot.textContent = '';
    dot.insertAdjacentHTML('beforeend',
      `<svg class="ic" viewBox="0 0 24 24" width="12" height="12"><use href="#icon-${useId}"></use></svg>`);
    dot.style.background = 'none';
    dot.style.border = 'none';
  }
}
