import { attachHandles, _engine } from '../ui/handles.js';

const tr = new TestRunner({ stopOnError: false });
tr.addBlock('placement + shedding', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(() => {
     const [wide, mid, narrow] = document.querySelectorAll('.bx[data-handles]');
     r.check(wide.querySelectorAll('.hx-square').length === 8, '8 squares on wide');
     r.check(wide.querySelectorAll('.hx-pill').length === 2, '2 pills on wide (R·M·R·M·R)');
     r.check(mid.querySelectorAll('.hx-pill').length === 1, '1 pill at 140-280 (R·M·R)');
     r.check(narrow.querySelectorAll('.hx-pill').length === 0, '0 pills below 140 (R·M)');
     const sq = wide.querySelector('.hx-square');
     r.check(getComputedStyle(sq).opacity === '0', 'dormant = opacity 0');
   });
});
tr.addBlock('dwell gate arms only when slow', (r) => {
  r.run(() => {
    _engine.speed = 5; _engine.settle = 0;          // fast sweep
    r.check(_engine.gate() < 0.05, 'fast sweep lights nothing');
    _engine.speed = 0; _engine.settle = 1;          // dwelled
    r.check(_engine.gate() > 0.9, 'slow + settled arms');
  });
});
tr.addBlock('keyboard focus reveals at 50%', (r) => {
  r.run(() => {
    const wide = document.querySelector('.bx[data-handles]');
    wide.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    const sq = wide.querySelector('.hx-square');
    r.check(sq.style.opacity === '0.5', 'focus → 50%');
  });
});
await tr.runBlocks();
