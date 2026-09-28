@echo off
setlocal enabledelayedexpansion

echo ==============================================================================
echo   MOSA RFID Edge Bridge - Windows Background Service Installer
echo   Native Support: Electron HW-VX6346KL ^& EL-UHF-RC4
echo ==============================================================================
echo.

:: Check for Administrative Privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Skrip ini membutuhkan hak akses Administrator.
    echo Silakan klik kanan file ini dan pilih "Run as Administrator".
    echo.
    pause
    exit /b 1
)

set SCRIPT_DIR=%~dp0
set APP_DIR=%SCRIPT_DIR%..
cd /d "%APP_DIR%"

echo [1/3] Memeriksa Node.js, .env, dan dependencies...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Node.js tidak ditemukan di PATH sistem.
    echo Silakan install Node.js 20 LTS terlebih dahulu.
    pause
    exit /b 1
)

for /f "delims=." %%V in ('node -p "process.versions.node"') do set NODE_MAJOR=%%V
if !NODE_MAJOR! LSS 20 (
    echo [ERROR] Node.js minimum versi 20. Versi saat ini:
    node --version
    echo Install Node.js versi 20 atau lebih baru, lalu jalankan ulang script ini.
    pause
    exit /b 1
)

if !NODE_MAJOR! GTR 20 (
    echo [WARNING] Baseline proyek adalah Node.js 20 LTS. Versi saat ini:
    node --version
    echo Instalasi dilanjutkan. npm ci dan npm test akan menentukan kompatibilitas aktual.
)

if not exist "%APP_DIR%\.env" (
    echo [ERROR] File %APP_DIR%\.env belum tersedia.
    echo Salin .env.example menjadi .env, lalu isi konfigurasi perangkat.
    pause
    exit /b 1
)

echo [INFO] Memasang dependencies sesuai package-lock.json...
call npm ci
if errorlevel 1 (
    echo [ERROR] npm ci gagal.
    echo Jika log menyebut "No prebuilt binaries" untuk better-sqlite3, gunakan Node.js 20 LTS.
    echo Jika log menyebut EPERM, tutup proses Node/terminal lain lalu hapus node_modules.
    echo Node Version Manager terdeteksi? Jalankan: nvm install 20 lalu nvm use 20
    pause
    exit /b 1
)

echo [INFO] Menjalankan test kompatibilitas Edge Bridge...
call npm test
if errorlevel 1 (
    echo [ERROR] Test gagal. Edge Bridge tidak dijalankan pada versi Node.js ini.
    pause
    exit /b 1
)

if not exist "%APP_DIR%\logs" (
    mkdir "%APP_DIR%\logs"
)

echo.
echo [2/3] Memeriksa PM2 Process Manager...
for /f "usebackq delims=" %%P in (`npm prefix -g`) do set "NPM_GLOBAL=%%P"
set "PM2_CMD=!NPM_GLOBAL!\pm2.cmd"
set "PM2_STARTUP_CMD=!NPM_GLOBAL!\pm2-startup.cmd"

if not exist "!PM2_CMD!" (
    echo [INFO] Memasang PM2 secara global untuk manajemen background service...
    call npm install -g pm2
    if errorlevel 1 (
        echo [ERROR] Instalasi PM2 gagal.
        echo Jalankan manual untuk melihat detail: npm install -g pm2
        pause
        exit /b 1
    )
)

if not exist "!PM2_CMD!" (
    echo [ERROR] pm2.cmd tidak ditemukan di !NPM_GLOBAL! setelah instalasi.
    echo Periksa hasil: npm prefix -g
    pause
    exit /b 1
)

if not exist "!PM2_STARTUP_CMD!" (
    echo [INFO] Memasang integrasi startup PM2 untuk Windows...
    call npm install -g pm2-windows-startup
    if errorlevel 1 (
        echo [ERROR] Instalasi pm2-windows-startup gagal.
        echo Jalankan manual untuk melihat detail: npm install -g pm2-windows-startup
        pause
        exit /b 1
    )
)

if not exist "!PM2_STARTUP_CMD!" (
    echo [ERROR] pm2-startup.cmd tidak ditemukan di !NPM_GLOBAL! setelah instalasi.
    pause
    exit /b 1
)

call "!PM2_STARTUP_CMD!" install
if errorlevel 1 (
    echo [ERROR] Pendaftaran PM2 startup gagal.
    echo Edge belum didaftarkan untuk otomatis berjalan setelah login Windows.
    pause
    exit /b 1
)

call "!PM2_CMD!" --version
if errorlevel 1 (
    echo [ERROR] PM2 terpasang tetapi tidak dapat dijalankan dari !PM2_CMD!.
    pause
    exit /b 1
)

echo.
echo [3/3] Menjalankan dan mendaftarkan MOSA Edge Bridge Service...
call "!PM2_CMD!" delete mosa-edge-bridge >nul 2>&1
call "!PM2_CMD!" start ecosystem.config.js
if errorlevel 1 (
    echo [ERROR] Edge Bridge gagal dijalankan.
    echo Jalankan untuk detail: "!PM2_CMD!" logs mosa-edge-bridge
    pause
    exit /b 1
)
call "!PM2_CMD!" save
if errorlevel 1 (
    echo [ERROR] Daftar proses PM2 gagal disimpan.
    pause
    exit /b 1
)

echo.
echo ==============================================================================
echo   [BERHASIL] MOSA Edge Bridge Service telah berjalan di background!
echo   Service akan otomatis menyala saat Windows booting (Auto-Start).
echo.
echo   Perintah Berguna:
echo     - Cek Status:  pm2 status
echo     - Cek Log:     pm2 logs mosa-edge-bridge
echo     - Restart:     pm2 restart mosa-edge-bridge
echo     - Stop:        pm2 stop mosa-edge-bridge
echo ==============================================================================
echo.
pause
