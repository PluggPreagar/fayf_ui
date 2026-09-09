// test/thw_test.js -- THW ladder (ui/thw.js) against thw.html. Real content
// for the page-level block, a synthetic 4-card deck for the deterministic
// ladder walk (Stufe B needs 3 same-category peers, hence 4).
import { resolve } from '../ui/model.js';
import { render } from '../ui/render.js';
import { mountThw, mountThwFromUrl, WRONG_MS } from '../ui/thw.js';

const tr = new TestRunner({ stopOnError: false });
const q = (root, name) => root.querySelector(`[data-name="${name}"]`);
const text = (root, name) => q(root, name)?.textContent ?? null;

tr.addBlock('thw: page mounts real content, Stufe A self-check books 25 points', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(() => {
     const root = document.querySelector('body > .bx');
     r.check(!!root, 'screen mounted');
     r.check(text(root, 'cat-label') === 'Struktur', 'category label from content', text(root, 'cat-label'));
     r.check(text(root, 'level-pill') === 'Stufe A · 25 Pkt', 'level pill starts at Stufe A', text(root, 'level-pill'));
     r.check(q(root, 'level-pill').classList.contains('bx-brand'), 'Stufe A pill is the active (brand) chip');
     r.check(text(root, 'progress-label') === 'Karte 1 / 8', 'progress counts the 8 content cards', text(root, 'progress-label'));
     r.check(!!q(root, 'btn-hint') && !!q(root, 'btn-know'), 'Stufe A shows Hinweis + Weiß ich');
     r.check(q(root, 'btn-know').classList.contains('bx-ok') && q(root, 'btn-hint').classList.contains('bx-warn'),
       'know = ok fill, hint = warn fill (button.know / button.hint variants)');
     r.check(q(root, 'prompt').textContent.includes('kleinste Organisationseinheit'), 'question card renders its front text');

     q(root, 'btn-know').click();
     r.check(text(root, 'answer-title') === 'Ortsverband (OV)', 'result shows the solution title');
     r.check(text(root, 'points-line') === '+25 Punkte · Stufe A', 'points line books Stufe A', text(root, 'points-line'));
     r.check(q(root, 'points-line').classList.contains('bx-ok'), 'success points line is the ok chip');
     r.check(text(root, 'stat-known') === '1 gewusst' && text(root, 'stat-points') === '25 Punkte', 'session stats updated');
     r.check(!!q(root, 'btn-next'), 'Weiter present');

     q(root, 'btn-next').click();
     r.check(text(root, 'progress-label') === 'Karte 2 / 8', 'advanced to card 2', text(root, 'progress-label'));
     r.check(text(root, 'level-pill') === 'Stufe A · 25 Pkt', 'level reset to Stufe A for the next card');
   });
});

const synthetic = {
  id: 'thw/synthetic',
  categories: { t: 'Test' },
  cards: [
    { id: 'c1', cat: 't', type: 'q',    front: 'Q1?', title: 'T1', detail: 'D1' },
    { id: 'c2', cat: 't', type: 'code', front: 'XYZ', title: 'T2', detail: 'D2' },
    { id: 'c3', cat: 't', type: 'q',    front: 'Q3?', title: 'T3', detail: 'D3' },
    { id: 'c4', cat: 't', type: 'q',    front: 'Q4?', title: 'T4', detail: 'D4' },
  ],
  fantasy: { t: ['F1', 'F2', 'F3'] },
};
let syn = null;

