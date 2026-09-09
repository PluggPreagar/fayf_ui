import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOptions, shuffle, LEVELS } from '../../ui/thw.js';

const data = JSON.parse(readFileSync(new URL('../../content/thw/units.json', import.meta.url)));

// Deterministic "random": a fixed sequence, cycled.
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('content: id, categories, cards with the fields the ladder reads', () => {
  assert.equal(typeof data.id, 'string');
  assert.ok(Array.isArray(data.cards) && data.cards.length >= 2);
  for (const c of data.cards) {
    for (const k of ['id', 'cat', 'type', 'front', 'title', 'detail']) assert.equal(typeof c[k], 'string', `${c.id}: ${k}`);
    assert.ok(['q', 'code'].includes(c.type), `${c.id}: type '${c.type}'`);
    assert.ok(data.categories[c.cat], `${c.id}: category '${c.cat}' has no label`);
  }
});

test('content: every category has >= 4 cards (3 peer distractors) and >= 3 fantasy names', () => {
  for (const cat of Object.keys(data.categories)) {
    assert.ok(data.cards.filter(c => c.cat === cat).length >= 4, `${cat}: needs 4 cards for Stufe B`);
    assert.ok((data.fantasy[cat] ?? []).length >= 3, `${cat}: needs 3 fantasy names for Stufe C`);
  }
});

test('ladder: 4 rungs, points strictly decreasing, last one is the solution', () => {
  assert.equal(LEVELS.length, 4);
  for (let i = 1; i < LEVELS.length; i++) assert.ok(LEVELS[i].points < LEVELS[i - 1].points);
  assert.equal(LEVELS[3].key, 'x');
});

test('shuffle: copy, same members', () => {
  const a = [1, 2, 3, 4];
  const s = shuffle(a, seq(0.9, 0.1, 0.5));
  assert.notEqual(s, a);
  assert.deepEqual(s.slice().sort(), a);
});

test('buildOptions: 4 distinct options, correct title always included', () => {
  for (const card of data.cards) {
    for (const level of [1, 2]) {
      const opts = buildOptions(card, level, data, seq(0.3, 0.7, 0.1, 0.9));
      assert.equal(opts.length, 4, `${card.id} L${level}`);
      assert.equal(new Set(opts).size, 4, `${card.id} L${level}: duplicates`);
      assert.ok(opts.includes(card.title), `${card.id} L${level}: correct missing`);
    }
  }
});

test('buildOptions: Stufe B uses same-category peer titles, Stufe C uses fantasy names', () => {
  const card = data.cards[0];
  const peers = new Set(data.cards.filter(c => c.cat === card.cat && c.id !== card.id).map(c => c.title));
  const fantasy = new Set(data.fantasy[card.cat]);
  const b = buildOptions(card, 1, data, seq(0.2, 0.6)).filter(o => o !== card.title);
  const c = buildOptions(card, 2, data, seq(0.2, 0.6)).filter(o => o !== card.title);
  assert.ok(b.every(o => peers.has(o)), 'B distractors are peers');
  assert.ok(c.every(o => fantasy.has(o)), 'C distractors are fantasy');
});
