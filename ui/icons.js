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
// icon-dashboard/pipelines(runs)/graph/records/issues(bug)/browse(files)/
// query(search)/annotate(edit) ported verbatim from infopedia_processor/
// frontend/icon-sprite.js (Heroicons v2 outline, MIT:
// github.com/tailwindlabs/heroicons, plus that file's own hand-drawn
// icon-bug) -- the fayf_processor side-panel nav rail's own icon set, reused
// rather than inventing a second visual language for the same concepts.
// Remaining nav ids (shop, training, lecture, free -- a different app, the
// THW-Lernkarten nav rail) have no real icon yet -- see .ai/todo.md TODO-1 --
// and render the shared placeholder glyph until one is authored.
//
// run/pause/blocked/cancelled/done/profile: hand-drawn line-art (this repo,
// no external source -- profile has no equivalent in the processor's sprite,
// a plain head+shoulders glyph). Two DIFFERENT vocabularies, deliberately
// not always same-spelled: box.state (a status) vs icon id (a depicted
// action/glyph, shared with any manual control that needs the same glyph --
// e.g. a "Start" button reuses icon "run", never a bespoke second play
// glyph). Mapping, state -> icon id (only these two differ):
//   running -> icon-run   paused -> icon-pause
//   blocked -> icon-blocked   cancelled -> icon-cancelled   done -> icon-done

const PLACEHOLDER = 'placeholder';

const SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
  <symbol id="icon-dashboard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 0 1-1.125-1.125v-3.75ZM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-8.25ZM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-2.25Z" />
  </symbol>
  <symbol id="icon-pipelines" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
  </symbol>
  <symbol id="icon-graph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
  </symbol>
  <symbol id="icon-records" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125m0 0h7.5" />
  </symbol>
  <symbol id="icon-issues" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.75a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5Z M7.5 10c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5v5c0 2.5-2 4.5-4.5 4.5s-4.5-2-4.5-4.5v-5Z M12 10v9 M7.5 11 4 9.5 M7.5 13.5H4 M7.5 16 4 17.5 M16.5 11 20 9.5 M16.5 13.5H20 M16.5 16 20 17.5" />
  </symbol>
  <symbol id="icon-browse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M4 4h6l2 2h8v12H4z" stroke-linecap="round" stroke-linejoin="round" />
  </symbol>
  <symbol id="icon-query" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z" />
  </symbol>
  <symbol id="icon-annotate" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
  </symbol>
  <symbol id="icon-profile" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="12" cy="8.25" r="3.25" />
    <path stroke-linecap="round" stroke-linejoin="round" d="M4.75 19.5a7.25 7.25 0 0 1 14.5 0" />
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

export const ICONS = [
  'dashboard', 'pipelines', 'graph', 'records', 'issues', 'browse', 'query', 'annotate', 'profile',
  'run', 'pause', 'blocked', 'cancelled', 'done',
];

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
