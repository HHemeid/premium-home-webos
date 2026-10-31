#!/usr/bin/env python3
"""Serve app/ on 127.0.0.1 only, with caching disabled so edits show up on reload.

The browser smoke tests in tests/browser/ are served at /__tests__/ (same origin as the app,
which they load in an iframe). They are kept out of app/ so they never end up in a TV package.

Usage: python3 tools/serve.py [port]   (default 8642)
"""
import functools
import http.server
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_DIR = ROOT / "app"
TESTS_DIR = (ROOT / "tests" / "browser").resolve()
TESTS_PREFIX = "/__tests__/"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def translate_path(self, path):
        clean = urllib.parse.unquote(path.split("?", 1)[0].split("#", 1)[0])
        if clean.startswith(TESTS_PREFIX):
            target = (TESTS_DIR / (clean[len(TESTS_PREFIX):] or "index.html")).resolve()
            # Never serve anything outside tests/browser.
            if target == TESTS_DIR or TESTS_DIR in target.parents:
                return str(target)
            return str(TESTS_DIR / "__not_found__")
        return super().translate_path(path)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8642
    handler = functools.partial(NoCacheHandler, directory=str(APP_DIR))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"Premium Home preview: http://127.0.0.1:{port}/")
        print(f"Browser smoke tests:  http://127.0.0.1:{port}/__tests__/   (Ctrl+C to stop)")
        server.serve_forever()
