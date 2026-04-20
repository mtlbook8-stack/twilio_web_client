@echo off
REM Launches the tray icon silently (no console window)
REM The Python script uses a Windows mutex to enforce a single instance -
REM a second launch will exit immediately, so no kill logic needed here.

set "DIR=%~dp0"
start "" "%DIR%.venv\Scripts\pythonw.exe" "%DIR%tray_app.py"
