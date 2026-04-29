#!/bin/bash
set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║       Wardrobe AI - Setup            ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Check Node.js ─────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "❌ Node.js non trovato. Installa da https://nodejs.org"
  exit 1
fi
echo "✅ Node.js $(node -v)"

# ── Check Python ──────────────────────────────────────────────────────────────
PYTHON=""
for cmd in python3 python; do
  if command -v $cmd &>/dev/null; then
    PYTHON=$cmd
    break
  fi
done
if [ -z "$PYTHON" ]; then
  echo "❌ Python non trovato. Installa da https://python.org"
  exit 1
fi
echo "✅ Python $($PYTHON --version)"

# ── Backend venv + deps ───────────────────────────────────────────────────────
echo ""
echo "📦 Configurando backend Python..."
cd backend

if [ ! -d "venv" ]; then
  $PYTHON -m venv venv
  echo "   Virtualenv creato"
fi

source venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt
echo "✅ Dipendenze Python installate"

# .env
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo ""
  echo "⚠️  IMPORTANTE: Apri backend/.env e inserisci la tua OPENAI_API_KEY"
fi
deactivate
cd ..

# ── Frontend deps ─────────────────────────────────────────────────────────────
echo ""
echo "📦 Installando dipendenze Node.js..."
npm install
echo "✅ Dipendenze Node installate"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Setup completato!                                     ║"
echo "║                                                          ║"
echo "║  Prima di avviare:                                       ║"
echo "║  1. Apri backend/.env                                    ║"
echo "║  2. Inserisci la tua OPENAI_API_KEY                      ║"
echo "║                                                          ║"
echo "║  Per avviare l'app:                                      ║"
echo "║     npm run dev          (modalità sviluppo)             ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
