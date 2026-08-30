import { resolve, diff } from '../ui/model.js';
import { render, capture } from '../ui/render.js';
import { mountRecordsPager } from '../ui/anatomy.js';

const tr = new TestRunner({ stopOnError: false });
tr.addBlock('anatomy renders 14 named parts', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(async () => {
     const root = document.querySelector('body > .bx');
     r.check(!!root, 'screen mounted');
     r.check(root.querySelectorAll('.bx').length > 40, 'composition is deep');
     const reg = await (await fetch('/registry.json')).json();
     const n = resolve(reg['screens/anatomy'], reg);
     const d = diff(capture(root), n);
     r.check(d.length === 0, 'screen invariant', `screen invariant: ${d.slice(0, 3).join('; ')}`);
   });
});

tr.addBlock('anatomy: records pager -- page 1 read-only row, real fetch to page 2, round-trip back', (r) => {
  r.run(() => {
    const root = document.querySelector('body > .bx');
    const record2 = root.querySelector('[data-name="record-2"]');
    r.check(record2.textContent === '2024 audit (archived)', 'page 1\'s archived record is the static, baked-in one');
    r.check(record2.classList.contains('bx-readonly'), 'archived record read-only from mount, no fetch needed');
    r.check(record2.tabIndex === -1, 'read-only record dropped from tab order');
    const record0 = root.querySelector('[data-name="record-0"]');
    r.check(!record0.classList.contains('bx-readonly'), 'non-archived record stays fully actionable');

    root.querySelector('[data-name="page-2"]').click();
  })
  .waitFor(() => document.querySelector('body > .bx [data-name="record-0"]')?.textContent === 'Client onboarding',
    3000, 50, 'page 2 content loaded via a real fetch')
  .run(() => {
    const root = document.querySelector('body > .bx');
    r.check(root.querySelector('[data-name="page-2"]').classList.contains('bx-tint1'), 'page 2 marked current');
    r.check(!root.querySelector('[data-name="page-1"]').classList.contains('bx-tint1'), 'page 1 no longer marked current');
    const archived = root.querySelector('[data-name="record-1"]');
    r.check(archived.textContent === 'Legacy migration (archived)', 'page 2\'s archived record is the one from content/anatomy/records.json');
    r.check(archived.classList.contains('bx-readonly'), 'page 2\'s archived record is read-only too');

    root.querySelector('[data-name="page-1"]').click();
  })
  .waitFor(() => document.querySelector('body > .bx [data-name="record-0"]')?.textContent === 'Q1 planning notes',
    3000, 50, 'navigated back to page 1')
  .run(() => {
    const root = document.querySelector('body > .bx');
    r.check(root.querySelector('[data-name="page-1"]').classList.contains('bx-tint1'), 'page 1 marked current again');
  });
});

// Isolated fresh mount -- exercises the error/retry path against a
// guaranteed-404 url without touching the shared page-level fixture above.
let errorFixture = null;

tr.addBlock('anatomy: records pager -- a failed fetch shows an actionable Retry', (r) => {
  r.run(() => {
    const doc = { box: 'stack', name: 'root', children: [
      { name: 'records-list', box: 'stack, gap:1', children: [
        { name: 'record-0', box: 'row, hairline', content: 'A' },
        { name: 'record-1', box: 'row, hairline', content: 'B' } ] },
      { name: 'pagination', box: 'row, hug', children: [
        { name: 'page-prev', box: 'hug', content: '‹' },
        { name: 'page-1', box: 'hug, tint1', content: '1' },
        { name: 'page-2', box: 'hug', content: '2' },
        { name: 'page-next', box: 'hug', content: '›' } ] } ] };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = render(resolve(doc));
    container.appendChild(root);
    // Guaranteed-404 url against this same dev server (real fetch, not
    // mocked -- server.py serves plain 404s for unknown paths), same
    // pattern as quiz_test.js's mountQuizFromUrl error-path test.
    mountRecordsPager(root, '/content/anatomy/does-not-exist.json');
    root.querySelector('[data-name="page-2"]').click();
    errorFixture = { container, root };
  })
  .waitFor(() => {
    const listEl = errorFixture?.root.querySelector('[data-name="records-list"]');
    return !!listEl && !listEl.classList.contains('bx-loading') && listEl.querySelector('.bx-error');
  }, 3000, 50, 'fetch settles (fails) and Retry renders')
  .run(() => {
    const { root, container } = errorFixture;
    const listEl = root.querySelector('[data-name="records-list"]');
    const retryBtn = listEl.querySelector('.bx-error');
    r.check(retryBtn.textContent === 'Retry', 'labeled Retry', retryBtn.textContent);
    r.check(retryBtn.tabIndex === 0, 'stays actionable -- error never drops tab order');
    container.remove();
  });
});

await tr.runBlocks();
