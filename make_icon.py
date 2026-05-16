"""
Genera ic_launcher_fg_{color}.png per ogni densità Android e public/logo_{color}.png
per la preview web. Tinge il logo con i colori accent preservando la luminosità 3D.
"""
from PIL import Image
import numpy as np
import os
from collections import deque

SRC = "backend/assets/Endyoapp4.png"
RES = "android/app/src/main/res"

ACCENTS = {
    "violet": "#8b5cf6",
    "blue":   "#3b82f6",
    "pink":   "#ec4899",
    "green":  "#10b981",
    "amber":  "#f59e0b",
    "red":    "#ef4444",
    "cyan":   "#06b6d4",
    "orange": "#f97316",
}

# (cartella, px foreground adaptive)
DENSITIES = [
    ("mipmap-mdpi",    108),
    ("mipmap-hdpi",    162),
    ("mipmap-xhdpi",   216),
    ("mipmap-xxhdpi",  324),
    ("mipmap-xxxhdpi", 432),
]

TOLERANCE = 30


def flood_fill_alpha(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    w, h = img.size
    pixels = img.load()

    def is_bg(r, g, b):
        return r >= 255 - TOLERANCE and g >= 255 - TOLERANCE and b >= 255 - TOLERANCE

    visited = [[False] * h for _ in range(w)]
    queue = deque()
    for x in range(w):
        for y in [0, h - 1]:
            r, g, b, a = pixels[x, y]
            if not visited[x][y] and is_bg(r, g, b):
                visited[x][y] = True
                queue.append((x, y))
    for y in range(h):
        for x in [0, w - 1]:
            r, g, b, a = pixels[x, y]
            if not visited[x][y] and is_bg(r, g, b):
                visited[x][y] = True
                queue.append((x, y))

    while queue:
        cx, cy = queue.popleft()
        pixels[cx, cy] = (0, 0, 0, 0)
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
                r, g, b, a = pixels[nx, ny]
                if is_bg(r, g, b):
                    visited[nx][ny] = True
                    queue.append((nx, ny))
    return img


def tint(img: Image.Image, hex_color: str) -> Image.Image:
    """Colora il logo con l'accent preservando la luminosità 3D del render."""
    ar = int(hex_color[1:3], 16)
    ag = int(hex_color[3:5], 16)
    ab = int(hex_color[5:7], 16)

    data = np.array(img.convert("RGBA"), dtype=np.float32)
    lum = (data[:, :, 0] * 0.299 + data[:, :, 1] * 0.587 + data[:, :, 2] * 0.114) / 255.0

    boost = 1.25
    data[:, :, 0] = np.clip(lum * ar * boost, 0, 255)
    data[:, :, 1] = np.clip(lum * ag * boost, 0, 255)
    data[:, :, 2] = np.clip(lum * ab * boost, 0, 255)
    # alpha invariata

    return Image.fromarray(data.astype(np.uint8), "RGBA")


def make_canvas(source: Image.Image, size: int) -> Image.Image:
    img = source.copy()
    # Usa 80% del canvas per lasciare margine (zona sicura adaptive icon)
    max_dim = int(size * 0.80)
    img.thumbnail((max_dim, max_dim), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - img.width) // 2
    oy = (size - img.height) // 2
    canvas.paste(img, (ox, oy), img)
    return canvas


# ── 1. Carica e rimuovi sfondo ────────────────────────────────────────────────
print(f"Carico {SRC}…")
src_raw = Image.open(SRC)
transparent = flood_fill_alpha(src_raw)
print("  Sfondo rimosso.")

# ── 2. Genera PNG per ogni colore e densità ───────────────────────────────────
os.makedirs("public", exist_ok=True)

for color_id, hex_color in ACCENTS.items():
    tinted = tint(transparent, hex_color)

    # Web preview (324 px, stessa del xxhdpi)
    web = make_canvas(tinted, 324)
    web.save(f"public/logo_{color_id}.png")
    print(f"  public/logo_{color_id}.png")

    # Android mipmap densities
    for folder, fg_px in DENSITIES:
        out_dir = os.path.join(RES, folder)
        os.makedirs(out_dir, exist_ok=True)
        canvas = make_canvas(tinted, fg_px)
        path = os.path.join(out_dir, f"ic_launcher_fg_{color_id}.png")
        canvas.save(path)

    print(f"  ic_launcher_fg_{color_id}.png  @ {len(DENSITIES)} densità")

print("\nDone!")
