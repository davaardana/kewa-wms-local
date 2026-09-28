@echo off
set SCRIPT_DIR=%~dp0
set APP_DIR=%SCRIPT_DIR%..
cd /d "%APP_DIR%"

where pm2 >nul 2>&1
if %errorLevel% equ 0 (
    call pm2 start ecosystem.config.js
    call pm2 status
) else (
    echo [INFO] Menjalankan Edge Bridge di terminal lokal (foreground)...
    node src/index.js
)
