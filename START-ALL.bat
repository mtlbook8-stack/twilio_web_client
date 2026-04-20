@echo off
echo Starting Twilio Web Client...
echo.

REM Start Python Flask Server with SSL (hidden)
echo [1/2] Starting Flask Server on port 5000 (HTTPS)...
echo Set WshShell = CreateObject("WScript.Shell") > "%temp%\start_flask.vbs"
echo WshShell.Run "cmd /c cd /d %~dp0 && python server.py", 0 >> "%temp%\start_flask.vbs"
cscript //nologo "%temp%\start_flask.vbs"
del "%temp%\start_flask.vbs"
timeout /t 3 /nobreak >nul

REM Start ngrok tunnel (hidden)
echo [2/2] Starting ngrok tunnel...
echo Set WshShell = CreateObject("WScript.Shell") > "%temp%\start_ngrok.vbs"
echo WshShell.Run "cmd /c ngrok http https://localhost:5000 --verify-upstream-tls=false", 0 >> "%temp%\start_ngrok.vbs"
cscript //nologo "%temp%\start_ngrok.vbs"
del "%temp%\start_ngrok.vbs"
timeout /t 2 /nobreak >nul

echo.
echo ================================================
echo  All servers started successfully!
echo ================================================
echo.
echo  App:           https://localhost:5000
echo  LAN clients:   https://YOUR-LAN-IP:5000
echo  ngrok tunnel:  Check ngrok dashboard
echo.
echo  To stop all servers, run STOP-ALL.bat
echo ================================================
echo.
pause

