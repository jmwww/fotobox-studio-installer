#!/usr/bin/env bash
set -Eeuo pipefail

WEBROOT="/var/www/html"
PAYLOAD_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/payload"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="/var/backups/fotobox-studio-installer/$STAMP"
DATA_ROOT="$WEBROOT/data/studio"

if [[ $EUID -ne 0 ]]; then
  echo "Bitte mit sudo starten: sudo bash install.sh"
  exit 1
fi

if [[ ! -d "$PAYLOAD_DIR/studio" ]]; then
  echo "FEHLER: payload/studio fehlt. Bitte das komplette Paket entpacken."
  exit 1
fi

if [[ ! -d "$WEBROOT" || ! -d "$WEBROOT/api" ]]; then
  echo "FEHLER: $WEBROOT oder $WEBROOT/api nicht gefunden."
  echo "Dieses Paket ist für eine bestehende Photobooth-Installation vorgesehen."
  exit 1
fi

echo "Fotobox Studio Installer"
echo "Ziel: $WEBROOT/studio"
echo "Datenspeicher bleibt erhalten: $DATA_ROOT"
echo

read -r -p "Installation fortsetzen? Vorhandene Dateien werden gesichert (j/N): " answer
[[ "$answer" =~ ^[JjYy]$ ]] || { echo "Abgebrochen."; exit 0; }

mkdir -p "$BACKUP_ROOT"
echo "Sicherung: $BACKUP_ROOT"

backup_path() {
  local path="$1"
  if [[ -e "$path" || -L "$path" ]]; then
    local rel="${path#/}"
    mkdir -p "$BACKUP_ROOT/$(dirname "$rel")"
    cp -a "$path" "$BACKUP_ROOT/$rel"
  fi
}

# Back up current Studio folder as a whole. Never back up or replace the persistent data folder.
if [[ -e "$WEBROOT/studio" ]]; then
  mkdir -p "$BACKUP_ROOT/var/www/html"
  cp -a "$WEBROOT/studio" "$BACKUP_ROOT/var/www/html/studio"
fi

# Preserve all existing external API files before installing the current Studio-compatible copies.
for file in studio-events.php studio-preview.php; do
  backup_path "$WEBROOT/api/$file"
done

# guest-usb.php belongs to the existing USB workflow. Ask separately before replacing it.
INSTALL_GUEST_USB=0
if [[ -e "$WEBROOT/api/guest-usb.php" ]]; then
  read -r -p "Auch /api/guest-usb.php durch die mitgelieferte Version ersetzen? Nur bei bewusst gewünschtem USB-API-Update (j/N): " usb_answer
  if [[ "$usb_answer" =~ ^[JjYy]$ ]]; then
    backup_path "$WEBROOT/api/guest-usb.php"
    INSTALL_GUEST_USB=1
  fi
else
  echo "guest-usb.php ist nicht vorhanden; wird installiert, damit die Studio-USB-Funktion verfügbar ist."
  INSTALL_GUEST_USB=1
fi

# Preserve the persistent data, including events, active event, library and previews.
mkdir -p "$DATA_ROOT/events" "$DATA_ROOT/active" "$DATA_ROOT/library" \
         "$DATA_ROOT/library/backgrounds" "$DATA_ROOT/library/frames" \
         "$DATA_ROOT/library/graphics" "$DATA_ROOT/preview"

# Replace Studio code only; keep data/ if it exists.
if [[ -d "$WEBROOT/studio/data" ]]; then
  mv "$WEBROOT/studio/data" "$BACKUP_ROOT/studio-data-live"
fi
rm -rf "$WEBROOT/studio"
cp -a "$PAYLOAD_DIR/studio" "$WEBROOT/studio"
if [[ -d "$BACKUP_ROOT/studio-data-live" ]]; then
  mv "$BACKUP_ROOT/studio-data-live" "$WEBROOT/studio/data"
fi

# Install external Studio API endpoints, with their originals backed up above.
install -m 0644 "$PAYLOAD_DIR/api/studio-events.php" "$WEBROOT/api/studio-events.php"
install -m 0644 "$PAYLOAD_DIR/api/studio-preview.php" "$WEBROOT/api/studio-preview.php"
if [[ "$INSTALL_GUEST_USB" -eq 1 ]]; then
  install -m 0644 "$PAYLOAD_DIR/api/guest-usb.php" "$WEBROOT/api/guest-usb.php"
fi

# On a Pi-hosted Studio, use the current host/origin rather than a fixed IP address.
JS="$WEBROOT/studio/js/studio.js"
if [[ -f "$JS" ]]; then
  cp -a "$JS" "$BACKUP_ROOT/studio.js-before-host-adjustment"
  python3 - "$JS" <<'PY'
from pathlib import Path
import re, sys
p = Path(sys.argv[1])
s = p.read_text()
pattern = r'const FOTOBOX_HOSTS = new Set\(\[[^\]]*\]\);\s*const FOTOBOX_BASE = FOTOBOX_HOSTS\.has\(window\.location\.hostname\)\s*\?\s*window\.location\.origin\s*:\s*"[^"]*";'
replacement = 'const FOTOBOX_BASE = window.location.origin;'
new, n = re.subn(pattern, replacement, s, count=1)
if n:
    p.write_text(new)
    print("FOTOBOX_BASE auf den aktuellen Host gesetzt.")
else:
    print("HINWEIS: FOTOBOX_BASE-Muster nicht automatisch geändert; bitte nachprüfen.")
PY
fi

# Permissions: code readable by web server; data writable by PHP/web server.
chown -R root:www-data "$WEBROOT/studio"
find "$WEBROOT/studio" -type d -exec chmod 0755 {} +
find "$WEBROOT/studio" -type f -exec chmod 0644 {} +
chown -R www-data:www-data "$DATA_ROOT"
find "$DATA_ROOT" -type d -exec chmod 2775 {} +
find "$DATA_ROOT" -type f -exec chmod 0664 {} +

# PHP syntax checks for installed endpoints.
for file in "$WEBROOT/studio/api/_common.php" "$WEBROOT/studio/api/events.php" \
            "$WEBROOT/studio/api/live.php" "$WEBROOT/api/studio-events.php" \
            "$WEBROOT/api/studio-preview.php"; do
  if ! php -l "$file"; then
    echo "FEHLER bei PHP-Syntaxprüfung: $file"
    echo "Sicherung der vorherigen Dateien liegt unter $BACKUP_ROOT"
    exit 1
  fi
done
if [[ "$INSTALL_GUEST_USB" -eq 1 ]]; then
  php -l "$WEBROOT/api/guest-usb.php"
fi

if command -v node >/dev/null 2>&1; then
  node --check "$WEBROOT/studio/js/studio.js"
fi

echo
echo "Installation abgeschlossen."
echo "Studio:       http://$(hostname -I | awk '{print $1}')/studio/"
echo "Event-Setup:  http://$(hostname -I | awk '{print $1}')/studio/setup.html"
echo "Sicherung:    $BACKUP_ROOT"
echo
echo "WICHTIG: studio-preview.php benötigt /home/fotobox/studio_render_for_print.py."
if [[ ! -x /home/fotobox/studio_render_for_print.py ]]; then
  echo "HINWEIS: Renderer-Skript fehlt oder ist nicht ausführbar; Druck-/Preview-Integration muss separat geprüft werden."
fi
