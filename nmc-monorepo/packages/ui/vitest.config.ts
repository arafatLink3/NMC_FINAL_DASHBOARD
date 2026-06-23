import { defineConfig } from 'vitest/config';

// Cross-platform UI primitives are tested in a DOM environment (the
// web build is the test-of-record for both visual primitives and
// layout). React Native-specific tests would mock the RN runtime
// separately and are out of scope for this package.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
