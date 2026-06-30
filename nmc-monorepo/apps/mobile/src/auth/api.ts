/**
 * api.ts — Singleton `@nmc/api-client` configured for the mobile runtime.
 *
 * The web SPA builds its client in `apps/web/src/lib/api.ts`; the mobile
 * app builds an equivalent one here with:
 *   - a base URL resolved from `expo-constants`' `extra.apiBaseUrl`
 *     (set in `app.json`).
 *   - `secureStoreTokenStorage` for JWT persistence.
 *   - a `refresh` handler that hits `/api/auth/refresh` and re-saves
 *     the session user info alongside the new tokens.
 *
 * The `AuthSession` returned by `api.login()` carries the user; we
 * mirror it into `expo-secure-store` via `saveSession()` so the
 * `useSession()` hook picks it up.
 */
import Constants from 'expo-constants';
import { createClient, bindEndpoints, type NmcApi } from '@nmc/api-client';
import { loadSession, saveSession } from './session';
import { secureStoreTokenStorage } from './token-storage';

function resolveBaseUrl(): string {
  const fromExtra = (
    Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined
  )?.apiBaseUrl;
  if (fromExtra) return fromExtra;
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }
  return 'http://localhost:4099';
}

const baseUrl = resolveBaseUrl();

const http = createClient({
  baseUrl,
  tokenStorage: secureStoreTokenStorage,
  // No `refresh` handler — the server's `/api/auth/login` returns an
  // access token only (no refresh token). On 401 the user is bounced
  // back to the LoginScreen by `useSession()`.
  onAuthChange: async ({ type }) => {
    if (type === 'logout') {
      const session = await loadSession();
      if (session) {
        await saveSession({ ...session, accessToken: '', refreshToken: '' });
      }
    }
  },
});

export const api: NmcApi = bindEndpoints(http);

export type ApiClient = typeof api;
export { baseUrl as apiBaseUrl };