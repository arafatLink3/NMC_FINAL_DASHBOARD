import { defineConfig, type ProxyOptions } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import react from '@vitejs/plugin-react';

// Vite config for the NMC Dashboard SPA.  The /api and /auth proxies
// target the Fastify dev server in @nmc/server so the browser can
// call the same endpoints that production would hit, without CORS
// or absolute URLs.
//
// We also override the proxy so a *down* backend never surfaces as
// a generic 500.  When the API is not listening on :4000 we respond
// with a clear 503 + JSON body so the SPA can show a meaningful
// "backend not running" error instead of a silent failure.
const API_TARGET = process.env.NMC_API_TARGET ?? 'http://localhost:4000';

function makeApiProxy(): ProxyOptions {
  return {
    target: API_TARGET,
    changeOrigin: true,
    ws: true,
    proxyTimeout: 30_000,
    timeout: 30_000,
    configure: (proxy) => {
      proxy.on('error', (err, _req, res: ServerResponse | Socket | undefined) => {
        // Only swallow the error if we still have a response to write to.
        if (res && typeof (res as ServerResponse).setHeader === 'function') {
          const reply = res as ServerResponse;
          if (reply.writableEnded || reply.headersSent) return;
          reply.statusCode = 503;
          reply.setHeader('Content-Type', 'application/json; charset=utf-8');
          reply.end(
            JSON.stringify({
              error: 'api_unreachable',
              message:
                'NMC API is not running on ' +
                API_TARGET +
                '. Start it with `pnpm dev` (or `pnpm dev:server`) in nmc-monorepo.',
              cause: (err as Error)?.message ?? 'ECONNREFUSED',
            }),
          );
        }
      });
    },
    bypass: (req: IncomingMessage) => {
      // Static asset requests are not proxied; let vite handle them.
      if (req.url?.startsWith('/@') || req.url?.startsWith('/node_modules/')) return undefined;
      return undefined;
    },
  };
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    host: '0.0.0.0',
    proxy: {
      '/api': makeApiProxy(),
      '/auth': makeApiProxy(),
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    host: '0.0.0.0',
    proxy: {
      '/api': makeApiProxy(),
      '/auth': makeApiProxy(),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
