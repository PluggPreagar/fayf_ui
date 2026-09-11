// ui/machine.js -- L9 controller (C11). Machine = JSON, handlers = pure,
// view = pure, effects = data the controller runs. Built on L0-L2
// (resolve/render) and ui/state-machine.js's shape (states/initial/enter/on),
// extended so the whole machine is JSON-serialisable and `step()` is pure.
//
// machine JSON:
//   { "initial": "loading",
//     "states": { "loading": { "enter": [ { "fetch": "/x", "ok": "x.loaded", "err": "x.failed" } ],
//                              "x.loaded": "ready", "x.failed": "error" },
//                 "ready":   { "refresh.click": "loading" } } }
//   trigger = "<name>.<event>" (always a dot); `enter` = effects on every entry
//   (start, and every transition that changes the state). A self-transition
//   stays: handler runs, no `enter` -- same rule the epoch below applies.
//   DOM trigger: <name> = the element's data-name, <event> = DOM event type
//     ("refresh.click"). `root` is reserved: the mounted element itself.
//     Bound as one capture-phase listener per event type on the mounted
//     element (capture, so non-bubbling events like "scroll" arrive too).
//     Payload = { name, event, target, path } -- path = data-names from the
//     event target upward; "scroll" adds scrollTop + clientHeight of e.target;
//     "input"/"change" add `value` (e.target.value, real <input>/<textarea>
//     fields only -- render.js's `field` node property, see its header).
//     A control (trigger element without trigger elements inside) is enabled
//     iff one of its triggers fires in the current state (guard = machine);
//     a surface (root, or a trigger element holding controls) is never disabled.
//   effect trigger: <name> = the source, never an element ("runs.loaded",
//     "timer.done") -- sharing a control's name would keep that control enabled.
//
// status  = { state, data }            -- the only mutable thing, owned by the controller
// handler = (status, payload) -> { status, effects? }      pure, no DOM/fetch/timers
// view    = (status) -> { [name]: patch }                  pure, controller paints it
//   patch = string                         text content (a <input>/<textarea>
//                                           target's `.value` instead, C11's
//                                           `field` escape hatch)
//         | node-json | [node-json]        children, rendered via L2
//         | { content?, env?, state? }     content as above, resolve env, state tokens
//   state tokens (C8 token string): actionable selected correct wrong readonly
//                                   loading error disabled hidden -- absolute per paint
// effects = fetch {url, ok, err} · emit {trigger, payload} · timer {ms, trigger}
//         · send {trigger, payload} (self, synchronous, after paint)
//         · stream {url, ok, err?} (SSE, a live EventSource -- every message
//           dispatches `ok` with the parsed JSON body (raw string if it
//           doesn't parse); `err` is optional, dispatched on a stream error.
//           Not fire-once like fetch/timer: stays open until the state that
//           started it ends, then is actively `.close()`d (same "belongs to
//           the state entry that started it" rule below, with a real
//           cleanup action instead of a silent drop).
//   async effects belong to the state entry that started them: a fetch/timer
//   result arriving after the machine left that state is dropped; a stream
//   left open past its state is closed instead.
import vocabulary from './vocabulary.json' with { type: 'json' };
import { resolve } from './model.js';
import { render } from './render.js';
import { mountIcons } from './icons.js';
import { markActionable, unmarkActionable, setActionableDisabled } from './actions.js';

// C2: the effect kinds live in vocabulary.json, next to the dials.
export const EFFECTS = vocabulary.effect;
export const STATE_TOKENS = ['actionable', 'selected', 'correct', 'wrong', 'readonly', 'loading', 'error', 'disabled', 'hidden'];
export const ROOT = 'root';

// Every trigger the machine knows, in any state. Used to tell a typo
// (error, C2) from a trigger that is merely inert in the current state.
export function triggers(machine) {
  const set = new Set();
  for (const def of Object.values(machine.states)) {
    for (const k of Object.keys(def)) if (k !== 'enter') set.add(k);
  }
  return set;
}

export function validateMachine(machine) {
  if (!machine || typeof machine !== 'object') throw new Error('machine: not an object');
  if (!machine.states || typeof machine.states !== 'object') throw new Error('machine: states missing');
  if (!(machine.initial in machine.states)) throw new Error(`machine: initial '${machine.initial}' not a state`);
  for (const [state, def] of Object.entries(machine.states)) {
    for (const [k, v] of Object.entries(def)) {
      if (k === 'enter') {
        if (!Array.isArray(v)) throw new Error(`machine: ${state}.enter must be a list`);
        v.forEach(e => validateEffect(e, `${state}.enter`));
        continue;
      }
      if (!k.includes('.')) throw new Error(`machine: trigger '${k}' in '${state}' needs <name>.<event>`);
      if (!(v in machine.states)) throw new Error(`machine: ${state}.${k} -> '${v}' not a state`);
    }
  }
  return machine;
}

