#!/usr/bin/env python3
"""fayf_ui dev server -- stdlib only. Port of infopedia_php/wrapper.php.

/wrapper?test=X.html   serve X.html + test/harness.js + test/js_runner.js + test/X_test.js
/wrapper?trace=X.html  serve X.html + test/tracer.js
/registry.json         {id: doc} for every parts/**.json and screens/**.json
no-store on every response (dev server, no reason to ever cache --
top-level pages bit this once: editing math-trainer.html served stale
until a cache-busting reload, because only specific path prefixes were
covered before; unconditional is simpler and closes it for good)
"""
import argparse
import http.server
import json
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == '/wrapper':
            return self.wrapper(urllib.parse.parse_qs(url.query))
        if url.path == '/registry.json':
            return self.registry()
        return super().do_GET()

    def wrapper(self, q):
        mode = 'test' if 'test' in q else 'trace' if 'trace' in q else None
        if not mode:
            return self.reply(400, 'usage: /wrapper?test=X.html | /wrapper?trace=X.html')
        target = Path(q[mode][0]).name          # basename only -- no traversal
        if not target.endswith('.html'):
            return self.reply(400, f'target must be .html: {target}')
        page = ROOT / target
        if not page.is_file():
            return self.reply(404, f'not found: {target}')
        if mode == 'test':
            rel = f'test/{target[:-5]}_test.js'
            if not (ROOT / rel).is_file():
                return self.reply(404, f'missing: {rel}')
            inject = ('<script src="test/harness.js"></script>\n'
                      '<script src="test/js_runner.js"></script>\n'
                      f'<script type="module" src="{rel}"></script>')
        else:
            inject = '<script src="test/tracer.js"></script>'
        html = page.read_text(encoding='utf-8').replace('</body>', inject + '\n</body>')
        self.reply(200, html, 'text/html; charset=utf-8')

    def registry(self):
        reg = {}
        for base, prefix in (('parts', ''), ('screens', 'screens/')):
            d = ROOT / base
            for f in sorted(d.rglob('*.json')) if d.is_dir() else []:
                rid = prefix + f.relative_to(d).as_posix()[:-5]
                reg[rid] = json.loads(f.read_text(encoding='utf-8'))
        self.reply(200, json.dumps(reg), 'application/json')

    def reply(self, code, text, ctype='text/plain; charset=utf-8'):
        body = text.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8017)
    args = ap.parse_args()
    print(f'fayf_ui: http://127.0.0.1:{args.port}/index.html')
    http.server.ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
