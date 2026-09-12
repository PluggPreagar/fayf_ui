// ui/browse.js -- files explorer controller, L9 (C11). machines/browse.json
// is the machine; handlers + view are pure; mountBrowse only hands the
// already-rendered screens/browse element to ui/machine.js.
//
// One filetree sub-controller (ui/filetree.js) rides on status.data.tree --
// same driver, own slice, talks via triggers + emit. Ground truth reference
// (behaviour only, not code -- it's ui-kit/DOM):
// fayf_processor/frontend/browse.js -- a lazy, N-level directory tree over
// mounts + a detail pane (JSON pretty-printed, everything else raw).
//
// Real edit + Save, 2026-09-12: a genuine, tested backend endpoint
// (backend/api/browse.py's write_file, PATCH /api/browse/{mount}/file,
// if_match optimistic concurrency) already existed -- the OLD ui-kit
// frontend used it (frontend/api.js's saveBrowseFile), the migration to
// this repo just never wired it up. detail-body is now a real
// `field:"textarea"` (detailEditor below), not N per-line box-model rows;
// no CSS white-space workaround needed anymore, no line cap either (a real
// textarea scrolls arbitrarily large content natively -- those were a
// per-line-row rendering's own limitations).
//
// Fixture path convention (for the sibling fayf_processor agent wiring the
// real API): a filetree node's `path` is `<mount>` for a mount root,
// `<mount>/<sub/path...>` nested -- the real API's `mount` + `path` params
// concatenated with one '/'. FIXTURE_URLS.level/file append '.json' to that
// same string, prefixed `/content/browse/level/` or `/content/browse/file/`
// -- e.g. node.path `runs/run-1` -> `/content/browse/level/runs/run-1.json`
// or `/content/browse/file/runs/run-1/result.json.json` (the trailing
// `.json.json` looks odd but is exactly this repo's existing convention:
// fixtures are always a `.json` file, whatever the real file's own
// extension -- same as content/issues/<id>.json). A consumer wanting the
// real two-part `/api/browse/{mount}/tree?path=` / `/api/browse/{mount}/file?path=`
// calls `splitMountPath` (below) on a filetree path the same way.
//
// status.data = { tree: filetreeStatus, detail: null | fileResponse,
//                  detailLoading, error, editText, saveMsg }
//   `tree.sel` (inside the filetree sub-status) is the selected file's path
//   -- used for detail-title, since the raw file response has no path field
//   of its own ({ format, content, hash, writable }).
import browseMachine from '../machines/browse.json' with { type: 'json' };
import { mountMachine } from './machine.js';
import { filetreeInit, filetreeHandlers, filetreeView, setChildren, setError } from './filetree.js';

export { browseMachine };

export const TREE = { name: 'tree' };
// `saveFile` builds a PATCH {url, init} for `Api.saveBrowseFile`'s real shape
// (backend/api/browse.py's write_file: {path, content, if_match} body,
// {hash} on 200, 409 on a stale if_match). `null` here (this repo's own
// fixture demo has no writable backend) means Save mutates status.data
// locally instead of firing a fetch -- same "no urls -> local-optimistic"
// convention ui/issues.js's status changes already established.
export const FIXTURE_URLS = { level: (path) => `/content/browse/level/${path}.json`, file: (path) => `/content/browse/file/${path}.json`, saveFile: null };

const NAV = ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'browse', 'query', 'annotate', 'profile'];
const NODE_PREFIX = `${TREE.name}-node-`;

// Pure. status.data at mount: nothing loaded, tree empty (no mounts yet).
export function initialData() {
  return { [TREE.name]: filetreeInit(TREE, []), detail: null, detailLoading: false, error: null,
    editText: '', saveMsg: '' };
}

const withData = (s, patch) => ({ ...s, data: { ...s.data, ...patch } });
const asList = (p) => Array.isArray(p) ? p : [];
const reset = (s) => ({ status: withData(s, { error: null }) });

// Pure. A filetree node path is `<mount>` or `<mount>/<sub/path...>` (this
// file's own header comment) -- the real API wants those as two separate
// params, split on the FIRST '/'.
export function splitMountPath(path) {
  const i = path.indexOf('/');
  return i < 0 ? [path, ''] : [path.slice(0, i), path.slice(i + 1)];
}

