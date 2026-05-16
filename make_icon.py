"""
Genera le icone launcher per tutte le varianti (8 colori × 2 temi).

Flusso per ogni variante:
  1. Parte dall'immagine ORIGINALE (Endyoapp4.png, sempre intera)
  2. Tema SCURO  → inverte i colori  (sfondo bianco→nero, logo amber→blu)
     Tema CHIARO → usa l'originale   (sfondo bianco rimane bianco)
  3. Tinge con il colore accent (luminanza × accent, preserva la 3D)
  4. Applica gradiente alpha radiale morbido sui bordi
  5. Salva nei mipmap Android e in public/ per la preview web
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

DENSITIES = [          # (cartella mipmap, px canvas foreground adaptive)
    ("mipmap-mdpi",    108),
    ("mipmap-hdpi",    162),
    ("mipmap-xhdpi",   216),
    ("mipmap-xxhdpi",  324),
    ("mipmap-xxxhdpi", 432),
]


# ── Trasformazioni ─────────────────────────────────────────────────────────────

def invert_rgb(img: Image.Image) -> Image.Image:
    """Inverte i colori RGB preservando il canale alpha se presente."""
    arr = np.array(img.convert("RGB"), dtype=np.float32)
    arr = 255.0 - arr
    return Image.fromarray(arr.astype(np.uint8), "RGB")


def tint(img: Image.Image, hex_color: str, boost: float = 1.3) -> Image.Image:
    """Colora il logo con il colore accent preservando la luminanza 3D."""
    r = int(hex_color[1:3], 16)
    g = int(hex_color[3:5], 16)
    b = int(hex_color[5:7], 16)

    arr = np.array(img.convert("RGB"), dtype=np.float32)
    lum = (arr[:, :, 0] * 0.299 + arr[:, :, 1] * 0.587 + arr[:, :, 2] * 0.114) / 255.0

    out = np.zeros_like(arr)
    out[:, :, 0] = np.clip(lum * r * boost, 0, 255)
    out[:, :, 1] = np.clip(lum * g * boost, 0, 255)
    out[:, :, 2] = np.clip(lum * b * boost, 0, 255)
    return Image.fromarray(out.astype(np.uint8), "RGB")


def radial_alpha(img: Image.Image, inner: float = 0.42, outer: float = 0.80) -> Image.Image:
    """
    Gradiente alpha radiale: opaco al centro, sfuma dolcemente ai bordi.
    Nessun ritaglio netto — transizione continua (curva smooth).
    """
    w, h = img.size
    cx, cy = w / 2, h / 2
    r = min(cx, cy)

    ys, xs = np.mgrid[0:h, 0:w]
    dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2).astype(np.float32)

    alpha = np.ones((h, w), dtype=np.float32)
    fade_zone = (dist >= r * inner) & (dist <= r * outer)
    t = (dist[fade_zone] - r * inner) / (r * outer - r * inner)
    alpha[fade_zone] = (1.0 - t) ** 2.0    # easing quadratico
    alpha[dist > r * outer] = 0.0

    mask = Image.fromarray((alpha * 255).clip(0, 255).astype(np.uint8), "L")
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def make_canvas(img: Image.Image, size: int) -> Image.Image:
    """Ridimensiona al canvas mantenendo le proporzioni, centrato."""
    src = img.copy()
    # Riempi il canvas al 95% per un piccolo margine di sicurezza
    max_dim = int(size * 0.95)
    src.thumbnail((max_dim, max_dim), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - src.width)  // 2
    oy = (size - src.height) // 2
    canvas.paste(src, (ox, oy), src)
    return canvas


# ── Carica immagine originale ─────────────────────────────────────────────────
print(f"Carico {SRC}…")
original = Image.open(SRC).convert("RGB")
inverted = invert_rgb(original)
print(f"  Dimensione originale: {original.size}")

os.makedirs("public", exist_ok=True)

# ── Genera tutte le varianti ──────────────────────────────────────────────────
for color_id, hex_color in ACCENTS.items():
    for theme in ("light", "dark"):
        base = original if theme == "light" else inverted
        processed = radial_alpha(tint(base, hex_color))

        # Web preview  (324 px — qualità alta per la preview in Settings)
        web = make_canvas(processed, 324)
        suffix = "" if theme == "light" else "_dark"
        web.save(f"public/logo_{color_id}{suffix}.png")

        # Android mipmap densities
        for folder, fg_px in DENSITIES:
            out_dir = os.path.join(RES, folder)
            os.makedirs(out_dir, exist_ok=True)
            canvas = make_canvas(processed, fg_px)
            canvas.save(os.path.join(out_dir, f"ic_launcher_fg_{color_id}_{theme}.png"))

    print(f"  {color_id}: light + dark @ {len(DENSITIES)} densità")

print("\nDone!")
