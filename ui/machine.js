// ui/machine.js -- L9 controller (C11). Machine = JSON, handlers = pure,
// effects = data the controller runs. Built on L0-L2 (resolve/render) and
// ui/state-machine.js's shape (states/initial/enter/on), extended so the
// whole machine is JSON-serialisable and `step()` is pure.
//
// machine JSON:
//   { "initial": "loading",
//     "states": { "loading": { "enter": [ { "fetch": "/x", "ok": "x.loaded", "err": "x.failed" } ],
//                              "x.loaded": "ready", "x.failed": "error" },
//                 "ready":   { "refresh.click": "loading" } } }
//   trigger = "<name>.<event>" (always a dot); `enter` = effects on every entry.
//   DOM trigger: <name> = the element's data-name, <event> = DOM event type
//     ("refresh.click"). The element is enabled iff one of its triggers fires
//     in the current state (guard = machine).
//   effect trigger: <name> = the source, never an element ("runs.loaded",
//     "timer.done") -- sharing a button's name would keep that button enabled.
//
// status  = { state, data }            -- the only mutable thing, owned by the controller
// handler = (status, payload) -> { status, effects? }      pure, no DOM/fetch/timers
// view    = (status) -> { [slot]: string | node-json }     pure, controller renders it
// effects = fetch {url, ok, err} · emit {trigger, payload} · timer {ms, trigger}
import vocabulary from './vocabulary.json' with { type: 'json' };
import { resolve } from './model.js';
import { render } from './render.js';
import { markActionable, setActionableDisabled } from './actions.js';

// C2: the effect kinds live in vocabulary.json, next to the dials.
export const EFFECTS = vocabulary.effect;

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
export function validateEffect(e, where = 'effect') {
  const kinds = EFFECTS.filter(k => k in e);
  if (kinds.length !== 1) throw new Error(`effect at ${where}: exactly one of ${EFFECTS.join('/')}, got ${JSON.stringify(e)}`);
  const k = kinds[0];
  if (k === 'fetch' && !(typeof e.fetch === 'string' && e.ok && e.err)) throw new Error(`effect at ${where}: fetch needs url string + ok + err triggers`);
  if (k === 'timer' && !(typeof e.timer === 'number' && e.timer >= 0 && e.trigger)) throw new Error(`effect at ${where}: timer needs ms number + trigger`);
  if (k === 'emit' && typeof e.emit !== 'string') throw new Error(`effect at ${where}: emit needs a trigger string`);
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
//   known trigger, inert in current state  -> same status, no effects
//   handler present                        -> runs first, its status/effects are kept
//   transition (incl. self-transition)     -> state set, target's enter effects appended
export function step(machine, status, trigger, payload, handlers = {}) {
  const def = machine.states[status.state];
  if (!def) throw new Error(`machine: status.state '${status.state}' not a state`);
  if (!triggers(machine).has(trigger)) throw new Error(`machine: unknown trigger '${trigger}'`);
  let next = status, effects = [];
  const h = handlers[trigger];
  if (typeof h === 'function') {
    const r = h(status, payload);
    if (!r || typeof r !== 'object' || !r.status) throw new Error(`handler '${trigger}' must return { status, effects? }`);
    next = r.status;
    effects = effects.concat(r.effects || []);
  }
  const target = def[trigger];
  if (target === undefined) return { status: next, effects };
  next = { ...next, state: target };
  return { status: next, effects: effects.concat(enterEffects(machine, target)) };
}

// Browser. Renders `screen` into `root`, binds every machine trigger as one
// delegated listener per event type on the rendered screen, runs effects,
// re-renders slots from view(status). DOM only via L2 render + [data-name].
//   opts.reg      registry for resolve
//   opts.view     pure (status) -> { slot: string | node-json }
//   opts.io       { fetch, setTimeout } injectable for tests
//   opts.onEmit   (trigger, payload) -> void   parent hook for `emit`
export function mountMachine(root, screen, machine, handlers = {}, opts = {}) {
  const { reg = {}, view = () => ({}), io = {}, onEmit = () => {}, data = {} } = opts;
  const doFetch = io.fetch || ((...a) => globalThis.fetch(...a));
  const doTimer = io.setTimeout || ((fn, ms) => globalThis.setTimeout(fn, ms));
  const el = render(resolve(screen, reg));
  root.appendChild(el);

  const known = triggers(machine);
  const names = new Set([...known].map(t => t.slice(0, t.lastIndexOf('.'))));
  const events = new Set([...known].map(t => t.slice(t.lastIndexOf('.') + 1)));
  let { status, effects } = init(machine, data);

  const ctl = {
    el,
    get status() { return status; },
    dispatch(trigger, payload) {
      const r = step(machine, status, trigger, payload, handlers);
      status = r.status;
      paint();
      r.effects.forEach(run);
      return status;
    },
  };

  function run(e) {
    validateEffect(e);
    if ('fetch' in e) {
      Promise.resolve()
        .then(() => doFetch(e.fetch, e.init))
        .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
        .then(json => ctl.dispatch(e.ok, json), err => ctl.dispatch(e.err, { error: String(err.message || err) }));
    } else if ('timer' in e) {
      doTimer(() => ctl.dispatch(e.trigger, e.payload), e.timer);
    } else {
      onEmit(e.emit, e.payload);
    }
  }

  function paint() {
    // slots from the pure view
    for (const [slot, content] of Object.entries(view(status) || {})) {
      const s = el.querySelector(`[data-name="${slot}"]`);
      if (!s) throw new Error(`machine: view names slot '${slot}' not in screen`);
      s.textContent = '';
      if (content == null) continue;
      if (typeof content === 'string') s.textContent = content;
      else s.appendChild(render(resolve(content, reg)));
    }
    // guard: a trigger's element is enabled iff the trigger fires in this state
    const active = new Set(Object.keys(machine.states[status.state]).filter(k => k !== 'enter'));
    for (const name of names) {
      const target = el.querySelector(`[data-name="${name}"]`);
      if (!target) continue;
      const enabled = [...active].some(t => t.startsWith(name + '.'));
      markActionable(target);   // idempotent: cursor, tab order, Enter/Space -> click
      setActionableDisabled(target, !enabled);
    }
    el.dataset.machineState = status.state;
  }

  for (const ev of events) {
    el.addEventListener(ev, (e) => {
      let t = e.target;
      while (t && t !== el) {
        const name = t.dataset && t.dataset.name;
        if (name && known.has(`${name}.${ev}`)) { ctl.dispatch(`${name}.${ev}`, { name, event: ev }); return; }
        t = t.parentNode;
      }
    });
  }

  paint();
  effects.forEach(run);
  return ctl;
}
