import { defineConfig } from 'vitest/config';

// We use happy-dom instead of jsdom because it's significantly smaller/faster
// and our store adapters only need a `localStorage`/`window` polyfill — not a
// full browser. Bump this if a test ever requires more DOM features.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['tests/**/*.test.ts'],
  },
});
