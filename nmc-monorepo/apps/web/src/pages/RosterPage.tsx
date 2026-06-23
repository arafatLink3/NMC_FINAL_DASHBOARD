// Roster — 3 shifts × departments + "who is on duty now" widget.

import { useEffect, useMemo, useState } from 'react';
import { engineerAt } from '@nmc/ai';
import { useCollection } from '../lib/store';
import type { RosterRecord } from '@nmc/api-client';

export function RosterPage() {
  const [rows] = useCollection<RosterRecord>('roster');
  const [dept, setDept] = useState<string>('all');
  const [now, setNow] = useState(new Date());

  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);

  const depts = useMemo(() => Array.from(new Set(rows.map((r) => r.dept ?? 'General'))), [rows]);
  const filtered = rows.filter((r) => dept === 'all' || (r.dept ?? 'General') === dept);

  const onDuty = useMemo(() => {
    const out: { dept: string; shift: string; engineers: string[]; collision: boolean }[] = [];
    for (const r of rows) {
      const engineers = Array.isArray((r as unknown as { engineers?: { name?: string }[] }).engineers)
        ? ((r as unknown as { engineers: { name?: string }[] }).engineers).map((x) => x.name ?? '')
        : [];
      const entry = { date: r.date ?? '', dept: r.dept ?? 'General', shift: r.shift ?? 'Morning', engineers } as unknown as Parameters<typeof engineerAt>[1][number];
      const e = engineerAt(now, [entry]);
      if (e) out.push({ dept: r.dept ?? 'General', shift: e.shift, engineers: e.engineers.map((x) => x.name), collision: e.collision });
    }
    return out;
  }, [rows, now]);

  return (
    <div>
      <h2 style={{ margin: '4px 0 12px' }}>Duty Roster</h2>

      <div className="card">
        <h3>On duty now</h3>
        {onDuty.length === 0 && <div className="empty">No active shifts.</div>}
        {onDuty.map((o, i) => (
          <div key={i} className="reminder" style={{ borderLeftColor: o.collision ? 'var(--danger)' : 'var(--primary)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="tag b">{o.dept}</span>
              <span className="tag p">{o.shift}</span>
              <span style={{ flex: 1 }}>{o.engineers.join(', ')}</span>
              {o.collision && <span className="tag r">collision 14–16</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0, flex: 1 }}>All entries</h3>
          <select value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="all">All departments</option>
            {depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Dept</th><th>Shift</th><th>Engineers</th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={4}><div className="empty">No roster entries.</div></td></tr>}
              {filtered.map((r, i) => (
                <tr key={r.id ?? i}>
                  <td>{r.date}</td>
                  <td>{r.dept ?? 'General'}</td>
                  <td>{r.shift}</td>
                  <td>{(r.engineers ?? []).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
