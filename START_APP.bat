@echo off
title TCS Co-ord Set Studio - Starting...
echo ============================================
echo    TCS - The Co-ord Set Studio
echo    Starting Application...
echo ============================================
echo.

:: Start Backend Server in new window
echo Starting Backend Server (Port 5000)...
start "TCS Backend" cmd /k "cd /d %~dp0backend && node src/server.js"

:: Wait 3 seconds for backend to start
timeout /t 3 /nobreak > nul

:: Start Frontend Server in new window
echo Starting Frontend Server (Port 3000/5173)...
start "TCS Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

:: Wait 2 seconds
timeout /t 2 /nobreak > nul

echo.
echo ============================================
echo    Servers Started Successfully!
echo ============================================
echo.
echo    Frontend: http://localhost:3000
echo    Backend:  http://localhost:5000
echo    Admin:    http://localhost:3000/admin-login
echo.
echo    Press any key to open the website...
pause > nul

:: Open browser
start http://localhost:3000

echo.
echo Keep this window open to see status.
echo Close this window to stop reminder.
pause
