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
  return dials;
}

function tokenDial(tok, primitive) {
  const enums = vocabulary[primitive];
  if (!enums) throw new Error(`unknown primitive '${primitive}'`);
  for (const [dial, values] of Object.entries(enums))
    if (values.includes(tok)) return [dial, tok];
  const scale = primitive === 'box' && /^(pad|gap)(\d+)$/.exec(tok);
  if (scale) return [scale[1], Number(scale[2])];
  const kv = /^([a-z-]+):(-?\d*\.?\d+)$/.exec(tok);
  if (kv && vocabulary[`${primitive}_numeric`].includes(kv[1])) return [kv[1], Number(kv[2])];
  throw new Error(`unknown token '${tok}' for ${primitive}`);
}

export function print(dials, primitive = 'box') {
  const out = [];
  for (const dial of Object.keys(vocabulary[primitive]))
    if (dial in dials) out.push(dials[dial]);
  if (primitive === 'box')
    for (const dial of ['pad', 'gap'])
      if (dial in dials) out.push(`${dial}${dials[dial]}`);
  for (const dial of vocabulary[`${primitive}_numeric`])
    if (dial in dials) out.push(`${dial}:${dials[dial]}`);
  return out.join(', ');
}
