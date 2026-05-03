"""
bg_service.py — rimozione sfondo tramite sottoprocesso Python isolato.

STRATEGIA MEMORIA:
    rembg durante l'inferenza occupa 400-800 MB di RAM anche con un singolo capo.
    Su Railway (piano base ~512 MB) questo causa OOM → crash 502 anche per una
    sola richiesta.

    Soluzione: il processo FastAPI principale non carica mai rembg.
    Ogni rimozione spawna un sottoprocesso Python dedicato che:
      1. Importa rembg + onnxruntime
      2. Carica il modello (u2netp, ~4 MB su disco, ~150 MB RAM durante inferenza)
      3. Processa l'immagine e salva il PNG
      4. Esce → tutta la RAM viene liberata dal sistema operativo

    Il processo principale rimane leggero (<200 MB) e non rischia mai OOM.

MODELLO:
    Usiamo 'u2netp' (versione leggera di U2Net, ~4 MB).
    Qualità leggermente inferiore a 'silueta', ma sufficientemente buona per
    le anteprime dei capi e compatibile con i piani Railway a bassa RAM.

CACHE MODELLO:
    Il modello viene scaricato da rembg in ~/.u2net/ al primo utilizzo.
    Su Railway persiste durante il lifetime del container (non tra i restart),
    ma essendo solo 4 MB il re-download è rapido (~2-3 s).
"""

import asyncio
import logging
import subprocess
import sys
import textwrap
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Script che gira nel sottoprocesso ────────────────────────────────────────
# Costruito come stringa e passato a `python -c "..."`.
# Riceve input_path e output_path come argomenti argv[1] e argv[2].
_BG_WORKER_SCRIPT = textwrap.dedent("""\
    import sys, io
    from pathlib import Path

    input_path  = sys.argv[1]
    output_path = sys.argv[2]

    p = Path(input_path)
    if not p.exists():
        print(f"FILE_NOT_FOUND: {input_path}", file=sys.stderr)
        sys.exit(1)

    try:
        from rembg import new_session, remove
        from PIL import Image

        # u2netp: il modello più leggero di rembg (~4 MB, ~150 MB RAM durante inferenza)
        session = new_session("u2netp")

        with open(p, "rb") as f:
            data = f.read()

        output = remove(data, session=session)

        img = Image.open(io.BytesIO(output))
        img.save(output_path, "PNG")

        # Rimuovi originale solo se diverso dall'output
        if str(p) != output_path:
            try:
                p.unlink()
            except Exception:
                pass

        print("OK")
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(2)
""")


def _remove_bg_subprocess_sync(input_path: str) -> str:
    """
    Esegue la rimozione sfondo in un sottoprocesso Python isolato.

    Il sottoprocesso carica rembg + modello, processa, salva, ed esce.
    Quando il processo figlio termina, tutta la sua RAM viene liberata —
    il processo FastAPI principale non vede mai il picco di memoria.

    Ritorna il path del PNG risultante, oppure input_path se fallisce.
    """
    p = Path(input_path)

    if not p.exists():
        logger.warning("BG removal: file non trovato: %s", input_path)
        return input_path

    # Già processato in un run precedente
    if p.stem.endswith("_nobg"):
        return input_path

    output_path = str(p.parent / f"{p.stem}_nobg.png")

    try:
        result = subprocess.run(
            [sys.executable, "-c", _BG_WORKER_SCRIPT, input_path, output_path],
            timeout=180,       # 3 min max (include eventuale download modello)
            capture_output=True,
            text=True,
        )

        if result.returncode == 0 and Path(output_path).exists():
            logger.info("BG rimosso: %s → %s (rc=0)", p.name, Path(output_path).name)
            return output_path
        else:
            logger.warning(
                "BG subprocess fallito per %s (rc=%d): %s",
                p.name, result.returncode, result.stderr.strip()[-300:],
            )
            return input_path

    except subprocess.TimeoutExpired:
        logger.error("BG subprocess timeout per %s (>180 s)", p.name)
        return input_path
    except Exception as e:
        logger.error("BG subprocess eccezione per %s: %s", p.name, e)
        return input_path


async def remove_background(input_path: str) -> str:
    """
    Async wrapper: esegue _remove_bg_subprocess_sync in un thread separato
    per non bloccare l'event loop di FastAPI durante l'attesa del sottoprocesso.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _remove_bg_subprocess_sync, input_path)


def preload_model_sync():
    """
    Stub di compatibilità — con l'approccio a sottoprocesso non pre-carichiamo
    nulla nel processo principale. Il modello verrà scaricato al primo utilizzo
    nel processo figlio.
    """
    logger.info("bg_service: approccio subprocess — nessun preload nel processo principale")
