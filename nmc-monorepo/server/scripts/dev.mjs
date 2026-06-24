// @nmc/server — dev orchestrator.
//
// What `pnpm dev` runs in the server package:
//   1. Start `tsc --watch` to recompile src/ to dist/ on every change.
//   2. Wait for the first build to succeed.
//   3. Spawn `node dist/server.js` and stream its output to stdout.
//   4. On any subsequent tsc success, restart the running server (kill the
//      old PID, start a new one). Fastify handles its own SIGINT/SIGTERM.
//
// This means `pnpm dev` actually runs the API on PORT (default 4000),
// not just compiles it.

import { spawn } from 'node:child_process';
import { existsSync, rmSync, watch as fsWatch } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const distDir = resolve(repoRoot, 'dist');
const serverEntry = resolve(distDir, 'server.js');

function log(prefix, msg) {
  process.stdout.write(`[${prefix}] ${msg}\n`);
}

function startTsc() {
  const tsc = spawn(
    'node',
    [resolve(repoRoot, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'],
    { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], env: process.env }
  );
  tsc.stdout.on('data', (b) => process.stdout.write(`[tsc] ${b}`));
  tsc.stderr.on('data', (b) => process.stderr.write(`[tsc] ${b}`));
  tsc.on('exit', (code) => log('tsc', `exited with code ${code}`));
  return tsc;
}

let serverProc = null;
function killProc(p) {
  if (!p) return;
  // On Windows, SIGTERM is unreliable — use taskkill /T /F to take the whole tree.
  if (process.platform === 'win32') {
    try { spawn('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
  } else {
    try { p.kill('SIGTERM'); } catch {}
  }
}

function startServer() {
  if (serverProc) {
    log('srv', `restart: killing pid ${serverProc.pid}`);
    killProc(serverProc);
    serverProc = null;
  }
  if (!existsSync(serverEntry)) {
    log('srv', 'dist/server.js not yet built — waiting for tsc');
    return;
  }
  log('srv', `starting node dist/server.js on PORT=${process.env.PORT ?? 4000}`);
  serverProc = spawn(process.execPath, ['--enable-source-maps', 'dist/server.js'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
  serverProc.on('exit', (code, signal) => {
    log('srv', `exited (code=${code}, signal=${signal})`);
    serverProc = null;
  });
}

// Detect a successful tsc build by tailing its stdout for "Found 0 errors".
let firstBuildDone = false;
function watchTscOutput(tsc) {
  const onData = (b) => {
    const s = b.toString();
    if (!s.includes('Found 0 errors')) return;
    // tsc prints the success line BEFORE the file is flushed to disk.
    // Poll for dist/server.js to actually exist before starting.
    const deadline = Date.now() + 5000;
    const waitForEntry = () => {
      if (existsSync(serverEntry)) {
        if (!firstBuildDone) {
          firstBuildDone = true;
          log('boot', 'first build succeeded — starting server');
        } else {
          log('boot', 'rebuild detected — restarting server');
        }
        startServer();
      } else if (Date.now() < deadline) {
        setTimeout(waitForEntry, 100);
      } else {
        log('boot', 'tsc reported success but dist/server.js never appeared — check tsconfig outDir');
      }
    };
    waitForEntry();
  };
  tsc.stdout.on('data', onData);
  tsc.stderr.on('data', onData);
}

// Clean dist so we never run a stale server.js that no longer matches src/.
// Also nuke the incremental buildinfo so tsc --watch emits from scratch
// (with `incremental: true`, tsc will skip emission if it thinks nothing changed).
if (existsSync(distDir)) {
  try { rmSync(distDir, { recursive: true, force: true }); } catch {}
}
for (const f of [
  resolve(repoRoot, 'tsconfig.tsbuildinfo'),
  resolve(repoRoot, 'src', 'tsconfig.tsbuildinfo'),
]) {
  if (existsSync(f)) { try { rmSync(f); } catch {} }
}

const tsc = startTsc();
watchTscOutput(tsc);

function shutdown(signal) {
  log('dev', `received ${signal} — shutting down`);
  killProc(serverProc);
  killProc(tsc);
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
