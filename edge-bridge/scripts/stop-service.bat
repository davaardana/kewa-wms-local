@echo off
where pm2 >nul 2>&1
if %errorLevel% equ 0 (
    call pm2 stop mosa-edge-bridge
    call pm2 status
) else (
    echo [INFO] PM2 tidak terdeteksi. Silakan tutup jendela terminal bridge yang berjalan.
)
