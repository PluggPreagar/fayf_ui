// ui/anatomy.js -- page-mount controller for screens/anatomy's records
// pager, same bucket as ui/quiz.js. Real state-rules wiring
// (docs/superpowers/specs/2026-08-30-state-rules-design.md) for the one
// screen in the repo that had no genuine interactive/async logic yet.
//
// Page 1 ships baked into screens/anatomy.json's static model, so the
// initial render matches it exactly -- no fetch, no conflict with
// test/anatomy_test.js's screen-wide diff(capture(root), resolve(doc))
// invariant, which runs right after mount. Paging to any OTHER page is a
// real fetch against content/anatomy/records.json, with real
// loading/error/read-only -- not a synthetic demo.
import { resolve } from './model.js';
import { render } from './render.js';
import { markActionable, setActionableLoading, setActionableError, setActionableReadonly } from './actions.js';

function recordRow(index, label) {
  return { name: `record-${index}`, box: 'row, mid, gap:1, pad:1, hairline', content: label };
}

export function mountRecordsPager(root, url = '/content/anatomy/records.json') {
  const listEl = root.querySelector('[data-name="records-list"]');
  const buttons = {
    prev: root.querySelector('[data-name="page-prev"]'),
    1: root.querySelector('[data-name="page-1"]'),
    2: root.querySelector('[data-name="page-2"]'),
    next: root.querySelector('[data-name="page-next"]'),
  };
  Object.values(buttons).forEach(markActionable);
  // Page 1's one archived row, matching content/anatomy/records.json's
  // page "1" entry -- read-only from the start, no fetch needed for this.
  // Guarded: only screens/anatomy.json's real page 1 has a record-2 baked
  // in -- a caller mounting this against a differently-shaped root (e.g. a
  // test fixture isolating just the error path) legitimately has none.
  const archivedRow1 = listEl.querySelector('[data-name="record-2"]');
  if (archivedRow1) setActionableReadonly(archivedRow1, true);

  let current = 1;
  let pagesCache = null;

  function paintPage(n, records) {
    listEl.replaceChildren(...records.map((rec, i) => {
      const row = render(resolve(recordRow(i, rec.label)));
      if (rec.archived) setActionableReadonly(row, true);
      return row;
    }));
    current = n;
    buttons[1].classList.toggle('bx-tint1', n === 1);
    buttons[2].classList.toggle('bx-tint1', n === 2);
  }

  async function goTo(n) {
    if (n === current) return;
    setActionableLoading(listEl, true);
    try {
      if (!pagesCache) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        pagesCache = (await res.json()).pages;
      }
      setActionableLoading(listEl, false);
      paintPage(n, pagesCache[n]);
    } catch (err) {
      setActionableLoading(listEl, false);
      const retryBtn = render(resolve({ box: 'row, mid, packed, pad:2, solid, rounded', content: 'Retry' }));
      markActionable(retryBtn);
      setActionableError(retryBtn, true);
      retryBtn.addEventListener('click', () => goTo(n), { once: true });
      listEl.replaceChildren(retryBtn);
    }
  }

  buttons[1].addEventListener('click', () => goTo(1));
  buttons[2].addEventListener('click', () => goTo(2));
  buttons.prev.addEventListener('click', () => goTo(Math.max(1, current - 1)));
  buttons.next.addEventListener('click', () => goTo(Math.min(2, current + 1)));
}
