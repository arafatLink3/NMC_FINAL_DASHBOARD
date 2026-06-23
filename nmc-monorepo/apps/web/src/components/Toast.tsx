// Toast stack — listens to bus `notify` events and renders the last few as
// a small stack at the bottom-center of the screen.

import { useEffect, useState } from 'react';
import { bus, type BusEvents } from '../lib/bus';

type Toast = BusEvents['notify'] & { expires: number };

export function ToastStack() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    return bus.on('notify', (p) => {
      const t: Toast = { ...p, expires: Date.now() + 3500 };
      setToasts((prev) => [...prev, t].slice(-5));
      const ms = Math.max(500, t.expires - Date.now());
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, ms);
    });
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type ?? 'info'}`}>{t.text}</div>
      ))}
    </div>
  );
}
