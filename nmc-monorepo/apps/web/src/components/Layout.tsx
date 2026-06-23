// App layout: header + sidebar + main outlet + notification drawer.
// Mirrors the legacy layout in app.js so the visual structure is identical.

import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { useNotif } from '../lib/notif';
import {
  IconBell, IconMenu, IconHome, IconTicket, IconLog, IconMail, IconUsers,
  IconServer, IconCalendar, IconLink, IconPhone, IconReport, IconSettings,
  IconInfo, IconSun, IconMoon, IconLogout, IconChat,
} from '../lib/icons';
import { NotifDrawer } from './Notif';
import { Chatbox } from './Chatbox';

type NavLink = { to: string; label: string; Icon: typeof IconHome; section: string };

const NAV: NavLink[] = [
  { to: '/dashboard',   label: 'Dashboard',    Icon: IconHome,     section: 'Main' },
  { to: '/tickets',     label: 'Tickets',      Icon: IconTicket,   section: 'Main' },
  { to: '/incidentLog', label: 'Incident Log', Icon: IconLog,      section: 'Main' },
  { to: '/mail',        label: 'Mail Log',     Icon: IconMail,     section: 'Main' },
  { to: '/contacts',    label: 'Contacts',     Icon: IconUsers,    section: 'Main' },
  { to: '/bras',        label: 'BRAS',         Icon: IconServer,   section: 'Network' },
  { to: '/nms',         label: 'NMS Links',    Icon: IconLink,     section: 'Network' },
  { to: '/roster',      label: 'Roster',       Icon: IconCalendar, section: 'Network' },
  { to: '/scr',         label: 'SCR',          Icon: IconReport,   section: 'Maintenance' },
  { to: '/ccb',         label: 'CCB',          Icon: IconPhone,    section: 'Maintenance' },
  { to: '/reports',     label: 'Reports',      Icon: IconReport,   section: 'System' },
  { to: '/settings',    label: 'Settings',     Icon: IconSettings, section: 'System' },
  { to: '/about',       label: 'About',        Icon: IconInfo,     section: 'System' },
];

function groupBySection(items: NavLink[]) {
  const out: Record<string, NavLink[]> = {};
  for (const it of items) {
    const arr = out[it.section] ?? [];
    arr.push(it);
    out[it.section] = arr;
  }
  return out;
}

export function Layout() {
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const { unread, openDrawer } = useNotif();
  const [collapsed, setCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const grouped = groupBySection(NAV);

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
        <button className="icon-btn" title={user ? `Logout ${user.email}` : 'Login'} onClick={() => (user ? logout() : navigate('/login'))}>
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
