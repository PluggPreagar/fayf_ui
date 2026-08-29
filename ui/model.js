// ui/model.js -- L0 parse/print, L1 resolve/diff. Pure: no DOM, no fs.
import vocabulary from './vocabulary.json' with { type: 'json' };

export function parse(tokens, primitive = 'box') {
  const list = Array.isArray(tokens) ? tokens
    : String(tokens).split(',').map(t => t.trim()).filter(Boolean);
  const dials = {};
  for (const tok of list) {
    const [dial, value] = tokenDial(tok, primitive);
    if (dial in dials) throw new Error(`duplicate dial '${dial}': '${tok}' vs '${dials[dial]}'`);
    dials[dial] = value;
  }
  if (primitive === 'box' && (dials['place-h'] != null || dials['place-v'] != null)) {
    const legal = ['docked', 'floating', 'anchored', 'sticky'];
    if (!legal.includes(dials.position)) {
      const tok = dials['place-h'] ?? dials['place-v'];
      throw new Error(`place token '${tok}' requires position docked|floating|anchored|sticky`);
    }
  }
  return dials;
}

function tokenDial(tok, primitive) {
  const enums = vocabulary[primitive];
  if (!enums) throw new Error(`unknown primitive '${primitive}'`);
  for (const [dial, values] of Object.entries(enums))
    if (values.includes(tok)) return [dial, tok];
  const kv = /^([a-z-]+):(-?\d*\.?\d+)(\+{1,2})?$/.exec(tok);
  if (kv && vocabulary[`${primitive}_numeric`].includes(kv[1])) {
    if (kv[3] && kv[1] !== 'gap') throw new Error(`growth suffix only valid on 'gap', got '${tok}'`);
    return [kv[1], kv[3] ? `${kv[2]}${kv[3]}` : Number(kv[2])];
  }
  throw new Error(`unknown token '${tok}' for ${primitive}`);
}

export function print(dials, primitive = 'box') {
  const out = [];
  for (const dial of Object.keys(vocabulary[primitive]))
    if (dial in dials) out.push(dials[dial]);
  for (const dial of vocabulary[`${primitive}_numeric`])
    if (dial in dials) out.push(`${dial}:${dials[dial]}`);
  return out.join(', ');
}

const toDials = (v, prim) => typeof v === 'string' ? parse(v, prim) : { ...v };

function pickConditional(candidates, env) {
  const known = new Set(vocabulary.condition);
  const scored = candidates.map(c => {
    const cond = c.condition ?? [];
    for (const tok of cond) if (!known.has(tok)) throw new Error(`unknown condition token '${tok}'`);
    return { c, cond, matches: cond.every(tok => env.includes(tok)) };
  }).filter(s => s.matches);
  if (!scored.length) throw new Error(`no candidate matches env [${env.join(',')}]`);
  const maxScore = Math.max(...scored.map(s => s.cond.length));
  const winners = scored.filter(s => s.cond.length === maxScore);
  if (winners.length > 1)
    throw new Error(`ambiguous conditional: ${winners.length} candidates tie at specificity ${maxScore} for env [${env.join(',')}]`);
  return winners[0].c;
}

export function resolve(doc, registry = {}, env = [], seen = new Set()) {
  if (typeof doc === 'string') doc = { box: 'hug', content: doc };
  if (doc.conditional) {
    const winner = pickConditional(doc.conditional, env);
    const merged = { ...doc, ...winner };
    delete merged.conditional;
    delete merged.condition;
    if (doc.name != null) merged.name = doc.name;
    doc = merged;
  }
  let node = { ...doc };
  const link = node.extends;
  if (link) {
    if (seen.has(link)) throw new Error(`cycle: ${[...seen, link].join(' -> ')}`);
    const base = registry[link];
    if (!base) throw new Error(`unknown id '${link}'`);
    const parent = resolve(base, registry, env, new Set([...seen, link]));
    node = mergeNode(parent, node);
  }
  delete node.extends;
  for (const prim of ['box', 'path'])
    if (node[prim] != null) node[prim] = toDials(node[prim], prim);
  if (node.content != null && node.children)
    throw new Error(`content xor children violated${node.name ? ` at '${node.name}'` : ''}`);
  if (node.children)
    node.children = node.children.map(c => resolve(c, registry, env, seen));
  return node;
}

function mergeNode(parent, child) {
  const out = { ...parent, ...child };
  for (const prim of ['box', 'path'])
    if (parent[prim] != null && child[prim] != null)
      out[prim] = { ...toDials(parent[prim], prim), ...toDials(child[prim], prim) };
  if (child.content != null && !child.children) delete out.children;
  if (child.children && parent.content != null && child.content == null) delete out.content;
  return out;
}

// Decodes a growth-suffixed gap dial value ('2+', '2++') into {base, allow},
// both in gap units (pre-x4 render scaling). null for a plain fixed gap.
export function parseGapGrowth(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d+)(\+{1,2})$/.exec(value);
  if (!m) throw new Error(`invalid gap growth token '${value}'`);
  return { base: Number(m[1]), allow: vocabulary.grow_class[m[2]] };
}

// L1 -- pure excess -> gap distribution. slots: [{base, allow}], same unit as excess.
// Growth is capped per slot at `allow`; unconsumed excess returns as `leftover`
// for the caller (V1 posture: margins absorb whatever gaps don't).
export function distributeGrowth(slots, excess) {
  if (excess <= 0) return { values: slots.map(s => s.base), leftover: excess };
  const totalAllow = slots.reduce((sum, s) => sum + s.allow, 0);
  if (totalAllow === 0) return { values: slots.map(s => s.base), leftover: excess };
  let consumed = 0;
  const values = slots.map(s => {
    const grown = Math.min(excess * s.allow / totalAllow, s.allow);
    consumed += grown;
    return s.base + grown;
  });
  return { values, leftover: excess - consumed };
}

// L1 -- pure excess (px) -> space-class condition token. Thresholds
// registered in ui/vocabulary.json (C8), not code. Always returns exactly
// one of 'compact'/'cozy'/'spacious' (never empty), so a doc can condition
// on any of the three explicitly.
//
// `spacious_min` (96) carries real evidence: examples/too-much-space-
// sketch.html's panel B measures a 460px-tall island container leaving
// ~185px leftover after elastic-gap growth caps out, comfortably above
// this threshold -- exactly the case mechanism 2 (spacious variants) was
// designed for. `compact_max` (48) does not have independent evidence of
// its own yet -- it's the simple midpoint of the 0..96 "not yet spacious"
// band, not a separately measured cutover. Revisit both once more real
// screens have been measured, per the same evidence discipline as above.
export function classify(excess) {
  if (excess >= vocabulary.space_class.spacious_min) return ['spacious'];
  if (excess >= vocabulary.space_class.compact_max) return ['cozy'];
  return ['compact'];
}

export function diff(a, b, at = '') {
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || typeof a !== typeof b) {
    return JSON.stringify(a) !== JSON.stringify(b)
      ? [`${at}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`] : [];
  }
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
    out.push(...diff(a[k], b[k], at ? `${at}.${k}` : k));
  return out;
}
