#!/usr/bin/env python3
"""Compare baseline and candidate Pocket Showcase page PNG screenshots pixel-by-pixel."""

from __future__ import annotations

import os
import sys
from PIL import Image, ImageChops

REQUIRED_PAGES = ("home", "gallery")


def load_rgba(path: str) -> Image.Image:
    if not os.path.isfile(path) or os.path.getsize(path) <= 0:
        raise ValueError("missing or empty screenshot")
    with Image.open(path, formats=["PNG"]) as img:
        img.load()
        width, height = img.size
        if width <= 0 or height <= 0:
            raise ValueError("invalid screenshot dimensions")
        return img.convert("RGBA")


def compare_page(baseline_dir: str, candidate_dir: str, page: str) -> tuple[str, bool]:
    base_path = os.path.join(baseline_dir, f"{page}.png")
    cand_path = os.path.join(candidate_dir, f"{page}.png")
    try:
        base_img = load_rgba(base_path)
        cand_img = load_rgba(cand_path)
    except (OSError, ValueError, Image.DecompressionBombError):
        return f"- `{page}`: FAIL (missing or invalid RGBA PNG)", False

    if base_img.size != cand_img.size:
        bw, bh = base_img.size
        cw, ch = cand_img.size
        return (
            f"- `{page}`: FAIL (dimension mismatch baseline={bw}x{bh} candidate={cw}x{ch})",
            False,
        )

    width, height = base_img.size
    total_pixels = width * height
    red, green, blue, alpha = ImageChops.difference(base_img, cand_img).split()
    changed = ImageChops.lighter(
        ImageChops.lighter(red, green), ImageChops.lighter(blue, alpha)
    )
    bbox = changed.getbbox()
    if bbox is None:
        return (
            f"- `{page}` ({width}x{height}): 0/{total_pixels} pixels differ (0.000000%), bbox=none",
            True,
        )

    diff_pixels = total_pixels - changed.histogram()[0]
    pct = (diff_pixels * 100.0) / total_pixels
    x0, y0, x1, y1 = bbox
    return (
        f"- `{page}` ({width}x{height}): {diff_pixels}/{total_pixels} pixels differ ({pct:.6f}%), bbox=({x0},{y0},{x1},{y1})",
        False,
    )


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: compare-pocket-page-pixels.py <baseline_dir> <candidate_dir>", file=sys.stderr)
        return 2

    baseline_dir, candidate_dir = sys.argv[1], sys.argv[2]
    all_ok = True
    lines: list[str] = []
    for page in REQUIRED_PAGES:
        line, ok = compare_page(baseline_dir, candidate_dir, page)
        lines.append(line)
        if not ok:
            all_ok = False

    status = "PASS" if all_ok else "FAIL"
    print(f"Pocket page pixel comparison: {status}")
    for line in lines:
        print(line)
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