// Same path-walk idiom table.js/tree.js's own handlers use: the clicked
// element's data-name chain carries the node's own name, once decoded.
function clickedNodePath(p) {
  for (const n of (p && p.path) || []) if (n.startsWith(NODE_PREFIX)) return decodeURIComponent(n.slice(NODE_PREFIX.length));
  return null;
}
function findNode(nodes, path) {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (n.children) { const f = findNode(n.children, path); if (f) return f; }
  }
  return null;
}

// filetree handlers, wrapped: filetreeHandlers' own click keeps its pure
// dir-toggle / file-select behaviour (and its `${name}.select` emit); this
// wrapper ALSO starts the async work a pure sub-controller can't --
//   file clicked  -> fetch its content
//   dir clicked, now open, children still null, nothing else pending
//                  -> set pendingPath, fetch its level
// Mirrors ui/issues.js's `selectingMaster` wrapping `treeHandlers`.
function selectingTree(urls) {
  const h = filetreeHandlers(TREE);
  const click = h[`${TREE.name}.click`];
  return {
    ...h,
    [`${TREE.name}.click`]: (s, p) => {
      const r = click(s, p);
      const selected = (r.effects || []).find(x => x.emit === `${TREE.name}.select`);
      if (selected) {
        const next = withData(r.status, { detail: null, detailLoading: true });
        return { status: next, effects: [...r.effects, { fetch: urls.file(selected.payload.path), ok: 'file.loaded', err: 'file.failed' }] };
      }
      const path = clickedNodePath(p);
      if (path == null) return r;
      const t = r.status.data[TREE.name];
      const node = findNode(t.nodes, path);
      if (node && node.kind === 'dir' && node.open && node.children === null && t.pendingPath == null) {
        const next = withData(r.status, { [TREE.name]: { ...t, pendingPath: path } });
        return { status: next, effects: [...(r.effects || []), { fetch: urls.level(path), ok: 'level.loaded', err: 'level.failed' }] };
      }
      return r;
    },
  };
}

export function makeHandlers(urls = FIXTURE_URLS) {
  return {
    'mounts.loaded': (s, p) => ({ status: withData(s, { [TREE.name]: filetreeInit(TREE, asList(p)) }) }),
    'mounts.failed': (s, p) => ({ status: withData(s, { error: p && p.error }) }),
    ...selectingTree(urls),
    'level.loaded': (s, p) => {
      const t = s.data[TREE.name];
      const pendingPath = t.pendingPath;
      const entries = (p && p.entries) || [];
      const mapped = entries.map(e => ({ name: e.name, path: `${pendingPath}/${e.name}`, kind: e.type === 'dir' ? 'dir' : 'file' }));
      const t2 = setChildren(t, pendingPath, mapped);
      return { status: withData(s, { [TREE.name]: { ...t2, pendingPath: null } }) };
    },
    'level.failed': (s, p) => {
      const t = s.data[TREE.name];
      const pendingPath = t.pendingPath;
      const t2 = setError(t, pendingPath, (p && p.error) || 'failed to load');
      return { status: withData(s, { [TREE.name]: { ...t2, pendingPath: null } }) };
    },
    'file.loaded': (s, p) => ({ status: withData(s, { detail: p, detailLoading: false, editText: detailBody(p), saveMsg: '' }) }),
    'file.failed': (s, p) => ({ status: withData(s, { detailLoading: false, error: p && p.error }) }),
    'detail-editor.input': (s, p) => ({ status: withData(s, { editText: (p && p.value) ?? '' }) }),
    // Save: writable-guarded (a read-only mount's Save button is disabled in
    // view(), but a stale/replayed trigger is still checked here, never
    // trusted from the DOM alone). No `urls.saveFile` (this repo's own
    // fixture demo, no writable backend) -> local-optimistic, same
    // convention ui/issues.js's status changes use.
    'btn-save.click': (s) => {
      const d = s.data;
      if (!d.detail || !d.detail.writable) return { status: s, effects: [] };
      if (!urls.saveFile) {
        return { status: withData(s, { detail: { ...d.detail, hash: `local-${Date.now()}` }, saveMsg: 'Saved (local)' }) };
      }
      const [mount, relPath] = splitMountPath(d[TREE.name].sel);
      const { url, init } = urls.saveFile(mount, relPath, d.editText, d.detail.hash);
      return { status: withData(s, { saveMsg: 'Saving…' }), effects: [{ fetch: url, init, ok: 'save.ok', err: 'save.err' }] };
    },
    'save.ok': (s, p) => ({ status: withData(s, { detail: { ...s.data.detail, hash: p && p.hash }, saveMsg: 'Saved' }) }),
    'save.err': (s, p) => ({ status: withData(s, { saveMsg: `Save failed: ${(p && p.body && p.body.error) || (p && p.error) || 'error'}` }) }),
    'btn-refresh.click': reset,
    'btn-retry.click': reset,
    'btn-theme.click': (s) => ({ status: s, effects: [{ emit: 'theme.toggle' }] }),
    ...Object.fromEntries(NAV.map(to => [`nav-${to}.click`, (s) => ({ status: s, effects: [{ emit: 'nav.go', payload: { to } }] })])),
    'brand.click': (s) => ({ status: s, effects: [{ emit: 'nav.go', payload: { to: 'dashboard' } }] }),
  };
}

