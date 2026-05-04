#!/bin/bash
# Endyo - Installer per macOS
# Doppio clic per eseguire (assicurati che il file abbia permessi di esecuzione)

echo ""
echo "========================================"
echo "  Endyo | Installer per macOS"
echo "========================================"
echo ""
echo "  Creazione di Endyo.app in corso..."
echo ""

APP_DIR="$HOME/Applications/Endyo.app"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

# ── Info.plist ─────────────────────────────────────────────────────────────
cat > "$APP_DIR/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>       <string>endyo</string>
  <key>CFBundleIdentifier</key>       <string>it.endyo.app</string>
  <key>CFBundleName</key>             <string>Endyo</string>
  <key>CFBundleDisplayName</key>      <string>Endyo</string>
  <key>CFBundleVersion</key>          <string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key>      <string>APPL</string>
  <key>CFBundleSignature</key>        <string>????</string>
  <key>LSUIElement</key>              <false/>
  <key>NSHighResolutionCapable</key>  <true/>
</dict>
</plist>
PLIST

# ── Eseguibile ─────────────────────────────────────────────────────────────
cat > "$APP_DIR/Contents/MacOS/endyo" << 'SCRIPT'
#!/bin/bash
URL="https://endyo.it/portal"
# Edge → Chrome → Safari (in ordine di preferenza per PWA app-mode)
if [ -d "/Applications/Microsoft Edge.app" ]; then
  exec open -a "Microsoft Edge" --args --app="$URL" --user-data-dir="$HOME/.endyo"
elif [ -d "/Applications/Google Chrome.app" ]; then
  exec open -a "Google Chrome" --args --app="$URL" --user-data-dir="$HOME/.endyo"
else
  exec open "$URL"
fi
SCRIPT
chmod +x "$APP_DIR/Contents/MacOS/endyo"

echo "  [OK] Endyo.app creato in ~/Applications/"

# ── Aggiungi al Dock ────────────────────────────────────────────────────────
defaults write com.apple.dock persistent-apps -array-add \
  "<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>$APP_DIR</string><key>_CFURLStringType</key><integer>0</integer></dict></dict></dict>" \
  2>/dev/null && killall Dock 2>/dev/null && echo "  [OK] Aggiunto al Dock" || echo "  [!] Dock: aggiungi Endyo manualmente trascinando ~/Applications/Endyo.app"

echo ""
echo "  Apertura Endyo..."
echo ""
open "$APP_DIR"

echo "  Installazione completata!"
echo "  Trovi Endyo in ~/Applications/ e nel Dock."
echo ""
