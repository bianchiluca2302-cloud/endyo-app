@echo off
setlocal enabledelayedexpansion
title Endyo Installer

:: ── Colori ──────────────────────────────────────────────────────────────────
color 0B
echo.
echo  ========================================
echo    Endyo ^| Installer per Windows
echo  ========================================
echo.
echo  Installazione del collegamento Endyo...
echo.

:: ── Cerca Edge ──────────────────────────────────────────────────────────────
set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set "EDGE64=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "CHROME86=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

set "BROWSER="
if exist "%EDGE64%" set "BROWSER=%EDGE64%"
if exist "%EDGE%"   set "BROWSER=%EDGE%"
if not defined BROWSER (
  if exist "%CHROME%"   set "BROWSER=%CHROME%"
  if exist "%CHROME86%" set "BROWSER=%CHROME86%"
)

if not defined BROWSER (
  echo  [!] Edge o Chrome non trovati.
  echo      Installa Microsoft Edge o Google Chrome e riprova.
  echo.
  pause
  exit /b 1
)

:: ── Crea collegamento Desktop con PowerShell ────────────────────────────────
set "APPDATA_ENDYO=%APPDATA%\Endyo"
set "DESKTOP=%USERPROFILE%\Desktop\Endyo.lnk"
set "STARTMENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Endyo.lnk"

powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "foreach ($path in @('%DESKTOP%', '%STARTMENU%')) {" ^
  "  $sc = $ws.CreateShortcut($path);" ^
  "  $sc.TargetPath = '%BROWSER%';" ^
  "  $sc.Arguments = '--app=https://endyo.it/portal --user-data-dir=\"%APPDATA_ENDYO%\"';" ^
  "  $sc.Description = 'Endyo - Il tuo armadio digitale con Stylist AI';" ^
  "  $sc.Save()" ^
  "}"

echo  [OK] Collegamento Desktop creato
echo  [OK] Collegamento Menu Start creato
echo.

:: ── Apri Endyo ───────────────────────────────────────────────────────────────
echo  Vuoi aprire Endyo adesso?
choice /C YN /M " Y = Si  N = No"
echo.
if errorlevel 2 goto :done
start "" "%BROWSER%" "--app=https://endyo.it/portal" "--user-data-dir=%APPDATA_ENDYO%"

:done
echo.
echo  Installazione completata!
echo  Trovi Endyo sul Desktop e nel Menu Start.
echo.
pause
