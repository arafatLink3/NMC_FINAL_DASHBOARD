// CCB / NCR / PID — change-control items with auto-flag (Ongoing / Upcoming / Completed).

import { useMemo } from 'react';
import { useCollection } from '../lib/store';
import type { CcbRecord } from '@nmc/api-client';

function statusOf(r: CcbRecord, now: Date): 'Ongoing' | 'Upcoming' | 'Completed' {
  const startStr = typeof r.start === 'string' ? r.start : '';
  const endStr   = typeof r.end === 'string' ? r.end : '';
  const start = startStr ? new Date(startStr) : null;
  const end   = endStr   ? new Date(endStr)   : null;
  if (start && start.getTime() > now.getTime()) return 'Upcoming';
  if (end && end.getTime() < now.getTime()) return 'Completed';
  return 'Ongoing';
}

export function CcbPage() {
  const [rows] = useCollection<CcbRecord>('ccb');
  const now = new Date();

  const buckets = useMemo(() => {
    const o: Record<'Ongoing' | 'Upcoming' | 'Completed', CcbRecord[]> = {
      Ongoing: [], Upcoming: [], Completed: [],
    };
    for (const r of rows) o[statusOf(r, now)].push(r);
    return o;
  }, [rows, now]);

  return (
    <div>
      <h2 style={{ margin: '4px 0 12px' }}>CCB / NCR / PID</h2>
      {(['Ongoing', 'Upcoming', 'Completed'] as const).map((s) => {
        const items = buckets[s];
        return (
          <div key={s} className="card">
            <h3>{s} ({items.length})</h3>
            {items.length === 0 && <div className="empty">No {s.toLowerCase()} items.</div>}
            {items.map((r) => (
              <div key={r.id} className="reminder" style={{ borderLeftColor: s === 'Ongoing' ? 'var(--warn)' : s === 'Upcoming' ? 'var(--info)' : 'var(--success)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ flex: 1 }}>{String(r.title ?? r.name ?? r.id)}</span>
                  <span className="muted">{String(r.start ?? '—')} → {String(r.end ?? '—')}</span>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
