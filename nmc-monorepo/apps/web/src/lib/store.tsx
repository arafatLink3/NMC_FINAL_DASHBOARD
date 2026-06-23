// Thin React wrapper over the localStorage store.
// Uses the same `nmc.` prefix the legacy SPA did, so any data that lived in
// the old SPA is transparently visible to the new app.

import { useCallback, useEffect, useState } from 'react';
import { bus } from './bus';

const NS = 'nmc.';

function key(collection: string) { return NS + collection; }

function read<T>(collection: string): T[] {
  try {
    const raw = localStorage.getItem(key(collection));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as T[]) : [];
  } catch { return []; }
}

function write<T>(collection: string, rows: T[]) {
  localStorage.setItem(key(collection), JSON.stringify(rows));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export type StoreLike = {
  get: <T = unknown>(collection: string) => T[];
  set: <T = unknown>(collection: string, rows: T[]) => void;
  list: () => string[];
  add: <T extends Record<string, unknown>>(collection: string, item: T) => T & { id: string };
  update: <T extends Record<string, unknown>>(collection: string, id: string, patch: Partial<T>) => (T & { id: string }) | null;
  removeItem: (collection: string, id: string) => void;
  clear: (collection: string) => void;
};

export const store: StoreLike = {
  get: <T = unknown>(c: string) => read<T>(c),
  set: <T = unknown>(c: string, rows: T[]) => { write<T>(c, rows); bus.emit('notify', { id: uid(), text: `Saved ${c}`, type: 'success', createdAt: new Date().toISOString() }); },
  list: () => {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NS)) out.push(k.slice(NS.length));
    }
    return out;
  },
  add: <T extends Record<string, unknown>>(c: string, item: T) => {
    const rows = read<T>(c);
    const next = { ...item, id: (item as { id?: string }).id ?? uid() } as T & { id: string };
    rows.push(next);
    write(c, rows);
    bus.emit('notify', { id: uid(), text: `Added to ${c}`, type: 'success', createdAt: new Date().toISOString() });
    return next;
  },
  update: <T extends Record<string, unknown>>(c: string, id: string, patch: Partial<T>): (T & { id: string }) | null => {
    const rows = read<T & { id: string }>(c);
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const cur = rows[idx];
    if (!cur) return null;
    const merged = { ...cur, ...patch } as T & { id: string };
    rows[idx] = merged;
    write(c, rows);
    bus.emit('notify', { id: uid(), text: `Updated ${c}`, type: 'success', createdAt: new Date().toISOString() });
    return merged;
  },
  removeItem: (c: string, id: string) => {
    const rows = read<{ id: string }>(c).filter((r) => r.id !== id);
    write(c, rows);
  },
  clear: (c: string) => localStorage.removeItem(key(c)),
};

// hook that re-renders when any tracked collection changes.
export function useCollection<T = unknown>(collection: string): [T[], (rows: T[]) => void] {
  const [rows, setRows] = useState<T[]>(() => read<T>(collection));

  useEffect(() => {
    setRows(read<T>(collection));
  }, [collection]);

  const update = useCallback((next: T[]) => {
    write(collection, next);
    setRows(next);
  }, [collection]);

  return [rows, update];
}
