"""Builds square, opaque iPhone icons from the game's icon.png.

usage: python make-icons.py <icon.png> <out_dir>
Writes icon-180.png (apple-touch-icon), icon-192.png, icon-512.png and icon-1024.png
(App Store size, used for the native app).
"""
import sys
from pathlib import Path

from PIL import Image

BG = (42, 43, 45, 255)  # the game's UI background colour (#2a2b2d)


def main() -> None:
    src = Image.open(sys.argv[1]).convert("RGBA")
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)

    bbox = src.getbbox() or (0, 0, src.width, src.height)
    sprite = src.crop(bbox)

    for size in (180, 192, 512, 1024):
        canvas = Image.new("RGBA", (size, size), BG)
        target = int(size * 0.82)
        scale = target / max(sprite.width, sprite.height)
        w, h = max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))
        resized = sprite.resize((w, h), Image.LANCZOS)
        canvas.alpha_composite(resized, ((size - w) // 2, (size - h) // 2))
        canvas.convert("RGB").save(out / f"icon-{size}.png", optimize=True)


if __name__ == "__main__":
    main()
