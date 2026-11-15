"""Draws the native app's launch screen in the game's own loading-screen style.

usage: python make-splash.py <icon.png> <PressStart2P.ttf> <out.png>

iOS shows it "aspect fill" on a landscape phone, so only the middle ~40 % band of
this square image is visible: everything is kept inside that band.
"""
import sys

from PIL import Image, ImageDraw, ImageFont

SIZE = 2732
BG = (42, 43, 45)          # #2a2b2d, the game's UI background
WHITE = (212, 212, 212)    # --white
RED = (163, 54, 53)        # --red


def stroked_text(draw, xy, text, font, fill, stroke):
    draw.text(xy, text, font=font, fill=fill, anchor="mm", stroke_width=stroke, stroke_fill=(0, 0, 0))


def main() -> None:
    icon_path, font_path, out = sys.argv[1:4]
    img = Image.new("RGB", (SIZE, SIZE), BG)
    draw = ImageDraw.Draw(img)
    cx, cy = SIZE // 2, SIZE // 2

    sprite = Image.open(icon_path).convert("RGBA")
    sprite = sprite.crop(sprite.getbbox() or (0, 0, sprite.width, sprite.height))
    target_h = 330
    scale = target_h / sprite.height
    sprite = sprite.resize((round(sprite.width * scale), target_h), Image.LANCZOS)
    img.paste(sprite, (cx - sprite.width // 2, cy - 330), sprite)

    title = ImageFont.truetype(font_path, 132)
    subtitle = ImageFont.truetype(font_path, 64)
    stroked_text(draw, (cx, cy + 110), "POKÉPATH", title, WHITE, 10)
    stroked_text(draw, (cx, cy + 230), "TOWER DEFENSE", subtitle, RED, 6)

    img.save(out, optimize=True)


if __name__ == "__main__":
    main()
