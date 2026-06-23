// Mail page — 6 templates (NTTN, IIG, Telco POP, BRAS, Weekly, Monthly) + log.

import { useMemo, useState } from 'react';
import { useCollection } from '../lib/store';
import { IconCopy, IconShare, IconCheck } from '../lib/icons';
import { bus } from '../lib/bus';
import type { MailLogEntry } from '@nmc/api-client';

type Tpl = { id: string; label: string; build: () => string };

const TPLS: Tpl[] = [
  { id: 'nttn',   label: 'NTTN',       build: () => mailBody('NTTN') },
  { id: 'iig',    label: 'IIG',        build: () => mailBody('IIG') },
  { id: 'pop',    label: 'Telco POP',  build: () => mailBody('Telco POP') },
  { id: 'bras',   label: 'BRAS',       build: () => mailBody('BRAS Bandwidth') },
  { id: 'weekly', label: 'Weekly',     build: () => `Weekly NMC Report — ${new Date().toLocaleDateString()}\n\n` + section('Highlights') + section('Major incidents') + section('Actions taken') + section('Upcoming changes') },
  { id: 'month',  label: 'Monthly',    build: () => `Monthly NMC Report — ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}\n\n` + section('Summary') + section('KPIs') + section('Incidents by zone') + section('Lessons learned') },
];

function section(title: string) { return `## ${title}\n- …\n- …\n\n`; }

function mailBody(kind: string) {
  return [
    `Subject: ${kind} update — ${new Date().toLocaleDateString()}`,
    ``,
    `Dear Team,`,
    ``,
    `Please find the ${kind} status below:`,
    ``,
    `• Vendor / link / capacity / used / free`,
    `• …`,
    ``,
    `Regards,`,
    `NMC`,
  ].join('\n');
}

export function MailPage() {
  const [active, setActive] = useState((TPLS[0] as Tpl).id);
  const [log, setLog] = useCollection<MailLogEntry>('mailLog');
  const tpl: Tpl = TPLS.find((t) => t.id === active) ?? (TPLS[0] as Tpl);
  const body = useMemo(() => tpl.build(), [tpl]);

  function send(channel: 'whatsapp' | 'mailto' | 'copy') {
    setLog([...log, { id: crypto.randomUUID(), channel, template: tpl.id, createdAt: new Date().toISOString(), body } as MailLogEntry]);
    if (channel === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(body)}`, '_blank', 'noopener');
    } else if (channel === 'mailto') {
      window.location.href = `mailto:?subject=${encodeURIComponent(tpl.label)}&body=${encodeURIComponent(body)}`;
    } else {
      copyToClipboard(body);
    }
    bus.emit('notify', { id: crypto.randomUUID(), text: `Mail sent via ${channel}`, type: 'success', createdAt: new Date().toISOString() });
  }

  return (
    <div>
      <h2 style={{ margin: '4px 0 12px' }}>Mail Center</h2>
      <div className="tabs">
        {TPLS.map((t) => (
          <div key={t.id} className={`tab ${active === t.id ? 'active' : ''}`} onClick={() => setActive(t.id)}>{t.label}</div>
        ))}
      </div>
      <div className="card">
        <h3>{tpl.label} template</h3>
        <pre className="ticket-preview">{body}</pre>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn" onClick={() => send('copy')}><IconCopy size={14} /> Copy</button>
          <button className="btn ghost" onClick={() => send('whatsapp')}><IconShare size={14} /> WhatsApp</button>
          <button className="btn ghost" onClick={() => send('mailto')}><IconCheck size={14} /> Outlook</button>
        </div>
      </div>

      <div className="card">
        <h3>Mail log</h3>
        {log.length === 0 && <div className="empty">No mails sent yet.</div>}
        {log.slice().reverse().slice(0, 30).map((m) => (
          <div key={m.id} className="reminder" style={{ borderLeftColor: 'var(--info)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="tag b">{m.channel}</span>
              <span style={{ flex: 1 }}>{m.template}</span>
              <span className="muted">{typeof m.createdAt === 'string' ? new Date(m.createdAt).toLocaleString() : ''}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function copyToClipboard(text: string) {
  try { await navigator.clipboard.writeText(text); bus.emit('notify', { id: crypto.randomUUID(), text: 'Copied to clipboard', type: 'success', createdAt: new Date().toISOString() }); } catch { /* ignore */ }
}
