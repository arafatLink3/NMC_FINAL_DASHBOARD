// Settings — API base URL, theme, user profile.

import { useState } from 'react';
import { useApi } from '../lib/api';
import { useTheme } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { bus } from '../lib/bus';

export function SettingsPage() {
  const api = useApi();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const [base, setBase] = useState(() => localStorage.getItem('nmc.apiBase') || window.location.origin);

  function saveBase() {
    api.setBaseUrl(base);
    bus.emit('notify', { id: crypto.randomUUID(), text: 'API base URL saved', type: 'success', createdAt: new Date().toISOString() });
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
