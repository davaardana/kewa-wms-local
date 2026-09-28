@echo off
title MOSA RFID Gate Bridge - HW-VX6346KL Service
echo ========================================================
echo   MOSA RFID Gate Bridge - IoT Auto-Start Daemon
echo   Compatible with: ELECTRON HW-VX6346KL
echo ========================================================
cd /d "%~dp0\.."
if not exist node_modules (
    echo [INFO] Installing required dependencies...
    call npm install
)
echo [INFO] Starting Gate Bridge TCP listener on port 2077...
node src/index.js
pause
