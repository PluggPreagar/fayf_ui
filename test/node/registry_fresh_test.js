import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { loadRegistry } from './registry.js';

// registry.json is a committed, generated file (`just build`) -- the static
// twin of /registry.json for consumers vendoring a pinned snapshot of this
// repo. Generated files rot silently; this makes "you forgot `just build`"
// a red test instead of a downstream 'unknown id' at render time.
const file = new URL('../../registry.json', import.meta.url);

test('registry.json exists (run `just build`)', () => {
  assert.ok(existsSync(file), 'registry.json missing -- run `just build`');
});

test('registry.json matches parts/ + screens/ exactly (run `just build` when this fails)', () => {
  const committed = JSON.parse(readFileSync(file, 'utf-8'));
  const live = loadRegistry();
  assert.deepEqual(Object.keys(committed).sort(), Object.keys(live).sort(), 'id set differs');
  for (const id of Object.keys(live)) assert.deepEqual(committed[id], live[id], `${id} differs`);
});
