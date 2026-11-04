@echo off
title SENTINEL AI Security Pipeline
cd /d "%~dp0"

echo ======================================================================
echo Starting Sentinel AI Surveillance and Reasoning Pipeline...
echo ======================================================================

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" start.py %*
) else (
    python start.py %*
)

pause
