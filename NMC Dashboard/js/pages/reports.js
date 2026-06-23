// pages/reports.js — Weekly (Sunday) and Monthly report builder
(function () {
  const S = window.NMCStore, U = window.NMCUI;

  // =========================================================================
  // Weekly Excel Report helpers
  // -------------------------------------------------------------------------
  // The exported workbook follows a strict 21-column contract. Anything that
  // is not in COLUMN_ORDER is stripped from the row so the sheet can never
  // accidentally leak internal fields (engineer, session id, etc.).
  // =========================================================================

  // Final column order for the Excel sheet (header text → source key).
  // `rcaProviderContact` is the mobile-number field on the incident record;
  // we combine it with `rcaProvider` into a single "name - mobile" cell.
  const COLUMN_ORDER = [
    ['Incident Name',                'incidentName'],
    ['Incident Category',            'incidentCategory'],
    ['Incident Sub-Category',        'incidentSubCategory'],
    ['Zone',                         'zone'],
    ['Service Impacted',             'serviceImpacted'],
    ['Impacted Client',              'impactedClient'],
    ['Fault Time',                   'faultTime'],
    ['Restoration Time',             'restorationTime'],
    ['Duration',                     'duration'],
    ['> 4 hours Duration',           'durationOver4h'],
    ['Ticket ID',                    'ticketId'],
    ['Ticket Type',                  'ticketType'],
    ['Root Cause',                   'rootCause'],
    ['RCA Provider name & mobile number', '__rcaCombined'],
    ['Action Taken',                 'actionTaken'],
    ['Issue Type',                   'issueType'],
    ['Forward Department',           'forwardDepartment'],
    ['Responsible Team',             'responsibleTeam'],
    ['Query Mail',                   'queryMail'],
    ['TT for Mail',                  'ttForMail'],
    ['Current Status',               'currentStatus'],
  ];

  // -----------------------------------------------------------------------
  // dayWithSuffix — add English ordinal suffix ('st' / 'nd' / 'rd' / 'th').
  // Example: dayWithSuffix(1) === '1st', dayWithSuffix(22) === '22nd'.
  // -----------------------------------------------------------------------
  function dayWithSuffix(day) {
    const d = Number(day);
    if (!Number.isFinite(d)) return String(day || '');
    // 11, 12, 13 are the only teen exceptions — every other -teen takes 'th'.
    if (d % 100 >= 11 && d % 100 <= 13) return d + 'th';
    switch (d % 10) {
      case 1: return d + 'st';
      case 2: return d + 'nd';
      case 3: return d + 'rd';
      default: return d + 'th';
    }
  }

  // -----------------------------------------------------------------------
  // getWeekRange — return { start, end } (Date objects) for the Monday→Sunday
  // window that contains `ref`. The window opens at Monday 12:00 and closes
  // at the following Sunday 23:59, as required by the spec.
  //
  // If `ref` is omitted, the current week is used.
  // -----------------------------------------------------------------------
  function getWeekRange(ref) {
    const today = ref ? new Date(ref) : new Date();
    if (isNaN(today.getTime())) throw new Error('Invalid reference date');

    // Anchor on Monday. JS getDay(): 0 = Sun, 1 = Mon, … 6 = Sat.
    // We want the most recent Monday on or before `today`.
    const dayOfWeek = today.getDay(); // 0..6
    const daysFromMonday = (dayOfWeek + 6) % 7; // 0 when today is Mon
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysFromMonday);

    // Sunday = Monday + 6 days.
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);

    // Spec: window opens at Monday 12:00, closes at Sunday 23:59.
    const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 12, 0, 0, 0);
    const end   = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate(), 23, 59, 59, 999);

    return { start, end, monday, sunday };
  }

  // -----------------------------------------------------------------------
  // buildWeeklyFileName — format the download name per the spec.
  // Example: "Weekly Incident Report from 1st June 2026 to 7th June 2026"
  // -----------------------------------------------------------------------
  const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];
  function buildWeeklyFileName(monday, sunday) {
    const sDay = dayWithSuffix(monday.getDate());
    const eDay = dayWithSuffix(sunday.getDate());
    return `Weekly Incident Report from ${sDay} ${MONTH_NAMES[monday.getMonth()]} ${monday.getFullYear()}` +
           ` to ${eDay} ${MONTH_NAMES[sunday.getMonth()]} ${sunday.getFullYear()}.xlsx`;
  }

  // -----------------------------------------------------------------------
  // parseIncidentDate — turn an incident's [Fault Date] + [Fault Time] pair
  // into a real JS Date. We try several shapes because the editor normalises
  // the time to "HH:MM" but seed / import data sometimes carries "HH:MM:SS"
  // or even a full ISO string. Returns null when the row is not parseable.
  // -----------------------------------------------------------------------
  function parseIncidentDate(inc) {
    if (!inc) return null;

    // The spec says "filter on [Fault Date] and [Fault Time]". Use them
    // first, then fall back to the legacy `date` field so older data still
    // gets included.
    const datePart = inc.faultDate || inc.date;
    const timePart = inc.faultTime || '00:00';
    if (!datePart) return null;

    // Normalise datePart → 'YYYY-MM-DD' (it can arrive as 'YYYY-MM-DD' or
    // 'YYYY-MM-DDTHH:MM:SS…' or 'DD/MM/YYYY').
    let y, m, d;
    if (/^\d{4}-\d{2}-\d{2}/.test(datePart)) {
      [y, m, d] = datePart.slice(0, 10).split('-').map(Number);
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(datePart)) {
      const parts = datePart.split('/');
      d = +parts[0]; m = +parts[1]; y = +parts[2];
    } else {
      const t = new Date(datePart);
      return isNaN(t.getTime()) ? null : t;
    }

    // Normalise timePart → ['HH','MM','SS'].
    const tParts = String(timePart).split(':');
    const hh = +(tParts[0] || 0);
    const mm = +(tParts[1] || 0);
    const ss = +(tParts[2] || 0);

    return new Date(y, (m || 1) - 1, d || 1, hh, mm, ss, 0);
  }

  // -----------------------------------------------------------------------
  // combineRcaProvider — produce the "Name - 017XXXXXXXX" string.
  // Handles the common cases where one side is empty.
  // -----------------------------------------------------------------------
  function combineRcaProvider(inc) {
    const name = (inc && inc.rcaProvider) ? String(inc.rcaProvider).trim() : '';
    const mob  = (inc && inc.rcaProviderContact) ? String(inc.rcaProviderContact).trim() : '';
    if (name && mob) return `${name} - ${mob}`;
    return name || mob || '';
  }

  // -----------------------------------------------------------------------
  // mapRowToColumns — take one raw incident object and produce a row in
  // the strict 21-column order. The internal field `__rcaCombined` is the
  // pre-merged name+mobile string; we rename it to its public header at the
  // end so the SheetJS sheet has clean header text.
  // -----------------------------------------------------------------------
  function mapRowToColumns(inc) {
    const merged = {
      incidentName:         inc.incidentName || '',
      incidentCategory:     inc.incidentCategory || '',
      incidentSubCategory:  inc.incidentSubCategory || '',
      zone:                 inc.zone || '',
      serviceImpacted:      inc.serviceImpacted || '',
      impactedClient:       inc.impactedClient || '',
      faultTime:            inc.faultTime || '',
      restorationTime:      inc.restorationTime || '',
      duration:             inc.duration || '',
      durationOver4h:       inc.durationOver4h || inc['Duration > 4 hours'] || '',
      ticketId:             inc.ticketId || '',
      ticketType:           inc.ticketType || '',
      rootCause:            inc.rootCause || '',
      __rcaCombined:        combineRcaProvider(inc),
      actionTaken:          inc.actionTaken || '',
      issueType:            inc.issueType || '',
      forwardDepartment:    inc.forwardDepartment || '',
      responsibleTeam:      inc.responsibleTeam || '',
      queryMail:            inc.queryMail || '',
      ttForMail:            inc.ttForMail || '',
      currentStatus:        inc.currentStatus || '',
    };
    // Re-shape into the final ordered object using the public header text.
    const out = {};
    COLUMN_ORDER.forEach(([header, key]) => { out[header] = merged[key]; });
    return out;
  }

  // -----------------------------------------------------------------------
  // collectWeeklyIncidents — pull every incident whose [Fault Date] +
  // [Fault Time] lands inside the Monday-12:00 → Sunday-23:59 window.
  //
  // Source order: the window-scoped `incidentLog` global wins (per the
  // brief); otherwise fall back to the store, which is the canonical
  // persisted collection in this app.
  // -----------------------------------------------------------------------
  function collectWeeklyIncidents(ref) {
    const range = getWeekRange(ref);
    const source = (Array.isArray(window.incidentLog) && window.incidentLog.length)
      ? window.incidentLog
      : S.list('incidents');

    return source
      .map(i => ({ row: i, ts: parseIncidentDate(i) }))
      .filter(x => x.ts && x.ts >= range.start && x.ts <= range.end)
      .map(x => mapRowToColumns(x.row));
  }

  // -----------------------------------------------------------------------
  // downloadWeeklyReport — public entry point used by the button below.
  // Lazy-loads SheetJS via NMCExcel, then triggers a browser download.
  // -----------------------------------------------------------------------
  async function downloadWeeklyReport(ref) {
    const X = window.NMCExcel;
    if (!X || typeof X.exportRowsAsXLSX !== 'function') {
      U.toast('Export module not loaded', 'error');
      return;
    }
    try {
      const range = getWeekRange(ref);
      const rows = collectWeeklyIncidents(ref);
      if (!rows.length) {
        U.toast('No incidents found in the selected week', 'warn');
        return;
      }
      const filename = buildWeeklyFileName(range.monday, range.sunday);
      // NMCExcel.exportRowsAsXLSX handles the SheetJS lazy-load + writeFile
      // call for us, so the rest of the app stays CDN-free at boot.
      await X.exportRowsAsXLSX(rows, filename);
      U.toast(`Downloaded ${rows.length} row(s) — ${filename}`, 'success');
    } catch (err) {
      console.error('Weekly report export failed:', err);
      U.toast('Export failed: ' + (err && err.message ? err.message : err), 'error');
    }
  }

  function render() {
    const view = document.getElementById('view');
    const inc = S.list('incidents');

    view.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <h3>Weekly Report</h3>
          <div class="row">
            <div class="col-6"><label>Week ending (Sun)</label><input id="w_end" type="date" /></div>
            <div class="col-6"><label>Auto-send to WhatsApp</label><select id="w_wa"><option value="1">Yes</option><option value="0">No</option></select></div>
          </div>
          <div class="flex" style="margin-top:10px">
            <button class="btn" id="w_gen">Generate</button>
            <button class="btn ghost" id="w_copy">Copy</button>
            <button class="btn success" id="w_wa_send">Send to WhatsApp</button>
            <button class="btn primary" id="download-weekly-report-btn"
                    title="Export the current Monday–Sunday week as an .xlsx file">
              Download Weekly Report
            </button>
          </div>
        </div>
        <div class="card">
          <h3>Monthly Report</h3>
          <div class="row">
            <div class="col-6"><label>Month</label><input id="m_mon" type="month" /></div>
            <div class="col-6"><label>Auto-send</label><select id="m_wa"><option value="1">Yes</option><option value="0">No</option></select></div>
          </div>
          <div class="flex" style="margin-top:10px">
            <button class="btn" id="m_gen">Generate</button>
            <button class="btn ghost" id="m_copy">Copy</button>
            <button class="btn success" id="m_wa_send">Send to WhatsApp</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <h3>Preview</h3>
        <pre id="rp_preview" class="ticket-preview" style="white-space:pre-wrap;min-height:260px">Pick a period and click Generate.</pre>
      </div>
    `;

    function buildWeekly(endDate) {
      const end = new Date(endDate);
      const start = new Date(end); start.setDate(start.getDate() - 6);
      const inRange = inc.filter(i => {
        const d = new Date(i.date);
        return d >= start && d <= end;
      });
      const solved = inRange.filter(i => i.currentStatus === 'Solved' || i.currentStatus === 'Non-Ticket solved').length;
      const running = inRange.filter(i => i.currentStatus === 'Running' || i.currentStatus === 'Non-ticket running').length;
      const rca = inRange.filter(i => i.currentStatus === 'RCA Pending ticket').length;
      const cats = {};
      inRange.forEach(i => { cats[i.incidentSubCategory || i.incidentCategory] = (cats[i.incidentSubCategory || i.incidentCategory] || 0) + 1; });
      const top = Object.entries(cats).sort((a,b) => b[1]-a[1]).slice(0, 5);
      return [
        `Subject: NMC Weekly Report – ${endDate}`,
        ``,
        `Period: ${start.toISOString().slice(0,10)} → ${endDate}`,
        `Total incidents: ${inRange.length}`,
        `Solved: ${solved}   Running: ${running}   RCA pending: ${rca}`,
        ``,
        `Top categories:`,
        ...top.map(([k,v]) => `  • ${k}: ${v}`),
        ``,
        `Generated by NMC Portal.`
      ].join('\n');
    }
    function buildMonthly(mon) {
      const [y, m] = mon.split('-').map(Number);
      const start = new Date(y, m-1, 1), end = new Date(y, m, 0);
      const inRange = inc.filter(i => {
        const d = new Date(i.date);
        return d >= start && d <= end;
      });
      const solved = inRange.filter(i => i.currentStatus === 'Solved' || i.currentStatus === 'Non-Ticket solved').length;
      const running = inRange.filter(i => i.currentStatus === 'Running' || i.currentStatus === 'Non-ticket running').length;
      const rca = inRange.filter(i => i.currentStatus === 'RCA Pending ticket').length;
      const cats = {};
      inRange.forEach(i => { cats[i.incidentSubCategory || i.incidentCategory] = (cats[i.incidentSubCategory || i.incidentCategory] || 0) + 1; });
      const top = Object.entries(cats).sort((a,b) => b[1]-a[1]).slice(0, 5);
      // total outage
      let tot = 0;
      inRange.forEach(i => {
        const m = (i.duration||'').match(/(\d+):(\d+):(\d+)/);
        if (m) tot += (+m[1])*3600 + (+m[2])*60 + (+m[3]);
      });
      const hh = String(Math.floor(tot/3600)).padStart(2,'0'), mm = String(Math.floor((tot%3600)/60)).padStart(2,'0');
      return [
        `Subject: NMC Monthly Report – ${mon}`,
        ``,
        `Period: ${start.toISOString().slice(0,10)} → ${end.toISOString().slice(0,10)}`,
        `Total incidents: ${inRange.length}`,
        `Solved: ${solved}   Running: ${running}   RCA pending: ${rca}`,
        `Total outage: ${hh}:${mm}`,
        ``,
        `Top categories:`,
        ...top.map(([k,v]) => `  • ${k}: ${v}`),
        ``,
        `Generated by NMC Portal.`
      ].join('\n');
    }

    const $ = (id) => document.getElementById(id);
    document.getElementById('w_gen').addEventListener('click', () => {
      const v = $('w_end').value;
      if (!v) return U.toast('Pick a date', 'warn');
      $('rp_preview').textContent = buildWeekly(v);
    });
    document.getElementById('m_gen').addEventListener('click', () => {
      const v = $('m_mon').value;
      if (!v) return U.toast('Pick a month', 'warn');
      $('rp_preview').textContent = buildMonthly(v);
    });
    document.getElementById('w_copy').addEventListener('click', () => { navigator.clipboard.writeText($('rp_preview').textContent).then(() => U.toast('Copied','success')); });
    document.getElementById('m_copy').addEventListener('click', () => { navigator.clipboard.writeText($('rp_preview').textContent).then(() => U.toast('Copied','success')); });
    function waShare() {
      const txt = $('rp_preview').textContent;
      window.open('https://wa.me/' + (S.get('wa_group','')||'') + '?text=' + encodeURIComponent(txt), '_blank');
    }
    document.getElementById('w_wa_send').addEventListener('click', waShare);
    document.getElementById('m_wa_send').addEventListener('click', waShare);

    // -----------------------------------------------------------------
    // Weekly Excel Report — SheetJS export.
    // Uses the optional `w_end` date input as the "current week anchor"
    // when the user has picked one; otherwise falls back to today.
    // -----------------------------------------------------------------
    document.getElementById('download-weekly-report-btn').addEventListener('click', () => {
      const anchor = $('w_end').value || undefined;
      downloadWeeklyReport(anchor);
    });
  }

  window.NMCPages = window.NMCPages || {};
  window.NMCPages.reports = render;
})();
