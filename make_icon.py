"""
Genera ic_launcher_fg_{color}.png per ogni densità Android e public/logo_{color}.png
per la preview web. Tinge il logo e applica un gradiente radiale sui bordi.
"""
from PIL import Image
import numpy as np
import os

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


def radial_alpha(img: Image.Image, inner: float = 0.48, outer: float = 0.82) -> Image.Image:
    """
    Maschera alpha radiale: completamente opaco fino a inner*r,
    poi sfuma dolcemente fino a trasparente a outer*r.
    Nessun ritaglio netto — solo gradiente morbido.
    """
    w, h = img.size
    cx, cy = w / 2, h / 2
    r = min(cx, cy)
    inner_r = r * inner
    outer_r = r * outer

    ys, xs = np.mgrid[0:h, 0:w]
    dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)

    alpha = np.ones((h, w), dtype=np.float32)
    fade = (dist >= inner_r) & (dist <= outer_r)
    t = (dist[fade] - inner_r) / (outer_r - inner_r)
    alpha[fade] = (1 - t) ** 1.8          # curva smooth
    alpha[dist > outer_r] = 0.0

    mask = Image.fromarray((alpha * 255).astype(np.uint8), mode='L')
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


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


# ── 1. Carica immagine sorgente ──────────────────────────────────────────────
print(f"Carico {SRC}…")
src_raw = Image.open(SRC).convert("RGB")
print(f"  Dimensione: {src_raw.size}")

# ── 2. Genera PNG per ogni colore e densità ───────────────────────────────────
os.makedirs("public", exist_ok=True)

for color_id, hex_color in ACCENTS.items():
    tinted_raw = tint(src_raw, hex_color)
    tinted = radial_alpha(tinted_raw)   # gradiente sui bordi, no ritaglio

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
