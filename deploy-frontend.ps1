#!/usr/bin/env pwsh
# ─────────────────────────────────────────────────────────────────────────────
# Deploy frontend dist ke VPS via SCP + restart edge-bridge via SSH
# Usage: .\deploy-frontend.ps1 -VpsHost "user@your-vps-ip" -VpsPath "/path/to/Mosaik-WMS"
# ─────────────────────────────────────────────────────────────────────────────
param(
    [Parameter(Mandatory=$true)]
    [string]$VpsHost,          # e.g. "root@206.237.98.48"

    [string]$VpsPath = "/root/Mosaik-WMS",  # path repo di VPS

    [switch]$EdgeOnly,         # hanya restart edge-bridge, skip frontend upload
    [switch]$FrontendOnly      # hanya upload frontend, skip edge restart
)

$distPath = "$PSScriptRoot\frontend\dist"
$remoteDistPath = "$VpsPath/frontend/dist"

Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  MOSA WMS — Deploy Script" -ForegroundColor Cyan
Write-Host "  VPS: $VpsHost" -ForegroundColor Cyan
Write-Host "  VPS Path: $VpsPath" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan

# ── 1. Upload frontend dist ──────────────────────────────────────────────────
if (-not $EdgeOnly) {
    Write-Host "`n[1/3] Uploading frontend dist to VPS..." -ForegroundColor Yellow

    # Upload index.html (bukan di assets/, jadi perlu upload terpisah)
    scp "$distPath\index.html" "${VpsHost}:${remoteDistPath}/index.html"
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to upload index.html"; exit 1 }

    # Upload semua assets (hash-based, safe untuk upload semua)
    scp -r "$distPath\assets\*" "${VpsHost}:${remoteDistPath}/assets/"
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to upload assets"; exit 1 }

    Write-Host "  ✓ Frontend dist uploaded" -ForegroundColor Green
}

# ── 2. Restart edge-bridge (ambil perubahan index.js) ───────────────────────
if (-not $FrontendOnly) {
    Write-Host "`n[2/3] Copying edge-bridge src to VPS and rebuilding..." -ForegroundColor Yellow

    # Upload file edge yang berubah
    scp "$PSScriptRoot\edge-bridge\src\index.js" "${VpsHost}:${VpsPath}/edge-bridge/src/index.js"
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to upload edge index.js"; exit 1 }

    # Restart container edge-bridge
    ssh $VpsHost "cd $VpsPath && docker compose restart edge-bridge"
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to restart edge-bridge"; exit 1 }

    Write-Host "  ✓ edge-bridge restarted" -ForegroundColor Green
}

# ── 3. Verify nginx serving new assets ──────────────────────────────────────
Write-Host "`n[3/3] Verifying deployment..." -ForegroundColor Yellow
ssh $VpsHost "ls -la $remoteDistPath/assets/ | grep -E 'TagEnrollment|edgeWebSocket|RfidGate|index-'"
Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅ Deploy selesai!" -ForegroundColor Green
Write-Host "  → Hard-refresh browser (Ctrl+Shift+R) di VPS" -ForegroundColor Green
Write-Host "  → Buka TagEnrollment → pilih warehouse + reader" -ForegroundColor Green
Write-Host "  → WS akan gagal (no LAN access) → SSE aktif otomatis" -ForegroundColor Green
Write-Host "  → Scan tag RFID → EPC muncul di UI via SSE" -ForegroundColor Green
Write-Host "═══════════════════════════════════════" -ForegroundColor Green
