// Incident Log — full 30+ column master table, search, filter, CSV export, manual entry.

import { useMemo, useState } from 'react';
import { useCollection, store } from '../lib/store';
import { IconPlus, IconDownload, IconSearch } from '../lib/icons';
import { fmtDMYHM, fmtLongDuration, durationBetween } from '../lib/format';
import type { IncidentRecord } from '@nmc/api-client';

const COLS: { key: keyof IncidentRecord | 'duration' | 'status'; label: string; w?: number }[] = [
  { key: 'session',       label: 'Session',       w: 70 },
  { key: 'name',          label: 'Name' },
  { key: 'incidentName',  label: 'Incident' },
  { key: 'category',      label: 'Category' },
  { key: 'subCategory',   label: 'Sub-category' },
  { key: 'zone',          label: 'Zone' },
  { key: 'ic',            label: 'IC' },
  { key: 'faultTime',     label: 'Fault',         w: 130 },
  { key: 'endTime',       label: 'Restored',      w: 130 },
  { key: 'duration',      label: 'Duration',      w: 110 },
  { key: 'ticketId',      label: 'TT',            w: 90 },
  { key: 'type',          label: 'Type' },
  { key: 'rootCause',     label: 'Root cause' },
  { key: 'rcaProvider',   label: 'RCA provider' },
  { key: 'actionTaken',   label: 'Action' },
  { key: 'issueType',     label: 'Issue type' },
  { key: 'dept',          label: 'Dept' },
  { key: 'team',          label: 'Team' },
  { key: 'informedPerson',label: 'Informed' },
  { key: 'whatsapp',      label: 'WhatsApp' },
  { key: 'mail',          label: 'Mail' },
  { key: 'currentStatus', label: 'Status' },
];

export function IncidentLogPage() {
  const [rows, setRows] = useCollection<IncidentRecord>('incidents');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'open' | 'solved'>('all');
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === 'open'   && r.solved === 'yes') return false;
      if (status === 'solved' && r.solved !== 'yes') return false;
      if (!term) return true;
      const blob = `${r.session} ${r.name} ${r.incidentName} ${r.category} ${r.subCategory} ${r.zone} ${r.ic} ${r.ticketId} ${r.rootCause} ${r.team} ${r.dept}`.toLowerCase();
      return blob.includes(term);
    });
  }, [rows, q, status]);

  function exportCsv() {
    const headers = COLS.map((c) => c.label);
    const lines = filtered.map((r) => COLS.map((c) => {
      if (c.key === 'duration') return fmtLongDuration(durationBetween(r.faultTime, r.endTime));
      if (c.key === 'status')   return r.solved === 'yes' ? 'Solved' : 'Running';
      const v = (r as Record<string, unknown>)[c.key as string];
      return v === null || v === undefined ? '' : String(v).replace(/"/g, '""');
    }).map((v) => `"${v}"`).join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `incidents-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Incident Log</h2>
        <div style={{ position: 'relative' }}>
          <IconSearch size={14} style={{ position: 'absolute', left: 8, top: 11, color: 'var(--muted)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" style={{ paddingLeft: 28, width: 220 }} />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="solved">Solved</option>
        </select>
        <button className="btn" onClick={() => setAddOpen(true)}><IconPlus size={14} /> Add</button>
        <button className="btn ghost" onClick={exportCsv}><IconDownload size={14} /> CSV</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          <table className="data">
            <thead>
              <tr>{COLS.map((c) => <th key={String(c.key)} style={{ minWidth: c.w }}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={COLS.length}><div className="empty">No incidents match.</div></td></tr>}
              {filtered.map((r) => (
                <tr key={r.id} className={`st-row-${statusClass(r)}`}>
                  {COLS.map((c) => {
                    if (c.key === 'duration') return <td key={String(c.key)}>{fmtLongDuration(durationBetween(r.faultTime, r.endTime))}</td>;
                    if (c.key === 'status')   return <td key={String(c.key)}><span className={`status ${r.solved === 'yes' ? 'solved' : 'running'}`}>{r.solved === 'yes' ? 'Solved' : 'Running'}</span></td>;
                    const v = (r as Record<string, unknown>)[c.key as string];
                    return <td key={String(c.key)}>{v === null || v === undefined || v === '' ? '—' : String(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {addOpen && <AddIncident onClose={() => setAddOpen(false)} onSaved={(inc) => { setRows([...rows, inc]); setAddOpen(false); }} />}
    </div>
  );
}

function statusClass(r: IncidentRecord): 'solved' | 'sky' | 'orange' | 'yellow' | 'ash' {
  if (r.solved === 'yes') return 'solved';
  if (!r.faultTime) return 'ash';
  const age = Date.now() - new Date(r.faultTime).getTime();
  if (age < 60 * 60 * 1000) return 'yellow';
  if (age < 4 * 60 * 60 * 1000) return 'sky';
  return 'orange';
}

function AddIncident({ onClose, onSaved }: { onClose: () => void; onSaved: (i: IncidentRecord) => void }) {
  const [f, setF] = useState<Partial<IncidentRecord>>({ session: 'Day', createdAt: new Date().toISOString() });
  function update<K extends keyof IncidentRecord>(k: K, v: IncidentRecord[K]) { setF((p) => ({ ...p, [k]: v })); }
  function save() {
    if (!f.category && !f.subCategory) return;
    const inc = store.add<IncidentRecord>('incidents', {
      id: crypto.randomUUID(),
      session: f.session ?? 'Day',
      name: f.name ?? '',
      incidentName: f.incidentName ?? '',
      category: f.category ?? '',
      subCategory: f.subCategory ?? '',
      zone: f.zone ?? '',
      ic: f.ic ?? '',
      faultTime: f.faultTime,
      endTime: f.endTime,
      ticketId: f.ticketId,
      rootCause: f.rootCause ?? '',
      actionTaken: f.actionTaken ?? '',
      dept: f.dept ?? '',
      team: f.team ?? '',
      currentStatus: f.currentStatus ?? 'Open',
      createdAt: new Date().toISOString(),
    } as IncidentRecord);
    onSaved(inc);
  }
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add incident</h3>
        <div className="row">
          <div className="col-6"><label>Session</label>
            <select value={f.session} onChange={(e) => update('session', e.target.value)}>
              <option>Day</option><option>Evening</option><option>Night</option>
            </select>
          </div>
          <div className="col-6"><label>Name</label>
            <input value={f.name ?? ''} onChange={(e) => update('name', e.target.value)} />
          </div>
          <div className="col-6"><label>Incident</label>
            <input value={f.incidentName ?? ''} onChange={(e) => update('incidentName', e.target.value)} />
          </div>
          <div className="col-6"><label>Category</label>
            <input value={f.category ?? ''} onChange={(e) => update('category', e.target.value)} />
          </div>
          <div className="col-6"><label>Sub-category</label>
            <input value={f.subCategory ?? ''} onChange={(e) => update('subCategory', e.target.value)} />
          </div>
          <div className="col-6"><label>Zone</label>
            <input value={f.zone ?? ''} onChange={(e) => update('zone', e.target.value)} />
          </div>
          <div className="col-6"><label>IC</label>
            <input value={f.ic ?? ''} onChange={(e) => update('ic', e.target.value)} />
          </div>
          <div className="col-6"><label>Root cause</label>
            <input value={f.rootCause ?? ''} onChange={(e) => update('rootCause', e.target.value)} />
          </div>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
