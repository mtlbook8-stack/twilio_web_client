@echo off
echo Starting Twilio Web Client with visible logs...
echo.

REM Start Flask Server in new window
echo [1/2] Starting Flask Server on port 5000...
start "Flask Server" cmd /k "python server.py"
timeout /t 3 /nobreak >nul

REM Start ngrok in new window
echo [2/2] Starting ngrok tunnel...
start "ngrok Tunnel" cmd /k "ngrok http 5000"
timeout /t 3 /nobreak >nul

echo.
echo ================================================
echo  Servers started in separate windows!
echo ================================================
echo  - Flask Server window will show debug logs
echo  - ngrok window will show tunnel URL
echo.
echo  You can start React separately if needed:
echo  npm start
echo.
pause
