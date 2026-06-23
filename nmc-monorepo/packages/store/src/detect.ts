/**
 * Runtime detection. The web side picks IndexedDB if available, else
 * falls back to localStorage. RN passes a real `AsyncStorage` via
 * `new AsyncStorageAdapter(backend)`.
 */
import { indexedDbAdapter } from './indexedDbAdapter.js';
import { localStorageAdapter } from './localStorageAdapter.js';
import type { StoreAdapter } from './types.js';

export function detectWebAdapter(): StoreAdapter {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.indexedDB) return indexedDbAdapter;
  } catch { /* ignore */ }
  return localStorageAdapter;
}
