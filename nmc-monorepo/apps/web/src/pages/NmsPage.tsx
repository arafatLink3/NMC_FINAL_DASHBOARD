// NMS Links — quick launcher cards for the network monitoring tools.

import { useCollection } from '../lib/store';
import { IconLink, IconSettings } from '../lib/icons';
import { useState } from 'react';
import type { NmsLink } from '@nmc/api-client';

export function NmsPage() {
  const [rows, setRows] = useCollection<NmsLink>('nmsLinks');
  const [editing, setEditing] = useState(false);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h2 style={{ margin: 0, flex: 1 }}>NMS Links</h2>
        <button className="btn ghost" onClick={() => setEditing((v) => !v)}><IconSettings size={14} /> {editing ? 'Done' : 'Edit'}</button>
      </div>
      <div className="nms-grid">
        {rows.length === 0 && <div className="empty">No NMS links yet — add some from the Edit button.</div>}
        {rows.map((r) => (
          <div key={r.id} className="nms-card">
            <div className="nms-cat">{r.category}</div>
            <h3>{r.label}</h3>
            <p className="muted" style={{ fontSize: 12 }}>{r.url}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <a className="btn sm" href={r.url} target="_blank" rel="noopener noreferrer"><IconLink size={14} /> Open</a>
              {editing && <button className="btn ghost sm" onClick={() => setRows(rows.filter((x) => x.id !== r.id))}>Delete</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
