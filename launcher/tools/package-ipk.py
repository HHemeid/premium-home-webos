#!/usr/bin/env python3
"""Build and validate the webOS package locally. Never contacts a TV.

Usage: python3 -B tools/package-ipk.py

Everything (package name, version, commands) is derived from app/appinfo.json and from the
CLI's own output, never hard-coded. Writes dist/<id>_<version>_all.ipk and dist/PACKAGE-INFO.txt.
Requires the project-local LG CLI (tools/setup-webos-cli.sh).
"""
import hashlib
import json
import re
import struct
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
DIST = ROOT / "dist"
BIN = ROOT / "tools" / "webos-cli" / "node_modules" / ".bin"
ALLOWED_URL_HOSTS = {"api.open-meteo.com", "www.w3.org"}  # weather API (opt-in); SVG namespace strings


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).strip()


def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    return struct.unpack(">II", head[16:24])


def main():
    problems = []
    if not (BIN / "ares-package").exists():
        sys.exit("LG CLI not found. Run tools/setup-webos-cli.sh first.")

    info = json.loads((APP / "appinfo.json").read_text())
    app_id, version = info["id"], info["version"]
    print(f"appinfo.json: id={app_id} version={version} title={info.get('title')}")

    # 1. Required fields and icon sizes (LG appinfo reference).
    for field in ("id", "version", "type", "main", "title", "icon"):
        if not info.get(field):
            problems.append(f"appinfo.json is missing '{field}'")
    if info.get("resolution") not in ("1920x1080", "1280x720"):
        problems.append("resolution must be 1920x1080 or 1280x720")
    for key, want in (("icon", (80, 80)), ("largeIcon", (130, 130))):
        if info.get(key):
            size = png_size(APP / info[key])
            print(f"{key}: {info[key]} {size[0]}x{size[1]}")
            if size != want:
                problems.append(f"{key} should be {want[0]}x{want[1]}, is {size[0]}x{size[1]}")

    # 2. Only installable files in app/ (tests and tools live outside it).
    files = sorted(p.relative_to(APP).as_posix() for p in APP.rglob("*") if p.is_file())
    stray = [f for f in files if re.search(r"(^|/)(tests?|tools|node_modules|\.git)(/|$)|\.(md|py|sh|zip)$|\.DS_Store$", f)]
    if stray:
        problems.append("non-app files inside app/: " + ", ".join(stray))
    print(f"app/ files: {len(files)}")

    # 3. No unexpected external URLs, fonts or CDNs; no obvious secrets.
    for f in files:
        if not f.endswith((".js", ".html", ".css", ".json", ".svg")):
            continue
        text = (APP / f).read_text(errors="ignore")
        for host in set(re.findall(r"https?://([a-zA-Z0-9.-]+)", text)):
            if host not in ALLOWED_URL_HOSTS:
                problems.append(f"{f}: unexpected external host {host}")
        if re.search(r"(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][^'\"]{6,}", text, re.I):
            problems.append(f"{f}: looks like an embedded secret")

    # 4. LG's own validation, then packaging.
    code, out = run([str(BIN / "ares-package"), "--check", str(APP)])
    print("ares-package --check:", out.splitlines()[-1] if out else code)
    if code != 0:
        problems.append("ares-package --check failed:\n" + out)

    if problems:
        print("\nNOT PACKAGED, problems found:\n- " + "\n- ".join(problems))
        return 1

    DIST.mkdir(exist_ok=True)
    for old in DIST.glob("*.ipk"):
        old.unlink()
    code, out = run([str(BIN / "ares-package"), "-o", str(DIST), str(APP)])
    print(out)
    if code != 0:
        print("ares-package failed")
        return 1
    built = sorted(DIST.glob("*.ipk"))
    expected = f"{app_id}_{version}_all.ipk"
    if len(built) != 1 or built[0].name != expected:
        print(f"Unexpected output: {[b.name for b in built]} (expected {expected})")
        return 1
    ipk = built[0]
    digest = hashlib.sha256(ipk.read_bytes()).hexdigest()
    code, details = run([str(BIN / "ares-package"), "-i", str(ipk)])

    report = f"""Premium Home package (built locally, NOT installed anywhere)

File:    {ipk.name}
Size:    {ipk.stat().st_size} bytes
SHA-256: {digest}
App ID:  {app_id}
Version: {version}
CLI:     @webos-tools/cli (project-local), {run([str(BIN / 'ares'), '-V'])[1]}

ares-package -i:
{details}

Commands for the LATER, separately approved TV step (do not run before then).
DEVICE is the name you choose in ares-setup-device; never type a literal placeholder.
  ares-install --device DEVICE dist/{ipk.name}
  ares-launch  --device DEVICE {app_id}
  ares-install --device DEVICE --remove {app_id}     # rollback: removes the app
"""
    (DIST / "PACKAGE-INFO.txt").write_text(report)
    print("\n" + report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
