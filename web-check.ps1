try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 5
  Write-Host "Status: $($r.StatusCode)"
  Write-Host "Content-Type: $($r.Headers['Content-Type'])"
  Write-Host "Body (first 400):"
  Write-Host ($r.Content.Substring(0, [Math]::Min(400, $r.Content.Length)))
} catch {
  Write-Host "ERR: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "--- Vite log (last 30) ---"
Get-Content 'C:\Test_NMC_Dashboard\nmc-monorepo\logs\web-dev.log' -Tail 30 | Out-String | Write-Host