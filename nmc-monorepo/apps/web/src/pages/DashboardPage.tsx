// Dashboard — KPI cards + 14-day incident trend + sub-category pie + hover details.

import { useEffect, useMemo, useState } from 'react';
import { LineChart, PieChart } from '../components/Charts';
import { useCollection } from '../lib/store';
import { bus } from '../lib/bus';
import { fmtDMYHM, fmtLongDuration, durationBetween } from '../lib/format';
import type { IncidentRecord } from '@nmc/api-client';

type Reminder = { id: string; text: string; minutes: number; danger?: boolean };

function startOfDay(d: Date) { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; }

export function DashboardPage() {
  const [incidents] = useCollection<IncidentRecord>('incidents');
  const [tick, setTick] = useState(0);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  // re-render every minute so "running" durations stay current
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const stats = useMemo(() => {
    const thisMonth = incidents.filter((i) => new Date(i.faultTime || i.createdAt || 0) >= monthStart);
    const open = thisMonth.filter((i) => !i.solved || i.solved === '' || (i.endTime ? new Date(i.endTime) > now : false));
    const solved = thisMonth.filter((i) => i.solved && i.solved !== '' && (!i.endTime || new Date(i.endTime) <= now));
    const nonTicket = thisMonth.filter((i) => i.source === 'non-ticket' || i.nonTicket);
    const longOut = thisMonth.filter((i) => {
      if (!i.faultTime) return false;
      const end = i.endTime ? new Date(i.endTime) : now;
      return (end.getTime() - new Date(i.faultTime).getTime()) > 4 * 60 * 60 * 1000;
    });
    return { total: thisMonth.length, open: open.length, solved: solved.length, nonTicket: nonTicket.length, longOut: longOut.length };
  }, [incidents, monthStart, now, tick]);

  const trend = useMemo(() => {
    const days: { label: string; value: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const count = incidents.filter((inc) => {
        const t = new Date(inc.faultTime || inc.createdAt || 0);
        return t >= d && t < next;
      }).length;
      days.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, value: count });
    }
    return days;
  }, [incidents, now]);

  const pie = useMemo(() => {
    const map = new Map<string, number>();
    for (const inc of incidents) {
      const k = inc.subCategory || inc.category || 'Other';
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [incidents]);

  // reminders: running incidents > 60 min
  useEffect(() => {
    const out: Reminder[] = [];
    for (const inc of incidents) {
      if (!inc.faultTime) continue;
      const end = inc.endTime ? new Date(inc.endTime) : now;
      const mins = Math.floor((end.getTime() - new Date(inc.faultTime).getTime()) / 60000);
      if (mins >= 60) {
        out.push({
          id: inc.id,
          text: `${inc.incidentName || inc.subCategory || inc.category} running ${fmtLongDuration(durationBetween(inc.faultTime, end.toISOString()))}`,
          minutes: mins,
          danger: mins >= 240,
        });
      }
    }
    out.sort((a, b) => b.minutes - a.minutes);
    setReminders(out.slice(0, 8));
  }, [incidents, now, tick]);

  return (
    <div>
      <h2 style={{ margin: '4px 0 12px' }}>Dashboard</h2>

      <div className="kpi">
        <div className="card info">
          <div className="ic">📋</div>
          <div><div className="v">{stats.total}</div><div className="l">Incidents this month</div></div>
        </div>
        <div className="card warning">
          <div className="ic">⏱️</div>
          <div><div className="v">{stats.open}</div><div className="l">Open / running</div></div>
        </div>
        <div className="card success">
          <div className="ic">✅</div>
          <div><div className="v">{stats.solved}</div><div className="l">Solved</div></div>
        </div>
        <div className="card">
          <div className="ic">📝</div>
          <div><div className="v">{stats.nonTicket}</div><div className="l">Non-ticket</div></div>
        </div>
        <div className="card danger">
          <div className="ic">⚠️</div>
          <div><div className="v">{stats.longOut}</div><div className="l">Outage &gt; 4h</div></div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card chart-card">
          <h3>Incidents — last 14 days</h3>
          <LineChart data={trend} ariaLabel="14-day trend" />
        </div>
        <div className="card chart-card">
          <h3>By sub-category</h3>
          <PieChart data={pie} ariaLabel="Sub-category distribution" />
        </div>
      </div>

      <div className="card">
        <h3>Reminders</h3>
        {reminders.length === 0 && <div className="empty">No incidents running &gt; 60 min.</div>}
        {reminders.map((r) => (
          <div key={r.id} className={`reminder ${r.danger ? 'danger' : ''}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⏰</span>
              <span style={{ flex: 1 }}>{r.text}</span>
              <button className="btn ghost sm" onClick={() => snooze(r.id)}>Snooze 1h</button>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Recent incidents</h3>
        <DashTable rows={incidents.slice().sort((a, b) => (b.faultTime || '').localeCompare(a.faultTime || '')).slice(0, 8)} />
      </div>
    </div>
  );
}

function snooze(id: string) {
  const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  localStorage.setItem(`nmc.rem-${id}`, until);
  bus.emit('notify', { id: crypto.randomUUID(), text: 'Reminder snoozed for 1 hour', type: 'info', createdAt: new Date().toISOString() });
}

function DashTable({ rows }: { rows: IncidentRecord[] }) {
  if (rows.length === 0) return <div className="empty">No incidents yet.</div>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead><tr><th>Sub-category</th><th>Incident</th><th>Fault</th><th>End</th><th>Duration</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const dur = durationBetween(r.faultTime, r.endTime || new Date().toISOString());
            return (
              <tr key={r.id} data-tip={JSON.stringify(r)} onMouseEnter={(e) => showTip(e.currentTarget)} onMouseLeave={hideTip}>
                <td>{r.subCategory || r.category || '—'}</td>
                <td>{r.incidentName || '—'}</td>
                <td>{fmtDMYHM(r.faultTime)}</td>
                <td>{r.endTime ? fmtDMYHM(r.endTime) : '—'}</td>
                <td>{fmtLongDuration(dur)}</td>
                <td><span className={`status ${r.solved ? 'solved' : 'running'}`}>{r.solved ? 'Solved' : 'Running'}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

let tipEl: HTMLDivElement | null = null;
function ensureTip() {
  if (tipEl) return tipEl;
  tipEl = document.createElement('div');
  tipEl.className = 'dash-tip';
  document.body.appendChild(tipEl);
  return tipEl;
}
function showTip(target: HTMLElement) {
  const tip = ensureTip();
  const data = target.getAttribute('data-tip') || '';
  let html = '<div class="tip-h">Incident details</div>';
  try {
    const obj = JSON.parse(data) as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'id') continue;
      const val = v === null || v === undefined || v === '' ? '<span class="tip-v muted">—</span>' : String(v);
      html += `<div class="tip-row"><span class="tip-k">${k}</span><span class="tip-v">${val}</span></div>`;
    }
  } catch {
    html += `<div class="tip-row"><span class="tip-v">${data}</span></div>`;
  }
  tip.innerHTML = html;
  const rect = target.getBoundingClientRect();
  let top = rect.bottom + 6;
  let left = rect.left;
  tip.classList.add('open');
  tip.style.top = `${top}px`;
  tip.style.left = `${left}px`;
  // clamp viewport
  requestAnimationFrame(() => {
    const tr = tip.getBoundingClientRect();
    if (tr.right > window.innerWidth - 8) tip.style.left = `${window.innerWidth - tr.width - 8}px`;
    if (tr.bottom > window.innerHeight - 8) tip.style.top = `${rect.top - tr.height - 6}px`;
  });
}
function hideTip() { tipEl?.classList.remove('open'); }
