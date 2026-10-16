FOTOBOX STUDIO 0.9.13 – WINDOWS DEMO

Diese Version führt einen zentralen lokalen Event-Speicher ein.

1. START
---------
start_studio.bat starten.

PHP 8.x muss installiert sein. C:\PHP\php.exe wird automatisch erkannt.

Der Server sucht sich automatisch einen freien Port ab 8080. Dadurch kann
kein alter Demo-PHP-Server die neue Version unbemerkt blockieren.

2. ZENTRALER EVENT-SPEICHER
----------------------------
Unter Windows liegen die Events jetzt dauerhaft hier:

%LOCALAPPDATA%\FotoboxStudio\data\events

Alle später entpackten Studio-Versionen greifen auf denselben Speicher zu.
Die Events sind daher nicht mehr an den jeweiligen Demo-Ordner gebunden.

Beim Start werden vorhandene JSON-Events aus dem aktuellen Ordner und aus
benachbarten fotobox-studio-demo-* Ordnern automatisch übernommen.

3. ARCHITEKTUR
--------------
Studio
  ↓ lokale API
zentraler Event-Speicher
  ↓
Smartphone
  ↓ Live-API
Box

Desktop und Smartphone verwenden denselben Live-Datenvertrag.

4. TEST
--------
- Studio öffnen und vorhandenes Event wählen.
- Abschicken → PIN ablesen.
- box.html öffnen bzw. über den Browser starten.
- PIN eingeben.
- Das Event muss gefunden werden.
- Änderungen am Smartphone müssen sofort auf der Box erscheinen.
- Änderungen im Desktop-Editor müssen ebenfalls sofort auf Smartphone und Box erscheinen.

5. RASPBERRY PI
---------------
Die zentrale Speicherung ist bewusst über FOTOBOX_STUDIO_DATA konfigurierbar.
Auf dem Raspberry Pi kann später ein eigener persistenter Datenpfad gesetzt
werden, ohne die API-Logik neu zu bauen.

WICHTIG 0.9.9:
- Die Fotobox-Demo nicht per Doppelklick auf box.html als file:// oeffnen.
- Zuerst start_studio.bat starten.
- Danach start_box.bat verwenden oder im Studio auf „Fotobox-Demo“ klicken.
- Die Box laeuft dann ueber http://127.0.0.1:<Port>/box.html und kann die lokale PHP-API erreichen.

0.9.10: Betriebsmodus-Demo ergänzt: Start, Browser-Kamera, 3-2-1 Countdown, Foto-Vorschau, erneute Aufnahme und Druck-Workflow als Windows-Demo. Die bestehende Raspberry-Pi-Kamera-/Druckerlogik bleibt unangetastet.


0.9.13: EVENT-ÜBERTRAGUNG AN DIE FOTOBOX
-----------------------------------------
- Das Studio kann ein validiertes Event direkt an den Raspberry Pi übertragen.
- Ziel: http://192.168.178.254/api/studio-events.php
- Der Raspberry Pi speichert Studio-Events getrennt unter:
  /var/www/html/data/studio/events
- Bestehende Kamera-, Drucker-, USB- und Fotobox-Daten werden dadurch nicht verändert.
- Die Pi-API muss vor der ersten Übertragung installiert werden. Die fertige
  PHP-Datei liegt unter raspberry-pi/api/studio-events.php.


0.9.13: Wiederholtes Übertragen eines Events möglich; Slot-Zuordnungen werden exakt an die Slots des gewählten Layouts angepasst.

0.9.19 – Allgemeine Grafik-Elemente
====================================

Neu:
- Neues Werkzeug „Grafiken“ im Studio.
- PNG/JPG/GIF/WebP können als Dekoration/Grafik importiert werden.
- Grafikdaten werden als PNG im Event gespeichert, damit Transparenz erhalten bleibt.
- Grafiken können auf der Vorschau verschoben, skaliert und gedreht werden.
- Deckkraft und Breite können im Inspector eingestellt werden.
- Mehrere Grafiken pro Event sind möglich.
- Shared Renderer zeigt Grafiken auch in der Druck-/Box-Vorschau an.
- Bestehende Cheese-Daten bleiben kompatibel.

Hinweis:
Der Raspberry-Pi-Renderer muss in einem nächsten Schritt noch um die Extraktion
und das Rendern der neuen design.graphics-Assets erweitert werden. Bis dahin
ist die Funktion vollständig im Windows-Studio sichtbar und im Event-JSON
vorhanden, aber noch nicht für den realen Pi-Druck freigeschaltet.
