import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { init, step, triggers, validateMachine } from '../../ui/machine.js';
import { graphMachine, handlers, view, initialData } from '../../ui/graph.js';

// The graph (Embed shell) flow as JSON in, JSON out (C11): machines/graph.json
// + pure handlers + pure view. No DOM. The simplest S6 machine yet -- ONE
// state (`ready`), no fetch at all: nav + theme only. The real graph canvas
// is Embed (out of scope, see ui/graph.js's header) -- there is barely
// anything for this machine to do.
const M = graphMachine;
const click = (name, ...path) => ({ name, event: 'click', target: path[0] ?? name, path: [...path, name, 'content', 'body', 'root'] });
const NAV = ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'settings'];

test('machines/graph.json validates; JSON round-trip identical; one state, no enter effects', () => {
  assert.equal(validateMachine(M), M);
  assert.deepEqual(JSON.parse(JSON.stringify(M)), M);
  assert.deepEqual(JSON.parse(readFileSync(new URL('../../machines/graph.json', import.meta.url), 'utf-8')), M);
  assert.equal(M.initial, 'ready');
  assert.equal(Object.keys(M.states).length, 1, 'one state only -- no loading/error split, no fetch at all');
  assert.equal(M.states.ready.enter, undefined, 'no enter effects -- immediately ready');
});

test('init -> ready immediately, zero effects (no fetch); initialData is empty', () => {
  const { status, effects } = init(M, initialData());
  assert.equal(status.state, 'ready');
  assert.deepEqual(effects, []);
  assert.deepEqual(status.data, {});
  assert.deepEqual(initialData(), {});
});

test('view: crumb-page "Graph" only -- nothing else to track', () => {
  const v = view(init(M, initialData()).status);
  assert.deepEqual(v, { 'crumb-page': 'Graph' });
});

test('nav click emits nav.go with the target; theme click emits theme.toggle; both stay ready', () => {
  const s = init(M, initialData()).status;
  for (const to of NAV) {
    const r = step(M, s, `nav-${to}.click`, click(`nav-${to}`), handlers);
    assert.equal(r.status.state, 'ready');
    assert.deepEqual(r.effects, [{ emit: 'nav.go', payload: { to } }]);
    assert.deepEqual(r.status, s, 'no data change -- handler is a pure pass-through');
  }
  const r = step(M, s, 'btn-theme.click', click('btn-theme'), handlers);
  assert.deepEqual(r.effects, [{ emit: 'theme.toggle' }]);
  assert.equal(r.status.state, 'ready');
});

test('unknown trigger throws (C2); handlers keyed for every machine trigger', () => {
  const s = init(M, initialData()).status;
  assert.throws(() => step(M, s, 'btn-run.click', click('btn-run'), handlers), /unknown trigger/);
  for (const k of triggers(M)) assert.equal(typeof handlers[k], 'function', k);
  assert.equal(triggers(M).size, NAV.length + 1, 'nav-* (6) + btn-theme -- exactly, no fetch triggers');
});
