/**
 * IndexedDB adapter (web). Better than localStorage once ticket history
 * grows large. The DB is called `nmc`; we keep a single object store
 * `kv` where each record is `{ key, value, updatedAt }`. The "table"
 * semantics (list/add/update/remove) are layered on top.
 */

import { ns, PREFIX } from './prefix.js';
import type { AnyRecord, StoreAdapter } from './types.js';

const DB_NAME = 'nmc';
const DB_VERSION = 1;
const STORE = 'kv';

interface RawRow { key: string; value: unknown; updatedAt: string }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb = globalThis.indexedDB;
    if (!idb) { reject(new Error('IndexedDB not available')); return; }
    const req = idb.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open error'));
  });
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDBRequest error'));
  });
}

function txComplete(t: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error('IDBTransaction error'));
    t.onabort = () => reject(t.error ?? new Error('IDBTransaction abort'));
  });
}

function uuid(): string {
  const c: { crypto?: { randomUUID?: () => string } } = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  if (c.crypto?.randomUUID) return c.crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function nowIso(): string { return new Date().toISOString(); }

export const indexedDbAdapter: StoreAdapter = {
  async get<T>(key: string): Promise<T | null> {
    const db = await openDb();
    const t = db.transaction(STORE, 'readonly');
    const store = t.objectStore(STORE);
    const row = await reqAsPromise<RawRow | undefined>(store.get(ns(key)) as IDBRequest<RawRow | undefined>);
    db.close();
    return (row?.value ?? null) as T | null;
  },

  async set<T>(key: string, value: T): Promise<void> {
    const db = await openDb();
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put({ key: ns(key), value, updatedAt: nowIso() } as RawRow);
    await txComplete(t);
    db.close();
  },

  async remove(key: string): Promise<void> {
    const db = await openDb();
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).delete(ns(key));
    await txComplete(t);
    db.close();
  },

  async list<T>(key: string): Promise<T[]> {
    const v = await this.get<T[]>(key);
    return Array.isArray(v) ? v : [];
  },

  async add<T = AnyRecord>(key: string, record: AnyRecord): Promise<T> {
    const rows = await this.list<T>(key);
    const id = (record.id as string | undefined) ?? uuid();
    const now = nowIso();
    const withMeta = { ...record, id, createdAt: (record.createdAt as string | undefined) ?? now, updatedAt: now } as unknown as T & { id: string; createdAt: string; updatedAt: string };
    rows.push(withMeta as T);
    await this.set(key, rows);
    return withMeta as T;
  },

  async update<T>(key: string, id: string, patch: Partial<T>): Promise<T | null> {
    const rows = await this.list<T>(key);
    let found: T | null = null;
    const next = rows.map((r) => {
      const rec = r as unknown as { id: string };
      if (rec.id !== id) return r;
      found = { ...r, ...patch, updatedAt: nowIso() } as T;
      return found as T;
    });
    if (!found) return null;
    await this.set(key, next);
    return found;
  },

  async removeItem<T>(key: string, id: string): Promise<T | null> {
    const rows = await this.list<T>(key);
    let removed: T | null = null;
    const next = rows.filter((r) => {
      const rec = r as unknown as { id: string };
      if (rec.id === id) { removed = r; return false; }
      return true;
    });
    if (!removed) return null;
    await this.set(key, next);
    return removed;
  },

  async clear(key?: string): Promise<void> {
    const db = await openDb();
    const t = db.transaction(STORE, 'readwrite');
    const store = t.objectStore(STORE);
    if (key) {
      store.delete(ns(key));
    } else {
      store.clear();
    }
    await txComplete(t);
    db.close();
  },

  async resetAll(): Promise<void> { await this.clear(); },

  async keys(): Promise<string[]> {
    const db = await openDb();
    const t = db.transaction(STORE, 'readonly');
    const store = t.objectStore(STORE);
    const rows = await reqAsPromise<RawRow[]>(store.getAll() as IDBRequest<RawRow[]>);
    db.close();
    return rows.map((r) => r.key.startsWith(PREFIX) ? r.key.slice(PREFIX.length) : r.key);
  },
};