// One key names the kind and carries its argument:
//   { fetch: "/url", ok: "x.loaded", err: "x.failed" }
//   { timer: 900, trigger: "pause.done" }
//   { emit: "row.select", payload: {...} }
//   { send: "flow.lock", payload: {...} }
//   { stream: "/events", ok: "run.event", err: "run.streamFailed" }   -- err optional
export function validateEffect(e, where = 'effect') {
  const kinds = EFFECTS.filter(k => k in e);
  if (kinds.length !== 1) throw new Error(`effect at ${where}: exactly one of ${EFFECTS.join('/')}, got ${JSON.stringify(e)}`);
  const k = kinds[0];
  if (k === 'fetch' && !(typeof e.fetch === 'string' && e.ok && e.err)) throw new Error(`effect at ${where}: fetch needs url string + ok + err triggers`);
  if (k === 'timer' && !(typeof e.timer === 'number' && e.timer >= 0 && e.trigger)) throw new Error(`effect at ${where}: timer needs ms number + trigger`);
  if ((k === 'emit' || k === 'send') && typeof e[k] !== 'string') throw new Error(`effect at ${where}: ${k} needs a trigger string`);
  if (k === 'stream' && !(typeof e.stream === 'string' && e.ok)) throw new Error(`effect at ${where}: stream needs url string + ok trigger (err optional)`);
  return e;
}

// Pure. Start: status in the initial state, its enter effects.
export function init(machine, data = {}) {
  validateMachine(machine);
  const status = { state: machine.initial, data };
  return { status, effects: enterEffects(machine, machine.initial) };
}

function enterEffects(machine, state) {
  return (machine.states[state].enter || []).map(e => ({ ...e }));
}

// Pure. One trigger in, next status + effects out. Never touches the input status.
//   unknown trigger (no state has it)      -> throws (C2)
//   known trigger, inert in current state  -> no-op: same status, no effects, no handler
//   handler present                        -> runs first, its status/effects are kept
//   transition to another state           -> state set, target's enter effects appended
//   self-transition (target = current)     -> state kept, no enter effects (a stay is
//                                             not an entry: N parallel fetches collect
//                                             via `x.loaded: "loading"` without re-firing)
export function step(machine, status, trigger, payload, handlers = {}) {
  const def = machine.states[status.state];
  if (!def) throw new Error(`machine: status.state '${status.state}' not a state`);
  if (!triggers(machine).has(trigger)) throw new Error(`machine: unknown trigger '${trigger}'`);
  if (def[trigger] === undefined) return { status, effects: [] };
  let next = status, effects = [];
  const h = handlers[trigger];
  if (typeof h === 'function') {
    const r = h(status, payload);
    if (!r || typeof r !== 'object' || !r.status) throw new Error(`handler '${trigger}' must return { status, effects? }`);
    next = r.status;
    effects = effects.concat(r.effects || []);
  }
  const to = def[trigger];
  next = { ...next, state: to };
  return { status: next, effects: to === status.state ? effects : effects.concat(enterEffects(machine, to)) };
}

// Keep element identity across paints: an existing child with the same name,
// dials and passthru as the freshly rendered one is updated in place (dial
// classes + dial styles from the fresh render, state classes/visibility/tab
// order kept -- paintState makes those absolute right after). Anything else
// is replaced. Focus, hover and outside references survive a repaint. A
// field element's (input/textarea) live `.value` is synced from the fresh
// render's, same as paintContent's own string-patch case -- morph() is the
// path an array-content patch (e.g. a field nested inside other nodes,
// paintContent below doesn't see it as a bare string) takes instead.
const KEEP_CLASS = (c) => c === 'bx-actionable' || c.startsWith('ins-') || STATE_TOKENS.includes(c.slice(3));
export function morphChildren(parent, fresh) {
  for (const n of [...parent.childNodes]) if (n.nodeType !== 1) n.remove();   // a previous string paint
  const old = [...parent.children];
  fresh.forEach((b, i) => { const a = old[i]; if (!a) parent.appendChild(b); else morph(a, b); });
  old.slice(fresh.length).forEach(a => a.remove());
}
function morph(a, b) {
  const same = a.tagName === b.tagName && a.dataset.name === b.dataset.name
    && a.dataset.box === b.dataset.box && (a.dataset.extra ?? '') === (b.dataset.extra ?? '');
  if (!same) { a.replaceWith(b); return; }
  const keep = [...a.classList].filter(KEEP_CLASS);
  a.className = [...new Set([...b.classList, ...keep])].join(' ');
  const vis = a.style.visibility, cur = a.style.cursor;
  a.setAttribute('style', b.getAttribute('style') || '');
  if (vis) a.style.visibility = vis;
  if (cur) a.style.cursor = cur;
  if (b.dataset.hasContent) a.dataset.hasContent = '1'; else delete a.dataset.hasContent;
  if (b.tagName === 'INPUT' || b.tagName === 'TEXTAREA') { if (a.value !== b.value) a.value = b.value; return; }
  if (b.dataset.hasContent && !b.children.length) { if (a.textContent !== b.textContent) a.textContent = b.textContent; return; }
  morphChildren(a, [...b.children]);
}

