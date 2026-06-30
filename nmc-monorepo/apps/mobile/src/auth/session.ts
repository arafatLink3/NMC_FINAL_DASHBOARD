/**
 * session.ts — Secure JWT storage and lifecycle for the mobile app.
 *
 * Tokens come from two flows:
 *   1. Email/password → `/api/auth/login` returns `{ accessToken, refreshToken, user }`.
 *   2. Azure AD SSO  → `/api/auth/azure/callback` returns the same shape.
 *
 * Both access and refresh tokens are stored in `expo-secure-store`, which
 * is backed by Keychain (iOS) / Keystore (Android). The access token is
 * re-read on every request via `getAccessToken()`; the refresh token is
 * consumed by `api-client`'s automatic refresh interceptor when the
 * access token expires.
 */
import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'nmc.session.access';
const REFRESH_KEY = 'nmc.session.refresh';
const USER_KEY = 'nmc.session.user';

export interface SessionUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export async function saveSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, session.accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, session.refreshToken);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(session.user));
}

export async function loadSession(): Promise<StoredSession | null> {
  const accessToken = await SecureStore.getItemAsync(ACCESS_KEY);
  const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  const userRaw = await SecureStore.getItemAsync(USER_KEY);
  if (!accessToken || !refreshToken || !userRaw) return null;
  try {
    return {
      accessToken,
      refreshToken,
      user: JSON.parse(userRaw) as SessionUser,
    };
  } catch {
    // Corrupt entry — wipe so the user is forced back to the login screen.
    await clearSession();
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
  ]);
}