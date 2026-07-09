#!/usr/bin/env python3
"""Compress images before GitHub Pages deploy (CI only)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow is required.", file=sys.stderr)
    sys.exit(1)

SUPPORTED = {".png", ".jpg", ".jpeg", ".webp"}
ROOT = Path(__file__).resolve().parent.parent / "images"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-width", type=int, default=1280)
    parser.add_argument("--max-height", type=int, default=1280)
    parser.add_argument("--quality", type=int, default=82)
    parser.add_argument("--png-compress", type=int, default=9)
    parser.add_argument("path", nargs="?", default=str(ROOT))
    return parser.parse_args()


def iter_images(root: Path):
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.lower() in SUPPORTED:
            yield path


def fit_within(image: Image.Image, max_width: int, max_height: int) -> Image.Image:
    width, height = image.size
    if width <= max_width and height <= max_height:
        return image
    scale = min(max_width / width, max_height / height)
    resample = Image.Resampling.LANCZOS if hasattr(Image, "Resampling") else Image.LANCZOS
    return image.resize((max(1, int(width * scale)), max(1, int(height * scale))), resample)


def save_image(image: Image.Image, path: Path, quality: int, png_compress: int) -> None:
    suffix = path.suffix.lower()
    kwargs: dict = {"optimize": True}

    if suffix in {".jpg", ".jpeg"}:
        if image.mode in {"RGBA", "LA", "P"}:
            image = image.convert("RGB")
        kwargs.update(quality=quality, progressive=True)
        image.save(path, format="JPEG", **kwargs)
    elif suffix == ".webp":
        kwargs.update(quality=quality, method=6)
        image.save(path, format="WEBP", **kwargs)
    elif suffix == ".png":
        kwargs["compress_level"] = png_compress
        image.save(path, format="PNG", **kwargs)
    else:
        image.save(path, **kwargs)


def compress_file(path: Path, args: argparse.Namespace) -> None:
    original_size = path.stat().st_size
    temp_path = path.with_name(f"{path.stem}.compressed{path.suffix}")

    with Image.open(path) as source:
        source.load()
        resized = fit_within(source, args.max_width, args.max_height)
        save_image(resized, temp_path, args.quality, args.png_compress)

    new_size = temp_path.stat().st_size
    if new_size < original_size:
        temp_path.replace(path)
        print(f"  {path.relative_to(ROOT.parent)}: {original_size // 1024} KB -> {new_size // 1024} KB")
    else:
        temp_path.unlink(missing_ok=True)


def main() -> int:
    args = parse_args()
    root = Path(args.path).resolve()

    if not root.exists():
        print(f"Path not found: {root}", file=sys.stderr)
        return 1

    files = list(iter_images(root))
    if not files:
        print(f"No images found in {root}")
        return 0

    print(f"Compressing {len(files)} image(s)...")
    for path in files:
        try:
            compress_file(path, args)
        except OSError as err:
            print(f"  skipped {path.name}: {err}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
