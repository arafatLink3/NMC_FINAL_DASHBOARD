// Auth context: thin wrapper over @nmc/api-client that exposes {user, token, login, logout}.
// Persists the JWT in localStorage via the api-client's token storage.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ApiError, type AuthSession, type Role, type User } from '@nmc/api-client';
import { bus } from './bus';
import { useApi } from './api';

type Ctx = {
  user: User | null;
  session: AuthSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthSession>;
  signup: (email: string, password: string, displayName?: string) => Promise<AuthSession>;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const navigate = useNavigate();
  const location = useLocation();

  const [session, setSession] = useState<AuthSession | null>(() => {
    try {
      const raw = localStorage.getItem('nmc.auth');
      return raw ? (JSON.parse(raw) as AuthSession) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  // Whenever the session changes, hand the token to the api-client and persist.
  useEffect(() => {
    if (session) {
      localStorage.setItem('nmc.auth', JSON.stringify(session));
      api.setToken(session.accessToken);
      bus.emit('nmc:auth:changed', { session });
    } else {
      localStorage.removeItem('nmc.auth');
      api.setToken(null);
      bus.emit('nmc:auth:changed', { session: null });
    }
  }, [session, api]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const s = await api.login({ username: email, password });
      setSession(s);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
      bus.emit('notify', { id: crypto.randomUUID(), text: `Welcome, ${s.user.name || s.user.email}`, type: 'success', createdAt: new Date().toISOString() });
      return s;
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Login failed';
      bus.emit('notify', { id: crypto.randomUUID(), text: msg, type: 'danger', createdAt: new Date().toISOString() });
      throw err;
    } finally {
      setLoading(false);
    }
  }, [api, navigate, location.state]);

  const signup = useCallback(async (email: string, password: string, displayName?: string) => {
    setLoading(true);
    try {
      const s = await api.signup({ email, password, ...(displayName ? { displayName } : {}) });
      setSession(s);
      navigate('/dashboard', { replace: true });
      bus.emit('notify', { id: crypto.randomUUID(), text: `Account created — welcome, ${s.user.name || s.user.email}`, type: 'success', createdAt: new Date().toISOString() });
      return s;
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Signup failed';
      bus.emit('notify', { id: crypto.randomUUID(), text: msg, type: 'danger', createdAt: new Date().toISOString() });
      throw err;
    } finally {
      setLoading(false);
    }
  }, [api, navigate]);

  const logout = useCallback(() => {
    setSession(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const hasRole = useCallback((...roles: Role[]) => {
    if (!session) return false;
    if (roles.length === 0) return true;
    return roles.includes(session.user.role);
  }, [session]);

  const value = useMemo<Ctx>(() => ({
    user: session?.user ?? null,
    session,
    loading,
    login,
    signup,
    logout,
    hasRole,
  }), [session, loading, login, signup, logout, hasRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
