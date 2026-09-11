// test/machine_test.js -- machine.html (C11 L9 controller fixture).
// The node suite proves step()/init() pure; this proves the browser half:
// slots painted from view(status), buttons guarded by state, effects run
// (fetch ok/err, timer, emit), delegated click -> trigger, C2 error on typo.
import { mountMachine } from '../ui/machine.js';

const tr = new TestRunner({ stopOnError: false });
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 2000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) return false; await wait(20); } return true; };

tr.addBlock('machine: load -> ready, slots + guards from status', (r) => {
  r.waitFor(() => document.body.dataset.ready === '1', 3000)
   .run(async () => {
     const ctl = window.__ctl, el = ctl.el;
     r.check(el.dataset.name === 'loader' && el.classList.contains('bx'), 'screen rendered from JSON');
     r.check(await until(() => ctl.status.state === 'ready'), 'fetch effect ran: loading -> ready', ctl.status.state);
     r.check(el.dataset.machineState === 'ready', 'data-machine-state mirrors status.state');
     r.check(el.querySelector('[data-name="status-line"]').textContent === 'state: ready', 'string slot painted from view()');
     r.check(el.querySelector('[data-name="body"]').textContent === '2 questions · load #1', 'node-json slot rendered via L2', el.querySelector('[data-name="body"]').textContent);
     const btn = (n) => el.querySelector(`[data-name="${n}"]`);
     r.check(!btn('refresh').classList.contains('bx-disabled') && btn('refresh').tabIndex === 0, 'refresh enabled in ready (trigger fires here)');
     r.check(!btn('pause').classList.contains('bx-disabled'), 'pause enabled in ready');
     r.check(btn('retry').classList.contains('bx-disabled') && btn('retry').tabIndex === -1, 'retry disabled in ready (inert trigger) -- guard = machine');
     r.check(btn('refresh').classList.contains('bx-actionable'), 'trigger targets are marked actionable');
   });
});

tr.addBlock('machine: click -> trigger -> transition -> effects (refresh, emit, timer)', (r) => {
  r.run(async () => {
     const ctl = window.__ctl, el = ctl.el;
     const btn = (n) => el.querySelector(`[data-name="${n}"]`);
     const before = window.__emitted.length;
     btn('refresh').click();
     r.check(window.__emitted.length === before + 1 && window.__emitted.at(-1)[0] === 'loader.refreshing', 'handler effect emit reached onEmit');
     r.check(await until(() => ctl.status.state === 'ready' && ctl.status.data.loads === 2), 'refresh re-entered loading, fetched again, back in ready (load #2)', JSON.stringify(ctl.status));
     btn('retry').click();
     r.check(ctl.status.state === 'ready', 'click on a disabled/inert button changes nothing');
     btn('pause').click();
     r.check(ctl.status.state === 'pausing', 'pause.click -> pausing');
     r.check(btn('pause').classList.contains('bx-disabled') && btn('refresh').classList.contains('bx-disabled'), 'in pausing every button is inert');
     r.check(el.querySelector('[data-name="body"]').textContent === 'paused 200 ms…', 'pausing view painted');
     r.check(await until(() => ctl.status.state === 'ready', 1000), 'timer effect fired pause.done -> ready');
   });
});

tr.addBlock('machine: fetch error -> error state, retry re-issues the fetch', (r) => {
  r.run(async () => {
     let fail = true;
     const io = { fetch: (url) => fail ? Promise.resolve({ ok: false, status: 503 }) : fetch(url) };
     const ctl = window.__mount(io);
     r.check(await until(() => ctl.status.state === 'error'), 'failed fetch -> error', ctl.status.state);
     const el = ctl.el, btn = (n) => el.querySelector(`[data-name="${n}"]`);
     r.check(el.querySelector('[data-name="body"]').textContent === 'failed: HTTP 503', 'error payload reaches the view', el.querySelector('[data-name="body"]').textContent);
     r.check(!btn('retry').classList.contains('bx-disabled') && btn('refresh').classList.contains('bx-disabled'), 'only retry enabled in error');
     fail = false;
     btn('retry').click();
     r.check(await until(() => ctl.status.state === 'ready'), 'retry -> loading -> ready with the injected fetch', ctl.status.state);
     r.check(ctl.status.data.error === null, 'handler cleared the error on load');
     el.remove();
   });
});

tr.addBlock('machine: C2 -- unknown trigger throws, view naming a missing slot throws', (r) => {
  r.run(() => {
     let threw = null;
     try { window.__ctl.dispatch('nope.click'); } catch (e) { threw = e.message; }
     r.check(/unknown trigger 'nope.click'/.test(threw), 'dispatch of a trigger no state knows throws', threw);
     threw = null;
     const host = document.createElement('div');
     try {
       mountMachine(host, { name: 'x', box: 'hug', children: [{ name: 'a', box: 'hug' }] },
         { initial: 's', states: { s: { 'a.click': 's' } } }, {}, { view: () => ({ nope: 'x' }) });
     } catch (e) { threw = e.message; }
     r.check(/slot 'nope' not in screen/.test(threw), 'view naming a slot the screen lacks throws at mount', threw);
     threw = null;
     try { mountMachine(host, { box: 'hug' }, { initial: 's', states: { s: { 'a.click': 'gone' } } }); }
     catch (e) { threw = e.message; }
     r.check(/'gone' not a state/.test(threw), 'machine with a dangling transition target is rejected at mount', threw);
   });
});

await tr.runBlocks();
