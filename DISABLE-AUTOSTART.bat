@echo off
echo ================================================
echo  Disabling Twilio Web Client Auto-Start
echo ================================================
echo.

REM Disable all three scheduled tasks
echo [1/4] Disabling scheduled tasks...
schtasks /Change /TN "TwilioWebClient-Startup" /Disable >nul 2>&1
if %errorlevel% equ 0 (echo   - TwilioWebClient-Startup: DISABLED) else (echo   - TwilioWebClient-Startup: not found or already disabled)
schtasks /Change /TN "TwilioWebClient-Wake" /Disable >nul 2>&1
if %errorlevel% equ 0 (echo   - TwilioWebClient-Wake: DISABLED) else (echo   - TwilioWebClient-Wake: not found or already disabled)
schtasks /Change /TN "TwilioWebClient-Tray" /Disable >nul 2>&1
if %errorlevel% equ 0 (echo   - TwilioWebClient-Tray: DISABLED) else (echo   - TwilioWebClient-Tray: not found or already disabled)

REM Stop Flask server
echo.
echo [2/4] Stopping Flask Server...
taskkill /F /IM python.exe >nul 2>&1

REM Stop ngrok
echo [3/4] Stopping ngrok...
taskkill /F /IM ngrok.exe >nul 2>&1

REM Stop tray app
echo [4/4] Stopping tray app...
taskkill /F /IM pythonw.exe >nul 2>&1

echo.
echo ================================================
echo  Auto-start DISABLED. System fully stopped.
echo  Nothing will start at logon or wake.
echo.
echo  To re-enable, run ENABLE-AUTOSTART.bat
echo ================================================
echo.
pause
