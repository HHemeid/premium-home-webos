#!/usr/bin/env python3
"""Run the browser smoke tests headlessly in Google Chrome and print the results.

Starts a private local server (127.0.0.1, port 8651) for the duration of the run and opens
/__tests__/?report=1 in headless Chrome in real time (IndexedDB, timers and image decoding behave
as in a normal window). The page POSTs its results back to /__results__ when it finishes.
Nothing here contacts a TV or any external service.

Usage: python3 tools/run-browser-tests.py      (exit code 0 = all passed)
"""
import functools
import http.server
import json
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import serve  # noqa: E402  (same folder)

PORT = 8651
TIMEOUT_S = 240
CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
]


def main():
    chrome = next((c for c in CHROME_CANDIDATES if Path(c).exists()), None)
    if not chrome:
        print("Google Chrome not found; open http://127.0.0.1:8642/__tests__/ in any browser instead.")
        return 2

    done = threading.Event()
    report = {}

    class Handler(serve.NoCacheHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            if self.path != "/__results__":
                self.send_error(404)
                return
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            report.update(json.loads(body))
            self.send_response(204)
            self.end_headers()
            done.set()

    handler = functools.partial(Handler, directory=str(serve.APP_DIR))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    try:
        with tempfile.TemporaryDirectory() as profile:
            browser = subprocess.Popen(
                [chrome, "--headless=new", "--disable-gpu", f"--user-data-dir={profile}", "--window-size=1600,1000",
                 "--no-first-run", "--no-default-browser-check", f"http://127.0.0.1:{PORT}/__tests__/?report=1"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            try:
                done.wait(TIMEOUT_S)
            finally:
                browser.terminate()
                browser.wait(10)
    finally:
        server.shutdown()

    if not report:
        print(f"SUMMARY: no results within {TIMEOUT_S} s (did the page load?)")
        return 1
    for r in report["results"]:
        print(f"{r['status']}  {r['name']}" + (f"  →  {r['error']}" if r.get("error") else ""))
    print(f"SUMMARY: {report['summary']}, {report['userAgent'].split('Chrome/')[-1].split(' ')[0] and 'Chrome ' + report['userAgent'].split('Chrome/')[-1].split(' ')[0]}")
    return 0 if report["failed"] == 0 and report["results"] else 1


if __name__ == "__main__":
    sys.exit(main())
