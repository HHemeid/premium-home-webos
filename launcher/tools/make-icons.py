#!/usr/bin/env python3
"""Generate the webOS app icons (icon.png 80x80, largeIcon.png 130x130) using only the stdlib.

Usage: python3 tools/make-icons.py
"""
import math
import struct
import zlib
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent / "app"
ICE = (127, 203, 255)
SUPERSAMPLE = 4


def pixel(px, py, size):
    """RGBA for one sample point: charcoal rounded square, icy ring, small accent dot."""
    half = size / 2
    corner = size * 0.22
    dx = max(abs(px - half) - (half - corner), 0)
    dy = max(abs(py - half) - (half - corner), 0)
    if math.hypot(dx, dy) > corner:
        return (0, 0, 0, 0)
    t = (px + py) / (2 * size)
    color = (int(26 - 12 * t), int(29 - 13 * t), int(36 - 16 * t))
    d = math.hypot(px - half, py - half)
    if abs(d - size * 0.25) < size * 0.035:
        color = ICE
    dot = math.hypot(px - size * 0.68, py - size * 0.32)
    if dot < size * 0.065:
        color = (236, 240, 245)
    return color + (255,)


def render(size):
    rows = bytearray()
    n = SUPERSAMPLE * SUPERSAMPLE
    for y in range(size):
        rows.append(0)  # PNG filter type: none
        for x in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(SUPERSAMPLE):
                for sx in range(SUPERSAMPLE):
                    r, g, b, a = pixel(x + (sx + 0.5) / SUPERSAMPLE, y + (sy + 0.5) / SUPERSAMPLE, size)
                    acc[0] += r * a
                    acc[1] += g * a
                    acc[2] += b * a
                    acc[3] += a
            alpha = acc[3] / n
            if acc[3]:
                rows += bytes((round(acc[0] / acc[3]), round(acc[1] / acc[3]), round(acc[2] / acc[3]), round(alpha)))
            else:
                rows += bytes((0, 0, 0, 0))
    return rows


def write_png(path, size):
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(bytes(render(size)), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)
    print(f"wrote {path.relative_to(APP_DIR.parent)} ({size}x{size})")


if __name__ == "__main__":
    write_png(APP_DIR / "icon.png", 80)
    write_png(APP_DIR / "largeIcon.png", 130)
