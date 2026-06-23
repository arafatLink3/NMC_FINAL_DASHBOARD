/**
 * Vitest shared setup: render helpers + theme provider.
 *
 * Tests render components inside a real `ThemeProvider` (default dark mode)
 * so styles resolve, and we use `react-test-renderer` via @testing-library
 * for tree assertions. We register an `afterEach(cleanup)` once on import
 * so DOM trees don't leak between tests (vitest config has globals:false).
 */
import { afterEach } from 'vitest';
import { type PropsWithChildren, type ReactElement } from 'react';
import { cleanup, render, type RenderOptions } from '@testing-library/react';
import { ThemeProvider } from '../src/theme/ThemeContext.js';

afterEach(() => {
  cleanup();
});

function Wrapper({ children }: PropsWithChildren): ReactElement {
  return <ThemeProvider initialMode="dark">{children}</ThemeProvider>;
}

export function renderWithTheme(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): ReturnType<typeof render> {
  return render(ui, { wrapper: Wrapper, ...options });
}

export * from '@testing-library/react';
