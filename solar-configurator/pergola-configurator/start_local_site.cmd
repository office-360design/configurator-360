@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 goto :error
)
call npm.cmd run dev
exit /b %errorlevel%
:error
echo.
echo The pergola configurator could not be started.
pause
exit /b 1
