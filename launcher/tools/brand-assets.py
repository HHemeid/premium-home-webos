#!/usr/bin/env python3
"""Build app/assets/brands/*.svg from downloaded originals (see BRAND-ASSET-SOURCES.md).

Usage: python3 -I tools/brand-assets.py <folder with the downloaded .svg files>

Every output is sanitized: only basic drawing elements survive, and scripts, event
attributes, external references, styles and comments are removed. The colour changes
listed in RECOLOUR are the only edits, and each is documented in BRAND-ASSET-SOURCES.md.
"""
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "app" / "assets" / "brands"
SVG_NS = "http://www.w3.org/2000/svg"
ALLOWED = {"svg", "g", "path", "polygon", "polyline", "rect", "circle", "ellipse", "defs", "radialGradient", "linearGradient", "stop", "title"}
ALLOWED_ATTRS = {"d", "points", "fill", "fill-rule", "clip-rule", "viewBox", "transform", "id",
                 "cx", "cy", "r", "fx", "fy", "gradientTransform", "gradientUnits", "x1", "y1", "x2", "y2",
                 "offset", "stop-color", "stop-opacity", "opacity", "fill-opacity", "x", "y", "width", "height", "rx", "ry", "points"}

# Simple Icons ship colourless single paths: give them the brand hex from Simple Icons' data.
# Triangles add the white "play" mark official icons show inside the cut-out.
SIMPLE = {
    "youtube": {"fill": "#FF0000", "under": "9.2,8.1 16.3,12 9.2,15.9"},
    "netflix": {"fill": "#E50914"},
    "stremio": {"fill": "#685CEE", "under": "10.2,7.4 16.5,12 10.2,16.6"},
    "tubi": {"fill": "#FFFFFF", "viewBox": "0 8.3 24 7.4"},  # white on a Tubi-purple tile; viewBox cropped to the wordmark
    "twitch": {"fill": "#FFFFFF"},  # white glyph on a Twitch-purple tile
}
# Wikimedia logos: map original colours to light-on-dark versions (others kept).
RECOLOUR = {
    "disneyplus": "white",  # every fill / gradient stop → white
    "primevideo": {"#232F3E": "#FFFFFF"},  # navy text → white; blue smile kept
    "xbox": "white",        # sphere + wordmark in white on an Xbox-green tile
    "geforcenow": {},       # kept as published (its own green, white and dark)
}


def local(tag):
    return tag.split("}", 1)[-1]


def sanitize(el):
    for child in list(el):
        if not isinstance(child.tag, str) or local(child.tag) not in ALLOWED:
            el.remove(child)
            continue
        sanitize(child)
    for name in list(el.attrib):
        key = local(name)
        value = el.attrib[name]
        if key == "style":
            # Keep only fill colours from inline styles (Illustrator exports put them there).
            m = re.search(r"fill:\s*(#[0-9A-Fa-f]{3,8})", value)
            del el.attrib[name]
            if m:
                el.set("fill", m.group(1))
            continue
        if key not in ALLOWED_ATTRS or "url(http" in value or "javascript:" in value.lower():
            del el.attrib[name]


def recolour(el, rule):
    for node in el.iter():
        for attr in ("fill", "stop-color"):
            v = node.get(attr)
            if not v or v == "none" or v.startswith("url("):
                continue
            if rule == "white":
                node.set(attr, "#FFFFFF")
            elif v.upper() in {k.upper() for k in rule}:
                node.set(attr, {k.upper(): w for k, w in rule.items()}[v.upper()])


def build(src_dir):
    OUT.mkdir(parents=True, exist_ok=True)
    ET.register_namespace("", SVG_NS)
    for name in list(SIMPLE) + list(RECOLOUR):
        src = Path(src_dir) / f"{name}.svg"
        if not src.exists():
            print(f"skip {name}: no download")
            continue
        tree = ET.parse(src)
        root = tree.getroot()
        sanitize(root)
        if root.get("viewBox") is None and root.get("width") and root.get("height"):
            root.set("viewBox", "0 0 %s %s" % (root.get("width"), root.get("height")))
        for attr in ("width", "height"):
            root.attrib.pop(attr, None)
        if name in SIMPLE:
            spec = SIMPLE[name]
            for p in root.iter(f"{{{SVG_NS}}}path"):
                p.set("fill", spec["fill"])
            if "viewBox" in spec:
                root.set("viewBox", spec["viewBox"])
            if "under" in spec:
                tri = ET.Element(f"{{{SVG_NS}}}polygon", {"points": spec["under"], "fill": "#FFFFFF"})
                root.insert(1, tri)  # after <title>, beneath the path
        else:
            recolour(root, RECOLOUR[name])
        out = OUT / f"{name}.svg"
        tree.write(out, encoding="unicode", xml_declaration=False)
        print(f"wrote {out.relative_to(OUT.parent.parent.parent)} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    build(sys.argv[1])
