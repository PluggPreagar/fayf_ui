// ui/json-diff.js -- generic structural JSON diff, L0/L1 (pure: no DOM, no
// fetch). Ported verbatim from fayf_processor's own frontend/json-diff.js
// (EPIC-15 diff-views D1/D2, that repo's 2026-08-13 decision: flatten both
// sides to dot-paths -- arrays by index, depth-capped -- and compare leaves;
// no text-diff, no vendor lib). Backs ui/records.js's artifact-history diff
// (issue "records: no diff view, no cross-run compare..."), same algorithm
// the OLD code shared with its own graph.js deploy-diff.

// Pure. value -> { "<dot.path>": leafValue, ... }. Depth-capped at 6 (a
// runaway-deep structure collapses to one "(deep)"/"…" entry rather than
// blowing up the row count); an empty object/array gets a placeholder leaf
// ("{}"/"[]") so it still shows up as added/removed, not silently dropped.
export function flattenValue(v, prefix = '', out = {}, depth = 0) {
  if (depth > 6) { out[prefix || '(deep)'] = '…'; return out; }
  if (v === null || typeof v !== 'object') { out[prefix || '(value)'] = v; return out; }
  const keys = Array.isArray(v) ? v.map((_, i) => i) : Object.keys(v).sort();
  if (!keys.length) out[prefix || '(value)'] = Array.isArray(v) ? '[]' : '{}';
  for (const k of keys) flattenValue(v[k], prefix ? `${prefix}.${k}` : String(k), out, depth + 1);
  return out;
}

// Pure. oldV, newV -> [{kind:'added'|'removed'|'changed', path, oldV?, newV?}],
// sorted by path. Leaf equality is JSON.stringify (values are already
// flattened to non-container leaves here, so this is just a cheap deep-equal
// without importing one).
export function diffJson(oldV, newV) {
  const a = flattenValue(oldV), b = flattenValue(newV), rows = [];
  for (const k of Object.keys(a)) {
    if (!(k in b)) rows.push({ kind: 'removed', path: k, oldV: a[k] });
    else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) rows.push({ kind: 'changed', path: k, oldV: a[k], newV: b[k] });
  }
  for (const k of Object.keys(b)) if (!(k in a)) rows.push({ kind: 'added', path: k, newV: b[k] });
  rows.sort((x, y) => (x.path < y.path ? -1 : 1));
  return rows;
}

// Pure. A leaf value -> display text, truncated (matches the OLD renderer's
// own 120-char cap -- a diff row is one line, not a place to dump a huge string).
export function fmtVal(v) {
  const s = String(typeof v === 'string' ? v : JSON.stringify(v));
  return s.length > 120 ? `${s.slice(0, 120)}…` : s;
}
