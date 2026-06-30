$path = 'C:\Test_NMC_Dashboard\Flies\White paper about Zero-Install Offline-Tolerant Automation Console for NMC Dashboard Management.pdf'
$bytes = [System.IO.File]::ReadAllBytes($path)
Write-Host ('Size bytes: ' + $bytes.Length)
$sb = New-Object System.Text.StringBuilder
foreach ($b in $bytes) {
  if ($b -ge 32 -and $b -lt 127 -or $b -eq 10 -or $b -eq 13) {
    [void]$sb.Append([char]$b)
  } elseif ($b -eq 9) {
    [void]$sb.Append([char]9)
  } else {
    [void]$sb.Append(' ')
  }
}
$out = 'C:\Test_NMC_Dashboard\white-paper-raw.txt'
[System.IO.File]::WriteAllText($out, $sb.ToString(), [System.Text.Encoding]::UTF8)
Write-Host ('Wrote: ' + $out)