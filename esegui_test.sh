#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"

echo ""
echo " ╔══════════════════════════════════════════════════╗"
echo " ║        MirrorFit — Test Suite Automatica         ║"
echo " ╚══════════════════════════════════════════════════╝"
echo ""

cd "$BACKEND_DIR"

# ── Verifica venv ─────────────────────────────────────────────────────────────
if [ ! -f "venv/bin/activate" ]; then
    echo " [ERRORE] Virtual environment non trovato."
    echo " Esegui prima: ./setup.sh"
    exit 1
fi

source venv/bin/activate
echo " [OK] Virtual environment attivato"

# ── Installa dipendenze test ──────────────────────────────────────────────────
echo " [..] Verifico dipendenze test..."
pip install -q -r requirements-test.txt
echo " [OK] Dipendenze OK"

# ── Pulizia DB vecchio ────────────────────────────────────────────────────────
[ -f "tests/test_temp.db" ] && rm "tests/test_temp.db" && echo " [OK] DB test precedente rimosso"

echo ""
echo " ─────────────────────────────────────────────────"
echo "  Avvio test..."
echo " ─────────────────────────────────────────────────"
echo ""

# ── Esegui pytest ─────────────────────────────────────────────────────────────
EXIT_CODE=0
python -m pytest tests/ \
    --tb=short \
    -v \
    --no-header \
    -p no:warnings \
    --asyncio-mode=auto \
    || EXIT_CODE=$?

echo ""
echo " ─────────────────────────────────────────────────"
if [ $EXIT_CODE -eq 0 ]; then
    echo "  RISULTATO: Tutti i test PASSATI ✓"
else
    echo "  RISULTATO: Alcuni test FALLITI ✗"
    echo "  Controlla l'output sopra per i dettagli."
fi
echo " ─────────────────────────────────────────────────"
echo ""

# Pulizia DB test
[ -f "tests/test_temp.db" ] && rm "tests/test_temp.db"

exit $EXIT_CODE
