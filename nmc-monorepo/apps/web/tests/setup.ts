// Vitest setup — load jest-dom matchers, polyfill fetch,
// and seed a clean localStorage between tests.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

beforeEach(() => {
  window.localStorage.clear();
  if (!('fetch' in globalThis)) {
    // jsdom provides fetch, but provide a safe stub fallback
    globalThis.fetch = vi.fn(async () =>
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    ) as unknown as typeof fetch;
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
