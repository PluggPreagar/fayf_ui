// ui/space-class.js -- resize -> measure excess -> classify -> re-resolve ->
// re-render (too-much-space mechanism 2, TODO-5). Wires the pure L1
// classify()/resolve() and L2 excess()/render() into a live, resize-
// reactive binding for one container+doc pair. Page-mount-layer glue, same
// bucket as ui/quiz.js -- not part of the box/vocabulary model itself.
import { resolve, classify } from './model.js';
import { render, excess } from './render.js';

// `container` must be the V1 shape: a stable-sized (`fill`) box whose own
// size doesn't depend on its content -- see excess()'s own precondition
// note. `doc`/`registry`/`baseEnv` are what `island` resolves from before
// any space-class token is added; `axis` matches container's main axis.
//
// Every reclassification re-renders the unconditioned base first to
// re-measure its current natural footprint (cheap, and the only way to
// detect "still fits" vs "room opened up" without caching a footprint that
// could go stale) -- one or two renders per resize tick, not optimized for
// resize-drag performance. `container.dataset.spaceClass` exposes the
// current classification for tests/debugging ('base' when no token fires).
export function wireSpaceClass(container, doc, registry, { axis = 'height', baseEnv = [] } = {}) {
  function apply() {
    const island = render(resolve(doc, registry, baseEnv));
    container.replaceChildren(island);
    const tokens = classify(excess(container, island, axis));
    container.dataset.spaceClass = tokens.join(',') || 'base';
    if (tokens.length) container.replaceChildren(render(resolve(doc, registry, [...baseEnv, ...tokens])));
  }
  apply();
  const ro = new ResizeObserver(apply);
  ro.observe(container);
  return () => ro.disconnect();
}
