@echo off
echo ============================================
echo  Starting Whiskers PetConnect...
echo ============================================

echo.
echo  [1/3] Starting backend (port 3001)...
start "Backend" cmd /k "cd /d %~dp0backend && npm run dev"

echo  [2/3] Starting frontend (port 5173)...
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo  [3/3] Starting Cloudflare Tunnel...
start "Cloudflare Tunnel" cmd /k "cloudflared tunnel --url http://localhost:5173"

echo.
echo ============================================
echo  All three processes are running.
echo  Each one opened in its own terminal window.
echo  Close those windows to stop the servers.
echo ============================================
pause
