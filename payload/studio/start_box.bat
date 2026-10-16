@echo off
setlocal EnableExtensions
set "DATA=%LOCALAPPDATA%\FotoboxStudio\data"
set "PORTFILE=%DATA%\server-port.txt"
if not exist "%PORTFILE%" (
  echo.
  echo Das Studio laeuft noch nicht.
  echo Bitte zuerst start_studio.bat starten.
  echo.
  pause
  exit /b 1
)
set /p PORT=<"%PORTFILE%"
if not defined PORT (
  echo Keine Server-Portnummer gefunden.
  pause
  exit /b 1
)
echo Oeffne Fotobox-Demo auf Port %PORT% ...
start "" "http://127.0.0.1:%PORT%/box.html"
exit /b 0
