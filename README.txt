FOTOBOX STUDIO INSTALLER – Raspberry Pi
=========================================

Zweck
-----
Installiert die aus der aktuellen Fotobox exportierte Studio-Web-App und
die zugehörigen Event-/Preview-API-Dateien in eine bestehende Photobooth-
Installation unter /var/www/html.

Installation
------------
1. ZIP vollständig auf den Raspberry Pi kopieren und entpacken.
2. Im entpackten Ordner ausführen:
      sudo bash install.sh
3. Den Bestätigungsfragen folgen.
4. Danach die URLs aus der Installerausgabe im Browser öffnen.

Sicherheit und Daten
--------------------
- Vorhandene Dateien werden unter /var/backups/fotobox-studio-installer/
  mit Zeitstempel gesichert.
- Der persistente Ordner /var/www/html/data/studio bleibt erhalten.
- Die vorhandene guest-usb.php wird nur nach separater Bestätigung ersetzt.
- Das Paket ist für eine bestehende Photobooth-Installation gedacht, nicht
  für einen leeren Raspberry Pi.
- Das Paket installiert keine Photobooth-Kernsoftware und keine Drucker-
  oder Kamera-Treiber.

Wichtige Abhängigkeit
---------------------
/var/www/html/api/studio-preview.php ruft
/home/fotobox/studio_render_for_print.py auf. Dieses Skript wird nicht
mitgeliefert, da es zur bestehenden Druck-/Render-Konfiguration gehört.
Vor der Nutzung der Druckvorschau muss geprüft werden, dass es auf dem
Zielgerät vorhanden und ausführbar ist.

Hinweis
-------
Die Installerdateien stammen aus dem aktuellen Studio-Export vom
Raspberry Pi des Anwenders. Vor Einsatz auf anderen Geräten zunächst auf
einer Testinstallation prüfen.
