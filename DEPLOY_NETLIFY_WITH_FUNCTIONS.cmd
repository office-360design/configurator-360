@echo off
setlocal
cd /d "%~dp0"

echo Preparing the current static site...
call npm.cmd run prepare:static
if errorlevel 1 goto :error

echo.
echo Logging in and linking to the existing Netlify project if needed...
call npx.cmd --yes netlify-cli@latest login
if errorlevel 1 goto :error
call npx.cmd --yes netlify-cli@latest link
if errorlevel 1 goto :error

echo.
echo Deploying static-site plus Netlify Functions to production...
call npx.cmd --yes netlify-cli@latest deploy --prod --dir=static-site --functions=netlify/functions
if errorlevel 1 goto :error

echo.
echo Deployment completed.
pause
exit /b 0

:error
echo.
echo Deployment failed. Review the error above.
pause
exit /b 1
