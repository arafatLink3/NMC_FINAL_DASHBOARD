// BRAS database — zone/district/BTS list with ping button.

import { useState } from 'react';
import { useCollection } from '../lib/store';
import { IconSearch } from '../lib/icons';
import { bus } from '../lib/bus';
import type { BrasRecord } from '@nmc/api-client';

export function BrasPage() {
  const [rows] = useCollection<BrasRecord>('bras_records');
  const [q, setQ] = useState('');

  const filtered = rows.filter((r) => {
    const term = q.trim().toLowerCase();
    if (!term) return true;
    return `${r.zone} ${r.district} ${r.bts} ${r.serviceAgent} ${r.brasName} ${r.loopback} ${r.contact}`.toLowerCase().includes(term);
  });

  function ping(row: BrasRecord) {
    if (!row.loopback) return;
    bus.emit('notify', { id: crypto.randomUUID(), text: `Ping ${row.loopback} requested — check NMS for results`, type: 'info', createdAt: new Date().toISOString() });
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, flex: 1 }}>BRAS Database</h2>
        <div style={{ position: 'relative' }}>
          <IconSearch size={14} style={{ position: 'absolute', left: 8, top: 11, color: 'var(--muted)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search zone, BTS, BRAS…" style={{ paddingLeft: 28, width: 260 }} />
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Zone</th><th>District</th><th>BTS</th><th>Service agent</th><th>BRAS</th><th>Loopback</th><th>Contact</th><th></th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={8}><div className="empty">No BRAS records.</div></td></tr>}
              {filtered.map((r) => (
                <tr key={r.id ?? `${r.bts}-${r.loopback}`}>
                  <td>{String(r.zone ?? '')}</td>
                  <td>{String(r.district ?? '')}</td>
                  <td>{String(r.bts ?? '')}</td>
                  <td>{String(r.serviceAgent ?? '')}</td>
                  <td>{String(r.brasName ?? '')}</td>
                  <td><code>{String(r.loopback ?? '')}</code></td>
                  <td>{String(r.contact ?? '')}</td>
                  <td><button className="btn ghost sm" onClick={() => ping(r)}>Ping</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
