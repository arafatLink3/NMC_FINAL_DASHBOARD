// components/notif.js — notification drawer + toast + modal helpers
(function (global) {
  const $ = global.NMCStore;

  function toast(text, type) {
    const w = document.getElementById('toastWrap');
    if (!w) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = text;
    w.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 2500);
    setTimeout(() => el.remove(), 3000);
  }

  function openModal(html) {
    const m = document.getElementById('modal');
    const mask = document.getElementById('modalMask');
    m.innerHTML = html;
    mask.classList.add('open');
  }
  function closeModal() {
    const mask = document.getElementById('modalMask');
    mask.classList.remove('open');
  }

  function renderNotif() {
    const list = $.get('notifications', []);
    const badge = document.getElementById('notifBadge');
    const unread = list.filter(n => !n.read).length;
    if (badge) {
      if (unread > 0) { badge.style.display = ''; badge.textContent = unread; }
      else { badge.style.display = 'none'; }
    }
    const box = document.getElementById('notifList');
    if (!box) return;
    box.innerHTML = list.length ? list.map(n => `
      <div class="item">
        <div class="flex"><span class="dot ${n.type==='warn'?'y':n.type==='danger'?'r':n.type==='success'?'g':'p'}"></span>
          <b>${escapeHtml(n.text)}</b></div>
        <small>${new Date(n.createdAt).toLocaleString()}</small>
      </div>`).join('') : `<div class="empty">No notifications yet</div>`;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function openDrawer() {
    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawerMask').classList.add('open');
    // mark all as read
    const arr = $.get('notifications', []).map(n => Object.assign({}, n, { read: true }));
    $.set('notifications', arr);
    renderNotif();
    hideHoverPreview(); // dismiss any open preview
  }
  function closeDrawer() {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawerMask').classList.remove('open');
  }

  // ---- Hover banner preview (last 3 notifications) ----
  let _hoverEl = null;
  function ensureHoverEl() {
    if (_hoverEl) return _hoverEl;
    _hoverEl = document.createElement('div');
    _hoverEl.className = 'notif-hover-preview';
    _hoverEl.setAttribute('aria-hidden', 'true');
    _hoverEl.innerHTML = '<div class="nhp-head">Recent notifications</div><div class="nhp-body"></div>';
    document.body.appendChild(_hoverEl);
    return _hoverEl;
  }
  function showHoverPreview(anchor) {
    const list = $.get('notifications', []);
    const recent = list.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 3);
    const el = ensureHoverEl();
    const body = el.querySelector('.nhp-body');
    body.innerHTML = recent.length
      ? recent.map(n => `
          <div class="nhp-item">
            <span class="dot ${n.type==='warn'?'y':n.type==='danger'?'r':n.type==='success'?'g':'p'}"></span>
            <div class="nhp-text">
              <div>${escapeHtml(n.text)}</div>
              <small>${new Date(n.createdAt).toLocaleString()}</small>
            </div>
          </div>`).join('')
      : '<div class="empty">No notifications yet</div>';

    // Position below the bell
    const r = (anchor || document.getElementById('openNotif') || {}).getBoundingClientRect
      ? anchor.getBoundingClientRect()
      : { left: window.innerWidth - 80, bottom: 70, width: 36 };
    const top = (r.bottom || 60) + 8;
    const left = Math.min(Math.max((r.right || r.left + 36) - 280, 8), window.innerWidth - 290);
    el.style.top = top + 'px';
    el.style.left = left + 'px';
    el.classList.add('show');
  }
  function hideHoverPreview() {
    if (_hoverEl) _hoverEl.classList.remove('show');
  }

  global.NMCUI = { toast, openModal, closeModal, renderNotif, openDrawer, closeDrawer, escapeHtml,
                   showHoverPreview, hideHoverPreview };
})(window);
