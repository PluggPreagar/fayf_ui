/**
 * test/js_runner.js — lightweight browser GUI test runner
 *
 * Usage:
 *   const tr = new TestRunner({ stopOnError: true });
 *   tr.beforeBlock = (runner) => runner.assertEq('/', topicFilter.value, 'topic reset');
 *   tr.addBlock('my block', (runner) => {
 *       runner.assertVisible('td', 'hello').click('button', 'OK');
 *   });
 *   tr.runBlocks();
 */
class TestRunner {
    constructor({ stopOnError = false, beforeBlock = null } = {}) {
        this.stopOnError = stopOnError;
        this.beforeBlock = beforeBlock;
        this.chain  = Promise.resolve();
        this.blocks = {};
        this.errors = [];
        this.checkCount = 0;
    }

    // ── Core ─────────────────────────────────────────────────────────────────

    check(condition, passMsg = null, failMsg = null, label = null) {
        if (this.stopOnError && this.errors.length > 0) return false;
        this.checkCount += 1;
        const suffix = label ? ` — ${label}` : '';
        if (condition) {
            if (passMsg) console.log(`OK : ${passMsg}${suffix}`);
        } else {
            const msg = `FAIL: ${failMsg || passMsg || 'check failed'}${suffix}`;
            console.error(msg);
            this.errors.push(msg);
            if (this.stopOnError) throw new Error(msg);
        }
        return !!condition;
    }

    // ── Internal helpers (non-chaining) ──────────────────────────────────────

    _computedVisible(element) {
        while (element) {
            const s = window.getComputedStyle(element);
            if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
            element = element.parentElement;
        }
        return true;
    }

    _find(selector, text = null) {
        for (const el of document.querySelectorAll(selector)) {
            if (text === null || el.textContent.includes(text)) return el;
        }
        return null;
    }

    _visible(selector, text = null) {
        const el = this._find(selector, text);
        return !!el && this._computedVisible(el);
    }

    _waitForCondition(conditionFn, timeoutMs = 1000, intervalMs = 100, label = null) {
        const dbg = label ? ` — ${label}` : '';
        console.log(`waitFor${dbg}: polling up to ${timeoutMs}ms`);
        return new Promise(resolve => {
            const deadline = Date.now() + timeoutMs;
            const id = setInterval(() => {
                if (conditionFn()) {
                    clearInterval(id);
                    console.log(`waitFor${dbg}: condition met`);
                    resolve(true);
                } else if (Date.now() >= deadline) {
                    clearInterval(id);
                    try { this.check(false, null, `waitFor timed out after ${timeoutMs}ms`, label); }
                    finally { resolve(false); }
                }
            }, intervalMs);
        });
    }

    // ── Assertions ────────────────────────────────────────────────────────────

    assertEq(expected, actual, label = null) {
        this.chain = this.chain.then(() => {
            const v = typeof actual === 'function' ? actual() : actual;
            this.check(expected === v,
                `assertEq: '${expected}' === '${v}'`,
                `assertEq: expected '${expected}' got '${v}'`,
                label);
        });
        return this;
    }

    assertTrue(actual, label = null)  { return this.assertEq(true,  actual, label); }  // B1 fix: this.
    assertFalse(actual, label = null) { return this.assertEq(false, actual, label); }  // B1 fix: this.

    assertVisible(selector, text = null, label = null) {
        this.chain = this.chain.then(() => {
            const el = this._find(selector, text) || this._find(selector);
            if (!this.check(el && this._computedVisible(el),
                    `visible: ${selector}${text ? ` "${text}"` : ''}`,
                    `not visible: ${selector}${text ? ` "${text}"` : ''}`, label)) return;
            if (!text) return;
            let content;
            if (el.tagName === 'SELECT') {
                const opt = el.options[el.selectedIndex];
                content = opt ? opt.text : '';
                this.check(content === text,
                    `selected: "${text}"`,
                    `selected "${content}" ≠ "${text}"`, label);
            } else {
                content = el.textContent;
                this.check(content.includes(text),
                    `contains: "${text}"`,
                    `"${text}" not in "${content.slice(0, 80)}"`, label);
            }
        });
        return this;
    }

    assertHidden(selector, text = null, label = null) {
        this.chain = this.chain.then(() => {
            const el = this._find(selector, text);
            this.check(!el || !this._computedVisible(el),
                `hidden: ${selector}`,
                `should be hidden: ${selector}`, label);
        });
        return this;
    }

