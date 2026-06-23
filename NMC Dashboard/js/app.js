// app.js — SPA router, header, drawer, seed, reminders
(function () {
  const S = window.NMCStore, AI = window.NMCAI, U = window.NMCUI;

  // ---------- Seed data on first run ----------
  function seedIfEmpty() {
    // First-boot copy of dropdown defaults so the manager and selects are populated.
    // Bump DROPDOWN_VERSION whenever DROPDOWN_DEFAULTS in ai.js changes meaningfully
    // (new keys added, lists expanded, etc.) — existing browsers will then refresh
    // the stored map on next load without losing user customisations for other keys
    // (we re-seed the full defaults object but custom values are still recoverable
    // by the user from their previous edits if they were in the manager).
    //
    // v8 — added 'None' to DROPDOWN_DEFAULTS.ticketType so the Ticket Type
    // dropdown offers a no-value option as the new default for new incidents.
    const DROPDOWN_VERSION = 8;
    const storedVer = S.get('dropdownVersion', 0);
    if (!S.get('dropdownOptions', null) || storedVer < DROPDOWN_VERSION) {
      S.set('dropdownOptions', JSON.parse(JSON.stringify(AI.DropdownConfig.defaults)));
      S.set('dropdownVersion', DROPDOWN_VERSION);
    }
    if (S.get('seeded', false)) return;
    fetch('data/seed.json').then(r => r.json()).then(seed => {
      S.set('contacts', seed.contacts || []);
      S.set('bras', seed.bras || []);
      S.set('scr', seed.scr || []);
      S.set('rosters', seed.rosters || []);
      S.set('ccb', seed.ccb || []);
      S.set('seeded', true);
      U.toast('Sample data loaded. You can edit it from the relevant pages.', 'success');
    }).catch(() => {
      S.set('seeded', true);
    });

    // ---------- One-time purge of @example.com rows from already-seeded browsers ----------
    // The seed no longer ships example.com contacts, but browsers seeded earlier still
    // have them in localStorage. v1 strips them on first load after this code ships,
    // bumps CONTACTS_PURGE_VERSION, and never runs again.
    const CONTACTS_PURGE_VERSION = 1;
    if (S.get('contactsPurgeVersion', 0) < CONTACTS_PURGE_VERSION) {
      const isExample = (s) => typeof s === 'string' && /@example\.com\s*$/i.test(s);
      const contacts = S.list('contacts');
      const before = contacts.length;
      const kept = contacts.filter(c => !isExample(c.email));
      if (kept.length !== before) {
        S.set('contacts', kept);
        const removedIds = new Set(contacts.filter(c => isExample(c.email)).map(c => c.id));
        // Sweep any tickets / incidents that referenced the removed contacts so
        // dropdowns and detail panels don't show ghost entries. We don't fail
        // if those stores are missing — this is best-effort cleanup.
        try {
          const sweep = (key) => {
            const rows = S.list(key);
            let changed = false;
            const next = rows.map(r => {
              let hit = false;
              ['mail', 'mailGenerated', 'contactId', 'attendees', 'cc'].forEach(f => {
                const v = r[f];
                if (Array.isArray(v)) { if (v.some(id => removedIds.has(id))) hit = true; }
                else if (typeof v === 'string') { if (removedIds.has(v)) hit = true; }
              });
              if (hit) { changed = true; return null; }
              return r;
            }).filter(Boolean);
            if (changed) S.set(key, next);
          };
          ['tickets', 'incidents', 'mails', 'notifications'].forEach(sweep);
        } catch (e) { /* best-effort */ }
        U.toast(`Removed ${before - kept.length} example.com contact(s) from local data.`, 'info');
      }
      S.set('contactsPurgeVersion', CONTACTS_PURGE_VERSION);
    }

    // ---------- One-time purge of non-sheet contacts ----------
    // The contacts page is now driven by the Google Sheet (source === 'sheet').
    // Any contact without that source was either hand-added before the sheet
    // sync existed, or was loaded from the old seed. v1 removes them on first
    // load after this code ships, bumps CONTACTS_NON_SHEET_PURGE_VERSION, and
    // never runs again. Future hand-added contacts will be tagged
    // source === 'manual' so they survive this sweep.
    const CONTACTS_NON_SHEET_PURGE_VERSION = 1;
    if (S.get('contactsNonSheetPurgeVersion', 0) < CONTACTS_NON_SHEET_PURGE_VERSION) {
      const contacts = S.list('contacts');
      const before = contacts.length;
      // Keep anything explicitly tagged from the sheet; drop anything else
      // (untagged seeded rows, hand-added rows created before the tagging
      // convention existed).
      const kept = contacts.filter(c => c.source === 'sheet');
      if (kept.length !== before) {
        S.set('contacts', kept);
        U.toast(`Removed ${before - kept.length} non-sheet contact(s). Load the sheet to repopulate.`, 'info');
      }
      S.set('contactsNonSheetPurgeVersion', CONTACTS_NON_SHEET_PURGE_VERSION);
    }
  }

  // ---------- Router ----------
  const routes = {
    '/dashboard':     () => window.NMCPages.dashboard(),
    '/tickets':       () => window.NMCPages.tickets(),
    '/incidentLog':   () => window.NMCPages.incidentLog(),
    '/mail':          () => window.NMCPages.mail(),
    '/contacts':      () => window.NMCPages.contacts(),
    '/bras':          () => window.NMCPages.bras(),
    '/roster':        () => window.NMCPages.roster(),
    '/nms':           () => window.NMCPages.nms(),
    '/scr':           () => window.NMCPages.scr(),
    '/ccb':           () => window.NMCPages.ccb(),
    '/reports':       () => window.NMCPages.reports(),
    '/settings':      () => window.NMCPages.settings(),
    '/about':         () => window.NMCPages.about(),
    '/contact':       () => window.NMCPages.contact()
  };

  function parseHash() {
    const h = (location.hash || '#/dashboard').replace(/^#/, '');
    return routes[h] ? h : '/dashboard';
  }

  function render() {
    const path = parseHash();
    document.querySelectorAll('.sidebar .nav-item').forEach(n => n.classList.toggle('active', n.dataset.route === path));
    document.querySelectorAll('#topNav a').forEach(a => a.classList.toggle('active', a.dataset.route === path));
    const view = document.getElementById('view');
    view.innerHTML = '<div class="card">Loading…</div>';
    try { routes[path](); }
    catch (e) {
      console.error(e);
      view.innerHTML = '<div class="card"><h3>Error</h3><pre>' + U.escapeHtml(e.message) + '</pre></div>';
    }
  }

  // ---------- Header wiring ----------
  function wireHeader() {
    const notifBtn = document.getElementById('openNotif');
    let notifHoverTimer = null;
    notifBtn.addEventListener('click', U.openDrawer);
    notifBtn.addEventListener('mouseenter', () => {
      clearTimeout(notifHoverTimer);
      notifHoverTimer = setTimeout(() => U.showHoverPreview(notifBtn), 150);
    });
    notifBtn.addEventListener('mouseleave', () => {
      clearTimeout(notifHoverTimer);
      notifHoverTimer = setTimeout(() => U.hideHoverPreview(), 120);
    });
    document.getElementById('drawerMask').addEventListener('click', U.closeDrawer);
    document.getElementById('clearNotif').addEventListener('click', () => {
      S.set('notifications', []); U.renderNotif();
      U.closeDrawer();
    });
    document.getElementById('openSettings').addEventListener('click', () => { location.hash = '#/settings'; });
    document.getElementById('toggleSidebar').addEventListener('click', () => {
      const sb = document.getElementById('sidebar');
      sb.style.display = (sb.style.display === 'none') ? '' : 'none';
    });
    document.querySelectorAll('.sidebar .nav-item').forEach(n => {
      n.addEventListener('click', () => { location.hash = '#' + n.dataset.route; });
    });
    document.querySelectorAll('#topNav a').forEach(a => {
      a.addEventListener('click', () => { location.hash = '#' + a.dataset.route; });
    });
    window.addEventListener('hashchange', render);
  }

  // ---------- Theme toggle (click + swipe) ----------
  function applyTheme(theme) {
    const t = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    const sw = document.getElementById('themeSwitch');
    const cb = document.getElementById('themeToggle');
    const lbl = document.getElementById('themeLabel');
    if (sw) sw.setAttribute('aria-checked', t === 'light' ? 'true' : 'false');
    if (cb) cb.checked = t === 'light';
    if (lbl) lbl.textContent = t === 'light' ? 'Light' : 'Dark';
    // Let pages (e.g. dashboard charts) repaint in the new palette
    document.dispatchEvent(new CustomEvent('nmc:themechange', { detail: { theme: t } }));
  }

  function wireThemeToggle() {
    const sw = document.getElementById('themeSwitch');
    const cb = document.getElementById('themeToggle');
    if (!sw || !cb) return;
    const saved = S.get('theme', null);
    // If user has never picked one, follow OS preference once
    const initial = saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    applyTheme(initial);

    const toggle = () => {
      const next = sw.getAttribute('aria-checked') === 'true' ? 'dark' : 'light';
      applyTheme(next);
      S.set('theme', next);
    };

    // Click anywhere on the pill
    sw.addEventListener('click', (e) => {
      // Swipe handlers will mark the element dragging; ignore the trailing click
      if (sw._swiped) { sw._swiped = false; return; }
      toggle();
    });
    cb.addEventListener('change', () => {
      const next = cb.checked ? 'light' : 'dark';
      applyTheme(next);
      S.set('theme', next);
    });

    // Touch / pointer swipe: swipe right -> light, swipe left -> dark
    let startX = 0, startY = 0, tracking = false;
    const start = (clientX, clientY) => {
      startX = clientX; startY = clientY; tracking = true;
      sw.classList.add('dragging');
    };
    const end = (clientX, clientY) => {
      if (!tracking) return;
      tracking = false;
      sw.classList.remove('dragging');
      const dx = clientX - startX;
      const dy = clientY - startY;
      // Only count as swipe if horizontal motion dominates and is large enough
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
      sw._swiped = true;
      const currentlyLight = sw.getAttribute('aria-checked') === 'true';
      if (dx > 0 && !currentlyLight) {
        applyTheme('light'); S.set('theme', 'light');
      } else if (dx < 0 && currentlyLight) {
        applyTheme('dark'); S.set('theme', 'dark');
      }
    };
    sw.addEventListener('touchstart', (e) => { const t = e.touches[0]; start(t.clientX, t.clientY); }, { passive: true });
    sw.addEventListener('touchend',   (e) => { const t = e.changedTouches[0]; end(t.clientX, t.clientY); });
    sw.addEventListener('pointerdown', (e) => { start(e.clientX, e.clientY); });
    sw.addEventListener('pointerup',   (e) => { end(e.clientX, e.clientY); });
    sw.addEventListener('pointercancel', () => { tracking = false; sw.classList.remove('dragging'); });
  }

  // ---------- Reminders ----------
  function checkReminders() {
    const now = new Date();
    const inc = S.list('incidents');
    // 1-hour reminder for any "Running" incident > 1h
    inc.filter(i => i.currentStatus === 'Running' && i.faultTime).forEach(i => {
      const t = new Date(i.faultTime);
      const mins = (now - t) / 60000;
      if (mins > 60 && mins < 1440) {
        const k = 'rem-' + i.id;
        if (!S.get(k, null)) {
          S.set(k, now.toISOString());
          S.notify(`⏰ 1h+ reminder: ${i.ticketId || ''} ${i.incidentName} (${Math.floor(mins)}m)`, 'warn');
        }
      }
    });

    // CCB/NCR/PID start soon (15m) and end-time reached
    const ccb = S.list('ccb');
    ccb.forEach(c => {
      const start = new Date(c.start), end = new Date(c.end);
      const beforeStart = (start - now) / 60000;
      const afterEnd = (now - end) / 60000;
      if (beforeStart > 0 && beforeStart <= 15 && c.status !== 'Active') {
        S.notify(`🛠 ${c.type} starts in ${Math.ceil(beforeStart)}m: ${c.title} (${c.area})`, 'warn');
        c.status = 'Active'; S.update('ccb', c.id, { status: 'Active' });
      }
      if (afterEnd > 0 && c.status === 'Active') {
        S.notify(`❓ ${c.type} window ended: ${c.title}. Confirm if maintenance is still running.`, 'warn');
        c.status = 'Expired'; S.update('ccb', c.id, { status: 'Expired' });
      }
    });

    // Weekly / Monthly report notifications
    const day = now.getDay();
    const date = now.getDate();
    const hours = now.getHours();
    if (day === 0 && hours >= 22 && !S.get('wk-sent-' + now.toISOString().slice(0, 10), false)) {
      S.notify('📈 Weekly Incident Report due tonight (Sunday night shift).', 'info');
    }
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (date === lastDay && hours >= 22 && !S.get('mo-sent-' + now.toISOString().slice(0, 7), false)) {
      S.notify('📈 Monthly Incident Report due tonight (month-end night shift).', 'info');
    }

    U.renderNotif();
  }

  // ---------- Initial notifications if empty ----------
  function primeNotifications() {
    if (S.get('notifications', []).length > 0) return;
    S.notify('Welcome to NMC Portal! Sample data is preloaded. Edit anything from the relevant pages.', 'info');
    S.notify('Tip: paste a ticket into the AI chatbox to auto-fill the form.', 'info');
  }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    seedIfEmpty();
    wireHeader();
    wireThemeToggle();
    primeNotifications();
    U.renderNotif();
    // Auto-pop the hover preview whenever a new notification is pushed.
    // The store fires a 'notify' bus event (see store.js); we mirror it to
    // a DOM CustomEvent for any other listeners and show the preview.
    window.NMC = window.NMC || {};
    window.NMC.bus = window.NMC.bus || {
      _h: {},
      on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); },
      emit(ev, payload) {
        (this._h[ev] || []).forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } });
        document.dispatchEvent(new CustomEvent('nmc:' + ev, { detail: payload }));
      }
    };
    window.NMC.bus.on('notify', () => {
      U.renderNotif();
      // Only auto-pop when the drawer is currently closed so we don't
      // fight the open state.
      const drawer = document.getElementById('drawer');
      if (drawer && !drawer.classList.contains('open')) {
        U.showHoverPreview(document.getElementById('openNotif'));
      }
    });
    setInterval(() => { checkReminders(); }, 60 * 1000);
    checkReminders();
    render();
  });
})();
