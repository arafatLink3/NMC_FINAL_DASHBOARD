/**
 * Token storage abstraction. Web uses localStorage, RN uses AsyncStorage.
 * The user supplies an adapter via `createClient({ tokenStorage })`.
 *
 * The default in-memory adapter is fine for tests and server-side
 * rendering where the client never persists tokens.
 */

export interface TokenStorage {
  getAccessToken(): Promise<string | null>;
  setAccessToken(token: string | null): Promise<void>;
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string | null): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryTokenStorage implements TokenStorage {
  private access: string | null = null;
  private refresh: string | null = null;
  async getAccessToken(): Promise<string | null> { return this.access; }
  async setAccessToken(t: string | null): Promise<void> { this.access = t; }
  async getRefreshToken(): Promise<string | null> { return this.refresh; }
  async setRefreshToken(t: string | null): Promise<void> { this.refresh = t; }
  async clear(): Promise<void> { this.access = null; this.refresh = null; }
}

export const memoryTokenStorage: TokenStorage = new MemoryTokenStorage();

/** Web adapter backed by `localStorage`; safe in browsers only. */
export const localStorageTokenStorage: TokenStorage = {
  async getAccessToken() {
    try { return globalThis.localStorage?.getItem('nmc.access') ?? null; } catch { return null; }
  },
  async setAccessToken(t) {
    try { if (t) globalThis.localStorage?.setItem('nmc.access', t); else globalThis.localStorage?.removeItem('nmc.access'); } catch { /* ignore */ }
  },
  async getRefreshToken() {
    try { return globalThis.localStorage?.getItem('nmc.refresh') ?? null; } catch { return null; }
  },
  async setRefreshToken(t) {
    try { if (t) globalThis.localStorage?.setItem('nmc.refresh', t); else globalThis.localStorage?.removeItem('nmc.refresh'); } catch { /* ignore */ }
  },
  async clear() {
    try {
      globalThis.localStorage?.removeItem('nmc.access');
      globalThis.localStorage?.removeItem('nmc.refresh');
    } catch { /* ignore */ }
  },
};
