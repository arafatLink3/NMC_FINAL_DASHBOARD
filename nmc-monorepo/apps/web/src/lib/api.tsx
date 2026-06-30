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

// Two storage keys:
//   - `nmc.apiBase`     legacy override (kept for backward-compat).
//   - `nmc.apiBase.url` the explicit URL the operator typed into Settings.
// In the SPA dev build the Vite proxy forwards `/api/*` and `/auth/*` to the
// Fastify server, so empty baseUrl (= same-origin) is always correct. We
// only honor an explicit override when it is an http(s) URL — anything else
// (a stale empty string from a prior session, a typo, a leftover 'null',
// etc.) falls back to same-origin so the page can never get stuck on a
// dead URL like the browser history used to.
function readBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const explicit = localStorage.getItem('nmc.apiBase.url') ?? '';
  if (/^https?:\/\//i.test(explicit)) return explicit.replace(/\/+$/, '');
  const legacy = localStorage.getItem('nmc.apiBase') ?? '';
  if (/^https?:\/\//i.test(legacy)) return legacy.replace(/\/+$/, '');
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
        // Persist the operator's explicit override under a dedicated key.
        // Empty / non-http values are accepted (clears the override) so
        // the SPA falls back to the same-origin / Vite proxy path.
        if (/^https?:\/\//i.test(url)) {
          localStorage.setItem('nmc.apiBase.url', url.replace(/\/+$/, ''));
        } else {
          localStorage.removeItem('nmc.apiBase.url');
        }
        // Also clear the legacy key so a previous bad value can't resurface.
        localStorage.removeItem('nmc.apiBase');
        const next = createClient({ baseUrl: url || '' });
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
