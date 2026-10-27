# ADD-READER-ALIAS.ps1
# Tambah IP alias 192.168.1.150 ke Ethernet TANPA ubah default gateway
# Jalankan: klik kanan -> Run as Administrator

$ErrorActionPreference = 'Stop'

$adapter = "Ethernet"
$aliasIP  = "192.168.1.150"
$prefix   = 24

Write-Host "=== Cek kondisi awal ===" -ForegroundColor Cyan
Get-NetIPAddress -InterfaceAlias $adapter -AddressFamily IPv4 |
    Select-Object IPAddress, AddressState | Format-Table

# Hapus alias lama kalau ada
$existing = Get-NetIPAddress -InterfaceAlias $adapter -AddressFamily IPv4 |
            Where-Object { $_.IPAddress -eq $aliasIP }
if ($existing) {
    Write-Host "Hapus alias lama $aliasIP ..." -ForegroundColor Yellow
    Remove-NetIPAddress -IPAddress $aliasIP -Confirm:$false
}

# Tambah alias TANPA DefaultGateway (internet tetap lewat gateway utama)
Write-Host "Tambah alias $aliasIP/$prefix ke $adapter ..." -ForegroundColor Green
New-NetIPAddress `
    -InterfaceAlias $adapter `
    -IPAddress $aliasIP `
    -PrefixLength $prefix

Write-Host ""
Write-Host "=== IP setelah alias ===" -ForegroundColor Cyan
Get-NetIPAddress -InterfaceAlias $adapter -AddressFamily IPv4 |
    Select-Object IPAddress, AddressState | Format-Table

Write-Host "=== Test ping reader ===" -ForegroundColor Cyan
ping 192.168.1.200 -n 3 -S $aliasIP

Write-Host "=== Test internet ===" -ForegroundColor Cyan
ping 8.8.8.8 -n 2

Write-Host ""
Write-Host "Tekan Enter untuk keluar..."
Read-Host
