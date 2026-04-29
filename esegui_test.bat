@echo off
setlocal EnableDelayedExpansion

echo.
echo  +==================================================+
echo  ^|      MirrorFit - Test Suite Automatica           ^|
echo  +==================================================+
echo.

cd /d "%~dp0backend"

:: ── Verifica venv ──────────────────────────────────────────────────────────
if not exist "venv\Scripts\activate.bat" (
    echo  [ERRORE] Virtual environment non trovato.
    echo  Esegui prima: setup.bat
    pause
    exit /b 1
)

:: ── Attiva venv ────────────────────────────────────────────────────────────
call venv\Scripts\activate.bat
echo  [OK] Virtual environment attivato

:: ── Installa dipendenze test (solo se mancano) ─────────────────────────────
echo  [..] Verifico dipendenze test...
pip install -q -r requirements-test.txt
echo  [OK] Dipendenze OK

:: ── Pulizia DB di test vecchio ─────────────────────────────────────────────
if exist "tests\test_temp.db" (
    del "tests\test_temp.db"
    echo  [OK] DB test precedente rimosso
)

echo.
echo  --------------------------------------------------
echo   Avvio test...
echo  --------------------------------------------------
echo.

:: ── Esegui pytest ──────────────────────────────────────────────────────────
python -m pytest tests/ ^
    --tb=short ^
    -v ^
    --no-header ^
    -p no:warnings ^
    --asyncio-mode=auto ^
    2>&1

set EXIT_CODE=%ERRORLEVEL%

echo.
echo  --------------------------------------------------

if %EXIT_CODE% == 0 (
    echo   RISULTATO: Tutti i test PASSATI [OK]
) else (
    echo   RISULTATO: Alcuni test FALLITI [!!]
    echo   Controlla l'output sopra per i dettagli.
)

echo  --------------------------------------------------
echo.

:: Pulizia DB test
if exist "tests\test_temp.db" del "tests\test_temp.db"

pause
exit /b %EXIT_CODE%
