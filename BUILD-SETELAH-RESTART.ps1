# =============================================================================
# MOSA WMS RFID — Build & Run Script (Jalankan setelah restart Windows)
# =============================================================================
# Cara pakai: klik kanan file ini → "Run with PowerShell"
# Atau dari PowerShell: .\BUILD-SETELAH-RESTART.ps1
# =============================================================================

Set-Location $PSScriptRoot
$DOCKER = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
$COMPOSE = 'C:\Program Files\Docker\cli-plugins\docker-compose.exe'
$PROJECT_DIR = $PSScriptRoot

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  MOSA WMS RFID — Docker Build & Launch" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Cek Docker Engine
Write-Host "[1/6] Mengecek Docker Engine..." -ForegroundColor Yellow
$maxWait = 60
$waited  = 0
while ($waited -lt $maxWait) {
    $status = & $DOCKER ps 2>&1
    if ($LASTEXITCODE -eq 0) { break }
    Write-Host "      Docker belum siap, tunggu $($maxWait - $waited)s lagi..." -ForegroundColor DarkYellow
    Start-Sleep 5
    $waited += 5
}
if ($waited -ge $maxWait) {
    Write-Host "❌ Docker Engine tidak merespons. Pastikan Docker Desktop sudah berjalan." -ForegroundColor Red
    Write-Host "   Buka Docker Desktop dari Start Menu dan tunggu ikon tray berwarna putih." -ForegroundColor Red
    pause; exit 1
}
Write-Host "   ✅ Docker Engine OK ($(& $DOCKER --version))" -ForegroundColor Green

# 2. Cek WSL2
Write-Host ""
Write-Host "[2/6] Mengecek WSL2..." -ForegroundColor Yellow
$wslCheck = wsl --status 2>&1
if ($LASTEXITCODE -ne 0 -and -not ($wslCheck -match 'Default Distribution')) {
    Write-Host "⚠️  WSL2 belum terkonfigurasi. Menjalankan setup WSL2..." -ForegroundColor DarkYellow
    wsl --install --no-distribution 2>&1
    wsl --set-default-version 2 2>&1
}
Write-Host "   ✅ WSL2 OK" -ForegroundColor Green

# 3. Validasi .env
Write-Host ""
Write-Host "[3/6] Validasi file .env..." -ForegroundColor Yellow
$envFile = Join-Path $PROJECT_DIR ".env"
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $PROJECT_DIR ".env.deploy.example") $envFile
    Write-Host "   ⚠️  .env dibuat dari template. Sudah menggunakan nilai dari repo." -ForegroundColor DarkYellow
} else {
    Write-Host "   ✅ .env sudah ada" -ForegroundColor Green
}

# Tampilkan konfigurasi aktif
Write-Host ""
Write-Host "   Konfigurasi aktif:" -ForegroundColor Cyan
Get-Content $envFile | Where-Object { $_ -notmatch 'TOKEN|PASSWORD|SECRET|KEY' -and $_ -notmatch '^#' -and $_ -ne '' } | ForEach-Object { Write-Host "     $_" -ForegroundColor DarkCyan }
Write-Host ""

# 4. Build semua image
Write-Host "[4/6] Build Docker images (ini butuh beberapa menit pertama kali)..." -ForegroundColor Yellow
Write-Host "      Building: nginx + frontend + backend + edge-bridge + postgres" -ForegroundColor DarkYellow
Write-Host ""

$buildResult = & $DOCKER compose `
    --env-file $envFile `
    -f (Join-Path $PROJECT_DIR "docker-compose.yml") `
    -f (Join-Path $PROJECT_DIR "docker-compose.windows-dev.yml") `
    build --no-cache 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build gagal!" -ForegroundColor Red
    Write-Host $buildResult
    pause; exit 1
}
Write-Host "   ✅ Build selesai" -ForegroundColor Green

# 5. Jalankan semua service
Write-Host ""
Write-Host "[5/6] Menjalankan containers..." -ForegroundColor Yellow
& $DOCKER compose `
    --env-file $envFile `
    -f (Join-Path $PROJECT_DIR "docker-compose.yml") `
    -f (Join-Path $PROJECT_DIR "docker-compose.windows-dev.yml") `
    up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Gagal menjalankan container!" -ForegroundColor Red
    pause; exit 1
}

Write-Host "   Menunggu backend sehat..." -ForegroundColor DarkYellow
Start-Sleep -Seconds 15

# 6. Migrasi database + seed
Write-Host ""
Write-Host "[6/6] Inisialisasi database (migrate + seed)..." -ForegroundColor Yellow
& $DOCKER compose `
    --env-file $envFile `
    -f (Join-Path $PROJECT_DIR "docker-compose.yml") `
    exec backend php artisan migrate --force 2>&1

& $DOCKER compose `
    --env-file $envFile `
    -f (Join-Path $PROJECT_DIR "docker-compose.yml") `
    exec backend php artisan db:seed --force 2>&1

# Hasil akhir
Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  ✅ MOSA WMS RFID berhasil dijalankan!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  🌐 Dashboard Web  : http://localhost" -ForegroundColor Cyan
Write-Host "  🗄️  Database Admin : http://localhost:8081  (jalankan: docker compose --profile adminer up -d adminer)" -ForegroundColor Cyan
Write-Host "  📡 Edge Bridge WS : ws://localhost:2078" -ForegroundColor Cyan
Write-Host "  📡 RFID TCP Port  : localhost:2077 (antenna A) / localhost:2079 (antenna B)" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Demo Login:" -ForegroundColor Yellow
Write-Host "    Super Admin  : superadmin@mosa.id  / password" -ForegroundColor White
Write-Host "    Project Mgr  : pm.budi@mosa.id     / password" -ForegroundColor White
Write-Host "    PIC Lapangan : pic.joko@mosa.id     / password" -ForegroundColor White
Write-Host ""
Write-Host "  Status container:" -ForegroundColor Yellow
& $DOCKER compose `
    --env-file $envFile `
    -f (Join-Path $PROJECT_DIR "docker-compose.yml") `
    ps

Write-Host ""
Write-Host "  Untuk stop: docker compose down" -ForegroundColor DarkGray
Write-Host "  Untuk logs: docker compose logs -f" -ForegroundColor DarkGray
Write-Host ""
pause
