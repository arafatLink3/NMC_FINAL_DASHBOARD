Set-Location 'C:\Test_NMC_Dashboard\nmc-monorepo'
$logDir = 'C:\Test_NMC_Dashboard\nmc-monorepo\logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir 'web-dev.log'
'' | Set-Content -Path $logFile -Encoding utf8

# `pnpm` is a .ps1 shim on Windows — invoke via cmd to launch the node script.
$cmdLine = 'pnpm --filter @nmc/web dev'
$proc = Start-Process -FilePath 'cmd.exe' `
  -ArgumentList '/c', $cmdLine `
  -WorkingDirectory (Get-Location) `
  -RedirectStandardOutput $logFile `
  -RedirectStandardError (Join-Path $logDir 'web-dev.err') `
  -NoNewWindow -PassThru

Write-Host "Spawned cmd pid=$($proc.Id)"
Start-Sleep -Seconds 10

$listen = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if ($listen) {
  Write-Host "Listening on :5173 (pid=$($listen[0].OwningProcess))"
} else {
  Write-Host "Web did NOT start. Tail of log:"
  Get-Content $logFile -Tail 80 | Out-String | Write-Host
  Write-Host "--- web-dev.err ---"
  Get-Content (Join-Path $logDir 'web-dev.err') -Tail 60 | Out-String | Write-Host
  exit 1
}
Write-Host "--- web-dev.log (last 40) ---"
Get-Content $logFile -Tail 40 | Out-String | Write-Host