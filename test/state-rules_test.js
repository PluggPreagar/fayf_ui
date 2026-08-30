// test/state-rules_test.js -- browser test for the interaction-state
// classes/setters added per
// docs/superpowers/specs/2026-08-30-state-rules-design.md. Only the
// JS-driven states (disabled/loading/error/read-only) are asserted here --
// hover/focus/pressed are native pseudo-classes (no JS toggle to test),
// verify those by real interaction against state-rules.html.
import { setActionableDisabled, setActionableLoading, setActionableError, setActionableReadonly } from '../ui/actions.js';

const tr = new TestRunner({ stopOnError: false });

tr.addBlock('fixture renders one actionable box per demoed state', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(() => {
     for (const name of ['default', 'disabled', 'loading', 'error', 'readonly', 'engaged']) {
       const el = document.querySelector(`[data-name="${name}"]`);
       r.check(!!el, `[data-name="${name}"] present`);
       r.check(el.classList.contains('bx-actionable'), `${name}: bx-actionable`);
     }
   });
});

tr.addBlock('loading/error/read-only classes hold independently, no channel collision', (r) => {
  r.run(() => {
    const loading = document.querySelector('[data-name="loading"]');
    r.check(loading.classList.contains('bx-loading'), 'loading: bx-loading set');
    r.check(!loading.classList.contains('bx-error') && !loading.classList.contains('bx-readonly'),
      'loading: no other state class leaked on');
    r.check(loading.tabIndex === -1, 'loading: dropped from tab order');

    const error = document.querySelector('[data-name="error"]');
    r.check(error.classList.contains('bx-error'), 'error: bx-error set');
    r.check(error.tabIndex === 0, 'error: stays in tab order (Retry is still actionable)');

    const readonly = document.querySelector('[data-name="readonly"]');
    r.check(readonly.classList.contains('bx-readonly'), 'readonly: bx-readonly set');
    r.check(readonly.tabIndex === -1, 'readonly: dropped from tab order');

    const engaged = document.querySelector('[data-name="engaged"]');
    r.check(engaged.classList.contains('bx-selected'), 'engaged: bx-selected set (existing channel, reused)');
  });
});

tr.addBlock('setters toggle off cleanly and restore tab order', (r) => {
  r.run(() => {
    const el = document.querySelector('[data-name="disabled"]');
    r.check(el.classList.contains('bx-disabled') && el.tabIndex === -1, 'starts disabled');
    setActionableDisabled(el, false);
    r.check(!el.classList.contains('bx-disabled') && el.tabIndex === 0, 'disabled cleared, tab order restored');
    setActionableDisabled(el, true); // restore fixture state for any later manual check

    const l = document.querySelector('[data-name="loading"]');
    setActionableLoading(l, false);
    r.check(!l.classList.contains('bx-loading') && l.tabIndex === 0, 'loading cleared, tab order restored');
    setActionableLoading(l, true);

    const e = document.querySelector('[data-name="error"]');
    setActionableError(e, false);
    r.check(!e.classList.contains('bx-error'), 'error cleared');
    setActionableError(e, true);

    const ro = document.querySelector('[data-name="readonly"]');
    setActionableReadonly(ro, false);
    r.check(!ro.classList.contains('bx-readonly') && ro.tabIndex === 0, 'readonly cleared, tab order restored');
    setActionableReadonly(ro, true);
  });
});

// Headless focus() doesn't reproduce the browser's real focus-visible
// heuristic (verified: neither plain focus() nor the non-standard
// {focusVisible:true} option triggers it here) -- so the actual "does the
// red ring survive a real Tab-focus" proof was done manually against this
// page (Browser pane, real keyboard Tab: confirmed outline:dashed AND
// border-color:accent both present simultaneously). Automated instead: a
// property-level regression that doesn't need the pseudo-class to fire --
// this is the exact invariant the manual check confirmed, expressed so it
// can't silently regress.
function declaredProps(selectorText) {
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of rules) {
      if (rule.selectorText === selectorText) return [...rule.style].filter(p => p !== '');
    }
  }
  return null;
}

tr.addBlock('error\'s channel (border-color) never overlaps focus-visible\'s (outline) -- regression for the collision found live', (r) => {
  r.run(() => {
    const errorProps = declaredProps('.bx-error');
    const focusProps = declaredProps('.bx-actionable:focus-visible');
    r.check(!!errorProps, '.bx-error rule found in tokens.css', errorProps);
    r.check(!!focusProps, '.bx-actionable:focus-visible rule found in tokens.css', focusProps);
    const overlap = (errorProps || []).filter(p => (focusProps || []).includes(p));
    r.check(overlap.length === 0, 'no shared CSS property between error and focus-visible', overlap);
  });
});

// Full channel audit across every state rule -- generalizes the error/focus
// check above. Two overlaps are EXPECTED and allowed (both pre-existing/
// by-design, see docs/superpowers/specs/2026-08-30-state-rules-design.md):
//   focus-visible <-> selected: same outline collision as error had, logged
//     there as a known pre-existing gap, not retrofitted.
//   loading/readonly/disabled: all three are "dim + inert" by nature and
//     are mutually exclusive states on one element by usage convention (a
//     box is never loading AND disabled AND read-only at once, same as the
//     doc's own state matrix -- one column applies at a time), so sharing
//     opacity/pointer-events is harmless in practice even though the
//     magnitudes differ (.7/.55/.45).
// Any OTHER overlap -- most importantly anything touching hover's `filter`
// -- is a real regression.
const STATE_SELECTORS = [
  '.bx-actionable:hover', '.bx-actionable:focus-visible', '.bx-actionable:active',
  '.bx-loading', '.bx-error', '.bx-readonly', '.bx-disabled', '.bx-selected',
];
const ALLOWED_OVERLAPS = new Set([
  ['.bx-actionable:focus-visible', '.bx-selected'].sort().join('|'),
  ['.bx-loading', '.bx-readonly'].sort().join('|'),
  ['.bx-loading', '.bx-disabled'].sort().join('|'),
  ['.bx-readonly', '.bx-disabled'].sort().join('|'),
]);

tr.addBlock('full channel audit: hover has zero overlap with any other state; only the 2 known/logged overlaps exist elsewhere', (r) => {
  r.run(() => {
    const props = Object.fromEntries(STATE_SELECTORS.map(s => [s, declaredProps(s) || []]));
    r.check(props['.bx-actionable:hover'].includes('filter') && props['.bx-actionable:hover'].length === 1,
      'hover\'s channel is exactly `filter`, nothing else', props['.bx-actionable:hover']);

    const unexpected = [];
    for (let i = 0; i < STATE_SELECTORS.length; i++) {
      for (let j = i + 1; j < STATE_SELECTORS.length; j++) {
        const a = STATE_SELECTORS[i], b = STATE_SELECTORS[j];
        const shared = props[a].filter(p => props[b].includes(p));
        if (!shared.length) continue;
        if (a.includes('hover') || b.includes('hover'))
          r.check(false, null, `hover channel collides with ${a === '.bx-actionable:hover' ? b : a}`, shared.join(','));
        else if (!ALLOWED_OVERLAPS.has([a, b].sort().join('|')))
          unexpected.push([a, b, shared]);
      }
    }
    r.check(unexpected.length === 0, 'no unexpected channel overlaps beyond the 2 logged ones', unexpected);
  });
});

await tr.runBlocks();
