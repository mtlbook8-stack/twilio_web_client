@echo off
echo Stopping all Twilio Web Client servers...
echo.

REM Stop Python processes
echo [1/3] Stopping Flask Server...
taskkill /F /IM python.exe >nul 2>&1

REM Stop Node processes (React dev server)
echo [2/3] Stopping React Dev Server...
taskkill /F /IM node.exe >nul 2>&1

REM Stop ngrok processes
echo [3/3] Stopping ngrok...
taskkill /F /IM ngrok.exe >nul 2>&1

echo.
echo ================================================
echo  All servers stopped successfully!
echo ================================================
echo.
pause
