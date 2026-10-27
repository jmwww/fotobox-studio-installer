Fotobox Studio Installer v1.0.1 — Vorabversion
================================================

Zweck
-----
Installiert das Fotobox Studio in eine bestehende Photobooth-Installation
unter /var/www/html. Diese Vorabversion ist noch nicht auf einem zweiten
Raspberry Pi vollständig durchgetestet.

Inhalt
------
- payload/studio: Studio-Weboberfläche und interne APIs
- payload/api: externe Studio-API-Endpunkte
- payload/renderer: Python-Renderer für Druckvorschau und Collagen
- install.sh: prüfender Installer mit Backup

Voraussetzungen
---------------
- bestehende Photobooth-Installation unter /var/www/html
- /var/www/html/api und /var/www/html/data vorhanden
- PHP mit exec() verfügbar
- Python 3
- Pillow für das verwendete System-Python (der Installer kann python3-pil
  nach Rückfrage über apt installieren)
- Benutzer und Home-Verzeichnis /home/fotobox

Installation
------------
1. ZIP vollständig entpacken.
2. Im entpackten Ordner ausführen:
      sudo bash install.sh
3. Prüfen, dass die angezeigten Pfade zum Testsystem passen.
4. Nach Abschluss die Studio-URL öffnen und ein Test-Event anlegen.
5. Einen vollständigen Fotolauf sowie die Druckvorschau testen.

Sicherheit und Grenzen
----------------------
- Vorhandene Studio-Dateien und Renderer werden unter
  /var/backups/fotobox-studio-installer/<Zeitstempel>/ gesichert.
- Der dauerhafte Datenordner /var/www/html/data/studio wird nicht gelöscht.
- Vorhandene Eventdaten und Assets werden nicht rekursiv umberechtigt.
- guest-usb.php wird nicht automatisch neu installiert, wenn sie fehlt.
  Eine vorhandene guest-usb.php wird nur nach gesonderter Bestätigung ersetzt,
  da USB-Helfer und systemd-Dienste hostabhängig sind.
- Das Skript wurde hier nicht auf einem realen zweiten Raspberry Pi ausgeführt.
  Die Syntaxprüfungen sind kein Nachweis einer vollständig funktionierenden
  Installation.
- Ein aktives Studio-Event ist für die Druckvorschau erforderlich.
- Prüfe vor Installation stets die Dateien und erstelle zusätzlich ein Backup
  der gesamten Photobooth-Installation.

Version
-------
v1.0.1-pre-release — aktualisiert Renderer-Paketierung und Systemprüfungen.
