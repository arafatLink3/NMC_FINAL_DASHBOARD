// Reports — auto-built weekly (Sun) and monthly summaries, WhatsApp share.

import { useMemo } from 'react';
import { useCollection } from '../lib/store';
import { IconShare } from '../lib/icons';
import { bus } from '../lib/bus';
import { fmtLongDuration, durationBetween } from '../lib/format';
import type { IncidentRecord } from '@nmc/api-client';

export function ReportsPage() {
  const [incidents] = useCollection<IncidentRecord>('incidents');
  const { weekly, monthly } = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const w = incidents.filter((i) => new Date(i.faultTime || i.createdAt || 0) >= weekStart);
    const m = incidents.filter((i) => new Date(i.faultTime || i.createdAt || 0) >= monthStart);
    return { weekly: w, monthly: m };
  }, [incidents]);

  function build(kind: 'Weekly' | 'Monthly', rows: IncidentRecord[]): string {
    const total = rows.length;
    const solved = rows.filter((r) => r.solved === 'yes').length;
    const longOut = rows.filter((r) => {
      if (!r.faultTime) return false;
      const end = r.endTime ? new Date(r.endTime) : new Date();
      return (end.getTime() - new Date(r.faultTime).getTime()) > 4 * 60 * 60 * 1000;
    }).length;
    const lines: string[] = [];
    lines.push(`📊 NMC ${kind} Report — ${new Date().toLocaleDateString()}`);
    lines.push('');
    lines.push(`Total: ${total}`);
    lines.push(`Solved: ${solved}`);
    lines.push(`Outage > 4h: ${longOut}`);
    lines.push('');
    lines.push('Major incidents:');
    for (const r of rows.slice(0, 10)) {
      const dur = fmtLongDuration(durationBetween(r.faultTime, r.endTime));
      lines.push(`• ${r.incidentName || r.subCategory || r.category} — ${dur}`);
    }
    return lines.join('\n');
  }

  function share(kind: 'Weekly' | 'Monthly', rows: IncidentRecord[]) {
    const text = build(kind, rows);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    bus.emit('notify', { id: crypto.randomUUID(), text: `${kind} report shared`, type: 'success', createdAt: new Date().toISOString() });
  }

  return (
    <div>
      <h2 style={{ margin: '4px 0 12px' }}>Reports</h2>
      <div className="grid-2">
        <div className="card">
          <h3>Weekly (Sun → today) — {weekly.length}</h3>
          <pre className="ticket-preview">{build('Weekly', weekly)}</pre>
          <button className="btn" onClick={() => share('Weekly', weekly)}><IconShare size={14} /> Send to WhatsApp</button>
        </div>
        <div className="card">
          <h3>Monthly — {monthly.length}</h3>
          <pre className="ticket-preview">{build('Monthly', monthly)}</pre>
          <button className="btn" onClick={() => share('Monthly', monthly)}><IconShare size={14} /> Send to WhatsApp</button>
        </div>
      </div>
    </div>
  );
}
