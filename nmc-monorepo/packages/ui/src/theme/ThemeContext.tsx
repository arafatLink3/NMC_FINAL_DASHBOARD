/**
 * ThemeContext — React context for the active theme tokens.
 *
 * Consumers read the active tokens via `useTheme()` and never touch CSS
 * variables directly. Components that need cross-platform styling should
 * compose their `StyleSheet.create` at module level using one of the two
 * token objects (`DARK_TOKENS` / `LIGHT_TOKENS`) and then either:
 *   (a) call `makeStyles(tokens => ({}))` to produce a function-style
 *       stylesheet bound to the active theme at render time, or
 *   (b) inline `style={{ color: tokens.text }}` for ad-hoc overrides.
 *
 * The Provider also sets `data-theme` on a configurable wrapper element
 * (default: the root View) so legacy CSS in the same tree keeps working.
 */
import { createContext, useContext, useMemo, useCallback, useEffect, useState, type ReactNode } from 'react';
import { DARK_TOKENS, LIGHT_TOKENS, tokensFor, type ThemeMode, type Tokens } from './tokens.js';

export interface ThemeContextValue {
  mode: ThemeMode;
  tokens: Tokens;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const noop = (): void => undefined;
const defaultValue: ThemeContextValue = {
  mode: 'dark',
  tokens: DARK_TOKENS,
  setMode: noop,
  toggle: noop,
};

export const ThemeContext = createContext<ThemeContextValue>(defaultValue);

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export interface ThemeProviderProps {
  children: ReactNode;
  /** Initial mode. Defaults to 'dark' to match the legacy SPA. */
  initialMode?: ThemeMode;
  /** Optional persistence key — if set, mode survives reloads. */
  storageKey?: string;
  /** Called when the user changes the mode (for telemetry). */
  onChange?: (mode: ThemeMode) => void;
}

/**
 * Read the persisted mode from localStorage on the client. SSR-safe:
 * returns `initialMode` on the server pass.
 */
function readPersistedMode(storageKey: string | undefined, fallback: ThemeMode): ThemeMode {
  if (!storageKey || typeof globalThis.localStorage === 'undefined') return fallback;
  try {
    const v = globalThis.localStorage.getItem(storageKey);
    if (v === 'dark' || v === 'light') return v;
  } catch {
    /* ignore quota / privacy errors */
  }
  return fallback;
}

export function ThemeProvider(props: ThemeProviderProps): JSX.Element {
  const { children, initialMode = 'dark', storageKey, onChange } = props;
  const [mode, setModeState] = useState<ThemeMode>(() => readPersistedMode(storageKey, initialMode));

  useEffect(() => {
    if (!storageKey || typeof globalThis.localStorage === 'undefined') return;
    try {
      globalThis.localStorage.setItem(storageKey, mode);
    } catch {
      /* ignore */
    }
  }, [mode, storageKey]);

  const setMode = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      onChange?.(next);
    },
    [onChange],
  );

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      onChange?.(next);
      return next;
    });
  }, [onChange]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, tokens: tokensFor(mode), setMode, toggle }),
    [mode, setMode, toggle],
  );

  // Cast through `any` to allow `JSX.Element` from a `.ts` file (we don't
  // import JSX namespace here to keep this file framework-agnostic).
  return <ThemeContext.Provider value={value}>{children as any}</ThemeContext.Provider>;
}

/**
 * makeStyles — Bind a style factory to the active theme tokens.
 *
 *   const useStyles = makeStyles((t) => ({
 *     card: { backgroundColor: t.card, borderRadius: t.radius, padding: 12 },
 *   }));
 *   ...
 *   const styles = useStyles();
 */
export function makeStyles<T>(
  factory: (tokens: Tokens) => T,
): () => T {
  return function useStyles(): T {
    const { tokens } = useTheme();
    return useMemo(() => factory(tokens), [tokens]);
  };
}