tr.addBlock('thw: ladder walk -- hint -> Stufe B, wrong pick -> Stufe C on its own, skip -> Lösung re-queues the card', (r) => {
  r.run(() => {
    (async () => {
      const reg = await (await fetch('/registry.json')).json();
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = render(resolve(reg['screens/thw-card'], reg));
      container.appendChild(root);
      const data = JSON.parse(JSON.stringify(synthetic));
      mountThw(root, data, reg);
      syn = { container, root, data };
    })();
  })
  .waitFor(() => syn !== null, 3000, 50, 'synthetic ladder mounted')
  .run(() => {
    const { root } = syn;
    r.check(text(root, 'progress-label') === 'Karte 1 / 4', 'deck of 4');
    q(root, 'btn-hint').click();
    r.check(text(root, 'level-pill') === 'Stufe B · 15 Pkt', 'hint climbs to Stufe B', text(root, 'level-pill'));
    r.check(q(root, 'level-pill').classList.contains('bx-warn'), 'Stufe B pill is the warn chip');
    const rows = [...root.querySelectorAll('[data-name^="option-"]')];
    r.check(rows.length === 4, '4 options', rows.length);
    r.check(rows.map((_, i) => text(root, `letter-${i}`)).join('') === 'ABCD', 'lettered A-D');
    const titles = rows.map(x => x.textContent.slice(1));
    r.check(titles.includes('T1'), 'correct title among the options');
    r.check(titles.filter(t => t !== 'T1').every(t => ['T2', 'T3', 'T4'].includes(t)), 'Stufe B distractors are peer titles');
    r.check(text(root, 'btn-skip') === 'Mehr Hinweis · Stufe C', 'skip names the next rung');

    const wrong = rows.find(x => !x.textContent.includes('T1'));
    wrong.click();
    r.check(wrong.classList.contains('bx-wrong'), 'wrong pick marked wrong');
    r.check(rows.every(x => x.classList.contains('bx-readonly')), 'all options read-only once picked');
    r.check(q(root, 'btn-skip').classList.contains('bx-disabled'), 'skip disabled once picked');
    r.check(text(root, 'level-pill') === 'Stufe B · 15 Pkt', 'still Stufe B right after the wrong pick (timer pending)');
  })
  .waitFor(() => text(syn.root, 'level-pill') === 'Stufe C · 10 Pkt', WRONG_MS + 500, 25, 'wrong pick advances to Stufe C on its own')
  .run(() => {
    const { root, data } = syn;
    const rows = [...root.querySelectorAll('[data-name^="option-"]')];
    r.check(rows.length === 4 && rows.every(x => !x.classList.contains('bx-readonly')), 'fresh, actionable options for Stufe C');
    const titles = rows.map(x => x.textContent.slice(1));
    r.check(titles.filter(t => t !== 'T1').every(t => data.fantasy.t.includes(t)), 'Stufe C distractors are fantasy names');
    r.check(text(root, 'btn-skip') === 'Mehr Hinweis · Lösung anzeigen', 'skip now offers the solution');

    q(root, 'btn-skip').click();
    r.check(text(root, 'points-line') === '+5 Punkte · Lösung', 'solution books 5 points', text(root, 'points-line'));
    r.check(q(root, 'points-line').classList.contains('bx-warn'), 'failed points line is the warn chip');
    r.check(text(root, 'stat-again') === '1 nochmal' && text(root, 'stat-points') === '5 Punkte', 'stats: 1 again, 5 points');
    r.check(text(root, 'progress-label') === 'Karte 1 / 5', 'failed card re-queued -- deck grew to 5', text(root, 'progress-label'));
    r.check(text(root, 'level-pill') === 'Lösung · 5 Pkt', 'level pill names the rung it resolved on');

    q(root, 'btn-next').click();
    r.check(q(root, 'prompt').textContent.startsWith('XYZ'), 'card 2 is the code card -- plate first');
    r.check(!!root.querySelector('[data-name="prompt"] .bx-brand'), 'code card renders the brand plate (atom/text.plate)');
    q(root, 'btn-hint').click();
    q(root, 'btn-skip').click(); // Stufe B -> Stufe C without picking
    r.check(text(root, 'level-pill') === 'Stufe C · 10 Pkt', 'skip alone climbs a rung');
    const correct = [...root.querySelectorAll('[data-name^="option-"]')].find(x => x.textContent.includes('T2'));
    correct.click();
    r.check(correct.classList.contains('bx-correct'), 'correct pick marked correct');
    r.check(text(root, 'points-line') === '+10 Punkte · Stufe C', 'Stufe C books 10 points', text(root, 'points-line'));
    r.check(text(root, 'stat-known') === '1 gewusst' && text(root, 'stat-points') === '15 Punkte', 'stats: 1 known, 15 points');
  });
});

tr.addBlock('thw: finishing the deck -- progress 100%, summary, no dangling controls', (r) => {
  r.run(() => {
    const { root, container } = syn;
    // cards 3, 4 and the re-queued c1: know them all
    for (let i = 0; i < 3; i++) { q(root, 'btn-next').click(); q(root, 'btn-know').click(); }
    r.check(text(root, 'points-line') === '+25 Punkte · Stufe A', 'last card resolved on Stufe A');
    q(root, 'btn-next').click();
    r.check(text(root, 'progress-label') === 'Runde abgeschlossen', 'finished label');
    r.check(q(root, 'progress-fill').style.width === '100%', 'progress bar full');
    r.check(q(root, 'prompt').textContent === 'Runde geschafft.', 'done title');
    r.check(text(root, 'done-text') === 'Diese Runde: 4 gewusst, 1 nochmal üben, 90 Punkte gesamt.', 'summary line', text(root, 'done-text'));
    r.check(!q(root, 'btn-next') && !q(root, 'btn-know'), 'no controls left');
    r.check(q(root, 'level').children.length === 0, 'level slot emptied');
    container.remove();
  });
});

let loaded = null;
tr.addBlock('mountThwFromUrl: loading during the fetch, error + Retry on a 404', (r) => {
  r.run(() => {
    (async () => {
      const reg = await (await fetch('/registry.json')).json();
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = render(resolve(reg['screens/thw-card'], reg));
      container.appendChild(root);
      const p = mountThwFromUrl(root, '/content/thw/units.json', reg);
      r.check(q(root, 'body').classList.contains('bx-loading'), 'loading set synchronously before the fetch resolves');
      await p;
      const bad = render(resolve(reg['screens/thw-card'], reg));
      container.appendChild(bad);
      await mountThwFromUrl(bad, '/content/thw/does-not-exist.json', reg);
      loaded = { container, root, bad };
    })();
  })
  .waitFor(() => loaded !== null, 3000, 50, 'both mounts settled')
  .run(() => {
    const { container, root, bad } = loaded;
    r.check(!q(root, 'body').classList.contains('bx-loading'), 'loading cleared once mounted');
    r.check(!!q(root, 'btn-know'), 'real content mounted');
    const retry = bad.querySelector('[data-name="body"] .bx-error');
    r.check(!!retry && retry.textContent === 'Retry', 'failed fetch shows an actionable Retry');
    r.check(retry.tabIndex === 0, 'error never drops tab order');
    container.remove();
  });
});

await tr.runBlocks();
