// ui/state-machine.js -- generic FSM primitive. Knows nothing about any
// particular screen. A state's enter/exit register/deregister whatever
// listeners it needs (DOM click, timer, later a socket message) --
// all of them just call send(event, payload). No action-type DSL:
// "navigate"/"toast"/"callback" are just what enter/exit do, not a
// mechanism this module interprets.
export function createMachine({ states, initial, context = {} }) {
  let current = initial;
  const ctx = context;

  function send(event, payload) {
    const def = states[current];
    const next = def && def.on && def.on[event];
    if (next == null) return false;
    if (typeof def.exit === 'function') def.exit(ctx);
    current = next;
    const nextDef = states[current];
    if (nextDef && typeof nextDef.enter === 'function') nextDef.enter(ctx, send, payload);
    return true;
  }

  const initialDef = states[initial];
  if (initialDef && typeof initialDef.enter === 'function') initialDef.enter(ctx, send);

  return {
    send,
    get state() { return current; },
  };
}
