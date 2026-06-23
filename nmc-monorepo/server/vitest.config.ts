import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

export default defineConfig({
  resolve: {
    alias: {
      // Workspace packages ship TS source; alias to src/index.ts so
      // vitest can run tests without a separate `tsc -b` step.
      '@nmc/ai': resolve(repoRoot, 'packages/ai/src/index.ts'),
      '@nmc/api-client': resolve(repoRoot, 'packages/api-client/src/index.ts'),
      '@nmc/store': resolve(repoRoot, 'packages/store/src/index.ts'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 20_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // sqlite memory + module singleton
      },
    },
    include: ['tests/**/*.test.ts'],
    sequence: {
      concurrent: false,
    },
  },
});