# PowerShell Master Command Launcher for Sentinel AI
Set-Location -Path $PSScriptRoot

if (Test-Path ".\.venv\Scripts\python.exe") {
    & ".\.venv\Scripts\python.exe" start.py $args
} else {
    python start.py $args
}
