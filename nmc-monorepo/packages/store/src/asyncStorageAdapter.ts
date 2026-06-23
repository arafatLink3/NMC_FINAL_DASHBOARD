/**
 * AsyncStorage adapter (React Native). Mirrors the same StoreAdapter
 * surface. The caller wires this up on app boot by passing an actual
 * AsyncStorage implementation (e.g. `@react-native-async-storage/async-storage`).
 *
 * On the web/Nest server we keep this file dependency-free so the package
 * has no RN-specific imports.
 */

import { ns, PREFIX } from './prefix.js';
import type { AnyRecord, StoreAdapter } from './types.js';

export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys?(): Promise<string[]>;
  multiGet?(keys: string[]): Promise<Array<[string, string | null]>>;
  clear?(): Promise<void>;
}

function uuid(): string {
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function nowIso(): string { return new Date().toISOString(); }

export class AsyncStorageAdapter implements StoreAdapter {
  constructor(private readonly backend: AsyncStorageLike) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.backend.getItem(ns(key));
    if (raw == null) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.backend.setItem(ns(key), JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    await this.backend.removeItem(ns(key));
  }

  async list<T>(key: string): Promise<T[]> {
    const v = await this.get<T[]>(key);
    return Array.isArray(v) ? v : [];
  }

  async add<T = AnyRecord>(key: string, record: AnyRecord): Promise<T> {
    const rows = await this.list<T>(key);
    const id = (record.id as string | undefined) ?? uuid();
    const now = nowIso();
    const withMeta = { ...record, id, createdAt: (record.createdAt as string | undefined) ?? now, updatedAt: now } as unknown as T & { id: string; createdAt: string; updatedAt: string };
    rows.push(withMeta as T);
    await this.set(key, rows);
    return withMeta as T;
  }

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
  }

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
  }

  async clear(key?: string): Promise<void> {
    if (key) { await this.remove(key); return; }
    const keys = await this.backend.getAllKeys?.();
    if (!keys) return;
    const ours = keys.filter((k) => k.startsWith(PREFIX));
    for (const k of ours) await this.backend.removeItem(k);
  }

  async resetAll(): Promise<void> { await this.clear(); }

  async keys(): Promise<string[]> {
    const keys = await this.backend.getAllKeys?.() ?? [];
    return keys.filter((k) => k.startsWith(PREFIX)).map((k) => k.slice(PREFIX.length));
  }
}
