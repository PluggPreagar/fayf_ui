// ui/tree.js -- tree controller, L9 (C11). Pure: no DOM, no fetch, no timers.
// Composed with ui/machine.js as "the same driver on a sub-status", same
// pattern as ui/table.js: the consumer keeps this tree's status under
// status.data[spec.name], spreads treeHandlers(spec) into its handlers,
// lists `<name>.click` as a self-transition in its machine JSON, and merges
// treeView(spec, t) into its view result.
//
// spec = { name, groupKey, groupOrder, labelKey, rowKey = 'id' }
// t = status.data[spec.name] = { rows, open: {groupValue: bool}, sel }
//   open[group] undefined or true = expanded; explicit false = collapsed
// in: `${name}.click` (group header -> toggle open; item row -> select)
// out: emit `${name}.select` with the row object

function checkSpec(spec) {
  if (!spec || typeof spec.name !== 'string' || !spec.name) throw new Error('tree: spec.name missing');
  if (typeof spec.groupKey !== 'string' || !spec.groupKey) throw new Error(`tree '${spec.name}': spec.groupKey missing`);
  if (!Array.isArray(spec.groupOrder)) throw new Error(`tree '${spec.name}': spec.groupOrder missing`);
  if (typeof spec.labelKey !== 'string' || !spec.labelKey) throw new Error(`tree '${spec.name}': spec.labelKey missing`);
  return spec;
}

// Pure. Non-empty groups, `groupOrder` order first, then any group not
// listed there (defensive, shouldn't happen in practice) alphabetically.
function groupsOf(rows, groupKey, groupOrder) {
  const map = new Map();
  for (const row of rows) {
    const g = row[groupKey];
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(row);
  }
  const known = groupOrder.filter(g => map.has(g));
  const extra = [...map.keys()].filter(g => !groupOrder.includes(g)).sort((a, b) => String(a).localeCompare(String(b)));
  return [...known, ...extra].map(group => ({ group, rows: map.get(group) }));
}

// Pure. The sub-status the consumer stores under status.data[spec.name].
export function treeInit(spec, rows = []) {
  checkSpec(spec);
  return { rows, open: {}, sel: null };
}

// Pure. Handlers keyed by trigger, to spread into the consumer's handlers.
// They read/write status.data[spec.name] only and return new objects.
export function treeHandlers(spec) {
  const { name } = checkSpec(spec);
  const rowKey = spec.rowKey ?? 'id';
  const groupPrefix = `${name}-group-`, itemPrefix = `${name}-item-`;
  const get = (s) => {
    const t = s.data && s.data[name];
    if (!t) throw new Error(`tree '${name}': status.data.${name} missing (treeInit)`);
    return t;
  };
  const put = (s, t) => ({ ...s, data: { ...s.data, [name]: t } });
  return {
    [`${name}.click`]: (s, p) => {
      const t = get(s);
      for (const n of (p && p.path) || []) {
        if (n.startsWith(groupPrefix)) {
          const group = n.slice(groupPrefix.length);
          const cur = t.open[group] !== false;   // undefined or true = currently expanded
          return { status: put(s, { ...t, open: { ...t.open, [group]: !cur } }) };
        }
        if (n.startsWith(itemPrefix)) {
          const key = n.slice(itemPrefix.length);
          const row = t.rows.find(r => String(r[rowKey]) === key);
          if (!row) return { status: s };
          return { status: put(s, { ...t, sel: row[rowKey] }), effects: [{ emit: `${name}.select`, payload: row }] };
        }
      }
      return { status: s };
    },
  };
}

// Pure. Patches to merge into the consumer's view result.
export function treeView(spec, t) {
  const { name, groupKey, groupOrder, labelKey } = checkSpec(spec);
  const rowKey = spec.rowKey ?? 'id';
  const groups = groupsOf(t.rows, groupKey, groupOrder);
  const isOpen = (group) => t.open[group] !== false;

  const content = [];
  for (const { group, rows } of groups) {
    const glyph = isOpen(group) ? '▾' : '▸';
    content.push({ name: `${name}-group-${group}`, box: 'row, mid, gap:1, pad:1, hug, bare', content: `${glyph} ${group} (${rows.length})` });
    if (isOpen(group)) for (const row of rows) {
      content.push({ name: `${name}-item-${row[rowKey]}`, box: 'row, mid, gap:1, pad:3, hug, bare', content: String(row[labelKey] ?? '') });
    }
  }

  const patches = { [name]: { content, state: '' } };
  for (const { group } of groups) patches[`${name}-group-${group}`] = { state: 'actionable' };
  for (const { group, rows } of groups) {
    if (!isOpen(group)) continue;
    for (const row of rows) {
      const k = row[rowKey];
      patches[`${name}-item-${k}`] = { state: 'actionable' + (t.sel != null && String(k) === String(t.sel) ? ', selected' : '') };
    }
  }
  return patches;
}
