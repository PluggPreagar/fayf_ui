/**
 * Shared test harness — injected by wrapper.php before the test-cases script.
 * Defines globals: suite(), assert(), assertMatch(), harnessFinish()
 * Creates and appends the test overlay to document.body.
 */
(function () {
    let _passed = 0, _failed = 0;

    // ── Overlay ───────────────────────────────────────────────────────────────
    const style = document.createElement('style');
    style.textContent = `
#test-overlay {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(16,16,16,0.97); color: #ccc;
    font-family: monospace; font-size: 0.82rem;
    padding: 1rem 1.25rem 4rem; overflow-y: auto;
}
#test-overlay h2 { color: #fff; font-size: 0.95rem; margin: 0 0 0.75rem; }
#test-overlay .t-suite { margin: 0.75rem 0 0.1rem; color: #777; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; }
#test-overlay .t-pass  { color: #4CAF50; }
#test-overlay .t-fail  { color: #f44336; }
#test-overlay pre      { font-size: 0.74rem; margin: 0.1rem 0 0 1.5rem; color: #f44336; white-space: pre-wrap; }
#test-overlay #t-summary { margin-top: 1.25rem; font-weight: bold; font-size: 0.9rem; }
#test-close {
    position: fixed; bottom: 1rem; right: 1.5rem; z-index: 10000;
    padding: 0.45rem 1.1rem; border-radius: 5px; border: none;
    background: #444; color: #fff; cursor: pointer; font-size: 0.82rem;
}
#test-close:hover { background: #666; }
    `.trim();
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'test-overlay';
    overlay.innerHTML = '<h2>Tests</h2><div id="t-out"></div><div id="t-summary"></div>';
    document.body.appendChild(overlay);

    const closeBtn = document.createElement('button');
    closeBtn.id = 'test-close';
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => { overlay.remove(); closeBtn.remove(); };
    document.body.appendChild(closeBtn);

    const out = document.getElementById('t-out');

    // ── Globals ───────────────────────────────────────────────────────────────
    window.suite = function (name) {
        const d = document.createElement('div');
        d.className = 't-suite';
        d.textContent = name;
        out.appendChild(d);
    };

    window.assert = function (desc, actual, expected) {
        const ok = JSON.stringify(actual) === JSON.stringify(expected);
        const d = document.createElement('div');
        d.className = ok ? 't-pass' : 't-fail';
        d.textContent = (ok ? '  PASS  ' : '  FAIL  ') + desc;
        if (!ok) {
            _failed++;
            const pre = document.createElement('pre');
            pre.textContent = '    expected: ' + JSON.stringify(expected)
                            + '\n    actual:   ' + JSON.stringify(actual);
            d.appendChild(pre);
        } else {
            _passed++;
        }
        out.appendChild(d);
    };

    window.assertMatch = function (desc, actual, pattern) {
        const ok = pattern.test(actual);
        const d = document.createElement('div');
        d.className = ok ? 't-pass' : 't-fail';
        d.textContent = (ok ? '  PASS  ' : '  FAIL  ') + desc;
        if (!ok) {
            _failed++;
            const pre = document.createElement('pre');
            pre.textContent = '    value:   ' + JSON.stringify(actual)
                            + '\n    pattern: ' + pattern;
            d.appendChild(pre);
        } else {
            _passed++;
        }
        out.appendChild(d);
    };

    window.harnessFinish = function () {
        const sum = document.getElementById('t-summary');
        const ok = _failed === 0;
        sum.className = ok ? 't-pass' : 't-fail';
        sum.textContent = (ok ? '\nOK — ' : '\nFAIL — ')
            + _passed + ' passed, ' + _failed + ' failed';
        document.title = (ok ? '✓ ' : '✗ ') + _passed + ' passed — ' + document.title;
    };
}());
