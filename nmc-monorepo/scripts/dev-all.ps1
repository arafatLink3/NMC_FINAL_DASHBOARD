# NMC Portal — one-shot dev launcher.
#
# Usage (from any directory):
#   powershell -NoProfile -ExecutionPolicy Bypass -File D:\Test_NMC_Dashboard\nmc-monorepo\scripts\dev-all.ps1
#
# What it does:
#   1. Resolves the monorepo root.
#   2. Installs deps if any of the workspace node_modules are missing.
#   3. Frees ports 4000 (server) and 5173 (vite) if a previous run left them bound.
#   4. Spawns @nmc/server (`pnpm dev` → tsc-watch + node dist/server.js) in a detached PowerShell child.
#   5. Spawns Vite (`pnpm dev` in apps\web) in a detached PowerShell child.
#   6. Waits for both ports, then smoke-tests /api/health through the Vite proxy.
#   7. Opens http://localhost:5173/login in your default browser.
#   8. Polls the child processes and tails their logs to this terminal.
#
# Kill this script (Ctrl-C) to stop both child processes cleanly.

[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [switch]$SkipInstall,
    [int]$ServerPort = 4000,
    [int]$WebPort    = 5173
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Resolve-Path (Join-Path $ScriptDir '..')
$ServerDir = Join-Path $RepoRoot 'server'
$WebDir    = Join-Path $RepoRoot 'apps\web'
$LogsDir   = Join-Path $RepoRoot 'logs'

New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

$ServerLog = Join-Path $LogsDir 'server.log'
$WebLog    = Join-Path $LogsDir 'web.log'
$LauncherLog = Join-Path $LogsDir 'launcher.log'
'' | Set-Content -Path $ServerLog, $WebLog -Encoding UTF8

function Write-Step($msg) { Write-Host "`n>> $msg" -ForegroundColor Yellow }
function Write-Info($msg) { Write-Host "   $msg" }

Write-Host "== NMC Portal dev launcher ==" -ForegroundColor Cyan
Write-Info "Repo       : $RepoRoot"
Write-Info "Server     : $ServerDir  (port $ServerPort)"
Write-Info "Web (Vite) : $WebDir     (port $WebPort)"
Write-Info "Logs       : $LogsDir"

# ── 1. Install deps if needed ──────────────────────────────────────────────
$needInstall = $false
foreach ($pkg in @(
    (Join-Path $RepoRoot  'node_modules\.pnpm'),
    (Join-Path $ServerDir 'node_modules'),
    (Join-Path $WebDir    'node_modules')
)) {
    if (-not (Test-Path $pkg)) { $needInstall = $true; break }
}
if ($needInstall -and -not $SkipInstall) {
    Write-Step 'Installing workspace dependencies (pnpm install)…'
    Push-Location $RepoRoot
    pnpm install
    Pop-Location
} else {
    Write-Info 'node_modules already present, skipping install (pass -SkipInstall:`$false to force).'
}

# ── 2. Free target ports ───────────────────────────────────────────────────
function Free-Port([int]$port) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        $pid_ = $c.OwningProcess
        try {
            # Kill the whole process tree so pnpm -> tsc-watch / node / vite all die.
            $kids = Get-CimInstance Win32_Process -Filter "ParentProcessId=$pid_" -ErrorAction SilentlyContinue
            foreach ($k in $kids) { Stop-Process -Id $k.ProcessId -Force -ErrorAction SilentlyContinue }
            Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue
        } catch {}
    }
}

function Stop-Tree([System.Diagnostics.Process]$p) {
    if (-not $p -or $p.HasExited) { return }
    try {
        $kids = Get-CimInstance Win32_Process -Filter "ParentProcessId=$($p.Id)" -ErrorAction SilentlyContinue
        foreach ($k in $kids) { Stop-Process -Id $k.ProcessId -Force -ErrorAction SilentlyContinue }
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    } catch {}
}
Write-Step "Freeing ports $ServerPort and $WebPort (if bound)"
Free-Port $ServerPort
Free-Port $WebPort
Start-Sleep -Seconds 1

