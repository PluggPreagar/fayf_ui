// ui/filetree.js -- files-explorer tree controller, L9 (C11). Pure: no DOM,
// no fetch, no timers. Composed with ui/machine.js as "the same driver on a
// sub-status", same pattern as ui/table.js/ui/tree.js: the consumer keeps
// this tree's status under status.data[spec.name], spreads
// filetreeHandlers(spec) into its handlers, lists `<name>.click` as a
// self-transition in its machine JSON, and merges filetreeView(spec, t) into
// its view result. Genuinely different shape from ui/tree.js (a flat GROUPED
// list built for issues.js) -- this is a recursive, N-level, lazily-loaded
// directory tree. Do not reuse/modify ui/tree.js for this.
//
// spec = { name }
// t = status.data[spec.name] = { nodes: [node, ...], sel: null | path, pendingPath: null | path }
//   node = { name, path, kind: 'dir' | 'file', open: bool, loading: bool,
//            error: null | string, children: null | [node, ...] }
//     children === null  -> not yet fetched (dir only, meaningless on a file)
//     children === []    -> fetched, this dir is empty
//   `pendingPath`: this controller is pure (no fetch) -- a consumer wraps its
//   click handler to ALSO start a fetch when a dir is opened for the first
//   time (same pattern as ui/issues.js's `selectingMaster` wrapping
//   `treeHandlers`). Only ONE directory can be loading at a time in this v1
//   (`pendingPath` guards it) -- a click on a second, different,
//   not-yet-loaded dir while one is already pending still toggles its `open`
//   flag (so the user sees it "opened" with nothing in it yet) but does NOT
//   start a second fetch; clicking it again once the first finishes retries.
//   Deliberate v1 limitation: directory listings are typically fast; true
//   concurrent-fetch tracking would need the fetch response to echo back
//   which path it was for, which the real API doesn't do -- not worth
//   solving here.
// in: `${name}.click` (a dir node -> toggle `open`, pure, no fetch here; a
//       file node -> set `sel`, emit `${name}.select` with the node)
// out: emit `${name}.select` with the clicked FILE node

function checkSpec(spec) {
  if (!spec || typeof spec.name !== 'string' || !spec.name) throw new Error('filetree: spec.name missing');
  return spec;
}

// Pure. Find a node anywhere in the (possibly nested) tree by its path.
function findNode(nodes, path) {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (n.children) { const f = findNode(n.children, path); if (f) return f; }
  }
  return null;
}

// Pure. New nodes array with the node at `path` replaced by `fn(node)`;
// everything else structurally shared where unchanged, input untouched.
function mapNode(nodes, path, fn) {
  return nodes.map(n => {
    if (n.path === path) return fn(n);
    if (n.children) return { ...n, children: mapNode(n.children, path, fn) };
    return n;
  });
}

// Pure. The sub-status the consumer stores under status.data[spec.name].
// mounts = [{ name, label, write }, ...] -> one root dir node per mount.
export function filetreeInit(spec, mounts = []) {
  checkSpec(spec);
  const nodes = mounts.map(m => ({
    name: m.label || m.name, path: m.name, kind: 'dir',
    open: false, loading: false, error: null, children: null,
  }));
  return { nodes, sel: null, pendingPath: null };
}

// Pure. Handlers keyed by trigger, to spread into the consumer's handlers.
// They read/write status.data[spec.name] only and return new objects. The
// FETCH DECISION is never this controller's job (see header) -- a dir click
// only ever toggles `open`.
export function filetreeHandlers(spec) {
  const { name } = checkSpec(spec);
  const prefix = `${name}-node-`;
  const get = (s) => {
    const t = s.data && s.data[name];
    if (!t) throw new Error(`filetree '${name}': status.data.${name} missing (filetreeInit)`);
    return t;
  };
  const put = (s, t) => ({ ...s, data: { ...s.data, [name]: t } });
  return {
    [`${name}.click`]: (s, p) => {
      const t = get(s);
      for (const n of (p && p.path) || []) {
        if (!n.startsWith(prefix)) continue;
        const path = decodeURIComponent(n.slice(prefix.length));
        const node = findNode(t.nodes, path);
        if (!node) return { status: s };
        if (node.kind === 'dir') {
          return { status: put(s, { ...t, nodes: mapNode(t.nodes, path, x => ({ ...x, open: !x.open })) }) };
        }
        return { status: put(s, { ...t, sel: path }), effects: [{ emit: `${name}.select`, payload: node }] };
      }
      return { status: s };
    },
  };
}

// Pure. Patches to merge into the consumer's view result. ONE content array
// under the single named slot `spec.name`, recursively flattened -- a closed
// dir's children are simply not walked, no nested DOM structure needed.
export function filetreeView(spec, t) {
  const { name } = checkSpec(spec);
  const rows = [];
  const patches = {};
  const glyphOf = (node) => node.kind === 'file' ? '· ' : node.loading ? '… ' : node.open ? '▾ ' : '▸ ';
  const walk = (nodes, depth) => {
    for (const node of nodes) {
      const key = `${name}-node-${encodeURIComponent(node.path)}`;
      rows.push({
        name: key, box: 'row, mid, gap:1, clip, pad:1, bare, fixed, h:22',
        content: '  '.repeat(depth) + glyphOf(node) + node.name,
      });
      patches[key] = { state: 'actionable' + (node.kind === 'file' && t.sel != null && String(t.sel) === String(node.path) ? ', selected' : '') };
      if (node.kind === 'dir' && node.open && node.children) walk(node.children, depth + 1);
    }
  };
  walk(t.nodes, 0);
  return { [name]: { content: rows, state: '' }, ...patches };
}

// Pure helpers for the consumer's wrapper to splice an async result into the
// tree (walks t.nodes recursively to find the node by `path`; returns a NEW
// `t`, input untouched -- same purity discipline as tableInit/tableHandlers).
// children = [{ name, path, kind }, ...] already mapped into filetree's node
// shape by the CALLER (the raw API/fixture response shape is the consumer's
// problem, not this sub-controller's -- same "pure data in, pure data out"
// boundary table.js/tree.js keep).
export function setChildren(t, path, children) {
  const mapped = children.map(c => ({ name: c.name, path: c.path, kind: c.kind, open: false, loading: false, error: null, children: null }));
  return { ...t, nodes: mapNode(t.nodes, path, n => ({ ...n, children: mapped, loading: false })) };
}

export function setLoading(t, path, loading) {
  return { ...t, nodes: mapNode(t.nodes, path, n => ({ ...n, loading })) };
}

export function setError(t, path, message) {
  return { ...t, nodes: mapNode(t.nodes, path, n => ({ ...n, error: message, loading: false })) };
}
