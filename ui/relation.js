// ui/relation.js -- L3 observer layer. Reads rendered measures, writes via style only.
export function wireRelations(el, external = {}) {
  const extra = el.dataset.extra ? JSON.parse(el.dataset.extra) : {};
  for (const rel of extra.relation ?? []) {
    const src = rel.watch === 'host' ? (external.host ?? el)
      : el.querySelector(`[data-name="${rel.watch}"]`);
    const dst = el.querySelector(`[data-name="${rel.drive}"]`);
    if (!src || !dst) continue;
    if (rel.measure === 'scroll-fraction') {
      const update = () => {
        const f = src.scrollTop / Math.max(1, src.scrollHeight - src.clientHeight);
        const free = el.clientHeight - dst.offsetHeight;
        dst.style.position = 'relative';
        dst.style.top = `${Math.round(f * free)}px`;
      };
      src.addEventListener('scroll', update, { passive: true });
      update();
    } else {
      throw new Error(`unknown measure '${rel.measure}'`);
    }
  }
}
