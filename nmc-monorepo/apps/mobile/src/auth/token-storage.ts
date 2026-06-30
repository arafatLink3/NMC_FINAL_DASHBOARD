/**
 * token-storage.ts — `expo-secure-store` adapter for `@nmc/api-client`.
 *
 * The api-client reads/writes tokens through the `TokenStorage`
 * interface. On native, `expo-secure-store` is backed by the iOS
 * Keychain / Android Keystore — appropriate for JWT storage.
 *
 * Keys mirror those used by `localStorageTokenStorage` in the web
 * adapter (so a session exported by the web client and re-imported on
 * mobile would land in the same logical slots — except we never
 * actually do that since tokens are scoped per-platform).
 */
import * as SecureStore from 'expo-secure-store';
import type { TokenStorage } from '@nmc/api-client';

const ACCESS_KEY = 'nmc.access';
const REFRESH_KEY = 'nmc.refresh';

export const secureStoreTokenStorage: TokenStorage = {
  async getAccessToken() {
    try { return await SecureStore.getItemAsync(ACCESS_KEY); } catch { return null; }
  },
  async setAccessToken(token) {
    try {
      if (token) await SecureStore.setItemAsync(ACCESS_KEY, token);
      else await SecureStore.deleteItemAsync(ACCESS_KEY);
    } catch { /* ignore */ }
  },
  async getRefreshToken() {
    try { return await SecureStore.getItemAsync(REFRESH_KEY); } catch { return null; }
  },
  async setRefreshToken(token) {
    try {
      if (token) await SecureStore.setItemAsync(REFRESH_KEY, token);
      else await SecureStore.deleteItemAsync(REFRESH_KEY);
    } catch { /* ignore */ }
  },
  async clear() {
    try {
      await Promise.all([
        SecureStore.deleteItemAsync(ACCESS_KEY),
        SecureStore.deleteItemAsync(REFRESH_KEY),
      ]);
    } catch { /* ignore */ }
  },
};