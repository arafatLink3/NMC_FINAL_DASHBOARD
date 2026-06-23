// pages/incidentLog.js — Master incident log with all columns
(function () {
  const S = window.NMCStore, U = window.NMCUI, AI = window.NMCAI;

  // -----------------------------------------------------------------------
  // SheetJS (xlsx) — lazy-loaded on first export. The CDN script tag is
  // injected once and the resulting Promise is memoised, so the page never
  // blocks on the network at load time and we never load the library twice.
  // -----------------------------------------------------------------------
  const SHEETJS_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  let _xlsxPromise = null;
  function loadSheetJS() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (_xlsxPromise) return _xlsxPromise;
    _xlsxPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SHEETJS_CDN;
      s.async = true;
      s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('SheetJS loaded but window.XLSX is missing')));
      s.onerror = () => reject(new Error('Failed to load SheetJS from CDN'));
      document.head.appendChild(s);
    });
    return _xlsxPromise;
  }

  // Map a row's currentStatus to a colour-coded CSS class. The status
  // strings come from AI.DropdownConfig.get('currentStatus') and are
  // matched case-insensitively. Values the spec calls out explicitly:
  //   - "Running" / "RCA Pending ticket" / status containing "running"  → yellow
  //   - "Non-ticket running" (and any "non-...running" variant)          → orange
  //   - "Non-Ticket solved" (and any "non-...solved" variant)            → ash
  //   - "RCA Pending" / "RCA Pending ticket"                            → dark sky blue
  //   - everything else (Solved, etc.)                                  → existing green
  // Yellow / orange / sky-blue / ash all work in both dark and light
  // modes because we pair a fixed colour token with a slightly darker
  // background tint for light mode (handled in the <style> block below).
  function statusClass(raw) {
    const s = String(raw || '').toLowerCase().trim();
    if (s === 'running') return 'st-yellow';
    if (/^non[- ]?ticket[- ]?solved|^non[- ]?.*solved/.test(s) || s === 'non-ticket solved') return 'st-ash';
    if (/^non[- ]?ticket[- ]?running|^non[- ]?.*running/.test(s) || s === 'non-ticket running') return 'st-orange';
    if (s === 'rca pending' || s === 'rca pending ticket' || /rca pending/.test(s)) return 'st-sky';
    return 'st-solved';
  }

  // Row-level class. The spec asks the *whole* row to be tinted by status
  // (not just the badge cell), so we map the status string to a class
  // that paints the full <tr>. A short default (no extra class) keeps
  // the table's own striped / hover styling intact.
  function rowClass(raw) {
    const s = String(raw || '').toLowerCase().trim();
    if (s === 'running') return 'st-row-yellow';
    if (/^non[- ]?ticket[- ]?solved|^non[- ]?.*solved/.test(s) || s === 'non-ticket solved') return 'st-row-ash';
    if (/^non[- ]?ticket[- ]?running|^non[- ]?.*running/.test(s) || s === 'non-ticket running') return 'st-row-orange';
    if (s === 'rca pending' || s === 'rca pending ticket' || /rca pending/.test(s)) return 'st-row-sky';
    return 'st-row-solved';
  }
  // Kept for the row-level "locked" tint, but no longer used to block
  // edits — every row should be editable regardless of status. The
  // helper is preserved so other callers (e.g. exporter filters) can
  // still tell solved rows apart from live ones.
  function isResolvedRow(r) {
    const s = String((r && r.currentStatus) || '').toLowerCase().trim();
    return s === 'solved';
  }

  // Column definitions — exactly 33 fields in the precise, non-negotiable
  // sequence from the spec. Fault Time / Restoration Time are split into a
  // date + a 24h time field so the duration can be auto-calculated even
  // when an incident crosses midnight or runs > 24 hours. `duration` and
  // `durationOver4h` are auto-derived and are not editable.
  const COLS = [
    { key: 'session', label: 'Session' },
    { key: 'sessionEngineers', label: 'Session Engineers' },
    { key: 'name', label: 'Engineer Name' },
    { key: 'date', label: 'Date' },
    { key: 'incidentName', label: 'Incident Name' },
    { key: 'incidentCategory', label: 'Incident Category' },
    { key: 'incidentSubCategory', label: 'Incident Sub-Category' },
    { key: 'zone', label: 'Zone' },
    { key: 'serviceImpacted', label: 'Service Impacted' },
    { key: 'impactedClient', label: 'Impacted Client' },
    { key: 'faultDate', label: 'Fault Date' },
    { key: 'faultTime', label: 'Fault Time' },
    { key: 'restorationDate', label: 'Restoration Date' },
    { key: 'restorationTime', label: 'Restoration Time' },
    { key: 'duration', label: 'Duration', auto: true },
    { key: 'durationOver4h', label: 'Duration > 4 hours', auto: true },
    { key: 'ticketId', label: 'Ticket ID' },
    { key: 'ticketType', label: 'Ticket Type' },
    { key: 'rootCause', label: 'Root Cause' },
    { key: 'rcaProvider', label: 'RCA Provider name' },
    { key: 'rcaProviderContact', label: 'Mobile Number' },
    { key: 'actionTaken', label: 'Action Taken' },
    { key: 'issueType', label: 'Issue Type' },
    { key: 'forwardDepartment', label: 'Forward Department' },
    { key: 'responsibleTeam', label: 'Responsible Team' },
    { key: 'informedPerson', label: 'Informed Person' },
    { key: 'informedTimeMedia', label: 'Informed Time and Media' },
    { key: 'ticketUpdateBy', label: 'Ticket Update By' },
    { key: 'whatsappNotified', label: 'Incident Notification to WhatsApp' },
    { key: 'mailGenerated', label: 'Mail Generated' },
    { key: 'queryMail', label: 'Query Mail' },
    { key: 'ttForMail', label: 'TT for Mail' },
    { key: 'currentStatus', label: 'Current Status' }
  ];

  // All 33 COLS are rendered in the main log table with their full-form
  // labels. The wrapper `.table-wrap` is allowed to scroll horizontally
  // (white-space:nowrap + min-width:max-content) so no text is clipped.
  const TABLE_COLS = COLS;

  // Fields the universal search bar scans with case-insensitive substring
  // matching. Scans every key from the 33-column spec.
  const SEARCH_FIELDS = COLS.map(c => c.key);

  // Build a list of 2-digit strings for a 0..n-1 range, padded to 2 chars.
  const paddedRange = (n) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push(String(i).padStart(2, '0'));
    return out;
  };
  const HOURS = paddedRange(24);   // '00'..'23'
  const MINUTES = paddedRange(60); // '00'..'59'

  // -----------------------------------------------------------------------
  // FIXED ENGINEER ROSTER
  // Per spec, the "Engineer Name" field in the incident editor is a fixed
  // dropdown — operators must pick from this list, not free-type. The
  // list is rendered exactly as supplied (trimmed, de-duplicated) and
  // any saved value that is no longer in the list is shown as a disabled
  // legacy option so the operator can see what used to be there but
  // must explicitly choose a current engineer before Save.
  // -----------------------------------------------------------------------
  const FIXED_ENGINEERS = [
    'Khaled',
    'Tariqul',
    'Peal',
    'Obayed',
    'Mihir',
    'Sabyasachi',
    'Jeba',
    'Simanta',
    'Arafat',
    'Ridoy',
    'Masum'
  ];

  // Split a stored 'HH:MM' or 'HH:MM:SS' value into { hh, mm } for the
  // dual-dropdown editor. Returns '' for both parts if the input is
  // missing/invalid so the dropdowns fall back to a blank initial
  // selection. We deliberately drop the seconds half — the dropdown
  // has minute resolution by spec — but combinedTime() below preserves
  // the original seconds when the user does not touch the pickers.
  const splitTime = (v) => {
    if (typeof v !== 'string') return { hh: '', mm: '' };
    const m = v.trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return { hh: '', mm: '' };
    return {
      hh: String(parseInt(m[1], 10) || 0).padStart(2, '0'),
      mm: String(parseInt(m[2], 10) || 0).padStart(2, '0')
    };
  };

  // Combine HH + MM dropdowns back into 'HH:MM'. If either half is blank,
  // returns '' (treat as unset) so the auto-calc and CSV stay consistent.
  const joinTime = (hh, mm) => (hh && mm ? hh + ':' + mm : '');

  // Module-scope helpers used by both the table cells (cellFor) and the
  // edit-row modal. They are defined at module scope (not inside
  // editRow()) because cellFor() also needs them, and previously this
  // raised a "durVal is not defined" ReferenceError at table render time.
  function splitTimeToISO(date, time) {
    if (!date) return null;
    return AI.parseTimeToISO(date, time);
  }
  // Recompute duration + the >4h flag for an arbitrary row context.
  // - In the table we pass the saved row fields.
  // - In the modal we pass the live input values.
  function durFromContext(ctx) {
    const a = splitTimeToISO(ctx.faultDate, ctx.faultTime);
    const b = splitTimeToISO(ctx.restorationDate, ctx.restorationTime);
    return AI.diffDuration(a, b);
  }
  function durVal() {
    // The current "context" is set by the caller right before reading the
    // cells. Default to an empty context (empty duration) so any stray
    // call doesn't throw.
    return _durCtx ? durFromContext(_durCtx) : '';
  }
  // Mutable holder for the row currently being rendered. Set by cellFor
  // at the top of each row mapping, and by recomputeDuration() inside
  // the modal. Keeping it as a module-level slot avoids re-plumbing a
  // parameter through every helper.
  let _durCtx = null;

  // Recompute the two auto-derived fields (Duration, Duration > 4 hours) for
  // an existing incident row. Used by the Excel exporter so legacy rows that
  // were saved before the auto-calc was added — or rows whose stored
  // duration has drifted from their fault/restoration timestamps — always
  // get exported with accurate, up-to-date values.
  function recomputeRow(r) {
    const fd = r.faultDate || r.date || '';
    const rd = r.restorationDate || r.date || '';
    const a = AI.parseTimeToISO(fd, r.faultTime);
    const b = AI.parseTimeToISO(rd, r.restorationTime);
    const d = AI.diffDuration(a, b);
    return {
      duration: d,
      durationOver4h: AI.durationOverThreshold(d, 4)
    };
  }

  function render() {
    const view = document.getElementById('view');
    const inc = S.list('incidents');
    const rosters = S.list('rosters');

    // Inject the theme-aware colour tokens exactly once per page mount.
    // We re-inject on every render() so the styles stay even if the view
    // is replaced; the browser dedupes by id so we just keep one node.
    if (!document.getElementById('nmc-status-palette')) {
      const style = document.createElement('style');
      style.id = 'nmc-status-palette';
      style.textContent = `
        .status.st-yellow { color:#f5b400; background:rgba(245,180,0,.18); border:1px solid rgba(245,180,0,.45); }
        .status.st-orange { color:#ff7a1a; background:rgba(255,122,26,.18); border:1px solid rgba(255,122,26,.5); }
        .status.st-ash    { color:#b8b8b8; background:rgba(160,160,160,.18); border:1px solid rgba(160,160,160,.45); }
        .status.st-sky    { color:#1e90ff; background:rgba(30,144,255,.18); border:1px solid rgba(30,144,255,.5); }
        .status.st-solved { color:var(--success); background:rgba(106,210,156,.18); border:1px solid rgba(106,210,156,.5); }
        body[data-theme="light"] .status.st-yellow { color:#8a6500; background:rgba(245,180,0,.28); }
        body[data-theme="light"] .status.st-orange { color:#a8420a; background:rgba(255,122,26,.28); }
        body[data-theme="light"] .status.st-ash    { color:#555;    background:rgba(160,160,160,.28); }
        body[data-theme="light"] .status.st-sky    { color:#0a5fb8; background:rgba(30,144,255,.28); }
        body[data-theme="light"] .status.st-solved { color:#1f7a4d; background:rgba(106,210,156,.32); }

        /* Row-level tints — paint the full <tr> so the whole row reads as
           a single status at a glance. Hover / striped styles from
           theme.css still take precedence on thead. */
        tr.st-row-yellow td { background-color: rgba(245,180,0,.12); }
        tr.st-row-orange td { background-color: rgba(255,122,26,.14); }
        tr.st-row-ash    td { background-color: rgba(160,160,160,.14); }
        tr.st-row-sky    td { background-color: rgba(30,144,255,.12); }
        tr.st-row-solved td { background-color: rgba(106,210,156,.14); }
        /* Click-to-edit affordance: every row is interactive, so paint the
           pointer cursor and a soft hover ring. A small ✎ in the last cell
           gives a visible "I can edit this" cue in addition to the row
           click. The pencil button shares the same click handler so
           keyboard / touch users have a clear target. */
        #i_table tbody tr[data-id] { cursor: pointer; }
        #i_table tbody tr[data-id]:hover td { background-color: rgba(120,180,255,.10); }
        body[data-theme="light"] #i_table tbody tr[data-id]:hover td { background-color: rgba(30,144,255,.10); }
        #i_table tbody tr[data-id] .row-edit-btn {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 8px; border-radius: 999px;
          background: var(--accent, #2c7be5); color: #fff;
          font-size: 11px; line-height: 1.6; border: 0;
          cursor: pointer; user-select: none;
        }
        #i_table tbody tr[data-id] .row-edit-btn:hover { filter: brightness(1.08); }
        body[data-theme="light"] tr.st-row-yellow td { background-color: rgba(245,180,0,.22); }
        body[data-theme="light"] tr.st-row-orange td { background-color: rgba(255,122,26,.22); }
        body[data-theme="light"] tr.st-row-ash    td { background-color: rgba(160,160,160,.22); }
        body[data-theme="light"] tr.st-row-sky    td { background-color: rgba(30,144,255,.22); }
        body[data-theme="light"] tr.st-row-solved td { background-color: rgba(106,210,156,.24); }
        /* (Legacy locked-row styles removed: every row is editable now.) */
      `;
      document.head.appendChild(style);
    }

    // Inline helpers for the filter bar's HH / MM dropdowns. The leading
    // blank <option value=""> lets the user clear a half without picking a
    // real value, which is what rangeBound() expects when computing the
    // inclusive default window (00:00 → 23:59).
    const hhOpts = (sel) => HOURS.map(h => `<option value="${h}"${h === sel ? ' selected' : ''}>${h}</option>`).join('');
    const mmOpts = (sel) => MINUTES.map(m => `<option value="${m}"${m === sel ? ' selected' : ''}>${m}</option>`).join('');

    view.innerHTML = `
      <div class="card">
        <div class="flex" style="flex-wrap:wrap;gap:8px;align-items:center">
          <h3 style="margin-right:auto">Incident Log</h3>
          <input id="i_q" placeholder="Search (Session, Engineer, BTS, TT, Zone, Status, Dept…)" style="max-width:280px" title="Substring search across all 33 fields" />
          <div class="flex" style="gap:4px;align-items:center" title="Filter from (start) date + HH:MM">
            <input id="i_from_date" type="date" title="Filter from date" />
            <select id="i_from_hh" title="Filter from hour (00-23)">
              <option value="">--</option>${hhOpts('00')}
            </select>
            <span style="font-weight:600">:</span>
            <select id="i_from_mm" title="Filter from minute (00-59)">
              <option value="">--</option>${mmOpts('00')}
            </select>
          </div>
          <div class="flex" style="gap:4px;align-items:center" title="Filter to (end) date + HH:MM">
            <input id="i_to_date" type="date" title="Filter to date" />
            <select id="i_to_hh" title="Filter to hour (00-23)">
              <option value="">--</option>${hhOpts('23')}
            </select>
            <span style="font-weight:600">:</span>
            <select id="i_to_mm" title="Filter to minute (00-59)">
              <option value="">--</option>${mmOpts('59')}
            </select>
          </div>
          <select id="i_status">
            <option value="">All status</option>
            ${AI.DropdownConfig.get('currentStatus').map(s => `<option>${U.escapeHtml(s)}</option>`).join('')}
          </select>
          <select id="i_dept">
            <option value="">All departments</option>
            ${AI.DropdownConfig.get('forwardDepartment').map(s => `<option>${U.escapeHtml(s)}</option>`).join('')}
          </select>
          <button class="btn ghost" id="i_export">Export Excel (.xlsx)</button>
          <button class="btn success" id="i_add">+ Manual entry</button>
        </div>
        <div class="muted" id="i_count" style="margin-top:6px">${inc.length} total incidents · Click a row to edit</div>
        <div class="table-wrap" style="margin-top:10px;max-height:560px;overflow:auto;white-space:nowrap">
          <table class="data" id="i_table" style="min-width:3600px;width:max-content">
            <thead><tr>
              ${TABLE_COLS.map(c => `<th>${U.escapeHtml(c.label)}</th>`).join('')}
              <th style="text-align:center;width:90px">Edit</th>
            </tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    const $ = (id) => document.getElementById(id);

    // Click handler (AC-6 / F-3.2): bind a single delegated click event
    // on the tbody. The handler is intentionally liberal — a click
    // anywhere inside a data row, OR on the inline "✎ Edit" button,
    // opens the same edit modal. This satisfies the user's "just tap
    // the row" requirement and also gives them a visible target for
    // cases where the row click is intercepted by something else.
    $('i_table').querySelector('tbody').addEventListener('click', (ev) => {
      const tr = ev.target.closest('tr[data-id]');
      if (!tr) return;
      // IMPORTANT: keep the id as a *string*. The store issues ids like
      // "incidents-lx2a-xyz" via uid(), not numeric ids. Coercing with
      // +turns that into NaN, which makes `if (id)` in the save flow
      // fall through to S.add() — every save would create a brand new
      // row instead of updating the existing one.
      const id = tr.dataset.id;
      // Re-fetch from the global data layer (the spec calls for
      // S.list('incidents') at click time) and find the matching record.
      // If the row was deleted between render and click, fall back to
      // the cached copy already in `inc` so the modal still opens with
      // a useful message instead of failing silently.
      const live = S.list('incidents').find(r => String(r.id) === String(id)) ||
                   inc.find(r => String(r.id) === String(id));
      if (window.NMC && window.NMC.bus) {
        // Diagnostic: lets the user (and us) see in the console that
        // the click landed. Silent no-op in production.
        try { window.NMC.bus.emit('incidentLog.rowClick', { id, hasLive: !!live }); } catch (_) {}
      }
      // Pass the live row object (not the id) so editRow() can use the
      // already-resolved record. This avoids another id-comparison pitfall
      // and keeps the modal consistent with the latest stored state.
      if (live) { editRow(live); return; }
      // Fallback: a row was clicked but we couldn't find the record in
      // the store (e.g. it was deleted from another tab). Open the modal
      // with a brand new blank record so the user can still add data
      // instead of getting a silent no-op.
      U.toast('Record not found — opening a new entry form.', 'info');
      editRow(null);
    });

    // Build an instant from the from/to date + HH/MM dropdown inputs. A
    // blank date half means the boundary is open on that side; a blank
    // hour/minute half falls back to 00:00 (from) or 23:59 (to) so the
    // user gets an inclusive day window by default. Returns null when the
    // date half is missing.
    function rangeBound(dateEl, hhEl, mmEl, isEnd) {
      const d = dateEl.value;
      if (!d) return null;
      const hh = hhEl && hhEl.value ? hhEl.value : '';
      const mm = mmEl && mmEl.value ? mmEl.value : '';
      let t;
      if (hh && mm) t = hh + ':' + mm;
      else t = isEnd ? '23:59' : '00:00';
      const ts = new Date(d + 'T' + t + ':00').getTime();
      return isNaN(ts) ? null : ts;
    }

    // Multi-field filter. Substring (case-insensitive) match is run against
    // every dimension in SEARCH_FIELDS (all 33 COLS keys), then
    // status/dept exact-match dropdowns, then the inclusive date + HH/MM
    // window. The window is compared against the row's fault instant
    // (faultDate + faultTime), falling back to the main `date` field when
    // either is missing.
    function filtered() {
      const q = $('i_q').value.toLowerCase().trim();
      const st = $('i_status').value;
      const dp = $('i_dept').value;
      const fromMs = rangeBound($('i_from_date'), $('i_from_hh'), $('i_from_mm'), false);
      const toMs   = rangeBound($('i_to_date'),   $('i_to_hh'),   $('i_to_mm'),   true);
      return inc.filter(i => {
        if (q) {
          const hit = SEARCH_FIELDS.some(k => {
            const v = i[k];
            return v != null && String(v).toLowerCase().includes(q);
          });
          if (!hit) return false;
        }
        if (st && i.currentStatus !== st) return false;
        if (dp && i.forwardDepartment !== dp) return false;
        if (fromMs != null || toMs != null) {
          const fd = i.faultDate || i.date || '';
          const ft = i.faultTime || '00:00';
          const rowMs = fd ? new Date(fd + 'T' + ft + ':00').getTime() : NaN;
          if (isNaN(rowMs)) return false;
          if (fromMs != null && rowMs < fromMs) return false;
          if (toMs   != null && rowMs > toMs)   return false;
        }
        return true;
      });
    }

    function cellFor(c, i) {
      // Expose the current row so durVal() / statusClass() can read it.
      _durCtx = {
        faultDate: i.faultDate || i.date || '',
        faultTime: i.faultTime || '',
        restorationDate: i.restorationDate || i.date || '',
        restorationTime: i.restorationTime || ''
      };
      const v = i[c.key];
      if (c.key === 'currentStatus') {
        return `<span class="status ${statusClass(v)}">${U.escapeHtml(v||'')}</span>`;
      }
      if (c.key === 'duration') {
        return `<span style="background:var(--bg);padding:2px 6px;border-radius:4px;display:inline-block">${U.escapeHtml(v||'')}${i.durationOver4h==='YES'?' ⚠':''}</span>`;
      }
      if (c.key === 'durationOver4h') {
        const over = AI.durationOverThreshold(durVal(), 4);
        return `<span class="status ${statusClass(over==='YES' ? 'RCA Pending' : 'Solved')}">${U.escapeHtml(v||'')}</span>`;
      }
      if (c.key === 'ticketId') {
        return `<code>${U.escapeHtml(v||'')}</code>`;
      }
      return U.escapeHtml(v == null ? '' : String(v));
    }

    function refresh() {
      const rows = filtered();
      const tb = document.querySelector('#i_table tbody');
      tb.innerHTML = rows.map(i => {
        // Status-tinted row class. The "locked" marker is no longer
        // applied — every row is editable. The trailing "✎ Edit" cell
        // is a visible affordance for the click-to-edit flow; clicking
        // it OR anywhere else on the row opens the same edit modal.
        const dataCells = TABLE_COLS.map(c => `<td>${cellFor(c, i)}</td>`).join('');
        const editCell = `<td style="text-align:center;white-space:nowrap">
          <button type="button" class="row-edit-btn" data-edit="${i.id}" title="Edit this record">✎ Edit</button>
        </td>`;
        return `<tr data-id="${i.id}" class="${rowClass(i.currentStatus)}" title="Click to edit this record">${dataCells}${editCell}</tr>`;
      }).join('') || `<tr><td colspan="${TABLE_COLS.length + 1}" class="muted" style="text-align:center;padding:20px">No matches</td></tr>`;
      const counter = $('i_count');
      if (counter) {
        counter.textContent = rows.length === inc.length
          ? `${inc.length} total incidents · Click a row to edit`
          : `${rows.length} of ${inc.length} incidents shown · Click a row to edit`;
      }
    }

    // Wire 'input' on the text search for live keystroke filtering, and
    // 'change' on the date pickers + HH/MM selects so every filter
    // mutation triggers an instant refresh of the table.
    ['i_q'].forEach(id => $(id).addEventListener('input', refresh));
    ['i_status','i_dept','i_from_date','i_from_hh','i_from_mm','i_to_date','i_to_hh','i_to_mm'].forEach(id => $(id).addEventListener('change', refresh));

    // Excel export. Maps the currently-filtered rows to a header-keyed
    // array (so each column heading is the human-readable COLS label) and
    // hands them to SheetJS for a real .xlsx download. Auto-derived fields
    // are recomputed from the row's fault/restoration timestamps so the
    // exported numbers are always consistent with the source data.
    $('i_export').addEventListener('click', async () => {
      const rows = filtered();
      try {
        const XLSX = await loadSheetJS();
        const headers = COLS.map(c => c.label);
        const data = rows.map(r => {
          const obj = {};
          const auto = recomputeRow(r);
          COLS.forEach(c => {
            let val;
            if (c.key === 'duration') val = auto.duration;
            else if (c.key === 'durationOver4h') val = auto.durationOver4h;
            else val = r[c.key];
            obj[c.label] = val == null ? '' : val;
          });
          return obj;
        });
        const ws = XLSX.utils.json_to_sheet(data, { header: headers });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Incident Log');
        XLSX.writeFile(wb, 'incident-log-' + new Date().toISOString().slice(0,10) + '.xlsx');
        U.toast('Exported ' + rows.length + ' rows to Excel', 'success');
      } catch (e) {
        U.toast('Export failed: ' + (e && e.message ? e.message : e), 'error');
      }
    });

    $('i_add').addEventListener('click', () => editRow(null));

    function editRow(idOrRow) {
      // editRow can be called with either a record id (legacy / "+ Manual
      // entry" path where id is null) or with a record object (row-click
      // path that already re-fetched the latest state from S.list).
      const isRowObj = idOrRow && typeof idOrRow === 'object' && !Array.isArray(idOrRow);
      const id = isRowObj ? idOrRow.id : idOrRow;
      const row = isRowObj ? idOrRow : (id ? inc.find(i => i.id === id) : {
        date: new Date().toISOString().slice(0,10), currentStatus: 'Running', ticketType: 'None',
        serviceImpacted: 'YES', informedTimeMedia: new Date().toLocaleString()
      });
      // Click-to-edit flow (AC-6 / F-3.2 in the original spec, plus the
      // follow-up clarification): tapping a row opens the modal with
      // every field directly editable. There is no separate read-only
      // "view" step and no Edit button to unlock the form — the user
      // just types the new value and clicks Save. The Save button then
      // hands off to the warning modal (see openOverwriteConfirmModal)
      // before the store is actually written.
      const startReadOnly = false;

      const rosterNames = (r) => {
        if (Array.isArray(r.engineers)) return r.engineers;
        if (typeof r.name === 'string' && r.name) return [r.name];
        return [];
      };
      const rowDate = row.date || new Date().toISOString().slice(0,10);
      const dayRoster = rosters.filter(r => r.date === rowDate);
      const liveEngineers = [];
      const liveShifts = [];
      dayRoster.forEach(r => {
        if (r.shift && liveShifts.indexOf(r.shift) < 0) liveShifts.push(r.shift);
        rosterNames(r).forEach(en => {
          if (en && liveEngineers.indexOf(en) < 0) liveEngineers.push(en);
        });
      });
      const selSession = row.session;
      if (selSession) {
        dayRoster.filter(r => r.shift === selSession).forEach(r => {
          rosterNames(r).forEach(en => {
            if (en && liveEngineers.indexOf(en) < 0) liveEngineers.push(en);
          });
        });
      }
      function merged(key) {
        const base = AI.DropdownConfig.get(key) || [];
        if (key === 'session') return liveShifts.concat(base).filter((v, i, a) => v && a.indexOf(v) === i);
        if (key === 'sessionEngineers' || key === 'name') {
          return liveEngineers.concat(base).filter((v, i, a) => v && a.indexOf(v) === i);
        }
        return base;
      }

      const e = (k) => document.getElementById('e_' + k);

      // -------------------------------------------------------------------
      // Editable synced fields (Create/Close-sourced)
      // -------------------------------------------------------------------
      // For an EXISTING row (id truthy), the fields below were originally
      // populated by the Create Ticket / Close Ticket flows. We do NOT
      // lock them — the operator can edit them here in Edit and Save
      // just like any other field. The row snapshot is still the base
      // for the Save merge (see Save handler), so if a synced input is
      // empty for any reason the original value survives, but as soon
      // as the operator types something that value is what gets saved.
      // AUTO_FIELDS (duration / durationOver4h) are the only fields the
      // form doesn't write — they are always recomputed from the
      // timestamps on Save.
      const AUTO_FIELDS = new Set(['duration', 'durationOver4h']);

      // Special renderer for Fault Time / Restoration Time — two side-by-side
      // HH and MM dropdowns separated by a colon. The e_<key>_hh /
      // e_<key>_mm ids are read on save and re-combined into a single
      // 'HH:MM' string for storage.
      //
      // Both selects are stamped with `data-pristine="1"` on render. As
      // soon as the operator changes either one, the flag is cleared so
      // combinedTime() knows to use the freshly-picked HH:MM instead of
      // the original stored value. This is what stops Save from silently
      // re-writing a row's seconds back to ":00" when the user did not
      // touch the time pickers.
      function renderSplitTimeField(c) {
        const v = row[c.key] != null ? row[c.key] : '';
        const { hh, mm } = splitTime(v);
        const optsHtml = (vals, sel) => vals.map(o =>
          `<option value="${o}"${o === sel ? ' selected' : ''}>${o}</option>`
        ).join('');
        return `<div class="col-6"><label>${c.label}</label>
          <div class="flex" style="gap:4px;align-items:center">
            <select id="e_${c.key}_hh" data-pristine="1" style="flex:1" title="Hours (00-23)">${optsHtml(HOURS, hh)}</select>
            <span style="font-weight:600">:</span>
            <select id="e_${c.key}_mm" data-pristine="1" style="flex:1" title="Minutes (00-59)">${optsHtml(MINUTES, mm)}</select>
          </div>
        </div>`;
      }

      // Read the two HH/MM dropdowns for `c` (faultTime / restorationTime)
      // and turn them back into a time string.
      //
      // IMPORTANT — preserve the original seconds when the operator did
      // not touch the dropdowns. The dropdowns only have minute
      // resolution, so if the stored value was e.g. "14:30:45" we cannot
      // faithfully round-trip it through `hh`+`mm`. The fix is:
      //   1. Stamp each hh/mm <select> with a `data-pristine` flag on
      //      initial render (see renderSplitTimeField).
      //   2. Mark the flag as soon as the user changes either select.
      //   3. When pristine, return the original stored value verbatim
      //      (including any `:SS` part) so Save does not silently
      //      downgrade the row's time precision.
      // When the user HAS picked a new value, we build a fresh
      // 'HH:MM' string and let the Save handler normalise it to
      // 'HH:MM:00'.
      function combinedTime(c) {
        const hhEl = e(c + '_hh'), mmEl = e(c + '_mm');
        if (!hhEl || !mmEl) return row[c] || '';
        // Untouched by the user → keep the original seconds.
        if (hhEl.dataset.pristine === '1' && mmEl.dataset.pristine === '1') {
          return row[c] || '';
        }
        const hh = hhEl.value, mm = mmEl.value;
        return joinTime(hh, mm) || row[c] || '';
      }
      function durFromRow() {
        const ft = combinedTime('faultTime');
        const rt = combinedTime('restorationTime');
        const fd = e('faultDate') ? e('faultDate').value : (row.faultDate || row.date);
        const rd = e('restorationDate') ? e('restorationDate').value : (row.restorationDate || row.date);
        return durFromContext({
          faultDate: fd,
          faultTime: ft,
          restorationDate: rd,
          restorationTime: rt
        });
      }
      function durVal() { return durFromRow(); }

      function renderField(c) {
        const v = row[c.key] != null ? row[c.key] : '';

        // ---- Engineer Name: fixed dropdown, no free text ---------------
        // Per spec, the operator must pick from FIXED_ENGINEERS. The
        // dropdown is rendered with the saved value `selected` when it
        // is still in the list. A legacy saved value that has since
        // been removed is shown as a disabled option (clearly marked
        // "legacy") so the operator can see what used to be there but
        // must explicitly pick a current engineer to satisfy the
        // "fixed-value dropdown" requirement.
        if (c.key === 'name') {
          const inList = FIXED_ENGINEERS.indexOf(String(v)) >= 0;
          const optsHtml = FIXED_ENGINEERS.map(o =>
            `<option${o === v ? ' selected' : ''}>${U.escapeHtml(o)}</option>`
          ).join('');
          const legacyOpt = (!inList && v)
            ? `<option value="" disabled selected>— legacy: ${U.escapeHtml(String(v))} —</option>`
            : '';
          return `<div class="col-6"><label>${c.label}</label>
            <select id="e_${c.key}" data-fixed-engineer="1" style="flex:1"
                    title="Engineer name is a fixed dropdown">${legacyOpt}${optsHtml}</select>
          </div>`;
        }

        // ---- Ticket Update By: fixed dropdown, live-mirrored from
        // Engineer Name. Per spec, this field tracks the Engineer
        // Name — the operator never edits it directly, but it is
        // rendered as a <select> so the saved value is visible and
        // round-trips cleanly. The change listener below copies
        // Engineer Name into this select on every pick.
        if (c.key === 'ticketUpdateBy') {
          // Seed with the saved value when it's still in the engineer
          // list; otherwise default to the current Engineer Name so the
          // row opens with a sensible value.
          const engName = String(row.name || '');
          const seed = FIXED_ENGINEERS.indexOf(String(v)) >= 0
            ? v
            : (FIXED_ENGINEERS.indexOf(engName) >= 0 ? engName : '');
          const inList = FIXED_ENGINEERS.indexOf(String(seed)) >= 0;
          const optsHtml = FIXED_ENGINEERS.map(o =>
            `<option${o === seed ? ' selected' : ''}>${U.escapeHtml(o)}</option>`
          ).join('');
          const legacyOpt = (!inList && v)
            ? `<option value="" disabled selected>— legacy: ${U.escapeHtml(String(v))} —</option>`
            : '';
          return `<div class="col-6"><label>${c.label}</label>
            <select id="e_${c.key}" data-fixed-engineer="1" data-mirror-of="name" style="flex:1"
                    title="Same as Engineer Name (auto-mirrored)">${legacyOpt}${optsHtml}</select>
          </div>`;
        }

        // ---- Mail Generated: fixed dropdown, live-mirrored from Engineer
        // Name. Per the latest spec, Mail Generated is the same value
        // as Engineer Name — the operator can also pick it directly
        // (so the same dropdown is rendered), but the Engineer Name
        // change handler will overwrite this select's value as soon as
        // the operator picks a different engineer.
        if (c.key === 'mailGenerated') {
          // Default to the saved Mail Generated value when it's still
          // in the list; otherwise default to the Engineer's value.
          // Engineer Name is intentionally unchanged; this dropdown
          // adds "Not Required" as a mail-only escape hatch.
          const MAIL_FIXED = FIXED_ENGINEERS.concat(['Not Required']);
          const seedRaw = String(v);
          const seedInMail = MAIL_FIXED.indexOf(seedRaw) >= 0;
          const seed = seedInMail
            ? seedRaw
            : (FIXED_ENGINEERS.indexOf(String(row.name)) >= 0 ? row.name : 'Not Required');
          const seedFixed = MAIL_FIXED.indexOf(String(seed)) >= 0;
          const optsHtml = MAIL_FIXED.map(o =>
            `<option${o === seed ? ' selected' : ''}>${U.escapeHtml(o)}</option>`
          ).join('');
          const legacyOpt = (!seedFixed && v)
            ? `<option value="" disabled selected>— legacy: ${U.escapeHtml(String(v))} —</option>`
            : '';
          return `<div class="col-6"><label>${c.label}</label>
            <select id="e_${c.key}" data-fixed-engineer="1" style="flex:1"
                    title="Same as Engineer Name (auto-mirrored)">${legacyOpt}${optsHtml}</select>
          </div>`;
        }

        // Synced fields (originally populated by Create/Close Ticket) are
        // intentionally NOT locked — the operator can edit them here just
        // like any other field. The row snapshot still pre-populates the
        // input value, and the Save handler merges `manual` on top of the
        // snapshot, so what the operator types is what gets saved. If a
        // synced input is left untouched the pre-populated snapshot value
        // is what gets written, which is what we want.
        if (c.auto) {
          if (c.key === 'durationOver4h') {
            return `<div class="col-6"><label>${c.label}</label>
              <div class="flex" style="gap:6px;align-items:center">
                <span id="e_${c.key}_badge" class="status ${statusClass(durVal()=='' ? '' : AI.durationOverThreshold(durVal(), 4) === 'YES' ? 'RCA Pending' : 'Solved')}">${U.escapeHtml(AI.durationOverThreshold(durVal(), 4))}</span>
                <span class="muted" style="font-size:11px">auto-derived from Duration &gt; 4h</span>
              </div></div>`;
          }
          return `<div class="col-6"><label>${c.label}</label>
            <input id="e_${c.key}" class="auto-calc" value="${U.escapeHtml(String(v || ''))}" readonly
              style="background:var(--bg);color:var(--text);border:1px solid var(--border);cursor:default"
              title="Auto-calculated from Fault and Restoration date+time" /></div>`;
        }
        if (c.key === 'faultTime' || c.key === 'restorationTime') {
          return renderSplitTimeField(c);
        }
        if (c.key === 'date' || c.key === 'faultDate' || c.key === 'restorationDate') {
          return `<div class="col-6"><label>${c.label}</label>
            <input type="date" id="e_${c.key}" value="${U.escapeHtml(String(v))}" /></div>`;
        }
        const opts = merged(c.key);
        if (opts && opts.length) {
          // Mark the snapshot's value `selected` so the dropdown
          // pre-populates with the saved option on render. Without this
          // the browser would default to the first option, and an
          // untouched field would silently change to the first option on
          // Save. The blankOpt is only needed for legacy rows whose
          // saved value is no longer in the options list.
          const optsHtml = opts.map(o =>
            `<option${o === v ? ' selected' : ''}>${U.escapeHtml(o)}</option>`
          ).join('');
          const blankOpt = v && opts.indexOf(v) < 0
            ? `<option selected>${U.escapeHtml(String(v))}</option>`
            : '';
          const newPh = '+ new';
          return `<div class="col-6"><label>${c.label}</label>
            <div class="flex" style="gap:4px">
              <select id="e_${c.key}" style="flex:1">${blankOpt}${optsHtml}</select>
              <input class="e-newopt" data-key="${c.key}" placeholder="${newPh}" style="max-width:120px" title="Add a new option for this field and select it" />
            </div>
          </div>`;
        }
        return `<div class="col-6"><label>${c.label}</label><input id="e_${c.key}" value="${U.escapeHtml(String(v))}" /></div>`;
      }

      // Build the modal footer. Click-to-edit flow: every row opens with
      // the same editable footer. Delete was removed at user request —
      // operators can no longer remove a record from the Edit dialog.
      // The footer is now [Cancel] [Save] for both new and existing rows.
      function buildFooter() {
        return `<div class="flex" style="margin-top:10px;justify-content:flex-end;gap:6px">
          <button class="btn ghost" id="e_cancel">Cancel</button>
          <button class="btn success" id="e_save">Save</button>
        </div>`;
      }

      // Build the modal HTML.
      const html = `
        <h3>${id ? 'Edit Incident' : 'New Incident'}</h3>
        <div class="row" id="e_form_body" style="max-height:450px;overflow-y:auto;padding-right:8px">
          ${COLS.map(renderField).join('')}
        </div>
        ${buildFooter()}`;
      U.openModal(html);

      // -------------------------------------------------------------------
      // S-7 / F-3.4 — Structural invariant: if the operator changes
      // "Service Impacted" away from "YES", we must:
      //   1. Force "Impacted Client" to "NO" (it can no longer be YES
      //      because no service is impacted).
      //   2. Lock the "Impacted Client" field in a read-only state so the
      //      invariant is visually enforced.
      // The inverse path (setting Service Impacted back to YES) re-enables
      // the field and leaves whatever value the operator selects in place.
      // The same rule fires on initial render in case the row was saved
      // with an inconsistent pair (e.g. serviceImpacted = NO but
      // impactedClient = YES) — we always normalise to NO when service
      // is not impacted.
      // -------------------------------------------------------------------
      const svcEl   = e('serviceImpacted');
      const impEl   = e('impactedClient');
      function applyServiceImpactedLock() {
        if (!svcEl || !impEl) return;
        const isYes = String(svcEl.value || '').toUpperCase() === 'YES';
        if (!isYes) {
          // Force the dependent value to NO and lock the field. The
          // disabled attribute also greys it out via theme.css.
          if (String(impEl.value || '').toUpperCase() !== 'NO') impEl.value = 'NO';
          impEl.setAttribute('readonly', 'readonly');
          impEl.setAttribute('aria-readonly', 'true');
          impEl.style.pointerEvents = 'none';
          impEl.style.opacity = '0.7';
          impEl.title = 'Locked: Service Impacted is not YES, so Impacted Client is forced to NO';
        } else {
          // Service is impacted again — release the lock so the operator
          // can pick any value (YES/NO/...) for Impacted Client.
          impEl.removeAttribute('readonly');
          impEl.removeAttribute('aria-readonly');
          impEl.style.pointerEvents = '';
          impEl.style.opacity = '';
          impEl.title = '';
        }
      }
      if (svcEl) svcEl.addEventListener('change', applyServiceImpactedLock);
      // Normalise on initial open so any pre-existing inconsistent row
      // is locked immediately when the modal appears.
      applyServiceImpactedLock();

      // ---------------------------------------------------------------
      // Pristine-flag handlers for the HH / MM time pickers.
      // When the operator changes either half we flip data-pristine to
      // '0' on BOTH halves, so combinedTime() treats the pair as a
      // user-supplied value and rebuilds the time string. Until then
      // the original stored value is preserved verbatim (with its
      // seconds), which stops Edit-Save from silently re-writing the
      // row's time precision.
      // ---------------------------------------------------------------
      ['faultTime', 'restorationTime'].forEach(k => {
        const hhEl = e(k + '_hh'), mmEl = e(k + '_mm');
        if (!hhEl || !mmEl) return;
        const markDirty = () => { hhEl.dataset.pristine = '0'; mmEl.dataset.pristine = '0'; };
        hhEl.addEventListener('change', markDirty);
        mmEl.addEventListener('change', markDirty);
      });

      // ---------------------------------------------------------------
      // Inline "+ new" option handler. The Edit modal renders a small
      // text input next to every dropdown that lets the operator add
      // a new option without leaving the form. Until now the input
      // was rendered but never wired, so typing a value and pressing
      // Enter did nothing — the Settings page's Dropdown Manager
      // (the OTHER way to add options) did work, which is why
      // admins saw the new option appear there but never in the
      // incident modal. This handler:
      //   1. Persists the new value to NMCStore.dropdownOptions[key]
      //      so it survives page reloads and is visible to the
      //      Settings page's Dropdown Manager.
      //   2. Appends a new <option> to the corresponding <select>
      //      in place and selects it, so the operator sees their
      //      value picked immediately.
      //   3. Does NOT touch `name` / `mailGenerated` — those are
      //      FIXED_ENGINEERS-rendered and intentionally closed.
      // ---------------------------------------------------------------
      document.querySelectorAll('#e_form_body .e-newopt').forEach(inp => {
        const k = inp.dataset.key;
        const sel = e(k);
        if (!sel) return;
        const apply = (raw) => {
          const v = (raw || '').trim();
          if (!v) return false;
          // Persist into the global dropdownOptions map. The first run
          // // copy lives in NMCStore; subsequent reads/writes should
          // // layer on top of it so we don't accidentally wipe
          // // user-configured sibling fields.
          const all = JSON.parse(JSON.stringify(
            S.get('dropdownOptions', null) || AI.DropdownConfig.defaults
          ));
          const arr = Array.isArray(all[k]) ? all[k].slice() : [];
          if (arr.indexOf(v) < 0) arr.push(v);
          all[k] = arr;
          S.set('dropdownOptions', all);
          // Reflect in the live <select>. Match by value, not text,
          // because some saved rows (and some new entries) use the
          // same display text but might have surrounding whitespace
          // we already trimmed.
          let exists = false;
          for (let i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value === v) { exists = true; sel.selectedIndex = i; break; }
          }
          if (!exists) {
            const opt = document.createElement('option');
            opt.value = v; opt.textContent = v;
            sel.appendChild(opt);
            sel.value = v;
          }
          return true;
        };
        inp.addEventListener('keydown', ev => {
          if (ev.key === 'Enter') { ev.preventDefault(); if (apply(inp.value)) inp.value = ''; }
        });
        // Some templates also render an "Add" button next to the
        // input; click it to commit. The button is matched by
        // [data-key] so a single delegated handler can cover both
        // the text input and the button.
        const btn = document.querySelector('#e_form_body .dd-addbtn[data-key="' + k + '"]');
        if (btn) btn.addEventListener('click', () => { if (apply(inp.value)) inp.value = ''; });
      });

      // ---------------------------------------------------------------
      // Live-mirror: Mail Generated must always equal Engineer Name.
      // Both fields are fixed <select>s from FIXED_ENGINEERS, but the
      // operator only ever needs to change the Engineer Name — the
      // Mail Generated select is auto-synced on every change. The
      // legacy placeholder (e.g. a previously-typed engineer that is
      // no longer in the list) is signalled by an empty .value and a
      // disabled selectedIndex, so the listener treats it as "no
      // sync" and leaves the mail select at its pre-populated value.
      // ---------------------------------------------------------------
      (function mirrorEngineerToMail() {
        const eng  = e('name');
        const mail = e('mailGenerated');
        if (!eng || !mail) return;
        const sync = () => {
          // Don't mirror the legacy placeholder — the operator must
          // explicitly pick a current engineer first, at which point
          // this listener will re-fire and copy the real value across.
          const opt = eng.options[eng.selectedIndex];
          if (!opt || opt.disabled) return;
          // Don't clobber an explicit "Not Required" pick on the
          // mail side. The mirror only fires when the operator
          // changes the Engineer Name AND the mail field is still
          // tracking that engineer's name (or is empty/legacy).
          const cur = mail.value;
          if (cur === 'Not Required') return;
          mail.value = eng.value;
        };
        // Initial sync handles any drift between the two saved fields.
        sync();
        // Subsequent picks always overwrite Mail Generated, unless
        // the operator has explicitly set it to "Not Required".
        eng.addEventListener('change', sync);
      })();

      // ---------------------------------------------------------------
      // Generic "follow Engineer Name" mirror: every <select> with
      // data-mirror-of="name" (e.g. Ticket Update By) is auto-synced
      // from the Engineer Name value on every pick. Runs once on open
      // and on every `change` event. Fields that are intentionally
      // decoupled from the engineer (e.g. Mail Generated when set to
      // "Not Required") are NOT marked with data-mirror-of, so this
      // block is a no-op for them.
      // ---------------------------------------------------------------
      (function mirrorEngineerToFollowers() {
        const eng = e('name');
        if (!eng) return;
        const followers = document.querySelectorAll(
          '#e_form_body [data-mirror-of="name"]'
        );
        if (!followers.length) return;
        const sync = () => {
          const opt = eng.options[eng.selectedIndex];
          if (!opt || opt.disabled) return;
          followers.forEach(sel => { sel.value = eng.value; });
        };
        sync();
        eng.addEventListener('change', sync);
      })();

      // ---- View / Edit / Save / Cancel wiring ---------------------------
      // (Delete was removed at user request; the modal footer no longer
      // exposes a per-row Delete button. The form's only exits are
      // Cancel and Save.)
      //
      // Track the live "dirty" snapshot so Cancel can restore the original
      // row values if the user opens the form, presses Edit, types, and
      // then changes their mind.
      const originalSnapshot = id ? JSON.parse(JSON.stringify(row)) : null;

      // (setReadOnly was removed: the click-to-edit flow keeps every
      // input/select enabled from the moment the modal opens, so there
      // is no longer a "lock then unlock" toggle to perform.)

      // The legacy "rebuild footer" path was used by the old view-then-edit
      // flow. Now that every row opens directly editable, the footer is
      // produced once by buildFooter() and never needs to be swapped. We
      // keep a no-op stub in case any future caller still references it.
      function rebuildFooter() {
        /* no-op: footer is now produced once by buildFooter() */
      }

      function wireFooterButtons() {
        const cancelBtn = document.getElementById('e_cancel');
        const saveBtn = document.getElementById('e_save');
        if (cancelBtn) cancelBtn.addEventListener('click', () => {
          // Cancel / Close = dismiss the modal without writing anything.
          U.closeModal();
        });
        if (saveBtn) saveBtn.addEventListener('click', () => {
          // No "locked" guard — any row can be saved. The resolved-row
          // check that used to silently close the modal is removed.
          //
          // Build the manual-edit payload from the form. For each COLS
          // entry we read the form input's .value — every field is
          // editable, including the ones that were originally populated
          // by Create/Close Ticket. The form is the source of truth.
          // The only fields we skip are AUTO_FIELDS (duration /
          // durationOver4h) — those are always recomputed from the
          // timestamps below.
          const manual = {};
          COLS.forEach(c => {
            if (AUTO_FIELDS.has(c.key)) return;                 // never read auto fields from the form
            if (c.key === 'faultTime' || c.key === 'restorationTime') {
              manual[c.key] = combinedTime(c.key);
              return;
            }
            const el = e(c.key);
            manual[c.key] = el ? el.value : '';
          });
          if (!manual.faultDate) manual.faultDate = manual.date || rowDate;
          if (!manual.restorationDate) manual.restorationDate = manual.date || rowDate;
          // S-6 / NFR-5: normalise 24h time pickers down to seconds.
          // The pickers return 'HH:MM' — the rest of the platform
          // (export, AI.parseTimeToISO, etc.) wants 'HH:MM:SS' for
          // unambiguous timestamp comparison, so we append ':00' here.
          // We do this for *every* submission (new + update) so the
          // store never holds a half-second string.
          ['faultTime', 'restorationTime'].forEach(k => {
            const v = manual[k];
            if (v && /^\d{1,2}:\d{2}$/.test(v)) manual[k] = v + ':00';
          });

          // ---- THE CORE FIX (Requirement #3) --------------------------
          // Merge the row snapshot with the manual edits using the
          // spread operator. The snapshot is the BASE (preserves every
          // synchronised / auto / previously-saved field), and the
          // manual edits are overlaid on top. The result `obj` is the
          // authoritative record to persist — no field that was in the
          // row snapshot can be wiped by an empty/missing form input.
          //
          //   obj = { ...row, ...manual, ...timestampReconciliation }
          //
          // The timestamp-reconciliation block then forces the four
          // auto/timestamp fields to their freshly-computed values so
          // duration is always internally consistent with the saved
          // fault/restoration timestamps.
          // -------------------------------------------------------------
          const a = AI.parseTimeToISO(manual.faultDate, manual.faultTime);
          const b = AI.parseTimeToISO(manual.restorationDate, manual.restorationTime);
          const computedDuration = AI.diffDuration(a, b);
          const computedOver4h   = AI.durationOverThreshold(computedDuration, 4);

          // Choose the base snapshot:
          //  - Editing an existing row: use the in-memory `row` (which
          //    is the freshest copy S.list returned at modal open).
          //  - Creating a new row: there is no prior state, so use an
          //    empty object — the manual edits supply everything.
          const baseSnapshot = id ? row : {};

          const obj = Object.assign(
            {},
            baseSnapshot,                                     // 1) preserve every existing field
            manual,                                           // 2) overlay only manually-edited fields
            {
              // 3) re-derive auto fields from the freshly-normalised
              //    timestamps so duration is always consistent. The
              //    .auto-calc inputs in the modal may have been stale.
              duration: computedDuration,
              durationOver4h: computedOver4h
            }
          );
          if (!obj.zone) obj.zone = AI.inferZone(obj.incidentName) || '';

          // F-3.5 / Formatted warning: for *existing* records the spec
          // mandates an explicit confirm step ("You are about to modify
          // a saved incident record…"). New records skip the prompt and
          // persist immediately — the prompt is a guard against
          // overwriting data, not a friction point for first-time entry.
          if (id) {
            openOverwriteConfirmModal(id, obj);
            return;
          }
          S.add('incidents', obj);
          U.closeModal();
          U.toast('Saved', 'success');
          // Re-render the master table with the existing filter state
          // still in place (refresh() re-reads the filter inputs from
          // the DOM, so active search / date-range selections survive).
          render();
        });
      }

      // -------------------------------------------------------------------
      // Formatted warning modal (F-3.5 + AC for the Save interception).
      // Opens a NMCUI modal with the spec-mandated warning copy and two
      // actions: "Confirm Changes" (persists + recomputes) and "Cancel"
      // (dismisses without writing). The function is defined inside
      // editRow() so it can close over the in-flight `obj` payload and
      // the `id` of the record being updated.
      // -------------------------------------------------------------------
      function openOverwriteConfirmModal(recordId, payload) {
        // Render a compact, accessible warning dialog inside the same
        // #modal element that NMCUI.openModal() manages. The dialog
        // uses the same colour tokens / typography as the rest of the
        // app (no bespoke CSS) and a single-row footer with two
        // buttons styled per theme.
        const ticketLabel = payload.ticketId || row.ticketId || '(no ticket id)';
        const btsLabel = payload.incidentName || row.incidentName || '(no incident name)';
        const dialogHtml = `
          <h3 style="color:var(--warn,#f5b400);display:flex;align-items:center;gap:8px">
            <span aria-hidden="true">⚠️</span> Confirm record overwrite
          </h3>
          <div class="card" style="border:1px solid var(--warn,#f5b400);background:rgba(245,180,0,.08);margin:8px 0 12px">
            <strong>Warning: You are about to modify a saved incident record.</strong><br/>
            Confirming this action will overwrite the data store values.
          </div>
          <div class="muted" style="margin-bottom:10px;line-height:1.5">
            <div><strong>Record:</strong> ${U.escapeHtml(String(ticketLabel))} — ${U.escapeHtml(String(btsLabel))}</div>
            <div><strong>ID:</strong> <code>${U.escapeHtml(String(recordId))}</code></div>
            <div><strong>Duration (auto-recompute):</strong> ${U.escapeHtml(String(payload.duration || ''))} · &gt;4h = ${U.escapeHtml(String(payload.durationOver4h || ''))}</div>
          </div>
          <div class="flex" style="justify-content:flex-end;gap:6px;margin-top:10px">
            <button class="btn ghost"   id="ow_cancel">Cancel</button>
            <button class="btn danger"  id="ow_confirm">Confirm Changes</button>
          </div>
        `;
        U.openModal(dialogHtml);

        const confirmBtn = document.getElementById('ow_confirm');
        const cancelBtn  = document.getElementById('ow_cancel');

        // Cancel = dismiss the warning without touching the store; the
        // user is returned to the edit form so they can revise values.
        if (cancelBtn) cancelBtn.addEventListener('click', () => {
          U.closeModal();
          U.toast('Save cancelled — no changes written.', 'info');
        });

        // Confirm = recompute (already done in caller, but we re-run to
        // honour "automatically trigger duration recomputations
        // (AI.diffDuration) via store hooks or immediately before
        // updating"), persist via the public data seam, notify the
        // shell, and force a re-render of the master table.
        if (confirmBtn) confirmBtn.addEventListener('click', () => {
          try {
            // Re-run duration / >4h recompute right before the write so
            // the store always lands with values that match the latest
            // fault/restoration timestamps — matches the spec wording
            // "immediately before updating".
            const a2 = AI.parseTimeToISO(payload.faultDate, payload.faultTime);
            const b2 = AI.parseTimeToISO(payload.restorationDate, payload.restorationTime);
            payload.duration = AI.diffDuration(a2, b2);
            payload.durationOver4h = AI.durationOverThreshold(payload.duration, 4);

            // F-3.5: public data seam — update the record in the store.
            // The store does a strict x.id === id match, so we make sure
            // the recordId we hand it is a string — store.ids are issued
            // by uid() and look like "incidents-lx2a-xyz", never numbers.
            const updated = S.update('incidents', String(recordId), payload);
            if (!updated) {
              // The store couldn't find a matching record (e.g. it was
              // deleted in another tab between open and confirm). Tell
              // the user and fall through to add() so the data isn't
              // silently lost.
              U.toast('Original record no longer exists — adding as new entry.', 'warn');
              S.add('incidents', payload);
              U.closeModal();
              render();
              return;
            }

            // Notify the application shell that the underlying data
            // layer has changed. S.notify is the public notify seam
            // on the store; we use it both to push a toast into the
            // notification drawer and to emit on NMC.bus for any
            // subscribers (charts, dashboards, etc.).
            S.notify('Incident record ' + (updated && updated.ticketId ? updated.ticketId : recordId) + ' updated.', 'success');

            // Force an immediate re-render of the master filter table
            // with the *active* search / date / status / department
            // filter inputs still in the DOM — refresh() inside
            // render() re-reads those input values, so the user's
            // current view is preserved across the update.
            U.closeModal();
            render();
          } catch (err) {
            // Surface the failure inside the warning dialog so the
            // operator doesn't lose context.
            U.toast('Update failed: ' + (err && err.message ? err.message : err), 'error');
            console.error('incident overwrite failed', err);
          }
        });
      }

      wireFooterButtons();
    }

    refresh();
  }

  window.NMCPages = window.NMCPages || {};
  window.NMCPages.incidentLog = render;
})();
