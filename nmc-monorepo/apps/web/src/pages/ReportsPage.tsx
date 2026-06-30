// Reports — auto-built weekly (Sun) and monthly summaries, WhatsApp share,
//          "Run now" button (POSTs to /api/reports/run),
//          CCB / NCR / PID log subsection.

import { useMemo, useState } from 'react';
import { useCollection } from '../lib/store';
import { IconShare } from '../lib/icons';
import { bus } from '../lib/bus';
import { fmtDMYHM, fmtLongDuration, durationBetween } from '../lib/format';
import { useApi } from '../lib/api';
import { useNotif } from '../lib/notif';
import type { IncidentRecord, CcbRecord } from '@nmc/api-client';

export function ReportsPage() {
  const [incidents] = useCollection<IncidentRecord>('incidents');
  const [ccb] = useCollection<CcbRecord>('ccb');
  const [running, setRunning] = useState<'weekly' | 'monthly' | null>(null);
  const [lastRun, setLastRun] = useState<{ kind: 'weekly' | 'monthly'; at: string; text?: string } | null>(null);
  const api = useApi();
  const notif = useNotif();

  const { weekly, monthly } = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const w = incidents.filter((i) => new Date(i.faultTime || i.createdAt || 0) >= weekStart);
    const m = incidents.filter((i) => new Date(i.faultTime || i.createdAt || 0) >= monthStart);
    return { weekly: w, monthly: m };
  }, [incidents]);

  // CCB/NCR log: Expired items, grouped by day.
  const ccbLog = useMemo(() => {
    const groups = new Map<string, CcbRecord[]>();
    for (const c of ccb) {
      const status = (c.status ?? '').toLowerCase();
      const isExpired = status === 'expired' || status === 'closed' || status === 'completed';
      if (!isExpired) continue;
      const key = (c.end || c.updatedAt || c.createdAt || '').slice(0, 10) || 'unknown';
      const arr = groups.get(key) ?? [];
      arr.push(c);
      groups.set(key, arr);
    }
    return Array.from(groups.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 14);
  }, [ccb]);

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

  async function runNow(kind: 'weekly' | 'monthly') {
    setRunning(kind);
    try {
      // Try the server first — it can also email/save the report server-side.
      const r = await fetch('/api/reports/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: kind }),
      });
      let text: string | undefined;
      if (r.ok) {
        const j = await r.json().catch(() => ({} as { text?: string; body?: string }));
        text = j.text ?? j.body;
      }
      setLastRun({ kind, at: new Date().toISOString(), text });
      notif.push(`${kind === 'weekly' ? 'Weekly' : 'Monthly'} report generated${text ? ' (server)' : ' (local)'}`, 'success');
      void api; // keep the hook call live for future endpoints
    } catch (err) {
      notif.push(`Server run failed — sharing locally: ${(err as Error).message}`, 'warn');
      share(kind === 'weekly' ? 'Weekly' : 'Monthly', kind === 'weekly' ? weekly : monthly);
    } finally {
      setRunning(null);
    }
  }

  return (
    <div>
      <h2 style={{ margin: '4px 0 12px' }}>Reports</h2>

      <div className="grid-2">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <h3 style={{ margin: 0, flex: 1 }}>Weekly (Sun → today) — {weekly.length}</h3>
            <button className="btn primary sm" disabled={running !== null} onClick={() => runNow('weekly')}>
              {running === 'weekly' ? 'Running…' : 'Run now'}
            </button>
            <button className="btn sm" onClick={() => share('Weekly', weekly)}>
              <IconShare size={14} /> WhatsApp
            </button>
          </div>
          <pre className="ticket-preview">{build('Weekly', weekly)}</pre>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <h3 style={{ margin: 0, flex: 1 }}>Monthly — {monthly.length}</h3>
            <button className="btn primary sm" disabled={running !== null} onClick={() => runNow('monthly')}>
              {running === 'monthly' ? 'Running…' : 'Run now'}
            </button>
            <button className="btn sm" onClick={() => share('Monthly', monthly)}>
              <IconShare size={14} /> WhatsApp
            </button>
          </div>
          <pre className="ticket-preview">{build('Monthly', monthly)}</pre>
        </div>
      </div>

      {lastRun && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Last manual run</h3>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {lastRun.kind === 'weekly' ? 'Weekly' : 'Monthly'} — {fmtDMYHM(lastRun.at)}
          </div>
          {lastRun.text && <pre className="ticket-preview">{lastRun.text}</pre>}
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        <h3>CCB / NCR / PID Log</h3>
        {ccbLog.length === 0 && <div className="empty">No closed change-control items yet.</div>}
        {ccbLog.map(([day, items]) => (
          <div key={day} style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{day}</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {items.map((c) => (
                <li key={c.id}>
                  <span className="tag b">{c.type || 'CCB'}</span>{' '}
                  <strong>{c.title || c.name || c.id}</strong>
                  {c.zone && <> · <span className="tag">{c.zone}</span></>}
                  {c.contact && <> · {c.contact}</>}
                  {c.start && c.end && (
                    <> · {fmtDMYHM(c.start)} → {fmtDMYHM(c.end)}</>
                  )}
                  <span style={{ color: 'var(--muted)', marginLeft: 6 }}>({c.status})</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
