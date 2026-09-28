# MOSA Edge Bridge production service installer for Windows.
# Run from edge-bridge folder as Administrator.
# Node.js LTS must already be installed system-wide.

param(
    [string]$InstallDir = 'C:\Program Files\MOSA Edge Bridge',
    [string]$ServiceName = 'MosaEdgeBridge',
    [string]$ServiceDisplayName = 'MOSA RFID Edge Bridge'
)

$ErrorActionPreference = 'Stop'

function Assert-Admin {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run this script as Administrator.'
    }
}

function Resolve-Node {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) {
        throw 'Node.js LTS not found in PATH. Install Node.js 20 LTS system-wide first, then rerun this installer.'
    }
    return $node.Source
}

Assert-Admin
$nodePath = Resolve-Node
$SourceDir = Resolve-Path (Join-Path $PSScriptRoot '..')

Write-Host "MOSA Edge Bridge production install" -ForegroundColor Cyan
Write-Host "Source : $SourceDir"
Write-Host "Target : $InstallDir"
Write-Host "Node   : $nodePath"

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Stopping existing service $ServiceName..."
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$exclude = @('node_modules', 'logs', '.git', 'snapshots', 'offline_buffer.json', 'offline_buffer.json.incidents')
Get-ChildItem -Path $SourceDir -Force | Where-Object { $exclude -notcontains $_.Name } | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $InstallDir -Recurse -Force
}

Set-Location $InstallDir
if (-not (Test-Path '.env')) {
    if (Test-Path '.env.example') {
        Copy-Item '.env.example' '.env'
        Write-Warning 'Created .env from .env.example. Edit secrets before starting production use.'
    } else {
        New-Item -ItemType File -Path '.env' | Out-Null
        Write-Warning 'Created empty .env. Fill it before starting production use.'
    }
}

Write-Host 'Installing production dependencies...'
npm ci --omit=dev

New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir 'logs') | Out-Null

Write-Host 'Applying folder ACL...'
$acl = Get-Acl $InstallDir
$acl.SetAccessRuleProtection($true, $false)
$rules = @(
    New-Object System.Security.AccessControl.FileSystemAccessRule('SYSTEM', 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'),
    New-Object System.Security.AccessControl.FileSystemAccessRule('Administrators', 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'),
    New-Object System.Security.AccessControl.FileSystemAccessRule('Users', 'ReadAndExecute', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
)
foreach ($rule in $rules) { $acl.AddAccessRule($rule) }
Set-Acl -Path $InstallDir -AclObject $acl

$envPath = Join-Path $InstallDir '.env'
$envAcl = Get-Acl $envPath
$envAcl.SetAccessRuleProtection($true, $false)
$envAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule('SYSTEM', 'FullControl', 'None', 'None', 'Allow')))
$envAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule('Administrators', 'FullControl', 'None', 'None', 'Allow')))
Set-Acl -Path $envPath -AclObject $envAcl

$wrapper = Join-Path $InstallDir 'scripts\run-edge-bridge-service.ps1'
$binPath = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$wrapper`""
sc.exe create $ServiceName binPath= $binPath start= auto DisplayName= $ServiceDisplayName | Out-Null
sc.exe description $ServiceName "MOSA RFID Edge Bridge service. Managed by IT only." | Out-Null

New-NetFirewallRule -DisplayName 'MOSA Edge Bridge WebSocket 2078' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 2078 -Profile Private -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule -DisplayName 'MOSA Edge Bridge TCP Reader A 2077' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 2077 -Profile Private -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule -DisplayName 'MOSA Edge Bridge TCP Reader B 2079' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 2079 -Profile Private -ErrorAction SilentlyContinue | Out-Null

Write-Host "Installed. Edit $envPath as Administrator, then run:" -ForegroundColor Green
Write-Host "  Start-Service $ServiceName"
Write-Host "  Get-Service $ServiceName"
Write-Host "  Get-Content '$InstallDir\logs\service.log' -Tail 50"
