# =============================================================================
# MOSA WMS — Edge Bridge Local (Baca RFID lokal, kirim ke API VPS)
# =============================================================================
# Gunakan ini jika: Edge Bridge jalan di PC lokal, API/DB di VPS
# Cara: klik kanan → "Run with PowerShell"
# =============================================================================

Set-Location $PSScriptRoot
$DOCKER  = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
$envFile = Join-Path $PSScriptRoot ".env"

Write-Host ""
Write-Host "========================================================" -ForegroundColor Magenta
Write-Host "  MOSA Edge Bridge — Mode: Local → VPS" -ForegroundColor Magenta
Write-Host "  Edge (RFID reader) di PC ini, API di VPS" -ForegroundColor Magenta
Write-Host "========================================================" -ForegroundColor Magenta
Write-Host ""

# Cek API_BASE_URL di .env
$apiUrl = Get-Content $envFile | Where-Object { $_ -match '^API_BASE_URL=' } | ForEach-Object { $_.Split('=',2)[1] }
Write-Host "  API Target VPS : $apiUrl" -ForegroundColor Cyan
Write-Host ""

# Jalankan hanya edge-bridge, arahkan API ke VPS
& $DOCKER compose `
    --env-file $envFile `
    -f (Join-Path $PSScriptRoot "docker-compose.yml") `
    -f (Join-Path $PSScriptRoot "docker-compose.local-edge-vps.yml") `
    up -d --build edge-bridge

Write-Host ""
Write-Host "  ✅ Edge Bridge berjalan:" -ForegroundColor Green
Write-Host "     TCP Port A  : 0.0.0.0:2077 (RFID reader antenna A)" -ForegroundColor White
Write-Host "     TCP Port B  : 0.0.0.0:2079 (RFID reader antenna B)" -ForegroundColor White
Write-Host "     WebSocket   : 0.0.0.0:2078 (dashboard browser)" -ForegroundColor White
Write-Host "     API Target  : $apiUrl" -ForegroundColor White
Write-Host ""
Write-Host "  Logs: docker compose logs -f edge-bridge" -ForegroundColor DarkGray
Write-Host ""
pause
