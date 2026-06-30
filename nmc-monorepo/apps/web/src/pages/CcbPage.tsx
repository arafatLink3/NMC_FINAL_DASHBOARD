// CCB / NCR / PID — change-control items with auto-flag (Ongoing / Upcoming / Completed).
// Implements design.html section 8: when an item's end time has passed,
// show a "Still ongoing?" banner with Yes (reopen, extend +2h) / No (close)
// buttons. Expired items move to history (Completed) and are surfaced in
// the Reports page CCB/NCR Log.

import { useMemo, useState } from 'react';
import { useCollection } from '../lib/store';
import { useApi } from '../lib/api';
import { useNotif } from '../lib/notif';
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
  const [rows, setRows] = useCollection<CcbRecord>('ccb');
  const api = useApi();
  const { push } = useNotif();
  const now = new Date();

  const buckets = useMemo(() => {
    const o: Record<'Ongoing' | 'Upcoming' | 'Completed', CcbRecord[]> = {
      Ongoing: [], Upcoming: [], Completed: [],
    };
    for (const r of rows) o[statusOf(r, now)].push(r);
    return o;
  }, [rows, now]);

  async function reopen(r: CcbRecord) {
    // Extend end by 2h and flip status back to Active so it surfaces in Ongoing again.
    const endIso = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const next = { ...r, end: endIso, status: 'Active' };
    setRows(rows.map((x) => (x.id === r.id ? next : x)));
    try {
      await api.updateCcb(r.id, { end: endIso, status: 'Active' });
      push(`Reopened ${String(r.title ?? r.name ?? r.id)} (+2h)`, 'success');
    } catch (e) {
      push(`Server update failed: ${(e as Error).message}`, 'danger');
    }
  }

  async function closeEvent(r: CcbRecord) {
    const next = { ...r, status: 'Expired' };
    setRows(rows.map((x) => (x.id === r.id ? next : x)));
    try {
      await api.updateCcb(r.id, { status: 'Expired' });
      push(`Closed ${String(r.title ?? r.name ?? r.id)} → history`, 'info');
    } catch (e) {
      push(`Server update failed: ${(e as Error).message}`, 'danger');
    }
  }

  return (
    <div>
      <h2 style={{ margin: '4px 0 12px' }}>CCB / NCR / PID</h2>

      {/* Section 8.3 — "Still ongoing?" banner for items past their end */}
      {buckets.Ongoing.length === 0 && buckets.Completed.length > 0 && (
        <ExpiredReview items={buckets.Completed} onYes={reopen} onNo={closeEvent} />
      )}
      {/* Also surface a banner for items that JUST expired but were still Ongoing
          when the user navigated here. We compare r.end vs now at row level. */}
      {buckets.Ongoing.length > 0 && rows.some((r) => {
        const endStr = typeof r.end === 'string' ? r.end : '';
        if (!endStr) return false;
        const end = new Date(endStr);
        // within the last 30 minutes, still considered Ongoing but worth confirming
        return end.getTime() < now.getTime() && (now.getTime() - end.getTime()) < 30 * 60 * 1000;
      }) && (
        <SoftReview rows={rows} onYes={reopen} onNo={closeEvent} now={now} />
      )}

      {(['Ongoing', 'Upcoming', 'Completed'] as const).map((s) => {
        const items = buckets[s];
        return (
          <div key={s} className="card">
            <h3>{s} ({items.length})</h3>
            {items.length === 0 && <div className="empty">No {s.toLowerCase()} items.</div>}
            {items.map((r) => (
              <div key={r.id} className="reminder" style={{ borderLeftColor: s === 'Ongoing' ? 'var(--warn)' : s === 'Upcoming' ? 'var(--info)' : 'var(--success)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="tag">{String(r.type ?? 'CCB')}</span>
                  <span style={{ flex: 1 }}>{String(r.title ?? r.name ?? r.id)}</span>
                  <span className="muted">{String(r.start ?? '—')} → {String(r.end ?? '—')}</span>
                </div>
                {r.notes && <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>{String(r.notes)}</div>}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ExpiredReview({ items, onYes, onNo }: { items: CcbRecord[]; onYes: (r: CcbRecord) => void; onNo: (r: CcbRecord) => void }) {
  return (
    <div className="card" style={{ borderLeft: '4px solid var(--danger)' }}>
      <h3 style={{ color: 'var(--danger)' }}>Expired — still ongoing?</h3>
      <div className="muted" style={{ marginBottom: 8 }}>These items ended but were not confirmed. Confirm to keep them on the active board.</div>
      {items.slice(0, 8).map((r) => (
        <div key={r.id} className="reminder" style={{ borderLeftColor: 'var(--danger)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="tag">{String(r.type ?? 'CCB')}</span>
            <span style={{ flex: 1 }}>{String(r.title ?? r.name ?? r.id)}</span>
            <span className="muted">ended {String(r.end ?? '—')}</span>
            <button className="btn success sm" onClick={() => onYes(r)}>Yes — reopen +2h</button>
            <button className="btn ghost sm" onClick={() => onNo(r)}>No — close</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SoftReview({ rows, onYes, onNo, now }: { rows: CcbRecord[]; onYes: (r: CcbRecord) => void; onNo: (r: CcbRecord) => void; now: Date }) {
  const fresh = rows.filter((r) => {
    const endStr = typeof r.end === 'string' ? r.end : '';
    if (!endStr) return false;
    const end = new Date(endStr);
    return end.getTime() < now.getTime() && (now.getTime() - end.getTime()) < 30 * 60 * 1000;
  });
  if (fresh.length === 0) return null;
  return (
    <div className="card" style={{ borderLeft: '4px solid var(--warn)' }}>
      <h3>Just ended — confirm status</h3>
      {fresh.map((r) => (
        <div key={r.id} className="reminder" style={{ borderLeftColor: 'var(--warn)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ flex: 1 }}>{String(r.title ?? r.name ?? r.id)}</span>
            <span className="muted">ended {String(r.end ?? '—')}</span>
            <button className="btn success sm" onClick={() => onYes(r)}>Yes — still ongoing</button>
            <button className="btn ghost sm" onClick={() => onNo(r)}>No — close</button>
          </div>
        </div>
      ))}
    </div>
  );
}
