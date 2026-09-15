import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { init, step, validateMachine } from '../../ui/machine.js';
import { browseMachine, makeHandlers, handlers, view, initialData, TREE, detailBody, detailEditor, splitMountPath, groupArtefactEntries } from '../../ui/browse.js';
import { filetreeView } from '../../ui/filetree.js';

// The browse (files explorer) flow as JSON in, JSON out (C11): machines/browse.json
// + pure handlers + pure view, on the shipped fixtures. No DOM.
const fixture = (rel) => JSON.parse(readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf-8'));
const MOUNTS_FX = fixture('content/browse/mounts.json');
const RUNS_LEVEL = fixture('content/browse/level/runs.json');
const RUN1_LEVEL = fixture('content/browse/level/runs/run-2026-09-01.json');
const LOGS_LEVEL = fixture('content/browse/level/runs/run-2026-09-01/logs.json');
const RESULT_FILE = fixture('content/browse/file/runs/run-2026-09-01/result.json.json');
const BACKEND_LEVEL = fixture('content/browse/level/backend.json');
const CONFIG_LEVEL = fixture('content/browse/level/backend/config.json');
const SETTINGS_FILE = fixture('content/browse/file/backend/config/settings.yaml.json');
const RECORDS_LEVEL = fixture('content/browse/level/runs/run-2026-09-01/records.json');
const NLP_RECORD_FILE = fixture('content/browse/file/runs/run-2026-09-01/records/nlp-parse_1a2b3c4d5e6f7890.json.json');
const M = browseMachine;
const MOUNTS_FETCH = { fetch: '/content/browse/mounts.json', ok: 'mounts.loaded', err: 'mounts.failed' };
const go = (s, trigger, payload) => step(M, s, trigger, payload, handlers);
const start = () => init(M, initialData());
const loaded = () => go(start().status, 'mounts.loaded', MOUNTS_FX).status;
const nodeName = (path) => `tree-node-${encodeURIComponent(path)}`;
const click = (path, ...rest) => ({ name: 'tree', event: 'click', target: nodeName(path), path: [nodeName(path), ...rest, 'tree', 'root'] });

test('machines/browse.json validates; JSON round-trip identical', () => {
  assert.equal(validateMachine(M), M);
  assert.deepEqual(JSON.parse(JSON.stringify(M)), M);
  assert.deepEqual(JSON.parse(readFileSync(new URL('../../machines/browse.json', import.meta.url), 'utf-8')), M);
});

test('fixtures: mounts shape, level fixtures have entries', () => {
  for (const m of MOUNTS_FX) assert.deepEqual(Object.keys(m).sort(), ['label', 'name', 'write']);
  assert.ok(RUNS_LEVEL.entries.length >= 2);
  assert.ok(RUN1_LEVEL.entries.some(e => e.type === 'dir'), 'run-2026-09-01 has a nested dir (logs) -- exercises 3-level recursion');
});

test('init -> loading with 1 fetch effect (mounts); tree empty', () => {
  const { status, effects } = start();
  assert.equal(status.state, 'loading');
  assert.deepEqual(effects, [MOUNTS_FETCH]);
  assert.deepEqual(status.data[TREE.name].nodes, []);
  assert.equal(status.data.detail, null);
  assert.equal(status.data.error, null);
  assert.equal(status.data.editText, '');
  assert.equal(status.data.saveMsg, '');
});

test('view in loading: status-text "loading…", tree empty + loading token', () => {
  const v = view(start().status);
  assert.equal(v['status-text'], 'loading…');
  assert.equal(v['crumb-page'], 'Browse');
  assert.equal(v['detail-title'], 'No file open');
  assert.deepEqual(v['detail-body'], { content: 'Select a file' });
  assert.deepEqual(v[TREE.name], { content: [], state: 'loading' });
});

test('mounts.loaded: tree populated with one root per mount, transitions to ready', () => {
  const r = go(start().status, 'mounts.loaded', MOUNTS_FX);
  assert.equal(r.status.state, 'ready');
  assert.deepEqual(r.effects, []);
  assert.equal(r.status.data[TREE.name].nodes.length, MOUNTS_FX.length);
  assert.deepEqual(r.status.data[TREE.name].nodes.map(n => n.path), MOUNTS_FX.map(m => m.name));
});

test('view in ready: status-text "<n> mounts"', () => {
  const v = view(loaded());
  assert.equal(v['status-text'], `${MOUNTS_FX.length} mounts`);
});

test('expanding a mount root: toggles open + issues exactly one level.loaded-bound fetch, sets pendingPath', () => {
  const s0 = loaded();
  const r = go(s0, 'tree.click', click('runs'));
  const t = r.status.data[TREE.name];
  assert.equal(t.nodes.find(n => n.path === 'runs').open, true);
  assert.equal(t.pendingPath, 'runs');
  assert.deepEqual(r.effects, [{ fetch: '/content/browse/level/runs.json', ok: 'level.loaded', err: 'level.failed' }]);
});

test('expanding a SECOND unexpanded dir while the first is pending: toggles open, NO second fetch', () => {
  const s0 = loaded();
  const r1 = go(s0, 'tree.click', click('runs'));
  assert.equal(r1.status.data[TREE.name].pendingPath, 'runs');
  const r2 = go(r1.status, 'tree.click', click('backend'));
  assert.equal(r2.status.data[TREE.name].nodes.find(n => n.path === 'backend').open, true, 'still visibly opened');
  assert.equal(r2.status.data[TREE.name].pendingPath, 'runs', 'pendingPath unchanged -- no 2nd fetch started');
  assert.deepEqual(r2.effects, [], 'no fetch effect for the second click');
});

test('level.loaded splices children at the right node (2+ levels deep) and clears pendingPath', () => {
  let s = go(loaded(), 'tree.click', click('runs')).status;
  s = go(s, 'level.loaded', RUNS_LEVEL).status;
  let t = s.data[TREE.name];
  assert.equal(t.pendingPath, null);
  const run1 = t.nodes.find(n => n.path === 'runs').children.find(n => n.path === 'runs/run-2026-09-01');
  assert.ok(run1, 'entries mapped to runs/<name> paths');
  assert.equal(run1.kind, 'dir');
  assert.equal(run1.children, null, 'not fetched yet');

  // expand it -- level 2
  s = go(s, 'tree.click', click('runs/run-2026-09-01')).status;
  assert.equal(s.data[TREE.name].pendingPath, 'runs/run-2026-09-01');
  s = go(s, 'level.loaded', RUN1_LEVEL).status;
  t = s.data[TREE.name];
  const run1After = t.nodes.find(n => n.path === 'runs').children.find(n => n.path === 'runs/run-2026-09-01');
  const logs = run1After.children.find(n => n.path === 'runs/run-2026-09-01/logs');
  assert.ok(logs, 'level 2 spliced under the level-1 node');
  assert.equal(logs.kind, 'dir');
  assert.equal(t.pendingPath, null);

  // expand it -- level 3
  s = go(s, 'tree.click', click('runs/run-2026-09-01/logs')).status;
  assert.equal(s.data[TREE.name].pendingPath, 'runs/run-2026-09-01/logs');
  s = go(s, 'level.loaded', LOGS_LEVEL).status;
  t = s.data[TREE.name];
  const logsAfter = t.nodes.find(n => n.path === 'runs').children.find(n => n.path === 'runs/run-2026-09-01').children.find(n => n.path === 'runs/run-2026-09-01/logs');
  assert.deepEqual(logsAfter.children.map(n => n.path).sort(), ['runs/run-2026-09-01/logs/stderr.log', 'runs/run-2026-09-01/logs/stdout.log'], 'level 3 -- proves real recursion, not just one level');
});

test('level.failed: sets error on the pending node, clears pendingPath, loading', () => {
  let s = go(loaded(), 'tree.click', click('runs')).status;
  s = go(s, 'level.failed', { error: 'HTTP 500' }).status;
  const t = s.data[TREE.name];
  assert.equal(t.pendingPath, null);
  const runs = t.nodes.find(n => n.path === 'runs');
  assert.equal(runs.error, 'HTTP 500');
  assert.equal(runs.loading, false);
});

test('level.failed: filetreeView surfaces the error inline (not silently invisible)', () => {
  let s = go(loaded(), 'tree.click', click('runs')).status;
  s = go(s, 'level.failed', { error: 'HTTP 500' }).status;
  const v = filetreeView(TREE, s.data[TREE.name]);
  const row = v[TREE.name].content.find(r => r.name === nodeName('runs'));
  assert.ok(row.content.includes('failed: HTTP 500') && row.content.includes('click to retry'), row.content);
});

test('groupArtefactEntries: >=2 shared prefixes group, a lone one does not, non-matching files pass through', () => {
  const entries = [
    { type: 'file', name: 'nlp-parse_1a2b3c4d5e6f7890.json' },
    { type: 'file', name: 'nlp-parse_2b3c4d5e6f789012.json' },
    { type: 'file', name: 'ingest_4d5e6f7890123456.json' },
    { type: 'file', name: 'manifest.json' },
    { type: 'dir', name: 'sub' },
  ];
  const out = groupArtefactEntries(entries);
  assert.equal(out.length, 4, 'nlp-parse group + lone ingest file + manifest.json + sub dir');
  const group = out.find(e => e.kind === 'group');
  assert.equal(group.name, 'nlp-parse');
  assert.deepEqual(group.children.map(c => c.name), ['nlp-parse_1a2b3c4d5e6f7890.json', 'nlp-parse_2b3c4d5e6f789012.json']);
  assert.ok(out.some(e => e.name === 'ingest_4d5e6f7890123456.json' && !e.kind), 'a lone-prefix file stays ungrouped');
  assert.ok(out.some(e => e.name === 'manifest.json'), 'no hash suffix -- never matches, passes through');
  assert.ok(out.some(e => e.name === 'sub' && e.type === 'dir'), 'a real dir is untouched');
});

test('level.loaded: a level with groupable artefact files renders a synthetic, PRE-POPULATED (no extra fetch) group folder', () => {
  let s = go(loaded(), 'tree.click', click('runs')).status;
  s = go(s, 'level.loaded', RUNS_LEVEL).status;
  s = go(s, 'tree.click', click('runs/run-2026-09-01')).status;
  s = go(s, 'level.loaded', RUN1_LEVEL).status;
  s = go(s, 'tree.click', click('runs/run-2026-09-01/records')).status;
  const r = go(s, 'level.loaded', RECORDS_LEVEL);
  const t = r.status.data[TREE.name];
  assert.equal(t.pendingPath, null);
  const records = t.nodes.find(n => n.path === 'runs').children.find(n => n.path === 'runs/run-2026-09-01')
    .children.find(n => n.path === 'runs/run-2026-09-01/records');
  const nlpGroup = records.children.find(n => n.name.startsWith('nlp-parse'));
  assert.equal(nlpGroup.name, 'nlp-parse (3)', 'label carries the member count');
  assert.equal(nlpGroup.kind, 'dir');
  assert.ok(Array.isArray(nlpGroup.children), 'children already populated -- no fetch needed to see them');
  assert.equal(nlpGroup.children.length, 3);
  assert.deepEqual(nlpGroup.children.map(c => c.path).sort(), [
    'runs/run-2026-09-01/records/nlp-parse_1a2b3c4d5e6f7890.json',
    'runs/run-2026-09-01/records/nlp-parse_2b3c4d5e6f789012.json',
    'runs/run-2026-09-01/records/nlp-parse_3c4d5e6f78901234.json',
  ], 'group members keep their REAL path -- only their tree POSITION is synthetic');
  const ingestGroup = records.children.find(n => n.name.startsWith('ingest'));
  assert.equal(ingestGroup.name, 'ingest (2)');
  const manifest = records.children.find(n => n.path === 'runs/run-2026-09-01/records/manifest.json');
  assert.equal(manifest.kind, 'file', 'an ungrouped file stays a plain file leaf');

  // opening the group + clicking a member fetches the member's REAL path, no
  // different from any other file -- the group node's actual `path` is
  // `<base>/<prefix>`, not its display name (which carries the count).
  const groupPath = nlpGroup.path;
  const s2 = go(r.status, 'tree.click', click(groupPath)).status;
  assert.equal(s2.data[TREE.name].nodes.find(n => n.path === 'runs').children.find(n => n.path === 'runs/run-2026-09-01')
    .children.find(n => n.path === 'runs/run-2026-09-01/records').children.find(n => n.path === groupPath).open, true);
  assert.equal(s2.data[TREE.name].pendingPath, null, 'expanding a pre-populated group never starts a fetch');
  const fileClick = go(s2, 'tree.click', click(nlpGroup.children[0].path));
  assert.deepEqual(fileClick.effects, [
    { emit: 'tree.select', payload: nlpGroup.children[0] },
    { fetch: `/content/browse/file/${nlpGroup.children[0].path}.json`, ok: 'file.loaded', err: 'file.failed' },
  ]);
});

test('level.loaded: truncated flag surfaces in status-text; cleared by the next non-truncated level', () => {
  let s = go(loaded(), 'tree.click', click('runs')).status;
  const r1 = go(s, 'level.loaded', { ...RUNS_LEVEL, truncated: true });
  assert.equal(r1.status.data.truncated, true);
  assert.ok(view(r1.status)['status-text'].includes('capped'), view(r1.status)['status-text']);
  let s2 = go(r1.status, 'tree.click', click('runs/run-2026-09-01')).status;
  const r2 = go(s2, 'level.loaded', RUN1_LEVEL);   // this fixture has no truncated:true
  assert.equal(r2.status.data.truncated, false);
  assert.ok(!view(r2.status)['status-text'].includes('capped'));
});

test('?mount=&path= deep-link (initialData\'s deepLink): walks mounts.loaded -> level.loaded -> level.loaded, selects + fetches the final file', () => {
  const target = 'runs/run-2026-09-01/records/manifest.json';
  const s0 = init(M, initialData(target));
  const r1 = go(s0.status, 'mounts.loaded', MOUNTS_FX);
  assert.equal(r1.status.data[TREE.name].nodes.find(n => n.path === 'runs').open, true, 'mount opened immediately');
  assert.deepEqual(r1.effects, [{ fetch: '/content/browse/level/runs.json', ok: 'level.loaded', err: 'level.failed' }]);
  assert.equal(r1.status.data.deepLink, 'run-2026-09-01/records/manifest.json');

  const r2 = go(r1.status, 'level.loaded', RUNS_LEVEL);
  assert.equal(r2.status.data[TREE.name].nodes.find(n => n.path === 'runs').children.find(n => n.path === 'runs/run-2026-09-01').open, true);
  assert.deepEqual(r2.effects, [{ fetch: '/content/browse/level/runs/run-2026-09-01.json', ok: 'level.loaded', err: 'level.failed' }]);
  assert.equal(r2.status.data.deepLink, 'records/manifest.json');

  const r3 = go(r2.status, 'level.loaded', RUN1_LEVEL);
  assert.deepEqual(r3.effects, [{ fetch: '/content/browse/level/runs/run-2026-09-01/records.json', ok: 'level.loaded', err: 'level.failed' }]);
  assert.equal(r3.status.data.deepLink, 'manifest.json');

  const r4 = go(r3.status, 'level.loaded', RECORDS_LEVEL);
  assert.equal(r4.status.data.deepLink, null, 'fully consumed');
  assert.equal(r4.status.data[TREE.name].sel, target, 'the final file is selected, same as a real click');
  assert.equal(r4.status.data.detailLoading, true);
  assert.deepEqual(r4.effects, [{ fetch: `/content/browse/file/${target}.json`, ok: 'file.loaded', err: 'file.failed' }]);

  const r5 = go(r4.status, 'file.loaded', { format: 'json', content: '{"count":5}', hash: 'hm', writable: false });
  assert.equal(view(r5.status)['detail-title'], target);
});

test('deep-link to just a mount (no sub-path): opens it, no fetch, no dangling deepLink', () => {
  const s0 = init(M, initialData('backend'));
  const r = go(s0.status, 'mounts.loaded', MOUNTS_FX);
  assert.equal(r.status.data[TREE.name].nodes.find(n => n.path === 'backend').open, true);
  assert.equal(r.status.data.deepLink, null);
  assert.deepEqual(r.effects, []);
});

test('deep-link to an unknown mount: silently ignored, no crash, tree still builds normally', () => {
  const s0 = init(M, initialData('nope/x/y'));
  const r = go(s0.status, 'mounts.loaded', MOUNTS_FX);
  assert.equal(r.status.data.deepLink, null);
  assert.deepEqual(r.effects, []);
  assert.equal(r.status.data[TREE.name].nodes.length, MOUNTS_FX.length);
});

test('deep-link where an intermediate segment fails to load: the walk stops quietly, no crash, no stuck deepLink', () => {
  const s0 = init(M, initialData('runs/nope-here/x'));
  const r1 = go(s0.status, 'mounts.loaded', MOUNTS_FX);
  const r2 = go(r1.status, 'level.loaded', RUNS_LEVEL);   // 'nope-here' isn't in RUNS_LEVEL's entries
  assert.equal(r2.status.data.deepLink, null);
  assert.deepEqual(r2.effects, []);
});

test('clicking a file: issues a file.loaded-bound fetch, does NOT touch pendingPath, sets detailLoading', () => {
  let s = go(loaded(), 'tree.click', click('runs')).status;
  s = go(s, 'level.loaded', RUNS_LEVEL).status;
  const r = go(s, 'tree.click', click('runs/README.md'));
  assert.deepEqual(r.effects, [
    { emit: 'tree.select', payload: r.status.data[TREE.name].nodes.find(n => n.path === 'runs').children.find(n => n.path === 'runs/README.md') },
    { fetch: '/content/browse/file/runs/README.md.json', ok: 'file.loaded', err: 'file.failed' },
  ]);
  assert.equal(r.status.data[TREE.name].pendingPath, null, 'a file click never sets pendingPath');
  assert.equal(r.status.data.detail, null);
  assert.equal(r.status.data.detailLoading, true);
  assert.equal(r.status.data[TREE.name].sel, 'runs/README.md');
});

test('file.loaded: data.detail set, detailLoading cleared, editText seeded; view shows the selected path as detail-title, a real editable field as detail-body', () => {
  let s = go(loaded(), 'tree.click', click('runs')).status;
  s = go(s, 'level.loaded', RUNS_LEVEL).status;
  s = go(s, 'tree.click', click('runs/README.md')).status;   // a file click -- sets tree.sel, unlike a dir click
  assert.equal(s.data[TREE.name].sel, 'runs/README.md');
  const r = go(s, 'file.loaded', RESULT_FILE);
  assert.deepEqual(r.status.data.detail, RESULT_FILE);
  assert.equal(r.status.data.detailLoading, false);
  assert.equal(r.status.data.editText, detailBody(RESULT_FILE), 'editText seeded from the loaded file, pretty-printed');
  const v = view(r.status);
  assert.equal(v['detail-title'], 'runs/README.md', 'shows the selected node path (tree.sel), not something from the file payload');
  assert.deepEqual(v['detail-body'], { content: detailEditor(detailBody(RESULT_FILE)) });
  assert.deepEqual(v['btn-save'], { state: 'disabled' }, 'this fixture file is not writable');
});

test('detailBody: pretty-prints JSON, passes everything else through as-is, falls back to raw on invalid JSON', () => {
  assert.equal(detailBody({ format: 'json', content: '{"a":1}' }), '{\n  "a": 1\n}');
  assert.equal(detailBody({ format: 'text', content: 'plain text\nsecond line' }), 'plain text\nsecond line');
  assert.equal(detailBody({ format: 'json', content: 'not json' }), 'not json');
});

test('a writable file (settings.yaml fixture): btn-save actionable; typing updates editText', () => {
  let s = go(loaded(), 'tree.click', click('backend')).status;
  s = go(s, 'level.loaded', BACKEND_LEVEL).status;
  s = go(s, 'tree.click', click('backend/config')).status;
  s = go(s, 'level.loaded', CONFIG_LEVEL).status;
  s = go(s, 'tree.click', click('backend/config/settings.yaml')).status;
  const r = go(s, 'file.loaded', SETTINGS_FILE);
  assert.equal(r.status.data.detail.writable, true);
  assert.deepEqual(view(r.status)['btn-save'], { state: 'actionable' });
  const typed = go(r.status, 'detail-editor.input', { value: 'server:\n  port: 9090\n' });
  assert.equal(typed.status.data.editText, 'server:\n  port: 9090\n');
});

test('btn-save.click, no real backend (FIXTURE_URLS.saveFile is null): saves locally, bumps the hash, shows a confirmation', () => {
  let s = go(loaded(), 'tree.click', click('backend')).status;
  s = go(s, 'level.loaded', BACKEND_LEVEL).status;
  s = go(s, 'tree.click', click('backend/config')).status;
  s = go(s, 'level.loaded', CONFIG_LEVEL).status;
  s = go(s, 'tree.click', click('backend/config/settings.yaml')).status;
  s = go(s, 'file.loaded', SETTINGS_FILE).status;
  const beforeHash = s.data.detail.hash;
  s = go(s, 'detail-editor.input', { value: 'server:\n  port: 9999\n' }).status;
  const r = go(s, 'btn-save.click');
  assert.deepEqual(r.effects, [], 'no fetch -- fixture demo has no writable backend, mutates locally');
  assert.notEqual(r.status.data.detail.hash, beforeHash, 'hash bumped so a second local save is distinguishable');
  assert.equal(r.status.data.saveMsg, 'Saved (local)');
});

test('btn-save.click on a non-writable file: no-op, no effects', () => {
  let s = go(loaded(), 'tree.click', click('runs')).status;
  s = go(s, 'level.loaded', RUNS_LEVEL).status;
  s = go(s, 'tree.click', click('runs/README.md')).status;
  s = go(s, 'file.loaded', RESULT_FILE).status;
  const r = go(s, 'btn-save.click');
  assert.deepEqual(r, { status: s, effects: [] });
});

test('btn-save.click with a real urls.saveFile: fires the right PATCH fetch effect; save.ok updates the hash; save.err surfaces the server message', () => {
  const saveUrls = { ...handlers, level: (p) => `/content/browse/level/${p}.json`, file: (p) => `/content/browse/file/${p}.json`,
    saveFile: (mount, relPath, content, ifMatch) => ({ url: `/api/browse/${mount}/file`, init: { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: relPath, content, if_match: ifMatch }) } }) };
  const h = makeHandlers(saveUrls);
  const goH = (s, trigger, payload) => step(M, s, trigger, payload, h);
  let s = goH(start().status, 'mounts.loaded', MOUNTS_FX).status;
  s = goH(s, 'tree.click', click('backend')).status;
  s = goH(s, 'level.loaded', BACKEND_LEVEL).status;
  s = goH(s, 'tree.click', click('backend/config')).status;
  s = goH(s, 'level.loaded', CONFIG_LEVEL).status;
  s = goH(s, 'tree.click', click('backend/config/settings.yaml')).status;
  s = goH(s, 'file.loaded', SETTINGS_FILE).status;
  s = goH(s, 'detail-editor.input', { value: 'server:\n  port: 1\n' }).status;
  const r = goH(s, 'btn-save.click');
  assert.equal(r.effects.length, 1);
  assert.equal(r.effects[0].fetch, '/api/browse/backend/file');
  assert.deepEqual(JSON.parse(r.effects[0].init.body), { path: 'config/settings.yaml', content: 'server:\n  port: 1\n', if_match: SETTINGS_FILE.hash });
  assert.equal(r.status.data.saveMsg, 'Saving…');

  const ok = goH(r.status, 'save.ok', { hash: 'fx-settings-2' });
  assert.equal(ok.status.data.detail.hash, 'fx-settings-2');
  assert.equal(ok.status.data.saveMsg, 'Saved');

  const err = goH(r.status, 'save.err', { error: 'HTTP 409', body: { error: 'this file changed since you loaded it -- reload and try again' } });
  assert.equal(err.status.data.saveMsg, 'Save failed: this file changed since you loaded it -- reload and try again', 'prefers the server’s own JSON error body over the generic HTTP status');
});

