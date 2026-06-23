// Tickets page — create + close forms, AI classification, WhatsApp share, CSV export.

import { useEffect, useMemo, useState } from 'react';
import { parseTicket, classify, diffDuration, DROPDOWN_DEFAULTS } from '@nmc/ai';
import { useCollection, store } from '../lib/store';
import { bus } from '../lib/bus';
import { fmtDMYHM, fmtLongDuration, toISOFromDateTime } from '../lib/format';
import { IconCopy, IconShare, IconCheck, IconX, IconPlus } from '../lib/icons';
import type { TicketRecord, IncidentRecord } from '@nmc/api-client';

type Mode = 'create' | 'close';

export function TicketsPage() {
  const [tickets, setTickets] = useCollection<TicketRecord>('tickets');
  const [incidents, setIncidents] = useCollection<IncidentRecord>('incidents');
  const [tab, setTab] = useState<Mode>('create');

  return (
    <div>
      <h2 style={{ margin: '4px 0 12px' }}>Tickets</h2>
      <div className="tabs">
        <div className={`tab ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>Create Ticket</div>
        <div className={`tab ${tab === 'close'  ? 'active' : ''}`} onClick={() => setTab('close')}>Close Ticket</div>
      </div>

      {tab === 'create' && <CreateTicket incidents={incidents} onSaved={() => setIncidents([...incidents])} />}
      {tab === 'close'  && <CloseTicket  tickets={tickets} incidents={incidents} onUpdated={() => { setTickets([...tickets]); setIncidents([...incidents]); }} />}

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Recent tickets</h3>
        <TicketsTable tickets={tickets} />
      </div>
    </div>
  );
}

function TicketsTable({ tickets }: { tickets: TicketRecord[] }) {
  if (tickets.length === 0) return <div className="empty">No tickets yet.</div>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead><tr><th>TT</th><th>Category</th><th>Sub-category</th><th>Status</th><th>Created</th></tr></thead>
        <tbody>
          {tickets.slice().reverse().slice(0, 20).map((t) => (
            <tr key={t.id}>
              <td>{t.tt || t.id.slice(0, 6)}</td>
              <td>{t.category || '—'}</td>
              <td>{t.subCategory || '—'}</td>
              <td><span className={`status ${t.status === 'closed' ? 'solved' : 'running'}`}>{t.status ?? 'open'}</span></td>
              <td>{fmtDMYHM(t.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Create Ticket ---------------- */

function CreateTicket({ incidents, onSaved }: { incidents: IncidentRecord[]; onSaved: () => void }) {
  const [raw, setRaw] = useState('');
  const [parsed, setParsed] = useState<ReturnType<typeof parseTicket> | null>(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    hh: String(new Date().getHours()).padStart(2, '0'),
    mm: String(Math.floor(new Date().getMinutes() / 15) * 15).padStart(2, '0'),
    category: '',
    subCategory: '',
    incidentName: '',
    zone: '',
    ic: '',
    etr: '',
    rootCause: '',
  });
  const [classifyOut, setClassifyOut] = useState<{ department: string; issue: string; tags: string[] } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const times = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
    return { hours, minutes };
  }, []);

  useEffect(() => {
    if (!raw.trim()) { setParsed(null); setClassifyOut(null); return; }
    const p = parseTicket(raw);
    setParsed(p);
    setForm((f) => ({
      ...f,
      category: p.category || f.category,
      subCategory: p.subCategory || f.subCategory,
      incidentName: p.bts || p.incidentName || f.incidentName,
      ic: String(p.ic ?? '') || f.ic,
      etr: p.etr || f.etr,
      rootCause: p.rootCause || f.rootCause,
    }));
    if (p.category) {
      const result = classify(p.category, raw);
      setClassifyOut({ department: result.department ?? '', issue: result.issue ?? '', tags: result.tags ?? [] });
    }
  }, [raw]);

  function update<K extends keyof typeof form>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  function buildPayload() {
    const faultTime = toISOFromDateTime(form.date, `${form.hh}:${form.mm}`);
    return {
      ...form,
      faultTime,
      raw,
      status: 'open',
      source: 'ticket',
      ping: parsed?.ping,
      laser: parsed?.laser,
      createdAt: new Date().toISOString(),
    } as Omit<TicketRecord, 'id'>;
  }

  function ticketText() {
    const dt = `${form.date} ${form.hh}:${form.mm}`;
    return [
      `🛠 *NMC Ticket*`,
      `Time: ${dt}`,
      `Category: ${form.category || '-'}`,
      `Sub-category: ${form.subCategory || '-'}`,
      `Incident: ${form.incidentName || '-'}`,
      `Zone: ${form.zone || '-'}`,
      `IC: ${form.ic || '-'}`,
      `ETR: ${form.etr || '-'}`,
      `Root: ${form.rootCause || '-'}`,
      parsed?.ping ? `Ping: ${parsed.ping.transmitted}/${parsed.ping.received} loss ${parsed.ping.loss}%` : null,
      parsed?.laser ? `Laser: rx ${parsed.laser.rx} tx ${parsed.laser.tx}` : null,
    ].filter(Boolean).join('\n');
  }

  function save() {
    if (!form.category) { bus.emit('notify', { id: crypto.randomUUID(), text: 'Category is required', type: 'warn', createdAt: new Date().toISOString() }); return; }
    const t = store.add<TicketRecord>('tickets', { ...buildPayload(), tt: '' } as TicketRecord);
    const inc: IncidentRecord = ({
      id: t.id,
      session: 'Day',
      name: form.incidentName,
      incidentName: form.incidentName,
      category: form.category,
      subCategory: form.subCategory,
      zone: form.zone,
      ic: form.ic,
      faultTime: t.faultTime,
      etr: form.etr,
      rootCause: form.rootCause,
      ticketId: t.tt || t.id.slice(0, 6),
      source: 'ticket',
      createdAt: t.createdAt,
      updatedAt: new Date().toISOString(),
    } as unknown) as IncidentRecord;
    const existing = incidents.find((i) => i.ticketId === inc.ticketId);
    if (existing) {
      store.update<IncidentRecord>('incidents', existing.id, inc);
    } else {
      store.add<IncidentRecord>('incidents', inc);
    }
    onSaved();
    bus.emit('notify', { id: crypto.randomUUID(), text: 'Ticket saved to incident log', type: 'success', createdAt: new Date().toISOString() });
    setRaw(''); setForm((f) => ({ ...f, category: '', subCategory: '', incidentName: '', zone: '', ic: '', etr: '', rootCause: '' }));
  }

  return (
    <div className="card">
      <h3>Create ticket</h3>
      <label>Raw ticket text (auto-fill)</label>
      <textarea rows={3} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="e.g. FO link down at Bashundhara, ping 100/95 loss 5%, ETR 14:30" />

      {classifyOut && (
        <div className="muted" style={{ marginTop: 6 }}>
          AI → <span className="tag b">{classifyOut.department}</span> <span className="tag p">{classifyOut.issue}</span>
          {classifyOut.tags.map((t) => <span key={t} className="tag y" style={{ marginLeft: 4 }}>{t}</span>)}
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <div className="col-3">
          <label>Date</label>
          <input type="date" value={form.date} onChange={(e) => update('date', e.target.value)} />
        </div>
        <div className="col-2">
          <label>Hour</label>
          <select value={form.hh} onChange={(e) => update('hh', e.target.value)}>{times.hours.map((h) => <option key={h} value={h}>{h}</option>)}</select>
        </div>
        <div className="col-2">
          <label>Min</label>
          <select value={form.mm} onChange={(e) => update('mm', e.target.value)}>{times.minutes.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        </div>
        <div className="col-5">
          <label>Category</label>
          <select value={form.category} onChange={(e) => update('category', e.target.value)}>
            <option value="">— select —</option>
            {DROPDOWN_DEFAULTS.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="col-6">
          <label>Sub-category</label>
          <input value={form.subCategory} onChange={(e) => update('subCategory', e.target.value)} />
        </div>
        <div className="col-6">
          <label>Incident name / BTS / area</label>
          <input value={form.incidentName} onChange={(e) => update('incidentName', e.target.value)} />
        </div>

        <div className="col-3"><label>Zone</label>
          <select value={form.zone} onChange={(e) => update('zone', e.target.value)}>
            <option value="">—</option>
            {DROPDOWN_DEFAULTS.zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        <div className="col-3"><label>IC</label>
          <input value={form.ic} onChange={(e) => update('ic', e.target.value)} />
        </div>
        <div className="col-3"><label>ETR</label>
          <input value={form.etr} onChange={(e) => update('etr', e.target.value)} placeholder="HH:MM" />
        </div>
        <div className="col-3"><label>Root cause</label>
          <input value={form.rootCause} onChange={(e) => update('rootCause', e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn" onClick={save}><IconCheck size={14} /> Confirm &amp; Save to Incident Log</button>
        <button className="btn ghost" onClick={() => { setRaw(''); setForm((f) => ({ ...f, category: '', subCategory: '', incidentName: '', zone: '', ic: '', etr: '', rootCause: '' })); }}><IconX size={14} /> Clear</button>
        <button className="btn ghost" onClick={() => setPreviewOpen((v) => !v)}><IconCopy size={14} /> Preview</button>
        <button className="btn ghost" onClick={() => shareWhatsApp(ticketText())}><IconShare size={14} /> WhatsApp</button>
      </div>

      {previewOpen && (
        <pre className="ticket-preview" style={{ marginTop: 10 }}>{ticketText()}</pre>
      )}
    </div>
  );
}

/* ---------------- Close Ticket ---------------- */

function CloseTicket({ tickets, incidents, onUpdated }: { tickets: TicketRecord[]; incidents: IncidentRecord[]; onUpdated: () => void }) {
  const [tt, setTt] = useState('');
  const [resolved, setResolved] = useState('');
  const [action, setAction] = useState('');
  const [dept, setDept] = useState('');
  const [root, setRoot] = useState('');
  const [endTime, setEndTime] = useState(new Date().toISOString().slice(0, 16));
  const [match, setMatch] = useState<IncidentRecord | null>(null);

  useEffect(() => {
    const found = incidents.find((i) => (i.ticketId || '').toLowerCase() === tt.toLowerCase());
    setMatch(found ?? null);
    if (found) {
      setRoot(found.rootCause || '');
      setDept(found.dept || found.team || '');
    }
  }, [tt, incidents]);

  function closeText() {
    const t = match;
    const dur = t ? fmtLongDuration(require_duration(t.faultTime, endTime)) : '';
    return [
      `✅ *NMC Close*`,
      `TT: ${tt}`,
      `Incident: ${t?.incidentName || '-'}`,
      `Restored at: ${endTime.replace('T', ' ')}`,
      dur ? `Duration: ${dur}` : null,
      `Root cause: ${root || '-'}`,
      `Action taken: ${action || '-'}`,
      `Resolved by: ${resolved || '-'}`,
      `Dept: ${dept || '-'}`,
    ].filter(Boolean).join('\n');
  }

  function apply() {
    if (!tt) { bus.emit('notify', { id: crypto.randomUUID(), text: 'Enter a TT number', type: 'warn', createdAt: new Date().toISOString() }); return; }
    const target = match ?? incidents.find((i) => (i.ticketId || '').toLowerCase() === tt.toLowerCase());
    if (target) {
      store.update<IncidentRecord>('incidents', target.id, {
        solved: 'yes',
        endTime: new Date(endTime).toISOString(),
        rootCause: root || target.rootCause,
        actionTaken: action,
        resolvedBy: resolved,
        dept: dept || target.dept,
        restored: endTime,
      });
    }
    const t = tickets.find((x) => (x.tt || '').toLowerCase() === tt.toLowerCase());
    if (t) {
      store.update<TicketRecord>('tickets', t.id, { status: 'closed', closedAt: new Date().toISOString() });
    }
    onUpdated();
    bus.emit('notify', { id: crypto.randomUUID(), text: 'Ticket closed', type: 'success', createdAt: new Date().toISOString() });
    setTt(''); setResolved(''); setAction(''); setRoot(''); setDept(''); setMatch(null);
  }

  return (
    <div className="card">
      <h3>Close ticket</h3>
      <div className="row">
        <div className="col-3"><label>TT number</label>
          <input value={tt} onChange={(e) => setTt(e.target.value)} placeholder="e.g. 12345" />
        </div>
        <div className="col-3"><label>End time</label>
          <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <div className="col-3"><label>Resolved by</label>
          <input value={resolved} onChange={(e) => setResolved(e.target.value)} />
        </div>
        <div className="col-3"><label>Department</label>
          <select value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">—</option>
            {DROPDOWN_DEFAULTS.departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="col-6"><label>Root cause</label>
          <input value={root} onChange={(e) => setRoot(e.target.value)} />
        </div>
        <div className="col-6"><label>Action taken</label>
          <input value={action} onChange={(e) => setAction(e.target.value)} />
        </div>
      </div>

      {match && (
        <div className="muted" style={{ marginTop: 8 }}>
          Matched incident <code>{match.id}</code> — {match.incidentName || match.subCategory} ({fmtDMYHM(match.faultTime)})
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn success" onClick={apply}><IconCheck size={14} /> Apply close</button>
        <button className="btn ghost" onClick={() => shareWhatsApp(closeText())}><IconShare size={14} /> WhatsApp</button>
        <button className="btn ghost" onClick={() => copyToClipboard(closeText())}><IconCopy size={14} /> Copy</button>
      </div>
    </div>
  );
}

function require_duration(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return '';
  const aa = a;
  const bb = new Date(b).toISOString();
  return diffDuration(aa, bb);
}

function shareWhatsApp(text: string) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
}

async function copyToClipboard(text: string) {
  try { await navigator.clipboard.writeText(text); bus.emit('notify', { id: crypto.randomUUID(), text: 'Copied to clipboard', type: 'success', createdAt: new Date().toISOString() }); } catch { /* ignore */ }
}
