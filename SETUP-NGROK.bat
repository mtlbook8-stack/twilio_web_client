@echo off
echo Configuring ngrok authtoken...
echo.

REM Check if .env file exists
if not exist ".env" (
    echo ERROR: .env file not found!
    echo Please copy .env.example to .env and fill in your credentials.
    pause
    exit /b 1
)

REM Read NGROK_AUTHTOKEN from .env file
for /f "tokens=1,2 delims==" %%a in ('type .env ^| findstr /B "NGROK_AUTHTOKEN="') do (
    set NGROK_TOKEN=%%b
)

if "%NGROK_TOKEN%"=="" (
    echo ERROR: NGROK_AUTHTOKEN not found in .env file!
    pause
    exit /b 1
)

if "%NGROK_TOKEN%"=="your_ngrok_authtoken_here" (
    echo ERROR: Please set your actual ngrok authtoken in .env file
    echo Get it from: https://dashboard.ngrok.com/get-started/your-authtoken
    pause
    exit /b 1
)

echo Configuring ngrok with authtoken...
ngrok config add-authtoken %NGROK_TOKEN%

echo.
echo ================================================
echo  ngrok configured successfully!
echo ================================================
echo.
pause
