@echo off
echo Stopping all Twilio Web Client servers...
echo.

REM Stop Python processes (Flask)
echo [1/2] Stopping Flask Server...
taskkill /F /IM python.exe >nul 2>&1

REM Stop ngrok processes
echo [2/2] Stopping ngrok...
taskkill /F /IM ngrok.exe >nul 2>&1

echo.
echo ================================================
echo  All servers stopped successfully!
echo ================================================
echo.

