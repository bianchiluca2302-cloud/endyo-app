"""
bg_service.py — rimozione sfondo tramite sottoprocesso Python isolato.

STRATEGIA MEMORIA:
    rembg durante l'inferenza occupa 400-800 MB di RAM anche con un singolo capo.
    Su Railway (piano base ~512 MB) questo causa OOM → crash 502 anche per una
    sola richiesta.

    Soluzione: il processo FastAPI principale non carica mai rembg.
    Ogni rimozione spawna un sottoprocesso Python dedicato che:
      1. Importa rembg + onnxruntime
      2. Carica il modello UNA SOLA VOLTA (u2netp, ~4 MB su disco, ~150 MB RAM)
      3. Processa TUTTI i path passati come argomenti in sequenza
      4. Esce → tutta la RAM viene liberata dal sistema operativo

    Passare più immagini allo stesso sottoprocesso è fondamentale: il primo
    avvio scarica/carica il modello; le immagini successive lo riutilizzano
    senza un secondo picco di RAM. Con sottoprocessi separati per front/back
    il secondo processo può ancora trovare RAM insufficiente se il GC del
    primo non ha ancora restituito la memoria al sistema.

MODELLO:
    Usiamo 'u2netp' (versione leggera di U2Net, ~4 MB).
    Qualità leggermente inferiore a 'silueta', ma sufficientemente buona per
    le anteprime dei capi e compatibile con i piani Railway a bassa RAM.

CACHE MODELLO:
    Il modello viene scaricato da rembg in ~/.u2net/ al primo utilizzo.
    Su Railway persiste durante il lifetime del container (non tra i restart),
    ma essendo solo 4 MB il re-download è rapido (~2-3 s).

PROTOCOLLO INPUT/OUTPUT:
    Il sottoprocesso riceve coppie di argomenti: input_path output_path, ...
    argv: [script, in1, out1, in2, out2, ...]
    Per ogni coppia stampa su stdout "OK:<output_path>" o "ERR:<input_path>:<msg>"
    Il processo principale legge le righe e aggiorna i path di conseguenza.
"""

import asyncio
import logging
import subprocess
import sys
import textwrap
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Script che gira nel sottoprocesso ────────────────────────────────────────
# Riceve coppie di argomenti (input_path, output_path) come argv[1..].
# Carica il modello una sola volta, poi processa tutte le coppie.
_BG_WORKER_SCRIPT = textwrap.dedent("""\
    import sys, io
    from pathlib import Path

    args = sys.argv[1:]
    if len(args) % 2 != 0:
        print("ERROR: numero di argomenti non pari", file=sys.stderr)
        sys.exit(1)

    pairs = [(args[i], args[i+1]) for i in range(0, len(args), 2)]

    try:
        from rembg import new_session, remove
        from PIL import Image

        # u2netp: il modello più leggero di rembg (~4 MB, ~150 MB RAM durante inferenza)
        # Caricato una sola volta per tutte le coppie di questo sottoprocesso.
        session = new_session("u2netp")
    except Exception as e:
        print(f"ERROR: impossibile caricare il modello: {e}", file=sys.stderr)
        sys.exit(2)

    for input_path, output_path in pairs:
        p = Path(input_path)
        if not p.exists():
            print(f"ERR:{input_path}:file non trovato", flush=True)
            continue
        try:
            with open(p, "rb") as f:
                data = f.read()

            # Resize to max 600px to avoid OOM on high-res phone photos
            import io as _io
            _img = Image.open(_io.BytesIO(data))
            _max_dim = 600
            if max(_img.size) > _max_dim:
                _ratio = _max_dim / max(_img.size)
                _new_size = (int(_img.size[0] * _ratio), int(_img.size[1] * _ratio))
                _img = _img.resize(_new_size, Image.LANCZOS)
                _buf = _io.BytesIO()
                _img.save(_buf, format="PNG")
                data = _buf.getvalue()

            output = remove(data, session=session)

            img = Image.open(io.BytesIO(output))
            img.save(output_path, "PNG")

            # Rimuovi originale solo se diverso dall'output
            if str(p) != output_path:
                try:
                    p.unlink()
                except Exception:
                    pass

            print(f"OK:{output_path}", flush=True)
        except Exception as e:
            print(f"ERR:{input_path}:{e}", flush=True)
""")


