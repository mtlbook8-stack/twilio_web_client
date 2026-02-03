@echo off
echo Starting Twilio Web Client...
echo.

REM Start Python Flask Server (hidden)
echo [1/3] Starting Flask Server on port 5000...
echo Set WshShell = CreateObject("WScript.Shell") > "%temp%\start_flask.vbs"
echo WshShell.Run "cmd /c cd /d %~dp0 && python server.py", 0 >> "%temp%\start_flask.vbs"
cscript //nologo "%temp%\start_flask.vbs"
del "%temp%\start_flask.vbs"
timeout /t 2 /nobreak >nul

REM Start React Dev Server (hidden)
echo [2/3] Starting React Dev Server on port 3000...
echo Set WshShell = CreateObject("WScript.Shell") > "%temp%\start_react.vbs"
echo WshShell.Run "cmd /c cd /d %~dp0 && set BROWSER=none && npm start", 0 >> "%temp%\start_react.vbs"
cscript //nologo "%temp%\start_react.vbs"
del "%temp%\start_react.vbs"
timeout /t 5 /nobreak >nul

REM Start ngrok tunnel (hidden)
echo [3/3] Starting ngrok tunnel...
echo Set WshShell = CreateObject("WScript.Shell") > "%temp%\start_ngrok.vbs"
echo WshShell.Run "cmd /c ngrok http 5000", 0 >> "%temp%\start_ngrok.vbs"
cscript //nologo "%temp%\start_ngrok.vbs"
del "%temp%\start_ngrok.vbs"
timeout /t 2 /nobreak >nul

echo.
echo ================================================
echo  All servers started successfully!
echo ================================================
echo.
echo  React App:     http://localhost:3000
echo  Flask API:     http://localhost:5000
echo  ngrok tunnel:  Check ngrok dashboard
echo.
echo  Opening browser in 3 seconds...
timeout /t 3 /nobreak >nul
start http://localhost:3000
echo.
echo  To stop all servers, run STOP-ALL.bat
echo ================================================
echo.
pause
