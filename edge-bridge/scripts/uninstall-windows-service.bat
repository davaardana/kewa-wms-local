@echo off
setlocal enabledelayedexpansion

echo ==============================================================================
echo   MOSA RFID Edge Bridge - Windows Service Uninstaller
echo ==============================================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Skrip ini membutuhkan hak akses Administrator.
    echo Silakan klik kanan file ini dan pilih "Run as Administrator".
    pause
    exit /b 1
)

where pm2 >nul 2>&1
if %errorLevel% equ 0 (
    echo [INFO] Menghentikan dan menghapus service mosa-edge-bridge...
    call pm2 stop mosa-edge-bridge >nul 2>&1
    call pm2 delete mosa-edge-bridge >nul 2>&1
    call pm2 save
    echo [BERHASIL] Service mosa-edge-bridge telah dicopot.
) else (
    echo [WARN] PM2 tidak terpasang.
)

echo.
pause
