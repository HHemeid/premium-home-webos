#!/usr/bin/env python3
"""Capture the review screenshots (1920x1080, Mac preview in test mode) and a contact sheet.

Uses headless Chrome against a private 127.0.0.1 server and the app's test-mode URL parameters
(separate storage slot, sample data always labelled). These are browser renders, not TV photos.

Usage: python3 -B tools/take-screenshots.py
"""
import functools
import http.server
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import serve  # noqa: E402

PORT = 8652
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT = Path(__file__).resolve().parent.parent / "screenshots"
# Motion Reduced: stills, and headless Chrome pauses CSS fades, which would catch images mid-fade.
BASE = f"http://127.0.0.1:{PORT}/index.html?test=1&motion=reduced"
# v0.7: the same eight screens plus the page below the dock as the TV "before" captures, on fresh defaults (scenic first run).
# v0.8 review set (Mac preview, test mode). Weather screens use the labelled ?weatherDemo sample.
SHOTS = [
    ("v0.8-01-home", "&focus=tab:home&motion=reduced"),
    ("v0.8-02-home-dock-focus", "&focus=favorites:netflix&motion=reduced"),
    ("v0.8-03-home-tabs-shown", "&focus=tab:home&motion=reduced&wallpaper=lake-mcdonald&background=scenic"),
    ("v0.8-04-apps", "&section=apps&focus=tab:apps&motion=reduced"),
    ("v0.8-05-settings-wallpaper", "&section=settings&cat=wallpaper&focus=cat:wallpaper&motion=reduced"),
    ("v0.8-06-wallpaper-gallery", "&open=gallery&motion=reduced"),
    ("v0.8-07-ambient-weather-demo", "&view=ambient&motion=reduced&weatherDemo=snow&wallpaper=aurora-denali&background=scenic"),
    ("v0.8-08-home-weather-demo", "&focus=favorites:youtube&motion=reduced&weatherDemo=rain&wallpaper=bowman-lake&background=scenic"),
    ("v0.8-09-night", "&theme=night&focus=favorites:youtube&motion=reduced&wallpaper=oldman-lake&background=scenic"),
    ("v0.8-10-settings-about", "&section=settings&cat=about&focus=cat:about&motion=reduced"),
    ("v0.8-11-quick-settings", "&open=quick&motion=reduced"),
    ("v0.8-12-gaming", "&section=gaming&focus=tab:gaming&motion=reduced"),
]


def shoot(profile, url, path, budget=5000):
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", f"--user-data-dir={profile}", "--hide-scrollbars",
                    "--window-size=1920,1080", f"--timeout={budget}", f"--screenshot={path}", url],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60, check=False)


def main():
    handler = functools.partial(type("Q", (serve.NoCacheHandler,), {"log_message": lambda *a: None}), directory=str(serve.APP_DIR))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        for name, query in SHOTS:
            with tempfile.TemporaryDirectory() as profile:
                shoot(profile, BASE + query, OUT / f"{name}.png")
            print(name)
        cells = "".join(f'<figure><img src="{n}.png"><figcaption>{n[5:].replace("-", " ")}</figcaption></figure>' for n, _ in SHOTS)
        sheet = OUT / "_sheet.html"
        sheet.write_text('<html><body style="margin:0;background:#111;color:#ccc;font:22px -apple-system,sans-serif;display:grid;'
                         f'grid-template-columns:repeat(2,960px)">{cells}<style>figure{{margin:0}}img{{width:960px;display:block}}'
                         'figcaption{padding:6px 12px 14px}</style></body></html>')
    finally:
        server.shutdown()
    with tempfile.TemporaryDirectory() as profile:
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", f"--user-data-dir={profile}", "--hide-scrollbars", "--allow-file-access-from-files",
                        "--window-size=1920,3480", f"--screenshot={OUT / 'v0.8-MAC-CONTACT-SHEET.png'}",
                        sheet.as_uri()], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60, check=False)
    sheet.unlink()


if __name__ == "__main__":
    main()
