@echo off
title TCS - Stopping Servers
echo ============================================
echo    Stopping TCS Servers...
echo ============================================
echo.

:: Kill all Node processes
taskkill /F /IM node.exe 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Node processes stopped.
) else (
    echo [INFO] No Node processes were running.
)

echo.
echo Servers stopped successfully!
echo.
pause
