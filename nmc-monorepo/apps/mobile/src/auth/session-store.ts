/**
 * session-store.ts — Lightweight React Context for session state.
 *
 * On mount, the provider restores any persisted session from
 * `expo-secure-store`. `signIn` / `signOut` update both the secure
 * store and the in-memory state so the navigator can switch between
 * `AuthStack` and `AppStack` reactively.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  clearSession,
  loadSession,
  saveSession,
  type SessionUser,
  type StoredSession,
} from './session';

interface SessionContextValue {
  ready: boolean;
  session: StoredSession | null;
  signIn: (session: StoredSession) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: SessionUser) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren): JSX.Element {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<StoredSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadSession().then((stored) => {
      if (cancelled) return;
      setSession(stored);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (next: StoredSession) => {
    await saveSession(next);
    setSession(next);
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    setSession(null);
  }, []);

  const setUser = useCallback((user: SessionUser) => {
    setSession((prev) => (prev ? { ...prev, user } : prev));
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ ready, session, signIn, signOut, setUser }),
    [ready, session, signIn, signOut, setUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}