@echo off
setlocal
cd /d "%~dp0"
start "" "http://127.0.0.1:8000/hall-configurator/?local=7"
python serve_local.py
endlocal
