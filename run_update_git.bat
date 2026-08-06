@echo off
setlocal

set "SCRIPT=%~dp0update_from_latest_zip_git.ps1"

if not exist "%SCRIPT%" (
    echo Update failed: PowerShell script not found:
    echo %SCRIPT%
    echo.
    pause
    exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"

echo.
pause