const isNode = (v) => v && typeof v === 'object' && !Array.isArray(v) && ('box' in v || 'extends' in v || 'children' in v || 'conditional' in v);
const isPatch = (v) => v && typeof v === 'object' && !Array.isArray(v) && !isNode(v);

// Browser. `screen` = node-json (rendered + appended to root) or an already
// rendered Element (used as is). Binds every machine trigger as one delegated
// listener per event type, runs effects, paints view(status). DOM only via L2
// render + [data-name].
//   opts.reg      registry for resolve
//   opts.view     pure (status) -> { name: patch }
//   opts.io       { fetch, setTimeout, EventSource } injectable for tests
//   opts.onEmit   (trigger, payload) -> void   parent hook for `emit`
//   opts.onStatus (status) -> void             after every paint
//   opts.data     initial status.data
export function mountMachine(root, screen, machine, handlers = {}, opts = {}) {
  const { reg = {}, view = () => ({}), io = {}, onEmit = () => {}, onStatus = () => {}, data = {} } = opts;
  const doFetch = io.fetch || ((...a) => globalThis.fetch(...a));
  const doTimer = io.setTimeout || ((fn, ms) => globalThis.setTimeout(fn, ms));
  const doStream = io.EventSource || globalThis.EventSource;
  let el;
  if (screen && typeof screen === 'object' && screen.nodeType === 1) el = screen;
  else { el = render(resolve(screen, reg)); root.appendChild(el); }
  if (el.querySelector(`[data-name="${ROOT}"]`)) throw new Error(`machine: '${ROOT}' is reserved for the mounted element`);

  const known = triggers(machine);
  const nameOf = (t) => t.slice(0, t.lastIndexOf('.'));
  const names = new Set([...known].map(nameOf));
  const events = new Set([...known].map(t => t.slice(t.lastIndexOf('.') + 1)));
  let { status, effects } = init(machine, data);
  let epoch = 0;   // bumps when status.state changes; stale async results are dropped
  const openStreams = new Map();   // epoch that opened a stream -> Set<EventSource>, closed once that epoch ends

  const ctl = {
    el,
    get status() { return status; },
    dispatch(trigger, payload) {
      const r = step(machine, status, trigger, payload, handlers);
      if (r.status.state !== status.state) {
        epoch += 1;
        for (const [at, streams] of openStreams) {
          if (at >= epoch) continue;
          streams.forEach(es => es.close());
          openStreams.delete(at);
        }
      }
      status = r.status;
      paint();
      onStatus(status);
      const sends = r.effects.filter(e => 'send' in e);
      r.effects.filter(e => !('send' in e)).forEach(run);
      sends.forEach(e => ctl.dispatch(e.send, e.payload));
      measureScroll();
      return status;
    },
  };

  // A `<name>.scroll` trigger also means "this element's viewport matters":
  // after a paint, deliver its metrics once whenever clientHeight changed
  // (first paint, a resize, content arriving) -- windowing needs a measure
  // before the user ever scrolls. Unchanged height -> nothing, no loop. A
  // height is recorded only once delivered: while the trigger is inert (a
  // `loading` state) nothing is remembered, so the first paint in a state
  // where it fires still gets its measure.
  const measured = new Map();
  function measureScroll() {
    for (const name of names) {
      const trigger = `${name}.scroll`;
      if (!known.has(trigger) || !active().has(trigger)) continue;
      const t = byName(name);
      if (!t) continue;
      const m = { scrollTop: t.scrollTop, clientHeight: t.clientHeight };
      if (measured.get(name) === m.clientHeight) continue;
      measured.set(name, m.clientHeight);
      ctl.dispatch(trigger, { name, event: 'scroll', target: name, path: [name], ...m });
    }
  }

  function run(e) {
    validateEffect(e);
    const at = epoch;
    const deliver = (trigger, payload) => { if (epoch === at) ctl.dispatch(trigger, payload); };
    if ('fetch' in e) {
      Promise.resolve()
        .then(() => doFetch(e.fetch, e.init))
        .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
        .then(json => deliver(e.ok, json), err => deliver(e.err, { error: String(err.message || err) }));
    } else if ('timer' in e) {
      doTimer(() => deliver(e.trigger, e.payload), e.timer);
    } else if ('emit' in e) {
      onEmit(e.emit, e.payload);
    } else if ('stream' in e) {
      const es = new doStream(e.stream);
      if (!openStreams.has(at)) openStreams.set(at, new Set());
      openStreams.get(at).add(es);
      es.onmessage = (ev) => {
        if (epoch !== at) { es.close(); return; }
        let payload; try { payload = JSON.parse(ev.data); } catch { payload = ev.data; }
        deliver(e.ok, payload);
      };
      if (e.err) es.onerror = () => deliver(e.err, { error: 'stream error' });
    }
  }

  const byName = (name) => name === ROOT ? el : el.querySelector(`[data-name="${name}"]`);
  const active = () => new Set(Object.keys(machine.states[status.state]).filter(k => k !== 'enter'));

  function paintContent(target, patch) {
    const content = isPatch(patch) ? patch.content : patch;
    if (content === undefined) return;
    if (content == null) { morphChildren(target, []); return; }
    if (typeof content === 'string') {
      if ('value' in target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) { if (target.value !== content) target.value = content; return; }
      if (target.textContent !== content) target.textContent = content;
      return;
    }
    const env = isPatch(patch) ? (patch.env || []) : [];
    morphChildren(target, (Array.isArray(content) ? content : [content]).map(node => render(resolve(node, reg, env))));
  }

  function paintState(target, tokens, viewDisabled) {
    const set = new Set(String(tokens).split(',').map(s => s.trim()).filter(Boolean));
    for (const t of set) if (!STATE_TOKENS.includes(t)) throw new Error(`machine: unknown state token '${t}'`);
    if (set.has('actionable')) markActionable(target); else if (target !== el) unmarkActionable(target);
    for (const t of STATE_TOKENS) {
      if (t === 'actionable' || t === 'disabled') continue;
      if (t === 'hidden') { target.style.visibility = set.has(t) ? 'hidden' : ''; continue; }
      target.classList.toggle(`bx-${t}`, set.has(t));
    }
    if (set.has('readonly') || set.has('loading')) target.tabIndex = -1;
    if (set.has('disabled')) viewDisabled.add(target);
  }

  function paint() {
    const patches = view(status) || {};
    const viewDisabled = new Set();
    // 1. content, so elements named in the same paint exist before 2.
    for (const [name, patch] of Object.entries(patches)) {
      const target = byName(name);
      if (!target) throw new Error(`machine: view names slot '${name}' not in screen`);
      paintContent(target, patch);
    }
    // 2. state tokens, absolute per paint
    for (const [name, patch] of Object.entries(patches)) {
      if (isPatch(patch) && patch.state !== undefined) paintState(byName(name), patch.state, viewDisabled);
    }
    // 3. guard: controls enabled iff a trigger of their name fires now
    const on = active();
    for (const name of names) {
      if (name === ROOT) continue;
      const target = byName(name);
      if (!target) continue;
      const isSurface = [...names].some(n => n !== name && n !== ROOT && target.querySelector(`[data-name="${n}"]`));
      if (isSurface) continue;
      const enabled = [...on].some(t => nameOf(t) === name);
      markActionable(target);
      setActionableDisabled(target, !enabled || viewDisabled.has(target));
    }
    mountIcons(el);
    el.dataset.machineState = status.state;
  }

  for (const ev of events) {
    el.addEventListener(ev, (e) => {
      // Walk up from the click target: the first trigger active in this state
      // wins; failing that, the innermost known one (inert -- handler may run).
      const path = [];
      let t = e.target;
      while (t && t !== el) { if (t.dataset && t.dataset.name) path.push(t.dataset.name); t = t.parentNode; }
      if (t === el) path.push(ROOT);
      const candidates = path.filter(n => known.has(`${n}.${ev}`));
      if (!candidates.length) return;
      const on = active();
      const name = candidates.find(n => on.has(`${n}.${ev}`)) ?? candidates[0];
      const payload = { name, event: ev, target: path[0] ?? ROOT, path };
      if (ev === 'scroll') Object.assign(payload, { scrollTop: e.target.scrollTop, clientHeight: e.target.clientHeight });
      if ((ev === 'input' || ev === 'change') && 'value' in e.target) payload.value = e.target.value;
      ctl.dispatch(`${name}.${ev}`, payload);
    }, true);   // capture: `scroll` does not bubble
  }

  paint();
  effects.forEach(run);
  measureScroll();
  return ctl;
}
