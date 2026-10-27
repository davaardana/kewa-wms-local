#!/usr/bin/env pwsh
# ═══════════════════════════════════════════════════════════════════════
#  MOSA WMS — Fix tag stuck: status='attached' tapi last_warehouse_id=NULL
#
#  Ini adalah data korupsi dari bug lama (sebelum fix GateEngineService).
#  Tag yang berhasil GATE_OUT seharusnya status='active', bukan 'attached'.
#  Script ini reset tag tersebut ke status='active' secara aman.
#
#  Jalankan SETELAH deploy-gate-fix.ps1:
#  .\fix-stuck-tags.ps1 -VpsHost "root@206.237.98.48"
# ═══════════════════════════════════════════════════════════════════════
param(
    [Parameter(Mandatory=$true)]
    [string]$VpsHost,
    [string]$VpsPath = "/root/Mosaik-WMS",
    [switch]$DryRun   # tampilkan saja, jangan update
)

Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  MOSA WMS — Fix Tag Status Corruption" -ForegroundColor Cyan
Write-Host "  VPS: $VpsHost  DryRun: $($DryRun.IsPresent)" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan

# 1. Cek dulu tag mana yang stuck
Write-Host "`n[1/2] Cek tag stuck (attached + no warehouse)..." -ForegroundColor Yellow
ssh $VpsHost @"
docker exec mosa-postgres psql -U mosa_user -d mosa_wms -c "
SELECT rt.id, rt.epc, rt.status, rt.last_warehouse_id,
       i.name AS item_name,
       (SELECT max(created_at) FROM custody_ledger 
        WHERE tag_epc = rt.epc AND action = 'GATE_OUT') AS last_gate_out
FROM rfid_tags rt
JOIN items i ON i.id = rt.item_id
WHERE rt.status = 'attached' AND rt.last_warehouse_id IS NULL
ORDER BY rt.id;
"
"@

if ($DryRun) {
    Write-Host "`n[DRY RUN] Tidak ada perubahan. Hapus flag -DryRun untuk apply fix." -ForegroundColor Yellow
    exit 0
}

# 2. Konfirmasi update
$confirm = Read-Host "`nLanjutkan reset status tag di atas ke 'active'? (y/N)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Host "Dibatalkan." -ForegroundColor Yellow
    exit 0
}

Write-Host "`n[2/2] Reset tag stuck ke status='active'..." -ForegroundColor Yellow
ssh $VpsHost @"
docker exec mosa-postgres psql -U mosa_user -d mosa_wms -c "
UPDATE rfid_tags
SET status = 'active', updated_at = NOW()
WHERE status = 'attached' AND last_warehouse_id IS NULL;
" -c "SELECT COUNT(*) AS updated FROM rfid_tags WHERE status = 'active' AND last_warehouse_id IS NULL;"
"@

Write-Host "`n✅ Tag stuck berhasil di-reset." -ForegroundColor Green
Write-Host "   Tag sekarang status='active' dan siap untuk dokumen OUTBOUND baru." -ForegroundColor Green
