import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

export function loadRegistry(root = new URL('../../', import.meta.url).pathname) {
  const reg = {};
  for (const [base, prefix] of [['parts', ''], ['screens', 'screens/']])
    for (const f of globSync(`${base}/**/*.json`, { cwd: root }).sort())
      reg[prefix + f.slice(base.length + 1, -5)] = JSON.parse(readFileSync(`${root}/${f}`, 'utf-8'));
  return reg;
}
