/**
 * Convenience: domain-keyed wrappers that match the legacy NMC
 * Dashboard localStorage layout. Useful both for the offline APK
 * (everything lives in AsyncStorage until the next sync) and for
 * unit tests.
 *
 *   const store = createLocalStore();
 *   await store.tickets.add({ category: 'BTS Down', ... });
 *   const tickets = await store.tickets.list();
 *
 *   const store2 = createAsyncStore(AsyncStorage);
 *   await store2.tickets.list();
 */

import { detectWebAdapter } from './detect.js';
import { localStorageAdapter } from './localStorageAdapter.js';
import { AsyncStorageAdapter, type AsyncStorageLike } from './asyncStorageAdapter.js';
import type { AnyRecord, StoreAdapter } from './types.js';

export interface Table<T extends AnyRecord> {
  get(id: string): Promise<T | null>;
  list(): Promise<T[]>;
  add(record: Partial<T> & AnyRecord): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T | null>;
  remove(id: string): Promise<T | null>;
  replaceAll(rows: T[]): Promise<void>;
}

function makeTable<T extends AnyRecord>(adapter: StoreAdapter, key: string): Table<T> {
  return {
    async get(id) {
      const rows = await adapter.list<T>(key);
      return rows.find((r) => (r as unknown as { id: string }).id === id) ?? null;
    },
    list: () => adapter.list<T>(key),
    add: (record) => adapter.add<T>(key, record),
    update: (id, patch) => adapter.update<T>(key, id, patch),
    remove: (id) => adapter.removeItem<T>(key, id),
    async replaceAll(rows) { await adapter.set(key, rows); },
  };
}

export interface NmcStore {
  adapter: StoreAdapter;
  tickets: Table<AnyRecord>;
  incidents: Table<AnyRecord>;
  contacts: Table<AnyRecord>;
  bras: Table<AnyRecord>;
  scr: Table<AnyRecord>;
  ccb: Table<AnyRecord>;
  rosters: Table<AnyRecord>;
  mailLog: Table<AnyRecord>;
  notifications: Table<AnyRecord>;
  nmsLinks: Table<AnyRecord>;
  raw: <T = unknown>(key: string) => Promise<T | null>;
  setRaw: <T = unknown>(key: string, value: T) => Promise<void>;
  remove: (key: string) => Promise<void>;
  clearAll: () => Promise<void>;
  exportJson: () => Promise<Record<string, unknown>>;
  importJson: (blob: Record<string, unknown>) => Promise<void>;
}

const TABLES = ['tickets', 'incidents', 'contacts', 'bras', 'scr', 'ccb', 'rosters', 'mailLog', 'notifications', 'nmsLinks'] as const;

function build(adapter: StoreAdapter): NmcStore {
  const store = {
    adapter,
    tickets: makeTable(adapter, 'tickets'),
    incidents: makeTable(adapter, 'incidents'),
    contacts: makeTable(adapter, 'contacts'),
    bras: makeTable(adapter, 'bras'),
    scr: makeTable(adapter, 'scr'),
    ccb: makeTable(adapter, 'ccb'),
    rosters: makeTable(adapter, 'rosters'),
    mailLog: makeTable(adapter, 'mailLog'),
    notifications: makeTable(adapter, 'notifications'),
    nmsLinks: makeTable(adapter, 'nmsLinks'),
    raw: (key: string) => adapter.get(key),
    setRaw: (key: string, value: unknown) => adapter.set(key, value),
    remove: (key: string) => adapter.remove(key),
    clearAll: () => adapter.resetAll(),
    async exportJson() {
      const out: Record<string, unknown> = {};
      for (const t of TABLES) {
        out[t] = await adapter.get(t);
      }
      return out;
    },
    async importJson(blob: Record<string, unknown>) {
      for (const [k, v] of Object.entries(blob)) {
        await adapter.set(k, v);
      }
    },
  } as NmcStore;
  return store;
}

export function createLocalStore(): NmcStore { return build(localStorageAdapter); }
export function createWebStore(): NmcStore { return build(detectWebAdapter()); }
export function createAsyncStore(backend: AsyncStorageLike): NmcStore { return build(new AsyncStorageAdapter(backend)); }
