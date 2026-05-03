"""
bg_service.py — rimozione sfondo dai capi del guardaroba usando rembg + silueta model.

Il modello 'silueta' (~45 MB) è ottimizzato per figure umane e vestiti.
Se rembg non è installato, viene installato automaticamente nel venv corrente.
Il modello viene scaricato alla prima esecuzione in ~/.u2net/silueta.onnx
"""

import asyncio
import io
import logging
import subprocess
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

# Sessione rembg condivisa (evita di ricaricare il modello ogni volta)
_rembg_session = None
_rembg_available = None  # None = non ancora verificato


def _ensure_rembg() -> bool:
    """
    Verifica che rembg sia disponibile; se non lo è, lo installa automaticamente
    nel venv corrente usando lo stesso Python dell'interprete in esecuzione.
    Ritorna True se rembg è utilizzabile, False in caso di errore.
    """
    global _rembg_available
    if _rembg_available is not None:
        return _rembg_available

    try:
        import rembg  # noqa: F401
        _rembg_available = True
        logger.info("rembg già disponibile")
        return True
    except ImportError:
        pass

    logger.info("rembg non trovato — installazione automatica in corso (potrebbe richiedere 1-2 minuti)...")
    try:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "rembg[cpu]", "onnxruntime", "--quiet"],
            timeout=180,
        )
        # Verifica che l'installazione sia andata a buon fine
        import importlib
        importlib.invalidate_caches()
        import rembg  # noqa: F401
        _rembg_available = True
        logger.info("rembg installato con successo")
        return True
    except Exception as e:
        logger.error("Impossibile installare rembg: %s", e)
        _rembg_available = False
        return False


def _get_session():
    """Restituisce la sessione rembg con il modello silueta (lazy init)."""
    global _rembg_session
    if _rembg_session is None:
        if not _ensure_rembg():
            return None
        try:
            from rembg import new_session
            _rembg_session = new_session("silueta")
            logger.info("rembg: modello silueta caricato")
        except Exception as e:
            logger.warning("rembg: impossibile caricare la sessione: %s", e)
    return _rembg_session


def _remove_bg_sync(input_path: str) -> str:
    """
    Rimuove lo sfondo dall'immagine.
    Salva il risultato come PNG (con trasparenza) nella stessa directory.
    Cancella il file originale se diverso.
    Ritorna il path del file risultante.
    """
    p = Path(input_path)
    if not p.exists():
        logger.warning("BG removal: file non trovato: %s", input_path)
        return input_path

    # Già processato
    if p.stem.endswith("_nobg"):
        return input_path

    if not _ensure_rembg():
        logger.warning("rembg non disponibile — sfondo non rimosso per %s", p.name)
        return input_path

    try:
        from rembg import remove

        session = _get_session()

        with open(p, "rb") as f:
            data = f.read()

        # Rimuovi sfondo
        if session:
            output = remove(data, session=session)
        else:
            output = remove(data)

        # Salva come PNG con trasparenza
        from PIL import Image
        img = Image.open(io.BytesIO(output))
        new_path = p.parent / f"{p.stem}_nobg.png"
        img.save(str(new_path), "PNG")

        # Rimuovi originale se diverso
        if str(new_path) != str(p):
            try:
                p.unlink()
            except Exception:
                pass

        logger.info("BG rimosso: %s → %s", p.name, new_path.name)
        return str(new_path)

    except Exception as e:
        logger.warning("BG removal fallito per %s: %s", p.name, e)
        return input_path


# ── Semaforo: max 1 rimozione sfondo alla volta ──────────────────────────────
# rembg durante l'inferenza occupa ~400-800 MB di RAM. Su Railway con pochi GB
# disponibili, due rimozioni parallele causano OOM → crash 502.
# Il semaforo serializza le richieste: ogni task aspetta che la precedente finisca.
_bg_semaphore: asyncio.Semaphore | None = None


def _get_bg_semaphore() -> asyncio.Semaphore:
    """Lazy-init: crea il semaforo nel loop corretto (quello di FastAPI)."""
    global _bg_semaphore
    if _bg_semaphore is None:
        _bg_semaphore = asyncio.Semaphore(1)
    return _bg_semaphore


async def remove_background(input_path: str) -> str:
    """
    Async wrapper per la rimozione dello sfondo.
    Gira in un thread separato per non bloccare l'event loop.
    Il semaforo garantisce che al massimo 1 rimozione sia attiva alla volta,
    evitando OOM sul server.
    Ritorna il path del file risultante (PNG se riuscito, originale se fallito).
    """
    async with _get_bg_semaphore():
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _remove_bg_sync, input_path)


def preload_model_sync():
    """
    Scarica e inizializza il modello silueta in modo sincrono.
    Da chiamare in un thread al primo avvio per evitare attese al primo utilizzo.
    """
    if _ensure_rembg():
        _get_session()
        logger.info("rembg: modello pronto")
