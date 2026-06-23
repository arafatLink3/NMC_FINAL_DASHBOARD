// Tiny typed event bus that mirrors the legacy `nmc.bus` global.
// All bus events used by the SPA live here so callers get type-safety.

export type BusEvents = {
  notify: { id: string; text: string; type?: 'info' | 'success' | 'warn' | 'danger'; createdAt: string; read?: boolean };
  'nmc:themechange': { theme: 'dark' | 'light' };
  'nmc:auth:changed': { session: import('@nmc/api-client').AuthSession | null };
};

type Listener<E extends keyof BusEvents> = (payload: BusEvents[E]) => void;

class Bus {
  private listeners = new Map<keyof BusEvents, Set<Listener<keyof BusEvents>>>();

  on<E extends keyof BusEvents>(event: E, fn: Listener<E>): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(fn as Listener<keyof BusEvents>);
    this.listeners.set(event, set);
    return () => set.delete(fn as Listener<keyof BusEvents>);
  }

  emit<E extends keyof BusEvents>(event: E, payload: BusEvents[E]) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try { (fn as Listener<E>)(payload); } catch (err) { console.error('[bus]', event, err); }
    }
  }
}

export const bus = new Bus();

// window listeners — keeps the bridge with any non-React code that still
// dispatches via `window.dispatchEvent(new CustomEvent('nmc:foo', { detail }))`.
if (typeof window !== 'undefined') {
  window.addEventListener('nmc:themechange', (e: Event) => {
    const detail = (e as CustomEvent<{ theme: 'dark' | 'light' }>).detail;
    bus.emit('nmc:themechange', detail);
  });
  window.addEventListener('nmc:notify', (e: Event) => {
    const detail = (e as CustomEvent<BusEvents['notify']>).detail;
    bus.emit('notify', detail);
  });
}
