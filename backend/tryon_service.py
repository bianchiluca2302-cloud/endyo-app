"""
tryon_service.py — integrazione FASHN API per virtual try-on
Documentazione: https://docs.fashn.ai/

Le immagini vengono inviate come base64 data URI perché il backend gira su
localhost e non è raggiungibile da FASHN (API cloud esterna).

Flow:
  1. POST /run  → ricevi prediction_id
  2. Poll GET /status/{id} fino a status == "completed" o "failed"
  3. Scarica l'immagine dal link result e salvala in uploads/
"""

import os
import asyncio
import uuid
import base64
import logging
from pathlib import Path
import httpx

logger = logging.getLogger(__name__)

FASHN_BASE = "https://api.fashn.ai/v1"
UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

# Mappa categoria → tipo indumento FASHN
# FASHN accetta: "top", "bottom", "one-piece"
CATEGORY_TO_FASHN = {
    "maglietta":  "tops",
    "felpa":      "tops",
    "giacchetto": "tops",
    "pantaloni":  "bottoms",
    "cappello":   None,   # non supportato da FASHN
    "scarpe":     None,   # non supportato da FASHN
}


def get_fashn_key() -> str | None:
    return os.getenv("FASHN_API_KEY")


def fashn_supported(category: str) -> bool:
    """Restituisce True se la categoria è supportata da FASHN."""
    return CATEGORY_TO_FASHN.get(category) is not None


def _resolve_path(path_or_relpath: str) -> Path:
    """
    Risolve un path (assoluto, relativo, o URL-style /uploads/xxx) nel path
    assoluto del filesystem.
    """
    s = str(path_or_relpath)
    # URL-style: /uploads/filename.ext → UPLOADS_DIR/filename.ext
    if s.startswith("/uploads/"):
        return UPLOADS_DIR / Path(s).name
    p = Path(s)
    if p.is_absolute() and p.exists():
        return p
    # Fallback: cerca solo il filename in UPLOADS_DIR
    return UPLOADS_DIR / p.name


def _file_to_data_uri(path_or_relpath: str) -> str:
    """
    Converte un file locale in un data URI base64.
    Accetta path assoluti, relativi, o URL-style (/uploads/xxx).
    """
    p = _resolve_path(path_or_relpath)

    if not p.exists():
        raise FileNotFoundError(f"Immagine non trovata: {p}")

    with open(p, "rb") as f:
        data = f.read()

    ext = p.suffix.lower().lstrip(".")
    mime = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
    b64 = base64.b64encode(data).decode()
    return f"data:{mime};base64,{b64}"