test('splitMountPath: mount root vs nested path', () => {
  assert.deepEqual(splitMountPath('backend'), ['backend', '']);
  assert.deepEqual(splitMountPath('backend/config/settings.yaml'), ['backend', 'config/settings.yaml']);
});

test('file.failed: detailLoading cleared, error set', () => {
  const s0 = loaded();
  const r = go(s0, 'file.failed', { error: 'HTTP 404' });
  assert.equal(r.status.data.detailLoading, false);
  assert.equal(r.status.data.error, 'HTTP 404');
});

test('mounts.failed -> error; retry re-issues the mounts fetch', () => {
  let r = go(start().status, 'mounts.failed', { error: 'HTTP 500' });
  assert.equal(r.status.state, 'error');
  assert.equal(r.status.data.error, 'HTTP 500');
  const v = view(r.status);
  assert.equal(v['status-text'], 'failed: HTTP 500');
  assert.deepEqual(v[TREE.name], { content: [{ name: 'btn-retry', box: 'row, mid, packed, pad:2, solid, rounded', content: 'Retry' }], state: '' });
  assert.deepEqual(v['btn-retry'], { state: 'error' });
  r = go(r.status, 'btn-retry.click');
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, [MOUNTS_FETCH]);
  assert.equal(r.status.data.error, null);
});

