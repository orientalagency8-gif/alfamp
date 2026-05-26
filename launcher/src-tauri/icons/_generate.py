"""Generate placeholder Alfa MP launcher icons (A-shape on dark bg) in all sizes."""
from PIL import Image, ImageDraw
from pathlib import Path

OUT = Path(__file__).parent
BG = (14, 14, 18, 255)
FG = (214, 58, 81, 255)  # accent red

def draw_a(img: Image.Image):
    """Draw a stylized A glyph centered."""
    d = ImageDraw.Draw(img)
    w, h = img.size
    # Outer triangle
    cx = w / 2
    pad_x = w * 0.16
    pad_y = h * 0.10
    pts = [(cx, pad_y), (w - pad_x, h - pad_y), (pad_x, h - pad_y)]
    d.polygon(pts, fill=FG)
    # Cut-out window (smaller inverted triangle)
    inner_pad_x = w * 0.32
    inner_top_y = h * 0.42
    inner_bot_y = h * 0.72
    d.polygon([(cx, inner_top_y), (w - inner_pad_x, inner_bot_y), (inner_pad_x, inner_bot_y)], fill=BG)
    # Cross bar
    bar_y = h * 0.74
    bar_h = h * 0.05
    d.rectangle([(w * 0.30, bar_y), (w * 0.70, bar_y + bar_h)], fill=FG)

def make_icon(size: int) -> Image.Image:
    img = Image.new('RGBA', (size, size), BG)
    draw_a(img)
    return img

sizes_png = {
    '32x32.png':      32,
    '128x128.png':    128,
    '128x128@2x.png': 256,
}
for name, size in sizes_png.items():
    p = OUT / name
    make_icon(size).save(p, 'PNG')
    print(f'  {name}  {size}x{size}')

# Windows .ico — multi-resolution
ico_sizes = [16, 24, 32, 48, 64, 128, 256]
ico_imgs = [make_icon(s) for s in ico_sizes]
ico_imgs[0].save(OUT / 'icon.ico', sizes=[(s, s) for s in ico_sizes])
print('  icon.ico  (multi-res)')

# macOS .icns — Tauri doesn't strictly need this on Win-only builds, but listed in conf.
# Pillow has no native ICNS writer; generate as PNG renamed (Tauri will warn but not fail
# when targets=msi,nsis). If needed later, use `iconutil` or `png2icns`.
make_icon(512).save(OUT / 'icon.icns', 'PNG')
print('  icon.icns  (PNG placeholder — replace before macOS bundle)')

# Also place a 512px icon (sometimes referenced by Tauri tooling)
make_icon(512).save(OUT / 'icon.png', 'PNG')
print('  icon.png  512x512')
print('\nDone.')
