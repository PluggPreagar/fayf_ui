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

// Found live (quiz.html): brightness(.94) alone is invisible on a bare/
// untinted actionable box (transparent background -- only the already-dark
// border/text shifts by 6%). Fixed with a supplemental background-wash
// rule scoped to untinted boxes only (tokens.css). Verified via selector
// matching, not real :hover -- consistent with this file's other
// pseudo-class-avoidance (see the file-top comment).
tr.addBlock('hover gives bare/untinted actionable boxes a real background wash, tinted ones are unaffected', (r) => {
  r.run(() => {
    const bareProps = declaredProps('.bx-actionable:hover:not([class*="bx-tint"]):not(.bx-brand):not(.bx-ok):not(.bx-warn)');
    r.check(!!bareProps, 'bare-hover rule found in tokens.css', bareProps);
    r.check(bareProps.includes('background-color'), 'bare-hover rule sets a real background', bareProps);

    const bareEl = document.querySelector('[data-name="default"]');
    r.check(bareEl.matches('.bx-actionable:not([class*="bx-tint"]):not(.bx-brand):not(.bx-ok):not(.bx-warn)'),
      'the fixture\'s bare box (no tint class) matches the bare-hover selector');

    const tintedEl = document.createElement('div');
    tintedEl.className = 'bx bx-actionable bx-tint3';
    r.check(!tintedEl.matches('.bx-actionable:not([class*="bx-tint"]):not(.bx-brand):not(.bx-ok):not(.bx-warn)'),
      'a tinted box does NOT match -- keeps only the brightness filter, no double treatment');

    // .bx-brand (atom/button.primary) isn't a bx-tint* class -- it needs
    // its own exclusion or it'd wrongly get the bare-hover wash on top of
    // its own brand fill (mockup) / tint3 fill (wireframe).
    const brandEl = document.createElement('div');
    brandEl.className = 'bx bx-actionable bx-brand';
    r.check(!brandEl.matches('.bx-actionable:not([class*="bx-tint"]):not(.bx-brand):not(.bx-ok):not(.bx-warn)'),
      'a brand (primary button) box does NOT match either -- already has its own fill');
  });
});

// Full channel audit across every state rule -- generalizes the error/focus
// check above. focus-visible <-> selected USED to be here (both used
// outline, same collision class as error's original draft) -- fixed by
// giving .bx-selected its own channel (border-left, tokens.css), so it's
// gone from the allow-list below; a regression there should fail loudly.
// Two overlaps remain EXPECTED and allowed (both by-design, see
// docs/superpowers/specs/2026-08-30-state-rules-design.md):
//   loading/readonly/disabled: all three are "dim + inert" by nature and
//     are mutually exclusive states on one element by usage convention (a
//     box is never loading AND disabled AND read-only at once, same as the
//     doc's own state matrix -- one column applies at a time), so sharing
//     opacity/pointer-events is harmless in practice even though the
//     magnitudes differ (.7/.55/.45).
//   error/selected: both touch border-left-color (error via the all-sides
//     border-color shorthand, selected via border-left specifically) --
//     mutually exclusive by component (error is for actionable buttons,
//     selected is for quiz answers), same "different components never
//     combine" reasoning as the trio above.
// Any OTHER overlap -- most importantly anything touching hover's `filter`
// -- is a real regression.
const STATE_SELECTORS = [
  '.bx-actionable:hover', '.bx-actionable:focus-visible', '.bx-actionable:active',
  '.bx-loading', '.bx-error', '.bx-readonly', '.bx-disabled', '.bx-selected',
];
const ALLOWED_OVERLAPS = new Set([
  ['.bx-loading', '.bx-readonly'].sort().join('|'),
  ['.bx-loading', '.bx-disabled'].sort().join('|'),
  ['.bx-readonly', '.bx-disabled'].sort().join('|'),
  ['.bx-error', '.bx-selected'].sort().join('|'),
]);

tr.addBlock('selected survives focus -- both channels visible at once (fix for the logged .bx-selected/focus collision)', (r) => {
  r.run(() => {
    const selectedProps = declaredProps('.bx-selected');
    const focusProps = declaredProps('.bx-actionable:focus-visible');
    r.check(!!selectedProps, '.bx-selected rule found in tokens.css', selectedProps);
    const overlap = (selectedProps || []).filter(p => (focusProps || []).includes(p));
    r.check(overlap.length === 0, 'no shared CSS property between selected and focus-visible', overlap);
  });
});

tr.addBlock('full channel audit: hover has zero overlap with any other state; only the allow-listed overlaps exist elsewhere', (r) => {
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
    r.check(unexpected.length === 0, 'no unexpected channel overlaps beyond the allow-listed ones', unexpected);
  });
});

// Skins (docs/superpowers/specs/2026-09-09-luna-skin-design.md). The
// skin-driven knobs introduced for luna (--r-rounded, --wrong, --focus,
// --display, --shadow, ...) must (a) resolve in EVERY skin -- a missing
// var silently falls back to `initial` and the box just loses its radius
// or colour -- and (b) reproduce the pre-luna hardcoded values exactly in
// wireframe/mockup, so this test pins those, not just luna's own values.
// Computed custom properties come back var()-substituted (verified live:
// luna's --wrong reads "#c97a00", not "var(--warn)").
const SKIN_VARS = ['--r-rounded', '--wrong', '--wrong-surf', '--ok-surf', '--warn', '--warn-surf',
  '--focus', '--display', '--prose', '--mono', '--shadow'];
