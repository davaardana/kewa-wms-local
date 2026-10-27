#!/usr/bin/env pwsh
# ═══════════════════════════════════════════════════════════════════════
#  MOSA WMS — Deploy Gate Engine Bug Fix ke VPS
#  Fix: GATE OUT tidak bisa karena status tag tidak di-reset ke 'active'
#       + double-scan check memblokir scan bertahap yang sah
#  Jalankan: .\deploy-gate-fix.ps1 -VpsHost "root@206.237.98.48"
# ═══════════════════════════════════════════════════════════════════════
param(
    [Parameter(Mandatory=$true)]
    [string]$VpsHost,          # e.g. "root@206.237.98.48"
    [string]$VpsPath = "/root/Mosaik-WMS"
)

$localFile  = "$PSScriptRoot\backend\app\Services\GateEngineService.php"
$remoteFile = "$VpsPath/backend/app/Services/GateEngineService.php"

Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  MOSA WMS — Gate Engine Bug Fix Deploy" -ForegroundColor Cyan
Write-Host "  VPS : $VpsHost" -ForegroundColor Cyan
Write-Host "  File: GateEngineService.php" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan

# 1. Upload file yang sudah di-fix
Write-Host "`n[1/3] Upload GateEngineService.php ke VPS..." -ForegroundColor Yellow
scp $localFile "${VpsHost}:${remoteFile}"
if ($LASTEXITCODE -ne 0) { Write-Error "SCP gagal"; exit 1 }
Write-Host "  ✔ File terupload" -ForegroundColor Green

# 2. Restart backend + queue-worker agar PHP opcache flush
Write-Host "`n[2/3] Restart backend container (flush opcache)..." -ForegroundColor Yellow
ssh $VpsHost "cd $VpsPath && docker compose restart backend queue-worker"
if ($LASTEXITCODE -ne 0) { Write-Error "Restart gagal"; exit 1 }
Write-Host "  ✔ Backend restarted" -ForegroundColor Green

# 3. Verifikasi file sudah update di container
Write-Host "`n[3/3] Verifikasi fix di container..." -ForegroundColor Yellow
ssh $VpsHost "docker exec mosa-backend grep -n 'status.*active.*last_warehouse_id.*null' /var/www/backend/app/Services/GateEngineService.php"
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✔ Fix terverifikasi di container!" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Verifikasi manual: cek file di container" -ForegroundColor Yellow
}

# 4. Cek DB — tag yang stuck 'attached' dengan last_warehouse_id=null (data lama)
Write-Host "`n[BONUS] Cek tag stuck dari bug lama..." -ForegroundColor Yellow
ssh $VpsHost @"
docker exec mosa-postgres psql -U mosa_user -d mosa_wms -c "
SELECT id, epc, status, last_warehouse_id 
FROM rfid_tags 
WHERE status = 'attached' AND last_warehouse_id IS NULL
LIMIT 20;
"
"@

Write-Host "`n═══════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅ Deploy selesai!" -ForegroundColor Green
Write-Host "  Jika ada tag 'attached' + last_warehouse_id=NULL" -ForegroundColor Green
Write-Host "  jalankan: .\fix-stuck-tags.ps1 -VpsHost $VpsHost" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Green
