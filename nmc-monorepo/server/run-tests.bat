@echo off
setlocal
cd /d D:\Test_NMC_Dashboard\nmc-monorepo

echo === pnpm version ===
call pnpm --version
if errorlevel 1 (
  echo pnpm is not on PATH
  exit /b 1
)

echo.
echo === Clean build-state cache (so approval gate re-evaluates) ===
call pnpm approve-builds --help > nul 2>&1
if errorlevel 1 (
  echo approve-builds subcommand not available, falling back to env flag
  set "PNPM_CONFIG_ALLOW_BUILD=protobufjs sqlite3 bcrypt esbuild"
)

echo.
echo === pnpm install (root) ===
call pnpm install --prefer-offline --reporter=append-only > install.log 2>&1
if errorlevel 1 (
  echo --- install.log ---
  type install.log
  exit /b 1
)
echo install ok

echo.
echo === pnpm test (server) ===
cd server
call pnpm test > test-output.log 2>&1
set RC=%errorlevel%
echo --- test-output.log (last 200 lines) ---
powershell -NoProfile -Command "Get-Content -Path 'test-output.log' -Tail 200"
echo exit=%RC%
exit /b %RC%
