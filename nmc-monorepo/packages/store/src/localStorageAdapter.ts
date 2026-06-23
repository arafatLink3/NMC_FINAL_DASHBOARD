/**
 * localStorage adapter (web). Mirrors the legacy `NMC Dashboard/js/store.js`
 * API exactly. Stored as JSON strings; table keys hold a JSON array of
 * records; scalar keys hold a single value.
 */

import { deNs, ns, PREFIX } from './prefix.js';
import type { AnyRecord, StoreAdapter } from './types.js';

function readRaw(key: string): string | null {
  try { return globalThis.localStorage?.getItem(ns(key)) ?? null; }
  catch { return null; }
}
function writeRaw(key: string, value: string): void {
  try { globalThis.localStorage?.setItem(ns(key), value); } catch { /* ignore quota */ }
}
function removeRaw(key: string): void {
  try { globalThis.localStorage?.removeItem(ns(key)); } catch { /* ignore */ }
}

function uuid(): string {
  const c: { crypto?: { randomUUID?: () => string } } = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  if (c.crypto?.randomUUID) return c.crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function nowIso(): string { return new Date().toISOString(); }

export const localStorageAdapter: StoreAdapter = {
  async get<T>(key: string): Promise<T | null> {
    const raw = readRaw(key);
    if (raw == null) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  },

  async set<T>(key: string, value: T): Promise<void> {
    writeRaw(key, JSON.stringify(value));
  },

  async remove(key: string): Promise<void> { removeRaw(key); },

  async list<T>(key: string): Promise<T[]> {
    const raw = readRaw(key);
    if (raw == null) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch { return []; }
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
    if (key) { removeRaw(key); return; }
    try {
      const ls = globalThis.localStorage;
      if (!ls) return;
      const remove: string[] = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.startsWith(PREFIX)) remove.push(k);
      }
      remove.forEach((k) => ls.removeItem(k));
    } catch { /* ignore */ }
  },

  async resetAll(): Promise<void> { await this.clear(); },

  async keys(): Promise<string[]> {
    try {
      const ls = globalThis.localStorage;
      if (!ls) return [];
      const out: string[] = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.startsWith(PREFIX)) out.push(deNs(k));
      }
      return out;
    } catch { return []; }
  },
};
