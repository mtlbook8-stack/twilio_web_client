@echo off
REM Silent startup script for Task Scheduler (no pause, no user interaction)
REM Uses the venv Python directly with full absolute paths

set "DIR=C:\Users\anyex\OneDrive\twilio_web_client"
set "VENV_PYTHON=%DIR%\.venv\Scripts\python.exe"

REM Write a wake-signal file so the tray app knows this is a scheduled restart
echo %date% %time% > "%DIR%\.wake_restart"

REM Kill any existing servers first to avoid duplicates / port conflicts
taskkill /F /IM ngrok.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
timeout /t 3 /nobreak >nul

timeout /t 10 /nobreak >nul

REM Start Flask Server with SSL (hidden via VBS)
echo Set WshShell = CreateObject("WScript.Shell") > "%temp%\ts_flask.vbs"
echo WshShell.Run """%VENV_PYTHON%"" ""%DIR%\server.py""", 0 >> "%temp%\ts_flask.vbs"
cscript //nologo "%temp%\ts_flask.vbs"
del "%temp%\ts_flask.vbs"
timeout /t 3 /nobreak >nul

REM Start ngrok tunnel (hidden via VBS)
echo Set WshShell = CreateObject("WScript.Shell") > "%temp%\ts_ngrok.vbs"
echo WshShell.Run "cmd /c ngrok http https://localhost:5000 --verify-upstream-tls=false", 0 >> "%temp%\ts_ngrok.vbs"
cscript //nologo "%temp%\ts_ngrok.vbs"
del "%temp%\ts_ngrok.vbs"

