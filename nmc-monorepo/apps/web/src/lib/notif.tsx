// Notification context — exposes the in-app notification list and toast helper.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { bus } from './bus';

export type NotifItem = {
  id: string;
  text: string;
  type?: 'info' | 'success' | 'warn' | 'danger';
  createdAt: string;
  read: boolean;
};

type Ctx = {
  notifs: NotifItem[];
  unread: number;
  push: (text: string, type?: NotifItem['type']) => void;
  markAllRead: () => void;
  clear: () => void;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
};

const STORAGE_KEY = 'nmc.notifications';
const CAP = 200;
const NotifContext = createContext<Ctx | null>(null);

function readAll(): NotifItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as NotifItem[]) : [];
  } catch { return []; }
}

function persist(arr: NotifItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.slice(-CAP)));
}

export function NotifProvider({ children }: { children: ReactNode }) {
  const [notifs, setNotifs] = useState<NotifItem[]>(() => readAll());
  const [drawerOpen, setDrawerOpen] = useState(false);

  const push = useCallback((text: string, type: NotifItem['type'] = 'info') => {
    setNotifs((prev) => {
      const item: NotifItem = {
        id: crypto.randomUUID(),
        text,
        type,
        createdAt: new Date().toISOString(),
        read: false,
      };
      const next = [...prev, item].slice(-CAP);
      persist(next);
      return next;
    });
  }, []);

  useEffect(() => {
    return bus.on('notify', (p) => {
      // Already added in push() — this listener is for code paths that
      // dispatch directly through the bus (e.g. legacy call sites).
      setNotifs((prev) => {
        if (prev.some((n) => n.id === p.id)) return prev;
        const next = [...prev, { ...p, read: p.read ?? false } as NotifItem].slice(-CAP);
        persist(next);
        return next;
      });
    });
  }, []);

  const markAllRead = useCallback(() => {
    setNotifs((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      persist(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setNotifs([]);
    persist([]);
  }, []);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const unread = useMemo(() => notifs.filter((n) => !n.read).length, [notifs]);

  const value = useMemo<Ctx>(() => ({
    notifs, unread, push, markAllRead, clear, drawerOpen, openDrawer, closeDrawer,
  }), [notifs, unread, push, markAllRead, clear, drawerOpen, openDrawer, closeDrawer]);

  return <NotifContext.Provider value={value}>{children}</NotifContext.Provider>;
}

export function useNotif(): Ctx {
  const ctx = useContext(NotifContext);
  if (!ctx) throw new Error('useNotif must be used within NotifProvider');
  return ctx;
}
