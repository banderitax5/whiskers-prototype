@echo off
cd /d "%~dp0"

echo ============================================
echo  Starting backend + frontend + Cloudflare tunnel
echo  (single window, all logs in one stream)
echo ============================================
echo.

call npm run dev
if %errorlevel% neq 0 (
    echo.
    echo If npm run dev failed, run install.bat first.
    echo For backend+frontend only (no tunnel): npm run dev:local
    pause
    exit /b 1
)

pause
