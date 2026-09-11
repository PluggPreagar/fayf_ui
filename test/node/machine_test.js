import test from 'node:test';
import assert from 'node:assert/strict';
import { init, step, triggers, validateMachine, validateEffect, EFFECTS } from '../../ui/machine.js';

// C11: machine = JSON, handlers pure, step pure. Every test here is
// "JSON in, JSON out" -- no DOM, no fetch, no timers.
const M = {
  initial: 'loading',
  states: {
    loading: { enter: [{ fetch: '/api/runs', ok: 'runs.loaded', err: 'runs.failed' }],
               'runs.loaded': 'ready', 'runs.failed': 'error' },
    ready:   { 'refresh.click': 'loading', 'row.click': 'ready' },
    error:   { 'retry.click': 'loading' },
  },
};

test('validateMachine accepts the S1 shape', () => {
  assert.equal(validateMachine(M), M);
});

test('validateMachine: initial must be a state', () => {
  assert.throws(() => validateMachine({ initial: 'x', states: { a: {} } }), /initial 'x'/);
});

test('validateMachine: transition target must be a state (C2)', () => {
  assert.throws(() => validateMachine({ initial: 'a', states: { a: { 'go.click': 'nope' } } }), /'nope' not a state/);
});

test('validateMachine: trigger needs <name>.<event>', () => {
  assert.throws(() => validateMachine({ initial: 'a', states: { a: { go: 'a' } } }), /needs <name>.<event>/);
});

test('validateEffect: exactly one kind, kind key carries the argument', () => {
  assert.deepEqual(EFFECTS, ['fetch', 'emit', 'timer']);
  assert.ok(validateEffect({ fetch: '/x', ok: 'a.b', err: 'a.c' }));
  assert.ok(validateEffect({ timer: 900, trigger: 'pause.done' }));
  assert.ok(validateEffect({ emit: 'row.select', payload: { id: 1 } }));
  assert.throws(() => validateEffect({ fetch: '/x' }), /ok \+ err/);
  assert.throws(() => validateEffect({ timer: '900', trigger: 'x.y' }), /ms number/);
  assert.throws(() => validateEffect({ fetch: '/x', timer: 1 }), /exactly one/);
  assert.throws(() => validateEffect({}), /exactly one/);
});

test('triggers(): every trigger of every state, enter excluded', () => {
  assert.deepEqual([...triggers(M)].sort(), ['refresh.click', 'retry.click', 'row.click', 'runs.failed', 'runs.loaded']);
});

test('init: initial status + its enter effects; data passed through', () => {
  const r = init(M, { rows: [] });
  assert.deepEqual(r, {
    status: { state: 'loading', data: { rows: [] } },
    effects: [{ fetch: '/api/runs', ok: 'runs.loaded', err: 'runs.failed' }],
  });
});

test('step: transition without handler -- state set, no effects when target has no enter', () => {
  const s0 = { state: 'loading', data: {} };
  const r = step(M, s0, 'runs.loaded', [1, 2]);
  assert.deepEqual(r, { status: { state: 'ready', data: {} }, effects: [] });
  assert.deepEqual(s0, { state: 'loading', data: {} }, 'input status untouched');
});

test('step: handler runs first, its status kept, then transition + enter effects appended', () => {
  const handlers = {
    'refresh.click': (status) => ({ status: { ...status, data: { ...status.data, refreshed: 1 } }, effects: [{ emit: 'dash.refreshing' }] }),
  };
  const r = step(M, { state: 'ready', data: { rows: [1] } }, 'refresh.click', undefined, handlers);
  assert.deepEqual(r.status, { state: 'loading', data: { rows: [1], refreshed: 1 } });
  assert.deepEqual(r.effects, [
    { emit: 'dash.refreshing' },
    { fetch: '/api/runs', ok: 'runs.loaded', err: 'runs.failed' },
  ]);
});

test('step: handler receives payload; data update without transition (self-transition)', () => {
  const handlers = { 'row.click': (status, payload) => ({ status: { ...status, data: { ...status.data, sel: payload.id } } }) };
  const r = step(M, { state: 'ready', data: {} }, 'row.click', { id: 7 }, handlers);
  assert.deepEqual(r, { status: { state: 'ready', data: { sel: 7 } }, effects: [] });
});

test('step: known trigger, inert in the current state -> unchanged, no effects', () => {
  const s0 = { state: 'loading', data: { a: 1 } };
  const r = step(M, s0, 'refresh.click');
  assert.deepEqual(r, { status: s0, effects: [] });
});

test('step: inert trigger still runs a handler (data may change, state may not)', () => {
  const handlers = { 'row.click': (status) => ({ status: { ...status, data: { hit: true } } }) };
  const r = step(M, { state: 'error', data: {} }, 'row.click', {}, handlers);
  assert.deepEqual(r, { status: { state: 'error', data: { hit: true } }, effects: [] });
});

test('step: unknown trigger (no state has it) throws (C2)', () => {
  assert.throws(() => step(M, { state: 'ready', data: {} }, 'nope.click'), /unknown trigger 'nope.click'/);
});

test('step: handler must return { status }', () => {
  assert.throws(() => step(M, { state: 'ready', data: {} }, 'row.click', {}, { 'row.click': () => 42 }), /must return \{ status/);
});

test('step: failed fetch -> error -> retry re-enters loading and re-issues the fetch', () => {
  let s = init(M).status;
  s = step(M, s, 'runs.failed', { error: 'HTTP 500' }).status;
  assert.equal(s.state, 'error');
  const r = step(M, s, 'retry.click');
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, [{ fetch: '/api/runs', ok: 'runs.loaded', err: 'runs.failed' }]);
});

test('machine JSON round-trips through JSON.stringify unchanged (nothing is a function)', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(M)), M);
});
