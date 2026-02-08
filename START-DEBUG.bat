@echo off
echo Starting all services in visible windows...
echo.

echo [1/3] Starting Flask Server...
start "Flask Server - WATCH THIS WINDOW" cmd /k "cd /d %~dp0 && C:\Users\anyex\AppData\Local\Programs\Python\Python312-arm64\python.exe server.py"
timeout /t 3 /nobreak >nul

echo [2/3] Starting ngrok...
start "ngrok Tunnel" cmd /k "C:\Users\anyex\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe http 5000"
timeout /t 3 /nobreak >nul

echo [3/3] Starting React...
start "React Dev Server" cmd /k "cd /d %~dp0 && set BROWSER=none && set PATH=%PATH%;C:\Program Files\nodejs && npm start"
timeout /t 3 /nobreak >nul

echo.
echo ================================================
echo All services started!
echo ================================================
echo.
echo WATCH THE "Flask Server - WATCH THIS WINDOW"
echo for debug logs when you make calls
echo.
echo Opening browser...
timeout /t 5 /nobreak >nul
start http://localhost:3000
echo.
pause
