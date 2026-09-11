// ui/graph.js -- graph controller, L9 (C11). machines/graph.json is the
// machine; handlers + view are pure; mountGraph only hands the already-
// rendered screens/graph element to ui/machine.js.
//
// The simplest S6 page yet -- and the LAST one (docs/superpowers/plans/
// 2026-09-11-workspace-dashboard.md's S6 table). Unlike every other S6 page,
// this is NOT a port of a ground-truth behaviour into boxes/paths/a machine:
// the plan is explicit that the real graph canvas (drag/zoom/wires,
// fayf_processor/frontend/graph.js + graph-canvas.js/graph-model.js/
// graph-shell.js/etc., ~5700 lines total) is Embed, decide after S6 (plan's
// "Not in this plan" list) -- out of scope to port, here or ever, per that
// decision. This file builds only the smallest possible fayf_ui shell (nav
// rail + one full-bleed embed slot) to wrap that legacy editor UNCHANGED
// (C11's one escape hatch: foreign DOM in a named slot, opaque to inspector/
// capture). The fayf_processor sibling grabs `[data-name="embed"]`
// (screens/graph.json) and inserts an `<iframe>` into it directly, plain DOM,
// entirely outside this repo's render/resolve pipeline.
//
// ONE machine state (`ready`), no fetch at all -- immediately ready, nav +
// theme only (even simpler than ui/query.js's single-state, one-fetch shape).
// status.data = {} -- nothing to track, view() only ever sets crumb-page.
import graphMachine from '../machines/graph.json' with { type: 'json' };
import { mountMachine } from './machine.js';

export { graphMachine };

const NAV = ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'settings'];

// Pure. Nothing to track -- the embed slot is foreign DOM, not machine data.
export function initialData() {
  return {};
}

// Pure. (status, payload) -> { status, effects? }
export const handlers = {
  'btn-theme.click': (s) => ({ status: s, effects: [{ emit: 'theme.toggle' }] }),
  ...Object.fromEntries(NAV.map(to => [`nav-${to}.click`, (s) => ({ status: s, effects: [{ emit: 'nav.go', payload: { to } }] })])),
};

// Pure. status -> { name: patch }.
export function view(s) {
  return { 'crumb-page': 'Graph' };
}

// Browser. `root` = the already-rendered screens/graph element.
export function mountGraph(root, reg, opts = {}) {
  return mountMachine(root, root, graphMachine, handlers, { reg, view, data: initialData(), ...opts });
}
