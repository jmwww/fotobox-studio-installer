#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

WEBROOT="/var/www/html"
PAYLOAD_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/payload"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="/var/backups/fotobox-studio-installer/$STAMP"
DATA_ROOT="$WEBROOT/data/studio"
RENDERER_DIR="/home/fotobox"
PYTHON="/usr/bin/python3"

die() { echo "FEHLER: $*" >&2; exit 1; }
note() { echo "[INFO] $*"; }
warn() { echo "[WARNUNG] $*" >&2; }

if [[ $EUID -ne 0 ]]; then
  echo "Bitte mit sudo starten: sudo bash install.sh"
  exit 1
fi

# --- Payload validation ---
for required in \
  "$PAYLOAD_DIR/studio" \
  "$PAYLOAD_DIR/api/studio-events.php" \
  "$PAYLOAD_DIR/api/studio-preview.php" \
  "$PAYLOAD_DIR/renderer/studio_render_for_print.py" \
  "$PAYLOAD_DIR/renderer/studio_renderer.py"; do
  [[ -e "$required" ]] || die "Benötigte Paketdatei fehlt: $required"
done

# --- Existing Photobooth validation ---
[[ -d "$WEBROOT" ]] || die "$WEBROOT fehlt. Erwartet wird eine bestehende Photobooth-Installation."
[[ -d "$WEBROOT/api" ]] || die "$WEBROOT/api fehlt. Installation wird aus Sicherheitsgründen abgebrochen."
[[ -d "$WEBROOT/data" ]] || die "$WEBROOT/data fehlt. Erwartet wird eine bestehende Photobooth-Installation."
command -v php >/dev/null 2>&1 || die "PHP ist nicht installiert."
command -v python3 >/dev/null 2>&1 || die "Python 3 ist nicht installiert."
id www-data >/dev/null 2>&1 || die "Benutzer www-data wurde nicht gefunden."

if ! php -r 'exit(function_exists("exec") ? 0 : 1);'; then
  die "PHP-Funktion exec() ist nicht verfügbar. Die Druckvorschau kann so nicht ausgeführt werden."
fi

# Check that the current tree resembles a Photobooth webroot, not an arbitrary empty directory.
if [[ ! -f "$WEBROOT/index.php" && ! -d "$WEBROOT/private" && ! -d "$WEBROOT/data/tmp" ]]; then
  warn "Die erwartete Photobooth-Struktur wurde nicht eindeutig erkannt."
  read -r -p "Trotzdem fortfahren? (j/N): " confirm_structure
  [[ "$confirm_structure" =~ ^[JjYy]$ ]] || { echo "Abgebrochen."; exit 0; }
fi

# Pillow: use distro package rather than pip/system-wide pip.
if ! "$PYTHON" -c 'from PIL import Image' >/dev/null 2>&1; then
  echo "Pillow (Python-Bildverarbeitung) fehlt."
  if command -v apt-get >/dev/null 2>&1; then
    read -r -p "Pillow über apt installieren? (j/N): " install_pillow
    [[ "$install_pillow" =~ ^[JjYy]$ ]] || die "Pillow wird benötigt. Installation abgebrochen."
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y python3-pil
    "$PYTHON" -c 'from PIL import Image' >/dev/null 2>&1 || die "Pillow ist nach der Installation weiterhin nicht verfügbar."
  else
    die "Pillow fehlt und apt-get ist nicht verfügbar. Bitte python3-pil für das System-Python installieren."
  fi
fi

# Renderer script assumes the service account is named fotobox.
id fotobox >/dev/null 2>&1 || die "Benutzer 'fotobox' fehlt. Der Renderer erwartet /home/fotobox; bitte nicht automatisch einen Benutzer anlegen."
[[ -d /home/fotobox ]] || die "/home/fotobox fehlt."

echo
echo "Fotobox Studio Installer v1.0.1 (Vorabversion)"
echo "Webroot:       $WEBROOT"
echo "Studio:        $WEBROOT/studio"
echo "Daten:         $DATA_ROOT (wird nicht gelöscht)"
echo "Renderer:      /home/fotobox/"
echo
echo "Es werden Backups erstellt. Vorhandene Eventdaten bleiben erhalten."
read -r -p "Installation fortsetzen? (j/N): " answer
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

# Back up Studio, endpoints, and renderer files before any replacement.
backup_path "$WEBROOT/studio"
backup_path "$WEBROOT/api/studio-events.php"
backup_path "$WEBROOT/api/studio-preview.php"
backup_path "$WEBROOT/api/guest-usb.php"
backup_path "/home/fotobox/studio_render_for_print.py"
backup_path "/home/fotobox/studio_renderer.py"

# Install Studio code. Persistent user data lives outside this directory.
rm -rf "$WEBROOT/studio"
cp -a "$PAYLOAD_DIR/studio" "$WEBROOT/studio"

# Install core endpoints.
install -m 0644 "$PAYLOAD_DIR/api/studio-events.php" "$WEBROOT/api/studio-events.php"
install -m 0644 "$PAYLOAD_DIR/api/studio-preview.php" "$WEBROOT/api/studio-preview.php"

