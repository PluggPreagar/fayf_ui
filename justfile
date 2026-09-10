port := env_var_or_default("PORT", "8017")

# List recipes
default:
    @just --list

# Dev server (Ctrl-C to stop)
serve:
    @echo "  app:    http://127.0.0.1:{{port}}/math-trainer.html"
    @echo "  app:    http://127.0.0.1:{{port}}/index.html"
    @echo "  tests:  http://127.0.0.1:{{port}}/wrapper?test=index.html"
    python3 server.py --port {{port}}

# All node tests -- L0-L1 model + parts conformance (+ registry.json freshness)
ci:
    node --test test/node/*.js

# Write registry.json -- static copy of /registry.json for consumers that
# vendor this repo as a pinned snapshot (no server). Re-run after any
# parts/screens change; `just ci` fails while it is stale.
build:
    python3 server.py --build

# Parts/screens conformance only
validate:
    node --test test/node/parts_validate_test.js

# Print browser test URL for PAGE (server must be running)
test PAGE="index.html":
    @echo "http://127.0.0.1:{{port}}/wrapper?test={{PAGE}}"

# Print tracer URL for PAGE
trace PAGE="index.html":
    @echo "http://127.0.0.1:{{port}}/wrapper?trace={{PAGE}}"
