// Contacts — global DB with AI search, reinforcement, CSV import/export.

import { useMemo, useState } from 'react';
import { useCollection, store } from '../lib/store';
import { suggestContact, learnContact } from '@nmc/ai';
import { IconSearch, IconPlus, IconDownload, IconCheck } from '../lib/icons';
import { bus } from '../lib/bus';
import type { ContactRecord } from '@nmc/api-client';

export function ContactsPage() {
  const [rows, setRows] = useCollection<ContactRecord>('contacts');
  const [q, setQ] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const [learnMap, setLearnMap] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('nmc.contactLearn') || '{}'); } catch { return {}; }
  });

  const results = useMemo(() => {
    if (!q.trim()) return rows;
    return suggestContact(q, rows, Math.max(10, rows.length), learnMap);
  }, [q, rows, learnMap]);

  function reinforce(id: string) {
    const next = learnContact(learnMap, q, id);
    setLearnMap(next);
    try { localStorage.setItem('nmc.contactLearn', JSON.stringify(next)); } catch { /* ignore */ }
    bus.emit('notify', { id: crypto.randomUUID(), text: 'Learned 👍', type: 'success', createdAt: new Date().toISOString() });
  }

  function importCsv(text: string) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return;
    const header = (lines[0] ?? '').split(',').map((h) => h.trim());
    const imported: ContactRecord[] = lines.slice(1).map((line) => {
      const cells = parseCsvLine(line);
      const obj: Record<string, string> = {};
      header.forEach((h, i) => { obj[h] = (cells[i] ?? '').trim(); });
      return {
        id: crypto.randomUUID(),
        name: obj.name || obj.Name || '',
        phone: obj.phone || obj.Phone || '',
        email: obj.email || obj.Email || '',
        zone: obj.zone || obj.Zone || '',
        dept: obj.dept || obj.Dept || '',
        role: obj.role || obj.Role || '',
      } as ContactRecord;
    }).filter((c) => c.name);
    setRows([...rows, ...imported]);
    bus.emit('notify', { id: crypto.randomUUID(), text: `Imported ${imported.length} contacts`, type: 'success', createdAt: new Date().toISOString() });
  }

  function exportCsv() {
    const headers = ['name', 'phone', 'email', 'zone', 'dept', 'role'];
    const lines = [headers.join(',')];
    for (const c of rows) {
      lines.push(headers.map((h) => `"${(c as unknown as Record<string, unknown>)[h] ?? ''}"`).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Contacts</h2>
        <div style={{ position: 'relative' }}>
          <IconSearch size={14} style={{ position: 'absolute', left: 8, top: 11, color: 'var(--muted)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, zone, dept…" style={{ paddingLeft: 28, width: 240 }} />
        </div>
        <button className="btn" onClick={() => setAddOpen(true)}><IconPlus size={14} /> Add</button>
        <label className="btn ghost" style={{ cursor: 'pointer' }}>
          Import CSV
          <input type="file" accept=".csv" style={{ display: 'none' }} onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            importCsv(await f.text());
            e.target.value = '';
          }} />
        </label>
        <button className="btn ghost" onClick={exportCsv}><IconDownload size={14} /> Export</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Zone</th><th>Dept</th><th>Role</th><th></th></tr></thead>
            <tbody>
              {results.length === 0 && <tr><td colSpan={7}><div className="empty">No contacts.</div></td></tr>}
              {results.map((c) => (
                <tr key={c.id}>
                  <td>{String((c as unknown as Record<string, unknown>).name ?? '')}</td>
                  <td>{String((c as unknown as Record<string, unknown>).phone ?? '') || '—'}</td>
                  <td>{String((c as unknown as Record<string, unknown>).email ?? '') || '—'}</td>
                  <td>{String((c as unknown as Record<string, unknown>).zone ?? '') || '—'}</td>
                  <td>{String((c as unknown as Record<string, unknown>).dept ?? '') || '—'}</td>
                  <td>{String((c as unknown as Record<string, unknown>).role ?? '') || '—'}</td>
                  <td>
                    {q.trim() && <button className="btn ghost sm" onClick={() => reinforce(c.id)}>👍</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {addOpen && <AddContact onClose={() => setAddOpen(false)} onSave={(c) => { setRows([...rows, c]); setAddOpen(false); }} />}
    </div>
  );
}

function AddContact({ onClose, onSave }: { onClose: () => void; onSave: (c: ContactRecord) => void }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', zone: '', dept: '', role: '' });
  function save() {
    if (!f.name.trim()) return;
    const c = store.add<ContactRecord>('contacts', { id: crypto.randomUUID(), ...f } as ContactRecord);
    onSave(c);
  }
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add contact</h3>
        <div className="row">
          <div className="col-6"><label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="col-6"><label>Phone</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div className="col-6"><label>Email</label><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="col-6"><label>Zone</label><input value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value })} /></div>
          <div className="col-6"><label>Dept</label><input value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })} /></div>
          <div className="col-6"><label>Role</label><input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} /></div>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save}><IconCheck size={14} /> Save</button>
        </div>
      </div>
    </div>
  );
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cur += ch; }
    } else {
      if (ch === ',') { out.push(cur); cur = ''; }
      else if (ch === '"') { inQ = true; }
      else { cur += ch; }
    }
  }
  out.push(cur);
  return out;
}
