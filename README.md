# fayf_ui

Wireframe UI library. Box + path, token config, JSON parts.
Governed by [CONSTITUTION.md](CONSTITUTION.md). Spec: [docs/superpowers/specs/2026-08-27-wireframe-ui-design.md](docs/superpowers/specs/2026-08-27-wireframe-ui-design.md).

    just serve     # http://127.0.0.1:8017/index.html  (gallery)
    just ci        # node tests: model + parts conformance + registry.json freshness
    just build     # write registry.json (static /registry.json for vendored snapshots)
    just test PAGE # browser test URL (index / render / handles / anatomy)

Pages: `index.html` gallery · `anatomy.html` screen · `handles.html` proximity demo
· `quiz.html` · `math-trainer.html` · `thw.html` (THW-Lernkarten ladder; try `?style=luna`)
· `machine.html` (L9 controller fixture) · `shell.html` (workspace shell: head · side-panel · content · detail · status).

Controllers (L9, C11): `ui/machine.js` — machine JSON (`initial` + `states{ enter?, <trigger>: <state> }`),
pure handlers `(status, payload) → { status, effects? }`, pure `view(status) → { slot: content }`,
effects `fetch · emit · timer · send` run by the controller. `step()`/`init()` tested under node.
`ui/quiz.js` + `machines/quiz.json` is the first real controller on it.

Skins: `?style=wireframe` (default) · `mockup` · `luna` — `ui/style-mode.js`, `ui/tokens.css`.
