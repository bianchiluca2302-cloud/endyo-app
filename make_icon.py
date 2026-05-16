"""
Genera ic_launcher_foreground.png per ogni densità Android
partendo da Endyoapp4.png (sfondo bianco → trasparente via flood-fill dai bordi).
"""
from PIL import Image
import os
from collections import deque

SRC   = "backend/assets/Endyoapp4.png"
RES   = "android/app/src/main/res"

# Densità: (cartella, px foreground adaptive, px launcher normale)
DENSITIES = [
    ("mipmap-mdpi",    108,  48),
    ("mipmap-hdpi",    162,  72),
    ("mipmap-xhdpi",   216,  96),
    ("mipmap-xxhdpi",  324, 144),
    ("mipmap-xxxhdpi", 432, 192),
]

TOLERANCE = 30   # quanto "bianco" conta come sfondo


def flood_fill_alpha(img: Image.Image, tolerance: int) -> Image.Image:
    """Rende trasparenti i pixel bianchi connessi ai bordi (flood-fill BFS)."""
    img = img.convert("RGBA")
    w, h = img.size
    pixels = img.load()

    def is_bg(r, g, b):
        return r >= 255 - tolerance and g >= 255 - tolerance and b >= 255 - tolerance

    visited = [[False] * h for _ in range(w)]
    queue = deque()

    # Seed: tutti i pixel del perimetro che sono "bianchi"
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
        pixels[cx, cy] = (0, 0, 0, 0)   # trasparente
        for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
                r, g, b, a = pixels[nx, ny]
                if is_bg(r, g, b):
                    visited[nx][ny] = True
                    queue.append((nx, ny))

    return img


# ── Carica sorgente e rimuovi sfondo ─────────────────────────────────────────
print(f"Carico {SRC}…")
src = Image.open(SRC)
print(f"  Dimensione originale: {src.size}")
transparent = flood_fill_alpha(src, TOLERANCE)
print("  Sfondo rimosso.")

# ── Genera per ogni densità ───────────────────────────────────────────────────
for folder, fg_px, launcher_px in DENSITIES:
    out_dir = os.path.join(RES, folder)
    os.makedirs(out_dir, exist_ok=True)

    # Foreground adaptive (108dp × densità) — centrato nel canvas
    fg = transparent.copy()
    fg.thumbnail((fg_px, fg_px), Image.LANCZOS)
    canvas = Image.new("RGBA", (fg_px, fg_px), (0, 0, 0, 0))
    offset = ((fg_px - fg.width) // 2, (fg_px - fg.height) // 2)
    canvas.paste(fg, offset, fg)
    out_fg = os.path.join(out_dir, "ic_launcher_foreground.png")
    canvas.save(out_fg)
    print(f"  {out_fg}  ({fg_px}×{fg_px})")

    # Launcher normale (per API < 26)
    lc = transparent.copy()
    lc.thumbnail((launcher_px, launcher_px), Image.LANCZOS)
    canvas2 = Image.new("RGBA", (launcher_px, launcher_px), (0, 0, 0, 0))
    offset2 = ((launcher_px - lc.width) // 2, (launcher_px - lc.height) // 2)
    canvas2.paste(lc, offset2, lc)
    # Per il launcher normale manteniamo la versione amber come fallback
    out_lc = os.path.join(out_dir, "ic_launcher.png")
    canvas2.save(out_lc)
    out_lr = os.path.join(out_dir, "ic_launcher_round.png")
    canvas2.save(out_lr)
    print(f"  {out_lc}  ({launcher_px}×{launcher_px})")

print("\nDone!")
