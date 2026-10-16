@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "PHP_EXE="
if exist "%PHP_HOME%\php.exe" set "PHP_EXE=%PHP_HOME%\php.exe"
if not defined PHP_EXE if exist "C:\PHP\php.exe" set "PHP_EXE=C:\PHP\php.exe"
if not defined PHP_EXE (
    for /f "delims=" %%P in ('where php 2^>nul') do if not defined PHP_EXE set "PHP_EXE=%%P"
)
if not defined PHP_EXE (
    echo.
    echo PHP wurde nicht gefunden.
    echo Erwartet wird C:\PHP\php.exe oder PHP im PATH.
    pause
    exit /b 1
)

rem ------------------------------------------------------------
rem ZENTRALER EVENT-SPEICHER
rem Alle Studio-Versionen verwenden denselben Windows-Speicher.
rem ------------------------------------------------------------
set "FOTOBOX_STUDIO_DATA=%LOCALAPPDATA%\FotoboxStudio\data"
if not exist "%FOTOBOX_STUDIO_DATA%\events" mkdir "%FOTOBOX_STUDIO_DATA%\events"

rem Bestehende Events aus dieser oder einer vorherigen Demo-Version übernehmen.
if exist "%~dp0data\events\*.json" xcopy "%~dp0data\events\*.json" "%FOTOBOX_STUDIO_DATA%\events\" /D /Y /I >nul
for /d %%D in ("%~dp0..\fotobox-studio-demo-*") do (
    if exist "%%~fD\data\events\*.json" xcopy "%%~fD\data\events\*.json" "%FOTOBOX_STUDIO_DATA%\events\" /D /Y /I >nul
)

echo.
echo Fotobox Studio 0.9.19
echo --------------------
echo PHP: %PHP_EXE%
"%PHP_EXE%" -v

echo.
echo Zentraler Event-Speicher:
echo   %FOTOBOX_STUDIO_DATA%\events
echo.

rem ------------------------------------------------------------
rem FREIER PORT: Verhindert, dass ein alter PHP-Server die neue
rem Version unbemerkt blockiert.
rem ------------------------------------------------------------
set "PORT="
for /f "delims=" %%P in ('powershell -NoProfile -Command "$p=8080; while(Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue){$p++}; $p"') do if not defined PORT set "PORT=%%P"
if not defined PORT set "PORT=8080"

echo %PORT%>"%FOTOBOX_STUDIO_DATA%\server-port.txt"
echo Starte lokalen Server auf:
echo   http://127.0.0.1:%PORT%/
echo.
echo Nicht dieses Fenster schliessen, solange das Studio laeuft.
echo.

start "" "http://127.0.0.1:%PORT%/"
"%PHP_EXE%" -S 127.0.0.1:%PORT% -t .
