"""
Genera le icone launcher per tutte le varianti (8 colori × 2 temi).

Flusso per ogni variante:
  1. Parte dall'immagine ORIGINALE (Endyoapp4.png, sfondo chiaro + logo amber)
  2. Tema SCURO  → inverte i canali RGB (sfondo chiaro→scuro)
     Tema CHIARO → usa l'originale
  3. Tinge i canali RGB con il colore accent (luminanza × accent)
  4. Crea canvas pieno: bg = colore dell'angolo tinted, logo al 65% del canvas
     → logo sempre dentro la safe-zone Android (66.7%), sfondo seamless
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

LOGO_PCT = 0.65        # logo occupa il 65% del canvas → dentro la safe-zone (66.7%)


# ── Trasformazioni ─────────────────────────────────────────────────────────────

def invert_rgb(img: Image.Image) -> Image.Image:
    arr = np.array(img.convert("RGBA"), dtype=np.float32)
    arr[:, :, :3] = 255.0 - arr[:, :, :3]
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def tint(img: Image.Image, hex_color: str, boost: float = 1.3) -> Image.Image:
    r = int(hex_color[1:3], 16)
    g = int(hex_color[3:5], 16)
    b = int(hex_color[5:7], 16)
    rgba = np.array(img.convert("RGBA"), dtype=np.float32)
    lum = (rgba[:,:,0]*0.299 + rgba[:,:,1]*0.587 + rgba[:,:,2]*0.114) / 255.0
    rgba[:,:,0] = np.clip(lum * r * boost, 0, 255)
    rgba[:,:,1] = np.clip(lum * g * boost, 0, 255)
    rgba[:,:,2] = np.clip(lum * b * boost, 0, 255)
    return Image.fromarray(rgba.astype(np.uint8), "RGBA")


def make_canvas(img: Image.Image, size: int) -> Image.Image:
    """
    Canvas finale:
    - Sfondo riempito col colore dell'angolo top-left (seamless, no bordi estranei)
    - Logo scalato a LOGO_PCT del canvas → dentro la safe-zone delle adaptive icon
    """
    rgba = img.convert("RGBA")

    # Colore bg dall'angolo top-left dell'immagine tintata
    arr = np.array(rgba)
    bg_px = arr[0, 0]
    bg_color = (int(bg_px[0]), int(bg_px[1]), int(bg_px[2]), 255)

    # Canvas riempito col colore bg
    canvas = Image.new("RGBA", (size, size), bg_color)

    # Logo scalato al LOGO_PCT
    logo = rgba.copy()
    max_dim = int(size * LOGO_PCT)
    logo.thumbnail((max_dim, max_dim), Image.LANCZOS)

    ox = (size - logo.width)  // 2
    oy = (size - logo.height) // 2
    canvas.paste(logo, (ox, oy), logo)
    return canvas


# ── Carica immagine originale ──────────────────────────────────────────────────
print(f"Carico {SRC}…")
original = Image.open(SRC).convert("RGBA")
inverted = invert_rgb(original)
print(f"  Dimensione originale: {original.size}")

os.makedirs("public", exist_ok=True)

# ── Genera tutte le varianti ───────────────────────────────────────────────────
for color_id, hex_color in ACCENTS.items():
    for theme in ("light", "dark"):
        base = original if theme == "light" else inverted
        processed = tint(base, hex_color)

        # Web preview 324 px
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
