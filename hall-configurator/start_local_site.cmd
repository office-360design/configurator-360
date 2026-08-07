@echo off
setlocal
cd /d "%~dp0.."
start "" http://localhost:8000/hall-configurator/
python -m http.server 8000
endlocal
