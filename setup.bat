@echo off
echo.
echo ╔══════════════════════════════════════╗
echo ║       Wardrobe AI - Setup            ║
echo ╚══════════════════════════════════════╝
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js non trovato. Installa da https://nodejs.org
    pause & exit /b 1
)
echo ✅ Node.js trovato

where python >nul 2>&1
if errorlevel 1 (
    echo ❌ Python non trovato. Installa da https://python.org
    pause & exit /b 1
)
echo ✅ Python trovato

echo.
echo 📦 Configurando backend Python...
cd backend
if not exist venv (
    python -m venv venv
    echo    Virtualenv creato
)
call venv\Scripts\activate.bat
pip install -q --upgrade pip
pip install -q -r requirements.txt
echo ✅ Dipendenze Python installate

if not exist .env (
    copy .env.example .env
    echo.
    echo ⚠️  IMPORTANTE: Apri backend\.env e inserisci la tua OPENAI_API_KEY
)
call deactivate
cd ..

echo.
echo 📦 Installando dipendenze Node.js...
call npm install
echo ✅ Dipendenze Node installate

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║  ✅ Setup completato!                                     ║
echo ║                                                          ║
echo ║  Prima di avviare:                                       ║
echo ║  1. Apri backend\.env                                    ║
echo ║  2. Inserisci la tua OPENAI_API_KEY                      ║
echo ║                                                          ║
echo ║  Per avviare l'app:                                      ║
echo ║     npm run dev   (modalità sviluppo)                    ║
echo ╚══════════════════════════════════════════════════════════╝
echo.
pause