// brand is realistic-skin-only by design: wireframe's .bx-brand is plain
// tint3 grey and never reads these (tokens.css) -- so they're asserted
// for mockup/luna only, not in the every-skin list above.
const REALISTIC_VARS = ['--brand', '--brand-surf'];
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
// A var's value as the browser would serialise it on an element (rgb(...)),
// so hex tokens compare against getComputedStyle output.
const cssVarColor = (name) => {
  const el = document.createElement('div');
  el.style.color = `var(${name})`;
  document.body.appendChild(el);
  const c = getComputedStyle(el).color;
  el.remove();
  return c;
};

tr.addBlock('skins: every skin-driven var resolves in wireframe, mockup and luna; wireframe/mockup keep their pre-luna values', (r) => {
  const before = document.documentElement.dataset.style;
  const probe = document.createElement('div');
  probe.className = 'bx bx-solid bx-rounded bx-brand bx-actionable';
  probe.textContent = 'probe';
  r.run(() => {
    document.body.appendChild(probe);
    for (const mode of ['wireframe', 'mockup', 'luna']) {
      document.documentElement.dataset.style = mode;
      const missing = SKIN_VARS.filter(v => cssVar(v) === '');
      r.check(missing.length === 0, `${mode}: all skin vars resolve`, missing);
      if (mode !== 'wireframe') {
        const missingBrand = REALISTIC_VARS.filter(v => cssVar(v) === '');
        r.check(missingBrand.length === 0, `${mode}: brand vars resolve`, missingBrand);
      }
    }
    document.documentElement.dataset.style = 'wireframe';
    r.check(getComputedStyle(probe).borderRadius === '3px', 'wireframe: rounded stays 3px');
    r.check(cssVar('--wrong') === cssVar('--accent'), 'wireframe: wrong is still accent red');
    r.check(cssVar('--focus') === cssVar('--ink'), 'wireframe: focus ring colour still ink');
    r.check(cssVar('--display') === cssVar('--prose'), 'wireframe: display face = prose face (no second font)');
    r.check(getComputedStyle(probe).boxShadow === 'none', 'wireframe: solid box has no shadow');

    document.documentElement.dataset.style = 'mockup';
    r.check(getComputedStyle(probe).borderRadius === '3px', 'mockup: rounded stays 3px');
    r.check(getComputedStyle(probe).boxShadow === 'rgba(0, 0, 0, 0.06) 0px 1px 2px 0px',
      'mockup: solid shadow unchanged from the old hardcoded value', getComputedStyle(probe).boxShadow);
    r.check(getComputedStyle(probe).borderColor === 'rgb(47, 95, 216)', 'mockup: brand border still brand blue');

    // ok/warn fills (decision 3): grey in wireframe, real colour in luna.
    const warnProbe = document.createElement('div');
    warnProbe.className = 'bx bx-solid bx-warn';
    document.body.appendChild(warnProbe);
    document.documentElement.dataset.style = 'wireframe';
    r.check(getComputedStyle(warnProbe).backgroundColor === cssVarColor('--tint3'),
      'wireframe: warn fill is plain tint3 grey (structure only)', getComputedStyle(warnProbe).backgroundColor);
    document.documentElement.dataset.style = 'luna';
    r.check(getComputedStyle(warnProbe).backgroundColor === 'rgb(251, 232, 204)',
      'luna: warn fill is THW amber-tint', getComputedStyle(warnProbe).backgroundColor);
    r.check(getComputedStyle(warnProbe).borderColor === 'rgb(201, 122, 0)',
      'luna: solid+warn border is amber', getComputedStyle(warnProbe).borderColor);
    warnProbe.remove();
    r.check(getComputedStyle(probe).borderRadius === '8px', 'luna: rounded is 8px');
    r.check(cssVar('--wrong') === cssVar('--warn'), 'luna: wrong re-hued to warn (amber)');
    r.check(getComputedStyle(probe).textTransform === 'uppercase', 'luna: brand button uppercase (display role)');
    r.check(getComputedStyle(probe).fontFamily.includes('Saira Condensed'), 'luna: brand button uses the display face');
  })
  .waitFor(() => document.fonts.check("600 12px 'Saira Condensed'") && document.fonts.check("12px 'Source Sans 3'"),
    3000, 50, 'luna: Saira Condensed + Source Sans 3 loaded from ui/fonts/')
  .run(() => {
    probe.remove();
    document.documentElement.dataset.style = before;
  });
});

tr.addBlock('skins: realistic-rendering rules are explicit mockup+luna selector lists (fixture pages with no data-style stay wireframe)', (r) => {
  r.run(() => {
    const solid = declaredProps(':root[data-style="mockup"] .bx-solid, :root[data-style="luna"] .bx-solid');
    r.check(!!solid && solid.includes('box-shadow'), 'mockup+luna .bx-solid rule found with its shadow', solid);
    const brand = declaredProps(':root[data-style="mockup"] .bx-brand, :root[data-style="luna"] .bx-brand');
    r.check(!!brand && brand.includes('background-color'), 'mockup+luna .bx-brand rule found', brand);
    const ok = declaredProps(':root[data-style="mockup"] .bx-ok, :root[data-style="luna"] .bx-ok');
    r.check(!!ok && ok.includes('color'), 'mockup+luna .bx-ok rule found (new fill token)', ok);
    const wireframeOutline = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch { return []; } })
      .find(rl => rl.selectorText && rl.selectorText.startsWith(':root:not([data-style="mockup"]):not([data-style="luna"])'));
    r.check(!!wireframeOutline, 'wireframe dotted-outline rule excludes both realistic skins');
  });
});

await tr.runBlocks();
