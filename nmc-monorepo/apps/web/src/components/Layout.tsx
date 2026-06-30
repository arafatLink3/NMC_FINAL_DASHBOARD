// App layout: header + sidebar + main outlet + notification drawer.
// Mirrors the legacy layout in app.js so the visual structure is identical.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { useNotif } from '../lib/notif';
import { useCollection } from '../lib/store';
import { engineerAt } from '@nmc/ai';
import {
  IconBell, IconMenu, IconHome, IconTicket, IconLog, IconMail, IconUsers,
  IconServer, IconCalendar, IconLink, IconPhone, IconReport, IconSettings,
  IconInfo, IconSun, IconMoon, IconLogout, IconChat,
} from '../lib/icons';
import type { RosterRecord } from '@nmc/api-client';
import { NotifDrawer } from './Notif';
import { Chatbox } from './Chatbox';

type NavLinkSpec = { to: string; label: string; Icon: typeof IconHome; section: string };

// Sidebar labels mirror the design.html blueprint:
//   "Mail Center", "BRAS DB", "Duty Roster", "NMS Links", "Incident Log", etc.
const NAV: NavLinkSpec[] = [
  { to: '/dashboard',   label: 'Dashboard',    Icon: IconHome,     section: 'Main' },
  { to: '/tickets',     label: 'Tickets',      Icon: IconTicket,   section: 'Main' },
  { to: '/incidentLog', label: 'Incident Log', Icon: IconLog,      section: 'Main' },
  { to: '/mail',        label: 'Mail Center',  Icon: IconMail,     section: 'Main' },
  { to: '/contacts',    label: 'Contacts',     Icon: IconUsers,    section: 'Main' },
  { to: '/bras',        label: 'BRAS DB',      Icon: IconServer,   section: 'Network' },
  { to: '/nms',         label: 'NMS Links',    Icon: IconLink,     section: 'Network' },
  { to: '/roster',      label: 'Duty Roster',  Icon: IconCalendar, section: 'Network' },
  { to: '/scr',         label: 'NTTN SCR',     Icon: IconReport,   section: 'Maintenance' },
  { to: '/ccb',         label: 'CCB / NCR / PID', Icon: IconPhone, section: 'Maintenance' },
  { to: '/reports',     label: 'Reports',      Icon: IconReport,   section: 'System' },
  { to: '/settings',    label: 'Settings',     Icon: IconSettings, section: 'System' },
  { to: '/about',       label: 'About',        Icon: IconInfo,     section: 'System' },
];

function groupBySection(items: NavLinkSpec[]) {
  const out: Record<string, NavLinkSpec[]> = {};
  for (const it of items) {
    const arr = out[it.section] ?? [];
    arr.push(it);
    out[it.section] = arr;
  }
  return out;
}

const SHIFT_RANGE: Record<string, string> = {
  Morning: '08:00 – 16:00',
  Evening: '14:00 – 22:00',
  Night: '22:00 – 08:00',
};

export function Layout() {
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const { unread, openDrawer } = useNotif();
  const [collapsed, setCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [roster] = useCollection<RosterRecord>('roster');
  const navigate = useNavigate();
  const location = useLocation();
  const grouped = groupBySection(NAV);

  // Re-evaluate the shift pill every minute so the displayed range stays
  // current without forcing a hard refresh.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const shiftPill = useMemo(() => {
    const entries = roster
      .filter((r) => (r.dept ?? r.team ?? r.group ?? 'General') === 'NMC')
      .map((r) => ({
        date: r.date ?? '',
        dept: r.dept ?? 'NMC',
        shift: r.shift ?? 'Morning',
        engineers: (Array.isArray(r.engineers) ? r.engineers : [])
          .map((e) => ({ name: typeof e === 'string' ? e : (e?.name ?? '') }))
          .filter((e) => e.name),
      }));
    const e = engineerAt(now, entries);
    const names = e.engineers.map((x) => x.name).filter(Boolean);
    return {
      shift: e.shift,
      collision: e.collision,
      engineers: names,
    };
  }, [roster, now]);

  return (
    <>
      <header className="app-header">
        <button className="icon-btn" aria-label="Toggle sidebar" onClick={() => setCollapsed((c) => !c)}>
          <IconMenu />
        </button>
        <Link to="/dashboard" className="brand">
          <span className="logo">N</span>
          <span>NMC Portal</span>
        </Link>
        <nav className="top-nav">
          <Link to="/dashboard">Home</Link>
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
        </nav>

        {/* Shift pill — design.html §2 header: "Shift: Morning (08:00-16:00) — On Duty: X, Y" */}
        <div
          className="shift-pill"
          title={`${shiftPill.shift} shift — engineers currently on duty`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 10px',
            marginLeft: 12,
            borderRadius: 999,
            background: shiftPill.collision ? 'var(--danger)' : 'var(--primary)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            maxWidth: 360,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span>Shift: {shiftPill.shift}</span>
          <span style={{ opacity: 0.85 }}>({SHIFT_RANGE[shiftPill.shift] ?? '—'})</span>
          <span style={{ opacity: 0.85 }}>•</span>
          <span style={{ fontWeight: 500, textTransform: 'none' }}>
            {shiftPill.engineers.length > 0
              ? `On Duty: ${shiftPill.engineers.slice(0, 4).join(', ')}${shiftPill.engineers.length > 4 ? '…' : ''}`
              : 'On Duty: —'}
          </span>
        </div>

        <div className="spacer" />
        <label className="theme-switch" title="Toggle theme">
          <input type="checkbox" checked={theme === 'light'} onChange={toggle} />
          <span className="track"><span className="thumb" /></span>
          <span className="label">{theme === 'dark' ? <IconMoon size={14} /> : <IconSun size={14} />}</span>
        </label>
        <button className="icon-btn" aria-label="Notifications" onClick={openDrawer}>
          <IconBell />
          {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
        </button>
        <button className="icon-btn" aria-label="AI chat" onClick={() => setChatOpen((c) => !c)}>
          <IconChat />
        </button>
        <button className="icon-btn" title={user ? `Logout ${user.email}` : 'Log in'} onClick={() => (user ? logout() : navigate('/login'))}>
          <IconLogout />
        </button>
      </header>
      <div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
        <aside className="sidebar">
          {Object.entries(grouped).map(([section, items]) => (
            <div key={section}>
              <div className="group-title">{section}</div>
              {items.map(({ to, label, Icon }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <span className="ic"><Icon size={16} /></span>
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </aside>
        <main className="main" key={location.pathname}>
          <Outlet />
        </main>
      </div>
      <NotifDrawer />
      {chatOpen && <Chatbox onClose={() => setChatOpen(false)} />}
    </>
  );
}
