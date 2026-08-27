/**
 * Generic function-call tracer — injected by wrapper.php?trace=<file>.
 *
 * Works with any HTML file. No PHP-side setup required.
 *
 * Discovery (auto, default):
 *   Enumerates all window properties that are user-defined functions
 *   (detected via fn.toString() — native built-ins contain "[native code]").
 *
 * Explicit allowlist (optional):
 *   Set window.__TRACE_FUNCTIONS__ = ['fn1','fn2'] before this script runs
 *   to restrict tracing to those names only.
 *
 * Note: only patches functions reachable as window properties, i.e. top-level
 * `function` declarations. `const`/`let` assigned functions are in the lexical
 * scope and cannot be intercepted from outside.
 */
(function () {
    function safeStr(v) {
        if (v === undefined) return 'undefined';
        if (v === null) return 'null';
        try { return JSON.stringify(v); } catch { return String(v); }
    }

    function isUserDefined(name) {
        try {
            const fn = window[name];
            if (typeof fn !== 'function') return false;
            return !fn.toString().includes('[native code]');
        } catch { return false; }
    }

    // Use explicit allowlist if provided, otherwise auto-discover
    const explicit = window.__TRACE_FUNCTIONS__;
    const names = (Array.isArray(explicit) && explicit.length > 0)
        ? explicit
        : Object.getOwnPropertyNames(window).filter(isUserDefined);

    function wrapFn(name) {
        const orig = window[name];
        if (typeof orig !== 'function') return false;
        window[name] = function (...args) {
            const label = name + '(' + args.map(safeStr).join(', ') + ')';
            console.group('[trace] ' + label);
            let result;
            try {
                result = orig.apply(this, args);
            } catch (err) {
                console.error('[trace] threw:', err);
                console.groupEnd();
                throw err;
            }
            if (result && typeof result.then === 'function') {
                result.then(
                    v => { console.log('[trace] resolved →', safeStr(v)); console.groupEnd(); },
                    e => { console.error('[trace] rejected →', e);        console.groupEnd(); }
                );
            } else {
                console.log('[trace] →', safeStr(result));
                console.groupEnd();
            }
            return result;
        };
        Object.defineProperty(window[name], 'name', { value: name });
        return true;
    }

    const patched = names.filter(wrapFn);
    console.log('[tracer] patched', patched.length, 'functions:', patched);
}());
