import test from 'node:test';
import assert from 'node:assert/strict';
import { createMachine } from '../../ui/state-machine.js';

test('enters the initial state on creation', () => {
  const log = [];
  createMachine({
    states: { a: { enter: () => log.push('enter-a') } },
    initial: 'a',
  });
  assert.deepEqual(log, ['enter-a']);
});

test('send() transitions on a matching event, calls exit then enter', () => {
  const log = [];
  const m = createMachine({
    states: {
      a: { enter: () => log.push('enter-a'), exit: () => log.push('exit-a'), on: { go: 'b' } },
      b: { enter: () => log.push('enter-b') },
    },
    initial: 'a',
  });
  const ok = m.send('go');
  assert.equal(ok, true);
  assert.equal(m.state, 'b');
  assert.deepEqual(log, ['enter-a', 'exit-a', 'enter-b']);
});

test('send() with an unregistered event is a no-op', () => {
  const m = createMachine({
    states: { a: { on: { go: 'b' } }, b: {} },
    initial: 'a',
  });
  const ok = m.send('nope');
  assert.equal(ok, false);
  assert.equal(m.state, 'a');
});

test('context is shared and mutable across enter/exit hooks', () => {
  const seen = [];
  const m = createMachine({
    states: {
      a: { exit: (ctx) => { ctx.count = 1; }, on: { go: 'b' } },
      b: { enter: (ctx) => { seen.push(ctx.count); } },
    },
    initial: 'a',
    context: { count: 0 },
  });
  m.send('go');
  assert.deepEqual(seen, [1]);
});

test('enter receives the payload passed to send()', () => {
  let received = null;
  const m = createMachine({
    states: {
      a: { on: { go: 'b' } },
      b: { enter: (ctx, send, payload) => { received = payload; } },
    },
    initial: 'a',
  });
  m.send('go', { id: 42 });
  assert.deepEqual(received, { id: 42 });
});

test('states with no enter/exit defined at all do not throw', () => {
  const m = createMachine({ states: { a: { on: { go: 'b' } }, b: {} }, initial: 'a' });
  assert.doesNotThrow(() => m.send('go'));
});
