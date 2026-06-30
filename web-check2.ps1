$out = @()
$out += "=== Port 5173 listeners ==="
$listen = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if ($listen) {
  foreach ($l in $listen) {
    $out += ("pid={0} addr={1} port={2}" -f $l.OwningProcess, $l.LocalAddress, $l.LocalPort)
  }
} else {
  $out += "(none)"
}

$out += ""
$out += "=== HTTP / ==="
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 5
  $out += ("Status: {0}" -f $r.StatusCode)
  $out += ("Content-Type: {0}" -f $r.Headers['Content-Type'])
  $out += "Body (first 400):"
  $body = $r.Content
  if ($body.Length -gt 400) { $body = $body.Substring(0, 400) }
  $out += $body
} catch {
  $out += ("ERR: {0}" -f $_.Exception.Message)
}

$out += ""
$out += "=== Vite log (last 30) ==="
$log = 'C:\Test_NMC_Dashboard\nmc-monorepo\logs\web-dev.log'
if (Test-Path $log) {
  Get-Content $log -Tail 30 | ForEach-Object { $out += $_ }
} else {
  $out += "(no log file)"
}

$out | Out-File -FilePath 'C:\Test_NMC_Dashboard\web-check-result.txt' -Encoding utf8
Write-Host "wrote C:\Test_NMC_Dashboard\web-check-result.txt"