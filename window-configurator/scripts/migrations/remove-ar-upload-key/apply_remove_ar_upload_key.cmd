@echo off
setlocal
cd /d "%~dp0"

echo Removing the AR upload password from this repository...
where py >nul 2>nul
if not errorlevel 1 (
    py -3 remove_ar_upload_password.py "%CD%"
) else (
    python remove_ar_upload_password.py "%CD%"
)

if errorlevel 1 (
    echo.
    echo Update failed. The script restored the original files when possible.
    pause
    exit /b 1
)

echo.
echo Code update completed.
echo Run DEPLOY_NETLIFY_WITH_FUNCTIONS.cmd to publish the change.
pause
