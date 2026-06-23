// Notification drawer — the right-side panel that lists recent notifications.

import { useNotif } from '../lib/notif';
import { IconBell, IconX, IconTrash } from '../lib/icons';
import { fmtDMYHM } from '../lib/format';

export function NotifDrawer() {
  const { drawerOpen, closeDrawer, notifs, markAllRead, clear } = useNotif();

  return (
    <>
      <div className={`drawer-mask ${drawerOpen ? 'open' : ''}`} onClick={closeDrawer} />
      <aside className={`drawer ${drawerOpen ? 'open' : ''}`} aria-hidden={!drawerOpen}>
        <div className="head">
          <IconBell />
          <h4>Notifications</h4>
          <button className="btn ghost sm" onClick={markAllRead}>Mark all read</button>
          <button className="icon-btn" onClick={closeDrawer} aria-label="Close"><IconX /></button>
        </div>
        <div className="body">
          {notifs.length === 0 && <div className="empty">No notifications yet.</div>}
          {notifs.slice().reverse().map((n) => (
            <div key={n.id} className="item" style={{ opacity: n.read ? 0.7 : 1 }}>
              <div>{n.text}</div>
              <div className="when">{fmtDMYHM(n.createdAt)} {n.type ? `· ${n.type}` : ''}</div>
            </div>
          ))}
          {notifs.length > 0 && (
            <button className="btn ghost" onClick={clear} style={{ marginTop: 12, width: '100%' }}>
              <IconTrash size={14} /> Clear all
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
