@echo off
echo Creating Desktop Shortcuts...

:: Get desktop path
set DESKTOP=%USERPROFILE%\Desktop

:: Create shortcut for START_APP.bat
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%DESKTOP%\TCS Store - Start.lnk'); $Shortcut.TargetPath = '%~dp0START_APP.bat'; $Shortcut.WorkingDirectory = '%~dp0'; $Shortcut.Description = 'Start TCS Store Application'; $Shortcut.Save()"

:: Create shortcut for STOP_APP.bat  
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%DESKTOP%\TCS Store - Stop.lnk'); $Shortcut.TargetPath = '%~dp0STOP_APP.bat'; $Shortcut.WorkingDirectory = '%~dp0'; $Shortcut.Description = 'Stop TCS Store Application'; $Shortcut.Save()"

echo.
echo Desktop shortcuts created!
echo - "TCS Store - Start" to start the application
echo - "TCS Store - Stop" to stop the application
echo.
pause