# Do not replace or add the USB API silently: its helper scripts and systemd units are host-specific.
if [[ -f "$PAYLOAD_DIR/api/guest-usb.php" ]]; then
  if [[ -f "$WEBROOT/api/guest-usb.php" ]]; then
    read -r -p "Vorhandene guest-usb.php durch Paketversion ersetzen? USB-Helfer und systemd-Dienste sind systemabhängig (j/N): " usb_answer
    if [[ "$usb_answer" =~ ^[JjYy]$ ]]; then
      install -m 0644 "$PAYLOAD_DIR/api/guest-usb.php" "$WEBROOT/api/guest-usb.php"
    else
      note "guest-usb.php unverändert gelassen."
    fi
  else
    warn "guest-usb.php ist nicht vorhanden. Sie wird nicht automatisch installiert, da sie lokale USB-Helfer/Dienste voraussetzen kann."
  fi
fi

# Install renderer pair together; wrapper references studio_renderer.py by absolute path.
install -o root -g root -m 0755 "$PAYLOAD_DIR/renderer/studio_render_for_print.py" /home/fotobox/studio_render_for_print.py
install -o root -g root -m 0755 "$PAYLOAD_DIR/renderer/studio_renderer.py" /home/fotobox/studio_renderer.py

# Create required persistent directories without deleting existing content.
mkdir -p \
  "$DATA_ROOT/events" \
  "$DATA_ROOT/active" \
  "$DATA_ROOT/active/assets" \
  "$DATA_ROOT/library/backgrounds" \
  "$DATA_ROOT/library/frames" \
  "$DATA_ROOT/library/graphics" \
  "$DATA_ROOT/preview" \
  "$DATA_ROOT/test-render"

# Ensure web code is readable, without recursively changing data ownership.
chown -R root:www-data "$WEBROOT/studio"
find "$WEBROOT/studio" -type d -exec chmod 0755 {} +
find "$WEBROOT/studio" -type f -exec chmod 0644 {} +

# Only apply ownership/modes to the directories this installer creates/uses.
# Existing files and assets are not recursively chowned.
for dir in \
  "$DATA_ROOT/events" "$DATA_ROOT/active" "$DATA_ROOT/active/assets" \
  "$DATA_ROOT/library" "$DATA_ROOT/library/backgrounds" \
  "$DATA_ROOT/library/frames" "$DATA_ROOT/library/graphics" \
  "$DATA_ROOT/preview" "$DATA_ROOT/test-render"; do
  chown www-data:www-data "$dir"
  chmod 2775 "$dir"
done

# API-created preview and image files need the web server to write in these existing Photobooth dirs.
for dir in "$WEBROOT/data/tmp" "$WEBROOT/data/images" "$WEBROOT/data/thumbs"; do
  if [[ -d "$dir" ]]; then
    if [[ ! -w "$dir" ]]; then
      warn "$dir ist für den Installer nicht schreibbar; Schreibrechte des Webservers bitte prüfen."
    fi
  else
    warn "$dir fehlt; die Photobooth-Vorschau/Galerie kann davon abhängig sein."
  fi
done

# PHP syntax checks.
for file in \
  "$WEBROOT/studio/api/_common.php" \
  "$WEBROOT/studio/api/events.php" \
  "$WEBROOT/studio/api/live.php" \
  "$WEBROOT/api/studio-events.php" \
  "$WEBROOT/api/studio-preview.php"; do
  php -l "$file" || die "PHP-Syntaxprüfung fehlgeschlagen: $file. Vorherige Dateien sind gesichert unter $BACKUP_ROOT"
done

# Python syntax and Pillow checks.
"$PYTHON" -m py_compile \
  /home/fotobox/studio_render_for_print.py \
  /home/fotobox/studio_renderer.py
"$PYTHON" -c 'from PIL import Image, ImageDraw, ImageFont; print("Pillow OK:", Image.__version__)'

# JavaScript syntax check if Node is available.
if command -v node >/dev/null 2>&1; then
  node --check "$WEBROOT/studio/js/studio.js" || die "JavaScript-Syntaxprüfung fehlgeschlagen."
else
  warn "Node.js nicht installiert; JavaScript-Syntax wurde nicht geprüft."
fi

# Verify host-relative API setting. Do not rewrite unknown JS structures automatically.
JS="$WEBROOT/studio/js/studio.js"
if grep -q 'const FOTOBOX_BASE = window.location.origin;' "$JS"; then
  note "Studio verwendet den aktuellen Host."
elif grep -q 'FOTOBOX_BASE' "$JS"; then
  warn "FOTOBOX_BASE wurde gefunden, aber nicht eindeutig auf window.location.origin gesetzt. Bitte Studio-Aufruf auf dem Test-Pi prüfen."
else
  warn "FOTOBOX_BASE wurde in studio.js nicht gefunden. API-Ziel bitte manuell prüfen."
fi

echo
echo "Installation abgeschlossen."
ip_addr="$(hostname -I 2>/dev/null | awk '{print $1}')"
[[ -n "$ip_addr" ]] || ip_addr="RASPBERRY-PI-IP"
echo "Studio:      http://$ip_addr/studio/"
echo "Event-Setup: http://$ip_addr/studio/setup.html"
echo "Backup:      $BACKUP_ROOT"
echo
echo "Renderer installiert. Druckvorschau erfordert ein aktives Studio-Event."
echo "Hinweis: Die Installation wurde syntaktisch geprüft; ein vollständiger Fotolauf muss praktisch getestet werden."
