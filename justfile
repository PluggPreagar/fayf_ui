port := env_var_or_default("PORT", "8017")

# List recipes
default:
    @just --list

# Dev server (Ctrl-C to stop)
serve:
    @echo "  app:    http://127.0.0.1:{{port}}/index.html"
    @echo "  tests:  http://127.0.0.1:{{port}}/wrapper?test=index.html"
    python3 server.py --port {{port}}

# All node tests -- L0-L1 model + parts conformance
ci:
    node --test test/node/*.js

# Parts/screens conformance only
validate:
    node --test test/node/parts_validate_test.js

# Print browser test URL for PAGE (server must be running)
test PAGE="index.html":
    @echo "http://127.0.0.1:{{port}}/wrapper?test={{PAGE}}"

# Print tracer URL for PAGE
trace PAGE="index.html":
    @echo "http://127.0.0.1:{{port}}/wrapper?trace={{PAGE}}"
