@echo off
setlocal
for %%I in ("%~dp0\..\..") do set "PROJECT_ROOT=%%~fI"
cd /d "%PROJECT_ROOT%"

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
echo Deploying dist/site plus Netlify Functions to production...
call npx.cmd --yes netlify-cli@latest deploy --prod --dir=dist/site --functions=netlify/functions
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
