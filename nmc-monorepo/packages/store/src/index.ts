export type { AnyRecord, StoreAdapter } from './types.js';
export { PREFIX, ns, deNs } from './prefix.js';
export { localStorageAdapter } from './localStorageAdapter.js';
export { indexedDbAdapter } from './indexedDbAdapter.js';
export { AsyncStorageAdapter, type AsyncStorageLike } from './asyncStorageAdapter.js';
export { detectWebAdapter } from './detect.js';
export {
  createLocalStore,
  createWebStore,
  createAsyncStore,
  type NmcStore,
  type Table,
} from './keys.js';
