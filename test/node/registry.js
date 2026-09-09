import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not .pathname: on Windows .pathname is "/D:/..." (leading
// slash before the drive), globSync silently matched 0 files and every
// registry-driven node test passed vacuously / failed on "non-empty".
export function loadRegistry(root = fileURLToPath(new URL('../../', import.meta.url))) {
  const reg = {};
  for (const [base, prefix] of [['parts', ''], ['screens', 'screens/']])
    // globSync hands back OS separators ("atom\\chip.json" on Windows) --
    // registry ids are always "/"-joined (server.py uses as_posix()), so
    // normalise before slicing or every `extends` lookup misses.
    for (const f of globSync(`${base}/**/*.json`, { cwd: root }).map(p => p.replaceAll('\\', '/')).sort())
      reg[prefix + f.slice(base.length + 1, -5)] = JSON.parse(readFileSync(`${root}/${f}`, 'utf-8'));
  return reg;
}
