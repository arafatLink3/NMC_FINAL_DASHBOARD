// Thin React hook that wraps @nmc/api-client for the SPA. Keeps
// the access token in localStorage via the shared `localStorageTokenStorage`
// and exposes `login` / `signup` / `logout` plus the current `user`
// and `loading` flag. The default admin (`admin@link3.net` / `admin123`)
// is seeded by the Fastify server.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  bindEndpoints,
  createClient,
  isApiError,
  localStorageTokenStorage,
  type AuthSession,
  type NmcApi,
  type User,
} from '@nmc/api-client';

// Friendly message for the most common 401 cause: stale or empty user table
// on the server (e.g. fresh clone of nmc.sqlite). Keeps the operator moving.
function explainAuthError(err: unknown, fallback: string): string {
  if (!isApiError(err)) return err instanceof Error ? err.message : fallback;
  if (err.status === 401) {
    return 'Sign-in failed: invalid email or password. (HTTP 401)';
  }
  return err.message || fallback;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** Resolves once the initial session restore attempt has finished. */
  ready: boolean;
  login(email: string, password: string): Promise<void>;
  signup(email: string, password: string, displayName?: string): Promise<void>;
  logout(): Promise<void>;
  /** Re-fetch the current user from the server. */
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// One client per browser tab. Empty `baseUrl` + relative `/api/...` paths
// in `endpoints.ts` mean Vite's dev proxy / same-origin in production.
function makeApi(): NmcApi {
  const client = createClient({
    baseUrl: '',
    tokenStorage: localStorageTokenStorage,
  });
  return bindEndpoints(client);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const apiRef = useRef<NmcApi | null>(null);
  if (!apiRef.current) apiRef.current = makeApi();
  const api = apiRef.current;

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const applySession = useCallback((session: AuthSession | null) => {
    setUser(session?.user ?? null);
  }, []);

  // Restore on mount: if a token is in localStorage, ask the server
  // who we are. Failures just leave us signed out.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await localStorageTokenStorage.getAccessToken();
        if (!token) return;
        const me = await api.me();
        if (!cancelled) setUser(me);
      } catch {
        // Token invalid/expired — clear so we don't loop.
        await localStorageTokenStorage.clear();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const login = useCallback<AuthContextValue['login']>(
    async (email, password) => {
      setLoading(true);
      try {
        const session = await api.login({ username: email, password });
        applySession(session);
      } catch (err) {
        // A 401 from /api/auth/login means credentials were wrong — drop
        // any stale token so the next attempt starts clean.
        if (isApiError(err) && err.status === 401) {
          await localStorageTokenStorage.clear();
        }
        throw new Error(explainAuthError(err, 'Login failed'));
      } finally {
        setLoading(false);
      }
    },
    [api, applySession],
  );

  const signup = useCallback<AuthContextValue['signup']>(
    async (email, password, displayName) => {
      setLoading(true);
      try {
        const session = await api.signup({ email, password, displayName });
        applySession(session);
      } finally {
        setLoading(false);
      }
    },
    [api, applySession],
  );

  const logout = useCallback<AuthContextValue['logout']>(async () => {
    await api.logout();
    setUser(null);
  }, [api]);

  const refresh = useCallback<AuthContextValue['refresh']>(async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        await localStorageTokenStorage.clear();
        setUser(null);
      } else {
        throw err;
      }
    }
  }, [api]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, ready, login, signup, logout, refresh }),
    [user, loading, ready, login, signup, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return ctx;
}