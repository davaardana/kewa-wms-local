$ErrorActionPreference = 'Stop'

$InstallDir = Split-Path -Parent $PSScriptRoot
Set-Location $InstallDir

$logDir = Join-Path $InstallDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir 'service.log'

function Write-ServiceLog($Message) {
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -Path $logFile -Value "[$timestamp] $Message"
}

Write-ServiceLog 'Starting MOSA Edge Bridge service wrapper.'

while ($true) {
    $process = Start-Process -FilePath 'node.exe' -ArgumentList @('src/index.js') -WorkingDirectory $InstallDir -NoNewWindow -PassThru -RedirectStandardOutput (Join-Path $logDir 'stdout.log') -RedirectStandardError (Join-Path $logDir 'stderr.log')
    $process.WaitForExit()
    Write-ServiceLog "node exited with code $($process.ExitCode). Restarting in 5 seconds."
    Start-Sleep -Seconds 5
}