async def _post_run(
    client: httpx.AsyncClient,
    api_key: str,
    model_data_uri: str,
    garment_data_uri: str,
    category: str,
) -> str:
    """Avvia una predizione FASHN e ritorna il prediction_id."""
    fashn_cat = CATEGORY_TO_FASHN[category]
    # Formato corretto API FASHN v1: { model_name, inputs: { ... } }
    payload = {
        "model_name": "tryon-v1.6",
        "inputs": {
            "model_image":        model_data_uri,
            "garment_image":      garment_data_uri,
            "category":           fashn_cat,
            "mode":               "balanced",
            "num_samples":        1,
            "garment_photo_type": "auto",
            "moderation_level":   "permissive",
            "output_format":      "jpeg",
        },
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    resp = await client.post(f"{FASHN_BASE}/run", json=payload, headers=headers, timeout=60)
    if resp.status_code != 200:
        body = resp.text[:500]
        raise ValueError(f"FASHN /run errore {resp.status_code}: {body}")
    data = resp.json()
    pred_id = data.get("id")
    if not pred_id:
        raise ValueError(f"FASHN /run non ha restituito un id: {data}")
    return pred_id


async def _poll_status(
    client: httpx.AsyncClient,
    api_key: str,
    prediction_id: str,
    max_wait: int = 180,
    interval: int = 5,
) -> str:
    """Poll finché lo status non è 'completed' o 'failed'. Ritorna l'URL dell'immagine."""
    headers = {"Authorization": f"Bearer {api_key}"}
    elapsed = 0
    while elapsed < max_wait:
        await asyncio.sleep(interval)
        elapsed += interval
        resp = await client.get(
            f"{FASHN_BASE}/status/{prediction_id}",
            headers=headers,
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status", "")
        logger.debug("FASHN poll %s → %s (elapsed %ds)", prediction_id, status, elapsed)
        if status == "completed":
            output = data.get("output", [])
            if not output:
                raise ValueError("FASHN completed ma output è vuoto")
            return output[0]  # URL immagine
        if status in ("failed", "cancelled", "error"):
            error = data.get("error") or data.get("message", "sconosciuto")
            raise ValueError(f"FASHN prediction {prediction_id} fallita: {error}")
        # "in-queue" e "in-progress" → continuiamo a fare polling
    raise TimeoutError(f"FASHN timeout dopo {max_wait}s per prediction {prediction_id}")


async def _download_image(client: httpx.AsyncClient, image_url: str) -> str:
    """Scarica l'immagine e salvala in uploads/. Ritorna il path relativo."""
    resp = await client.get(image_url, timeout=30)
    resp.raise_for_status()
    filename = f"tryon_{uuid.uuid4().hex}.jpg"
    dest = UPLOADS_DIR / filename
    dest.write_bytes(resp.content)
    return f"/uploads/{filename}"


async def _post_run_fashn_cat(
    client: httpx.AsyncClient,
    api_key: str,
    model_data_uri: str,
    garment_data_uri: str,
    fashn_cat: str,
) -> str:
    """Avvia una predizione FASHN con categoria già nel formato FASHN (es. 'tops')."""
    payload = {
        "model_name": "tryon-v1.6",
        "inputs": {
            "model_image":        model_data_uri,
            "garment_image":      garment_data_uri,
            "category":           fashn_cat,
            "mode":               "balanced",
            "num_samples":        1,
            "garment_photo_type": "auto",
            "moderation_level":   "permissive",
            "output_format":      "jpeg",
        },
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    resp = await client.post(f"{FASHN_BASE}/run", json=payload, headers=headers, timeout=60)
    if resp.status_code != 200:
        body = resp.text[:500]
        raise ValueError(f"FASHN /run errore {resp.status_code}: {body}")
    data = resp.json()
    pred_id = data.get("id")
    if not pred_id:
        raise ValueError(f"FASHN /run non ha restituito un id: {data}")
    return pred_id


async def generate_outfit_tryon(
    avatar_path: str,
    garments: list[dict],  # lista di {'photo': '/uploads/xxx', 'category': 'maglietta'}
) -> str:
    """
    Genera un virtual try-on dell'outfit completo.
    Catena le chiamate FASHN: avatar → indossa top → indossa bottom.

    Args:
        avatar_path: path della foto avatar
        garments: lista ordinata di capi con 'photo' e 'category'
    Returns:
        Path relativo dell'immagine finale (/uploads/tryon_xxx.jpg)
    """
    api_key = get_fashn_key()
    if not api_key:
        raise ValueError("FASHN_API_KEY non configurata nel file .env")

    # Filtra solo capi supportati e ordina: tops prima, poi bottoms
    order = ["tops", "bottoms"]
    supported = []
    for g in garments:
        fashn_cat = CATEGORY_TO_FASHN.get(g["category"])
        if fashn_cat:
            supported.append({"photo": g["photo"], "fashn_cat": fashn_cat})
    supported.sort(key=lambda x: order.index(x["fashn_cat"]) if x["fashn_cat"] in order else 99)

    if not supported:
        raise ValueError("Nessun capo nell'outfit è supportato da FASHN (usa maglietta, felpa, giacchetto o pantaloni)")

    current_model_path = avatar_path
    last_result_path = None

    for item in supported:
        logger.info("FASHN outfit: applicazione %s su %s", item["fashn_cat"], current_model_path)
        model_uri   = _file_to_data_uri(current_model_path)
        garment_uri = _file_to_data_uri(item["photo"])

        async with httpx.AsyncClient() as client:
            pred_id = await _post_run_fashn_cat(client, api_key, model_uri, garment_uri, item["fashn_cat"])
            logger.info("FASHN outfit: prediction_id=%s", pred_id)
            image_url = await _poll_status(client, api_key, pred_id, max_wait=240)
            logger.info("FASHN outfit: completato → %s", image_url)
            local_path = await _download_image(client, image_url)
            logger.info("FASHN outfit: salvato → %s", local_path)

        # Usa il risultato come avatar per il prossimo capo
        current_model_path = local_path
        last_result_path = local_path

    return last_result_path


async def generate_tryon(
    model_image_path: str,
    garment_image_path: str,
    category: str,
    base_url: str = "http://127.0.0.1:8000",  # non più usato, mantenuto per compatibilità
) -> str:
    """
    Genera un'immagine virtual try-on.

    Args:
        model_image_path: path del file avatar (es. /uploads/avatar_xxx.jpg)
        garment_image_path: path del file capo (es. /uploads/front_xxx.jpg)
        category: categoria del capo
        base_url: (deprecato, ignorato — le immagini vengono inviate come base64)

    Returns:
        Path relativo dell'immagine generata (/uploads/tryon_xxx.jpg)
    """
    api_key = get_fashn_key()
    if not api_key:
        raise ValueError("FASHN_API_KEY non configurata nel file .env")

    if not fashn_supported(category):
        raise ValueError(f"Categoria '{category}' non supportata da FASHN")

    # Converti le immagini in base64 — evita il problema dei localhost URL
    logger.info("FASHN: conversione immagini in base64...")
    model_uri   = _file_to_data_uri(model_image_path)
    garment_uri = _file_to_data_uri(garment_image_path)

    async with httpx.AsyncClient() as client:
        logger.info("FASHN: avvio try-on categoria=%s", category)
        pred_id = await _post_run(client, api_key, model_uri, garment_uri, category)
        logger.info("FASHN: prediction_id=%s", pred_id)

        image_url = await _poll_status(client, api_key, pred_id)
        logger.info("FASHN: completato → %s", image_url)

        local_path = await _download_image(client, image_url)
        logger.info("FASHN: salvato → %s", local_path)
        return local_path
