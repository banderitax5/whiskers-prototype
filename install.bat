@echo off
echo ============================================
echo  Installing frontend dependencies...
echo ============================================
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Frontend install failed.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Installing backend dependencies...
echo ============================================
cd ..\backend
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Backend install failed.
    pause
    exit /b 1
)

cd ..
echo.
echo ============================================
echo  All dependencies installed successfully!
echo  Next steps:
echo    1. Copy backend\.env.example to backend\.env
echo       and fill in your SUPABASE_URL,
echo       SUPABASE_SERVICE_KEY, and ENCRYPTION_KEY
echo    2. Copy frontend\.env.example to frontend\.env
echo       and fill in your VITE_SUPABASE_URL and
echo       VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
echo    3. Run start.bat to launch the app
echo ============================================
pause
