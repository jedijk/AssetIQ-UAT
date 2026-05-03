#!/usr/bin/env python3
"""
Make near-white pixels transparent in a PNG (white canvas + white checkmark on blue shield).
Threshold is conservative so light blue shield gradients are preserved.

Usage (from repo root):
  python3 frontend/scripts/make_operator_logo_transparent.py [input.png] [output.png]
Defaults: frontend/public/logo.png -> frontend/public/logo-operator.png
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image


def main(inp: Path, out: Path, thresh: int = 238) -> None:
    img = Image.open(inp).convert("RGBA")
    w, h = img.size
    px = img.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r >= thresh and g >= thresh and b >= thresh:
                px[x, y] = (r, g, b, 0)
    img.save(out, "PNG")
    print(f"Wrote {out} ({w}x{h}, thresh={thresh})")


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    default_in = root / "public" / "logo.png"
    default_out = root / "public" / "logo-operator.png"
    in_path = Path(sys.argv[1]) if len(sys.argv) > 1 else default_in
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else default_out
    if not in_path.is_file():
        raise SystemExit(f"Input not found: {in_path}")
    main(in_path, out_path)
