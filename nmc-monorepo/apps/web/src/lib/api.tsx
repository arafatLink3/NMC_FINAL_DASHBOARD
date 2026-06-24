// React wrapper around @nmc/api-client's createClient.
// Exposes the bound endpoint object as `useApi()`.

import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { createClient, bindEndpoints, type NmcApi } from '@nmc/api-client';

type Ctx = NmcApi & {
  setToken: (t: string | null) => void;
  getToken: () => string | null;
  setBaseUrl: (url: string) => void;
};

const ApiContext = createContext<Ctx | null>(null);

function readBaseUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:4000';
  const fromStorage = localStorage.getItem('nmc.apiBase');
  if (fromStorage) return fromStorage;
  // The endpoint paths in @nmc/api-client are absolute (e.g. '/api/auth/login'),
  // so we keep baseUrl empty and let them render as-is. The Vite dev server
  // proxies /api/* to Fastify, and in production the same origin serves /api.
  // Relative URLs (no host) keep the request same-origin → no CORS preflight.
  return '';
}

export function ApiProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef(createClient({ baseUrl: readBaseUrl() }));
  const baseRef = useRef<string>(readBaseUrl());

  const value = useMemo<Ctx>(() => {
    const c = clientRef.current;
    return {
      ...bindEndpoints(c),
      setToken: (t) => {
        void c.tokenStorage.setAccessToken(t);
      },
      getToken: () => {
        // synchronous best-effort: only works for the in-memory store
        const mem = c.tokenStorage as { access?: string | null };
        return mem.access ?? null;
      },
      setBaseUrl: (url) => {
        baseRef.current = url;
        localStorage.setItem('nmc.apiBase', url);
        // re-create the client so the new base takes effect
        const next = createClient({ baseUrl: url });
        Object.assign(clientRef.current, next);
      },
    } as Ctx;
  }, []);

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): Ctx {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApi must be used within ApiProvider');
  return ctx;
}