export const handlers = makeHandlers(FIXTURE_URLS);   // this repo's own default export

const RETRY = { name: 'btn-retry', box: 'row, mid, packed, pad:2, solid, rounded', content: 'Retry' };

// Pure. `detail` = { format, content, hash, writable } -> the editable text
// for detail-body (JSON pretty-printed, everything else passed through
// as-is). A real `field:"textarea"` (below) renders/wraps/scrolls this
// natively -- no line-splitting, no NBSP-indent workaround, no length cap
// needed anymore (those were a per-line-box rendering's own limitations,
// gone now that this is one real form field, not N box-model rows).
export function detailBody(detail) {
  let text = detail.content ?? '';
  if (detail.format === 'json') {
    try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* not valid JSON -- fall back to the raw string */ }
  }
  return String(text);
}

// Pure. One real, editable field wrapping `text` -- the content array
// detail-body's view() patch nests it into (same "field only ever comes
// from a view() patch" pattern query.js's `fql` field established). Shared
// with ui/records.js (same detail panel shape, different save wiring).
export function detailEditor(text) {
  return [{ name: 'detail-editor', box: 'fill, pad:2, solid, rounded', field: 'textarea', content: text }];
}

// Pure. status -> { name: patch }. Object.entries order = paint order:
// content-level slots first, tree row patches last.
export function view(s) {
  const d = s.data;
  const t = d[TREE.name];
  const loading = s.state === 'loading';
  const mountCount = t ? t.nodes.length : 0;
  const selPath = t && t.sel != null ? t.sel : null;
  const writable = !!(d.detail && d.detail.writable);
  const patches = {
    'crumb-page': 'Browse',
    'status-text': loading ? 'loading…' : s.state === 'error' ? `failed: ${d.error}` : `${mountCount} mounts`,
    'detail-title': selPath || 'No file open',
    'detail-body': { content: d.detail ? detailEditor(d.editText) : (d.detailLoading ? 'Loading…' : 'Select a file') },
    'btn-save': { state: writable ? 'actionable' : 'disabled' },
    'save-msg': d.saveMsg || '',
  };
  if (loading) {
    patches[TREE.name] = { content: [], state: 'loading' };
  } else if (s.state === 'error') {
    patches[TREE.name] = { content: [RETRY], state: '' };
    patches['btn-retry'] = { state: 'error' };
  } else {
    const tv = filetreeView(TREE, t);
    patches[TREE.name] = tv[TREE.name];
    Object.assign(patches, tv);
  }
  return patches;
}

// Browser. `root` = the already-rendered screens/browse element.
export function mountBrowse(root, reg, opts = {}) {
  return mountMachine(root, root, browseMachine, makeHandlers(opts.urls || FIXTURE_URLS), { reg, view, data: initialData(), ...opts });
}
