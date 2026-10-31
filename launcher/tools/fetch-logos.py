#!/usr/bin/env python3
"""Download the brand logos on your own machine and build app/assets/brands/*.svg.

Usage: python3 -I tools/fetch-logos.py

The logos are trademarks of their owners and are NOT part of this repository. This
script fetches each one from its public source (Simple Icons, CC0, and Wikimedia Commons
public-domain text logos), checks the download against the SHA-256 recorded in
BRAND-ASSET-SOURCES.md, then applies the documented colour changes via brand-assets.py.
Without it the launcher shows plain monogram tiles, which is fine too.
"""
import hashlib
import sys
import tempfile
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SI = "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/"
WM = "https://upload.wikimedia.org/wikipedia/commons/"
SOURCES = {
    "youtube": (SI + "youtube.svg", "5038808acbbc4e6edda16cbeb1cc6dec80e4e4ee4e227e039c41229fa222aa8c"),
    "netflix": (SI + "netflix.svg", "67dbc495988bd5667a09ed4f56e14db4070a44c7a74e297b146c229f70fd6f6e"),
    "stremio": (SI + "stremio.svg", "88b47bc8690fee5b98ba89972446d4ad86c7f14f77dc6a1260ec1ba8f506130b"),
    "tubi": (SI + "tubi.svg", "676ed4e503226dd4399405e80c99e97119809e5b6d5c31b9c413edf59d8b6b76"),
    "twitch": (SI + "twitch.svg", "dbe27bc02a01b8d89b6259cacef328c9fa70bb13c29f38c36eb1421863f6f0b6"),
    "disneyplus": (WM + "3/3e/Disney%2B_logo.svg", "ad0ea07cb6627c268dae721d9647019e6e3ce1b51c8f4ba8ec8ddf4618546140"),
    "primevideo": (WM + "1/11/Amazon_Prime_Video_logo.svg", "8aaa625b2e8a8ba5247e1035e111b73feb312df08c9ff04e2ef59240595f29a2"),
    "xbox": (WM + "d/d7/Xbox_logo_%282019%29.svg", "3125ef256b609370346686a681d821b52f043e0e16996e190e90b1b59b78f377"),
    "geforcenow": (WM + "4/4d/GeForce_Now_logo_%282022%29.svg", "7d0d92eabc36f8c3873a081356de0c7c1e3e04c93d2bfe8f9ba363570a48b96c"),
}


def main():
    sys.path.insert(0, str(HERE))
    import importlib
    brand_assets = importlib.import_module("brand-assets")
    with tempfile.TemporaryDirectory() as tmp:
        for name, (url, sha) in SOURCES.items():
            req = urllib.request.Request(url, headers={"User-Agent": "premium-home-fetch-logos/1.0 (personal launcher)"})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            got = hashlib.sha256(data).hexdigest()
            if got != sha:
                print(f"{name}: the download changed since it was reviewed (sha256 {got[:12]}…); skipped. "
                      f"Check the file yourself, then add it to {tmp} and run brand-assets.py.")
                continue
            (Path(tmp) / f"{name}.svg").write_bytes(data)
            print(f"{name}: downloaded and verified")
        brand_assets.build(tmp)


if __name__ == "__main__":
    main()
