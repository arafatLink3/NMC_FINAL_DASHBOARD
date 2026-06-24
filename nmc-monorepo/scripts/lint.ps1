$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$null = [System.Management.Automation.Language.Parser]::ParseFile(
    'D:\Test_NMC_Dashboard\nmc-monorepo\scripts\dev-all.ps1',
    [ref]$tokens, [ref]$errors)
if ($errors -and $errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Host $_.Message -ForegroundColor Red }
    exit 1
}
Write-Host 'OK' -ForegroundColor Green
