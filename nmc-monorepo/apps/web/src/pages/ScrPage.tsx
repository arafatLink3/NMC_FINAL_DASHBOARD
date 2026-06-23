// NTTN SCR — long-haul capacity share table.

import { useCollection } from '../lib/store';
import { IconDownload, IconPlus } from '../lib/icons';
import type { ScrRecord } from '@nmc/api-client';

export function ScrPage() {
  const [rows] = useCollection<ScrRecord>('scr');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h2 style={{ margin: 0, flex: 1 }}>NTTN SCR</h2>
        <button className="btn"><IconPlus size={14} /> Add row</button>
        <button className="btn ghost"><IconDownload size={14} /> Export</button>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Vendor</th><th>Link</th><th>Capacity (Mbps)</th><th>Used (Mbps)</th><th>Free (Mbps)</th><th>Util %</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6}><div className="empty">No SCR data yet.</div></td></tr>}
              {rows.map((r) => {
                const cap = Number(r.capacity) || 0;
                const used = Number(r.used) || 0;
                const free = cap - used;
                const util = cap ? Math.round((used / cap) * 100) : 0;
                return (
                  <tr key={r.id}>
                    <td>{r.vendor}</td>
                    <td>{r.link}</td>
                    <td>{cap}</td>
                    <td>{used}</td>
                    <td>{free}</td>
                    <td>{util}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