# ── 3. Helper: start a detached PowerShell child that runs a command and pipes to a log ──
function Start-Detached([string]$cwd, [string]$cmd, [string]$logPath) {
    $psCmd = "Set-Location -LiteralPath '$cwd'; $cmd 2>&1 | ForEach-Object { Write-Output `$_; Add-Content -LiteralPath '$logPath' -Value `$_ }"
    $arg = '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $psCmd
    $proc = Start-Process -FilePath powershell -ArgumentList $arg -PassThru -WindowStyle Hidden
    return $proc
}

# ── 4. Start @nmc/server ───────────────────────────────────────────────────
Write-Step "Starting @nmc/server on http://localhost:$ServerPort"
$serverProc = Start-Detached -cwd $ServerDir -cmd 'pnpm dev' -logPath $ServerLog

# ── 5. Start Vite ──────────────────────────────────────────────────────────
Write-Step "Starting Vite on http://localhost:$WebPort"
$webProc = Start-Detached -cwd $WebDir -cmd 'pnpm dev' -logPath $WebLog

# ── 6. Wait for ports ──────────────────────────────────────────────────────
Write-Step "Waiting for ports $ServerPort and $WebPort to come up…"
function Wait-Port([int]$port, [int]$timeoutSec = 60) {
    for ($i = 0; $i -lt $timeoutSec; $i++) {
        if (Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}
$serverUp = Wait-Port $ServerPort 60
$webUp    = Wait-Port $WebPort    60
if (-not $serverUp) { Write-Host ("Server did NOT come up. Tail of {0}:" -f $ServerLog) -ForegroundColor Red; Get-Content $ServerLog -Tail 40 }
if (-not $webUp)    { Write-Host ("Vite did NOT come up. Tail of {0}:" -f $WebLog)     -ForegroundColor Red; Get-Content $WebLog -Tail 40 }

# ── 7. Smoke-test the proxy ────────────────────────────────────────────────
if ($webUp -and $serverUp) {
    try {
        $r = Invoke-WebRequest "http://localhost:$WebPort/api/health" -UseBasicParsing -TimeoutSec 5
        Write-Host ("Proxy check /api/health -> HTTP {0}" -f $r.StatusCode) -ForegroundColor Green
    } catch {
        Write-Host ("Proxy check /api/health FAILED: {0}" -f $_.Exception.Message) -ForegroundColor Red
        Get-Content $WebLog -Tail 40
    }
}

# ── 8. Open browser ────────────────────────────────────────────────────────
if (-not $NoBrowser) { Start-Process "http://localhost:$WebPort/login" }

Write-Host ""
Write-Host "Server PID : $($serverProc.Id)" -ForegroundColor DarkCyan
Write-Host "Vite   PID : $($webProc.Id)"    -ForegroundColor DarkCyan
Write-Host "Press Ctrl-C to stop both processes." -ForegroundColor Yellow

# ── 9. Tail logs + monitor ─────────────────────────────────────────────────
$running = $true
$null = [Console]::TreatControlCAsInput = $true
[Console]::CancelKeyPress.add({
    $script:running = $false
})

try {
    $lastS = 0
    $lastW = 0
    while ($running) {
        Start-Sleep -Seconds 2

        $sAll = Get-Content $ServerLog -ErrorAction SilentlyContinue
        $wAll = Get-Content $WebLog    -ErrorAction SilentlyContinue
        if ($sAll.Count -gt $lastS) {
            $sAll[$lastS..($sAll.Count - 1)] | ForEach-Object { Write-Host "[srv] $_" -ForegroundColor DarkYellow }
            $lastS = $sAll.Count
        }
        if ($wAll.Count -gt $lastW) {
            $wAll[$lastW..($wAll.Count - 1)] | ForEach-Object { Write-Host "[web] $_" -ForegroundColor DarkGreen }
            $lastW = $wAll.Count
        }

        if ($serverProc.HasExited -and $webProc.HasExited) {
            Write-Host "Both child processes exited." -ForegroundColor Red
            break
        }
    }
} finally {
    Write-Host "Stopping child processes…" -ForegroundColor Yellow
    foreach ($p in @($serverProc, $webProc)) { Stop-Tree $p }
    Free-Port $ServerPort
    Free-Port $WebPort
    Write-Host "Done." -ForegroundColor Green
}