    assertOption(selector, text, label = null) {
        this.chain = this.chain.then(() => {
            const el = document.querySelector(selector);
            const opts = el ? Array.from(el.options) : [];
            const found = opts.find(o => o.text === text || o.text.replace(/ /g, ' ') === text);
            this.check(!!found,
                `option "${text}" in ${selector}`,
                `option "${text}" not found in ${selector}`, label);
        });
        return this;
    }

    assertNoOption(selector, text, label = null) {
        this.chain = this.chain.then(() => {
            const el = document.querySelector(selector);
            const opts = el ? Array.from(el.options) : [];
            const found = opts.find(o => o.text === text || o.text.replace(/ /g, ' ') === text);
            this.check(!found,
                `no option "${text}" in ${selector}`,
                `option "${text}" unexpectedly present in ${selector}`, label);
        });
        return this;
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    set(selector, value, label = null) {
        this.chain = this.chain.then(() => {
            const el = document.querySelector(selector);
            if (!this.check(el, `set ${selector}`, `not found: ${selector}`, label)) return;
            el.value = value;
            if (el.value !== value) {
                const opt = Array.from(el.options || []).find(o => o.text === value);
                if (this.check(opt, `option "${value}"`, `option "${value}" not found in ${selector}`, label)) {
                    el.value = opt.value;
                }
            }
            const evt = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? 'input' : 'change';
            el.dispatchEvent(new Event(evt));
        });
        return this;
    }

    click(selector, text = null, label = null) {
        this.chain = this.chain.then(() => {
            const el = this._find(selector, text);
            if (this.check(el, `click ${selector}`, `not found: ${selector}`, label)) el.click();
        });
        return this;
    }

    run(fn, label = null) {  // B2 fix: check inside chain
        this.chain = this.chain.then(() => {
            if (this.check(typeof fn === 'function', 'run: fn ok', 'run: not a function', label)) fn();
        });
        return this;
    }

    wait(ms, label = null) {
        this.chain = this.chain.then(() => {
            console.log(`wait ${ms}ms${label ? ` — ${label}` : ''}`);
            return new Promise(resolve => setTimeout(resolve, ms));
        });
        return this;
    }

    waitFor(conditionFn, timeoutMs = 1000, intervalMs = 100, label = null) {  // B3 fix
        this.chain = this.chain.then(() =>
            this._waitForCondition(conditionFn, timeoutMs, intervalMs, label)
        );
        return this;
    }

    waitForVisible(selector, text = null, label = null, timeoutMs = 1000, intervalMs = 100) {  // B4 fix
        this.chain = this.chain.then(() =>
            this._waitForCondition(
                () => this._visible(selector, text),
                timeoutMs, intervalMs,
                label || `waitForVisible: ${selector}`
            )
        );
        return this;
    }

    waitForHidden(selector, text = null, label = null, timeoutMs = 1000, intervalMs = 100) {
        this.chain = this.chain.then(() =>
            this._waitForCondition(
                () => !this._visible(selector, text),
                timeoutMs, intervalMs,
                label || `waitForHidden: ${selector}`
            )
        );
        return this;
    }

    // ── Block management ──────────────────────────────────────────────────────

    addBlock(name, block) {
        if (typeof block !== 'function') {
            const msg = `addBlock "${name}": block must be a function`;
            console.error(msg); this.errors.push(msg); return this;
        }
        this.blocks[name] = block;
        return this;
    }

    clearBlocks() { this.blocks = {}; return this; }

    _logBlock(name) {
        this.chain = this.chain.then(() => {
            if (name === '_start') {
                console.log('─── TestRunner ─────────────────────────────────');
            } else if (name === '_end') {
                console.log('────────────────────────────────────────────────');
                this.summary();
            } else {
                console.log(`\n── ${name} ──`);
            }
        });
        return this;
    }

    runBlocks(stopOnError = null) {
        if (stopOnError !== null) this.stopOnError = stopOnError;
        const all = { _start: () => {}, ...this.blocks, _end: () => {} };
        Object.entries(all).forEach(([name, block]) => {
            this._logBlock(name);
            if (name !== '_start' && name !== '_end' && this.beforeBlock) {
                this.chain = this.chain.then(() => {
                    this.beforeBlock(this);  // appends steps to this.chain
                    return this.chain;       // await those steps before the block runs
                });
            }
            this.chain = this.chain.then(() => block(this));
        });
        this.chain = this.chain.catch(err => console.error('TestRunner fatal:', err));
        return this.chain;
    }

    summary() {
        console.log(`\nChecks: ${this.checkCount}`);
        if (this.errors.length === 0) {
            console.log(`✓ All ${this.checkCount} passed`);
        } else {
            console.error(`✗ ${this.errors.length} failed`);
            this.errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}`));
        }
    }
}
