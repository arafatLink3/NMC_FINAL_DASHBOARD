// Settings — API base URL, theme, user profile, mail signature,
//            Outlook account status, Backup / Restore JSON.

import { useEffect, useState } from 'react';
import { useApi } from '../lib/api';
import { useTheme } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { useNotif } from '../lib/notif';
import { bus } from '../lib/bus';

const STORAGE_KEYS = [
  'nmc.apiBase',
  'nmc.mailSignature',
  'nmc.outlookFrom',
  'nmc.shiftWindowStart',
  'nmc.shiftWindowEnd',
  'nmc.contacts',
  'nmc.bras',
  'nmc.scr',
  'nmc.roster',
  'nmc.ccb',
  'nmc.tickets',
  'nmc.incidents',
  'nmc.mailLog',
  'nmc.notifications',
  'nmc.aiTraining',
  'nmc.contactLearn',
  'nmc.contactDownrank',
  'nmc.settings',
  'nmc.nms_links',
  'nmc.wa_group',
];

export function SettingsPage() {
  const api = useApi();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const notif = useNotif();
  const [base, setBase] = useState(() => localStorage.getItem('nmc.apiBase') || window.location.origin);
  const [signature, setSignature] = useState(() => localStorage.getItem('nmc.mailSignature') || '');
  const [outlookStatus, setOutlookStatus] = useState<'unknown' | 'ok' | 'error' | 'disabled'>('unknown');
  const [outlookMsg, setOutlookMsg] = useState<string>('');

  function saveBase() {
    api.setBaseUrl(base);
    bus.emit('notify', { id: crypto.randomUUID(), text: 'API base URL saved', type: 'success', createdAt: new Date().toISOString() });
  }

  function saveSignature() {
    localStorage.setItem('nmc.mailSignature', signature);
    notif.push('Mail signature saved', 'success');
  }

  async function refreshOutlookStatus() {
    try {
      const r = await fetch('/api/mail/status', { credentials: 'include' });
      if (r.status === 503) {
        const j = await r.json().catch(() => ({} as { error?: string }));
        setOutlookStatus('disabled');
        setOutlookMsg(j.error ?? 'IMAP disabled by server config');
        return;
      }
      if (!r.ok) {
        setOutlookStatus('error');
        setOutlookMsg(`HTTP ${r.status}`);
        return;
      }
      const j = await r.json().catch(() => ({} as { smtp?: boolean; imap?: boolean }));
      setOutlookStatus('ok');
      setOutlookMsg(`IMAP: ${j.imap ? 'ready' : 'off'} · SMTP: ${j.smtp ? 'ready' : 'off'}`);
    } catch (err) {
      setOutlookStatus('error');
      setOutlookMsg((err as Error).message);
    }
  }

  useEffect(() => { void refreshOutlookStatus(); }, []);

  function exportBackup() {
    const dump: Record<string, unknown> = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {},
    };
    for (const k of STORAGE_KEYS) {
      const raw = localStorage.getItem(k);
      if (raw !== null) (dump.data as Record<string, unknown>)[k] = raw;
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nmc-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notif.push('Backup downloaded', 'success');
  }

  async function importBackup(file: File) {
    try {
      const text = await file.text();
      const dump = JSON.parse(text) as { version?: number; data?: Record<string, string> };
      if (!dump.data || typeof dump.data !== 'object') throw new Error('Invalid backup file');
      let count = 0;
      for (const [k, v] of Object.entries(dump.data)) {
        localStorage.setItem(k, v);
        count++;
      }
      notif.push(`Restored ${count} keys — reloading…`, 'success');
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      notif.push(`Restore failed: ${(err as Error).message}`, 'danger');
    }
  }

  function resetAll() {
    if (!confirm('This will clear all local data. Continue?')) return;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('nmc.') || k === 'nmc.auth')) localStorage.removeItem(k);
    }
    bus.emit('notify', { id: crypto.randomUUID(), text: 'Local data cleared — reloading…', type: 'warn', createdAt: new Date().toISOString() });
    setTimeout(() => window.location.reload(), 600);
  }

  const statusColor =
    outlookStatus === 'ok' ? 'var(--success)' :
    outlookStatus === 'disabled' ? 'var(--muted)' :
    outlookStatus === 'error' ? 'var(--danger)' : 'var(--muted)';

  return (
    <div>
      <h2 style={{ margin: '4px 0 12px' }}>Settings</h2>

      <div className="card">
        <h3>Profile</h3>
        <p className="muted">Signed in as <strong>{user?.name || user?.email}</strong> · role <code>{user?.role}</code></p>
        <button className="btn ghost" onClick={logout}>Sign out</button>
      </div>

      <div className="card">
        <h3>API</h3>
        <label>Base URL</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="http://localhost:3000" />
          <button className="btn" onClick={saveBase}>Save</button>
        </div>
        <p className="muted">Defaults to <code>window.location.origin</code> when served behind a reverse proxy.</p>
      </div>

      <div className="card">
        <h3>Outlook / IMAP account</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span className="tag" style={{ background: statusColor, color: '#fff' }}>
            {outlookStatus === 'unknown' ? 'Checking…' :
             outlookStatus === 'ok' ? 'Connected' :
             outlookStatus === 'disabled' ? 'Disabled' : 'Error'}
          </span>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{outlookMsg}</span>
          <button className="btn ghost sm" onClick={refreshOutlookStatus}>Re-check</button>
        </div>
        <p className="muted">
          Configure <code>OUTLOOK_IMAP_HOST</code>, <code>OUTLOOK_IMAP_USER</code>, <code>OUTLOOK_IMAP_PASSWORD</code>
          and <code>SMTP_*</code> on the server. The poller auto-starts on boot when
          <code> OUTLOOK_IMAP_HOST</code> is set.
        </p>
      </div>

      <div className="card">
        <h3>Mail signature</h3>
        <p className="muted">Appended to every WhatsApp / mail share. Plain text.</p>
        <textarea
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          rows={5}
          style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
          placeholder={'— NMC, Link3 Technologies Ltd.\n+880 …'}
        />
        <div style={{ marginTop: 8 }}>
          <button className="btn" onClick={saveSignature}>Save signature</button>
        </div>
      </div>

      <div className="card">
        <h3>Backup / Restore</h3>
        <p className="muted">Downloads every <code>nmc.*</code> localStorage key as JSON.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={exportBackup}>Download backup</button>
          <label className="btn ghost" style={{ cursor: 'pointer' }}>
            Restore from file…
            <input
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importBackup(f);
                e.currentTarget.value = '';
              }}
            />
          </label>
        </div>
      </div>

      <div className="card">
        <h3>Theme</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn ${theme === 'dark' ? '' : 'ghost'}`} onClick={() => setTheme('dark')}>Dark</button>
          <button className={`btn ${theme === 'light' ? '' : 'ghost'}`} onClick={() => setTheme('light')}>Light</button>
        </div>
      </div>

      <div className="card">
        <h3>Danger zone</h3>
        <button className="btn danger" onClick={resetAll}>Reset all local data</button>
      </div>
    </div>
  );
}