test('refresh from ready -> loading with 1 fetch; error cleared', () => {
  const r = go(loaded(), 'btn-refresh.click');
  assert.equal(r.status.state, 'loading');
  assert.deepEqual(r.effects, [MOUNTS_FETCH]);
  assert.equal(r.status.data.error, null);
});

test('nav click emits nav.go with the target; theme click emits theme.toggle', () => {
  const s = loaded();
  for (const to of ['dashboard', 'pipelines', 'graph', 'records', 'issues', 'browse', 'query', 'annotate', 'profile']) {
    const r = go(s, `nav-${to}.click`, click(`nav-${to}`));
    assert.equal(r.status.state, 'ready');
    assert.deepEqual(r.effects, [{ emit: 'nav.go', payload: { to } }]);
  }
  assert.deepEqual(go(s, 'btn-theme.click').effects, [{ emit: 'theme.toggle' }]);
  assert.deepEqual(go(s, 'brand.click').effects, [{ emit: 'nav.go', payload: { to: 'dashboard' } }], 'brand click -> nav.go dashboard');
});

test('unknown trigger throws (C2); tree handler keyed by tree.click', () => {
  assert.throws(() => go(loaded(), 'tile-running.click'), /unknown trigger/);
  assert.equal(typeof handlers['tree.click'], 'function');
});
