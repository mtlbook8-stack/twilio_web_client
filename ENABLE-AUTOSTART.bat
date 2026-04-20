@echo off
echo ================================================
echo  Enabling Twilio Web Client Auto-Start
echo ================================================
echo.

REM Enable all three scheduled tasks
echo [1/1] Enabling scheduled tasks...
schtasks /Change /TN "TwilioWebClient-Startup" /Enable >nul 2>&1
if %errorlevel% equ 0 (echo   - TwilioWebClient-Startup: ENABLED) else (echo   - TwilioWebClient-Startup: not found - run SETUP-TASK-SCHEDULER.ps1 first)
schtasks /Change /TN "TwilioWebClient-Wake" /Enable >nul 2>&1
if %errorlevel% equ 0 (echo   - TwilioWebClient-Wake: ENABLED) else (echo   - TwilioWebClient-Wake: not found - run SETUP-TASK-SCHEDULER.ps1 first)
schtasks /Change /TN "TwilioWebClient-Tray" /Enable >nul 2>&1
if %errorlevel% equ 0 (echo   - TwilioWebClient-Tray: ENABLED) else (echo   - TwilioWebClient-Tray: not found - run SETUP-TASK-SCHEDULER.ps1 first)

echo.
echo ================================================
echo  Auto-start ENABLED.
echo  Servers and tray will start at next logon/wake.
echo.
echo  To start now, run START-ALL.bat
echo  To disable again, run DISABLE-AUTOSTART.bat
echo ================================================
echo.
pause
