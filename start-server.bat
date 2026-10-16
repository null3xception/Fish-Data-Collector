@echo off
cd /d "%~dp0"
where py >nul 2>nul && (py serve.py %* & goto done)
where python >nul 2>nul && (python serve.py %* & goto done)
echo Python was not found. Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH", then run this again.
:done
pause