def _remove_bg_subprocess_sync(pairs: list[tuple[str, str]]) -> dict[str, str]:
    """
    Esegue la rimozione sfondo per tutte le coppie (input, output) in un
    singolo sottoprocesso Python isolato.

    Il modello viene caricato UNA sola volta per tutte le immagini, evitando
    il doppio picco di RAM che si avrebbe con sottoprocessi separati.

    Ritorna un dict {input_path: risultante_output_path}.
    Se una coppia fallisce, il valore rimane l'input_path originale.
    """
    if not pairs:
        return {}

    # Filtra coppie con file già processati o non esistenti
    valid_pairs = []
    result = {}
    for inp, out in pairs:
        p = Path(inp)
        if not p.exists():
            logger.warning("BG removal: file non trovato: %s", inp)
            result[inp] = inp
            continue
        if p.stem.endswith("_nobg"):
            result[inp] = inp  # già processato
            continue
        valid_pairs.append((inp, out))

    if not valid_pairs:
        return result

    # Costruisci argv: [in1, out1, in2, out2, ...]
    argv_pairs = []
    for inp, out in valid_pairs:
        argv_pairs += [inp, out]

    try:
        proc_result = subprocess.run(
            [sys.executable, "-c", _BG_WORKER_SCRIPT] + argv_pairs,
            timeout=300,       # 5 min max per batch (include eventuale download modello)
            capture_output=True,
            text=True,
        )

        # Parsing dell'output riga per riga
        output_map: dict[str, str] = {}
        for line in proc_result.stdout.splitlines():
            line = line.strip()
            if line.startswith("OK:"):
                out_path = line[3:]
                # Risali all'input corrispondente cercando la coppia
                for inp, out in valid_pairs:
                    if out == out_path:
                        output_map[inp] = out_path
                        break
            elif line.startswith("ERR:"):
                parts = line[4:].split(":", 1)
                if parts:
                    inp_path = parts[0]
                    msg = parts[1] if len(parts) > 1 else "errore sconosciuto"
                    logger.warning("BG subprocess ERR per %s: %s", inp_path, msg)
                    output_map[inp_path] = inp_path

        if proc_result.returncode != 0 and proc_result.stderr:
            logger.warning(
                "BG subprocess stderr (rc=%d): %s",
                proc_result.returncode,
                proc_result.stderr.strip()[-500:],
            )

        # Compila il risultato finale
        for inp, out in valid_pairs:
            if inp in output_map and Path(output_map[inp]).exists():
                result[inp] = output_map[inp]
                logger.info("BG rimosso: %s → %s", Path(inp).name, Path(output_map[inp]).name)
            else:
                logger.warning("BG fallito per %s (output non trovato)", Path(inp).name)
                result[inp] = inp

    except subprocess.TimeoutExpired:
        logger.error("BG subprocess timeout (>300 s) per %d immagini", len(valid_pairs))
        for inp, _ in valid_pairs:
            result[inp] = inp
    except Exception as e:
        logger.error("BG subprocess eccezione: %s", e)
        for inp, _ in valid_pairs:
            result[inp] = inp

    return result


async def remove_background(input_path: str) -> str:
    """
    Async wrapper per singola immagine — mantiene la firma originale.
    Internamente chiama il batch con una sola coppia.
    """
    p = Path(input_path)
    if not p.exists():
        return input_path

    output_path = str(p.parent / f"{p.stem}_nobg.png")
    loop = asyncio.get_event_loop()
    result_map = await loop.run_in_executor(
        None,
        _remove_bg_subprocess_sync,
        [(input_path, output_path)],
    )
    return result_map.get(input_path, input_path)


async def remove_background_batch(pairs: list[tuple[str, str]]) -> dict[str, str]:
    """
    Rimuove lo sfondo da più immagini in un singolo sottoprocesso.
    pairs: [(input_path, output_path), ...]
    Ritorna dict {input_path: output_path_risultante}.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _remove_bg_subprocess_sync, pairs)


def preload_model_sync():
    """
    Stub di compatibilità — con l'approccio a sottoprocesso non pre-carichiamo
    nulla nel processo principale. Il modello verrà scaricato al primo utilizzo
    nel processo figlio.
    """
    logger.info("bg_service: approccio subprocess — nessun preload nel processo principale")
