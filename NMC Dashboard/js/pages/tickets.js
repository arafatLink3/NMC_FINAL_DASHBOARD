(function () {
  window.NMCPages = window.NMCPages || {};

  const S = window.NMCStore, U = window.NMCUI, AI = window.NMCAI;

  // --- 1. CORE UTILITIES & 24-HOUR TIME ENGINE ---
  const pad2 = n => String(n).padStart(2, '0');
  const TIME_RE = /^\d{2}:\d{2}$/;
  const TIME_FULL_RE = /^\d{2}:\d{2}\s+\(\d{2}\/\d{2}\/\d{2}\)$/;

  function parseFullDateTime(str) {
    if (!str) return null;
    const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
    if (!m) return null;
    const [, dd, mo, yyyy, hh, mm, ss] = m;
    const d = new Date(+yyyy, +mo - 1, +dd, +hh, +mm, +ss);
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtShortHistorical(d) {
    if (!d || isNaN(d.getTime())) return '';
    const yy = String(d.getFullYear()).slice(-2);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())} (${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${yy})`;
  }

  function formatDuration(faultStr, restoredStr) {
    if (!faultStr || !restoredStr) return '';
    let a = null, b = null;

    let fClean = faultStr.replace(/(AM|PM)/i, '').trim();
    let rClean = restoredStr.replace(/(AM|PM)/i, '').trim();

    const fm = fClean.match(/^(\d{1,2}):(\d{2})(?:\s*\((\d{1,2})\/(\d{1,2})\/(\d{2,4})\))?$/);
    if (fm) {
      const [, hh, mm, dd, mo, yy] = fm;
      const today = new Date();
      const year = yy ? (yy.length === 2 ? 2000 + +yy : +yy) : today.getFullYear();
      const month = (mo ? +mo - 1 : today.getMonth());
      const day = (dd ? +dd : today.getDate());
      a = new Date(year, month, day, +hh, +mm, 0).getTime();
    }

    const rm = rClean.match(/^(\d{1,2}):(\d{2})(?:\s*\((\d{1,2})\/(\d{1,2})\/(\d{2,4})\))?$/);
    if (rm) {
      const [, hh, mm, dd, mo, yy] = rm;
      const today = new Date();
      const year = yy ? (yy.length === 2 ? 2000 + +yy : +yy) : today.getFullYear();
      const month = (mo ? +mo - 1 : today.getMonth());
      const day = (dd ? +dd : today.getDate());
      b = new Date(year, month, day, +hh, +mm, 0).getTime();
    }

    if (!a || !b || isNaN(a) || isNaN(b)) return '';
    let diff = Math.max(0, b - a);
    const days = Math.floor(diff / 86400000); diff -= days * 86400000;
    const hrs  = Math.floor(diff / 3600000);  diff -= hrs * 3600000;
    const mins = Math.floor(diff / 60000);

    if (days > 0) return `${days} days ${hrs} hrs ${mins} mins`;
    if (hrs  > 0) return `${hrs} hrs ${mins} mins`;
    return `${mins} mins`;
  }

  // Parses an ISO yyyy-mm-dd date + "HH" / "MM" select values into a real Date.
  // Returns null if any piece is missing or invalid. Multi-day outages are
  // handled naturally because we construct a single absolute timestamp from
  // (date, hours, minutes) — no manual hour arithmetic that could mis-count
  // across DST or month boundaries.
  function parseDateTime(dateStr, hhStr, mmStr) {
    if (!dateStr) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m) return null;
    const yyyy = +m[1], mo = +m[2] - 1, dd = +m[3];
    const hh = parseInt(hhStr, 10); if (!Number.isFinite(hh)) return null;
    const mm = parseInt(mmStr, 10); if (!Number.isFinite(mm)) return null;
    const d = new Date(yyyy, mo, dd, hh, mm, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  // Returns "X hours Y minutes" or "D days H hrs M mins" — safe for
  // multi-day outages. Negative diffs (clock skew) are clamped to 0.
  function formatDurationFromDates(faultDate, restoredDate) {
    if (!faultDate || !restoredDate) return '';
    let diff = restoredDate.getTime() - faultDate.getTime();
    if (diff < 0) diff = 0;
    const days = Math.floor(diff / 86400000); diff -= days * 86400000;
    const hrs  = Math.floor(diff / 3600000);  diff -= hrs * 3600000;
    const mins = Math.floor(diff / 60000);
    if (days > 0) return `${days} days ${hrs} hrs ${mins} mins`;
    if (hrs > 0)  return `${hrs} hrs ${mins} mins`;
    return `${mins} mins`;
  }

  // Build an Incident Log row skeleton from a Ticket-Page payload (p) plus
  // the contextual extras the t_confirm handler computes (AI classification,
  // on-shift engineer, current timestamp, default status). The keys match
  // the COLS schema in incidentLog.js (L77-105) so the row renders in the
  // master log without further patching.
  //
  // Mapping reference (Ticket Page -> Incident Log):
  //   p.category       -> incidentSubCategory  (also incidentCategory as fallback)
  //   p.bts            -> incidentName         (also zone from roster resolution)
  //   p.ic (count)     -> impactedClient       ("YES" if > 0 else "NO")
  //   p.faultDate      -> faultDate            (yyyy-mm-dd)
  //   p.faultTime      -> faultTime            (HH:MM)
  //   p.tt             -> ticketId
  //   p.rootCause      -> rootCause            (defaults to "Yet to identify")
  //   p.ping / p.laser -> actionTaken          (one-line summary)
  function rowFromTicket(p, extras) {
    extras = extras || {};
    const icNum = parseInt(p.ic, 10);
    const icStr = (Number.isFinite(icNum) && icNum > 0) ? 'YES' : 'NO';
    const pingStr = (typeof p.ping === 'string') ? p.ping : (p.ping && p.ping.ip) || '';
    const laserStr = (typeof p.laser === 'string') ? p.laser : (p.laser && p.laser.ip) || '';
    const actParts = [];
    if (pingStr && pingStr.trim()) actParts.push('Ping: ' + pingStr.trim());
    if (laserStr && laserStr.trim()) actParts.push('Laser: ' + laserStr.trim());
    return {
      // Identity / context
      session:           extras.session || '',
      sessionEngineers:  extras.sessionEngineers || '',
      name:              extras.name || '',
      date:              p.faultDate || new Date().toISOString().slice(0, 10),

      // Classification (mapped from Ticket fields)
      incidentName:      p.bts || '',
      incidentCategory:  p.category || '',
      incidentSubCategory: p.category || '',
      zone:              extras.zone || '',

      // Service / client
      serviceImpacted:   icStr,
      impactedClient:    p.ic != null && p.ic !== '' ? String(p.ic) : 'NO',

      // Timing
      faultDate:         p.faultDate || '',
      faultTime:         p.faultTime || '',
      restorationDate:   '',
      restorationTime:   '',
      duration:          '',
      durationOver4h:    '',

      // Ticket linkage
      ticketId:          p.tt || '',
      ticketType:        '',
      rootCause:         p.rootCause || 'Yet to identify',

      // RCA / action
      rcaProvider:          '',
      rcaProviderContact:   '',
      actionTaken:          actParts.join(' | '),

      // Classification extras from AI
      issueType:         extras.issueType || '',
      forwardDepartment: extras.forwardDepartment || '',
      responsibleTeam:   extras.responsibleTeam || extras.forwardDepartment || '',

      // Notification / status
      informedPerson:    '',
      informedTimeMedia: extras.informedTimeMedia || '',
      ticketUpdateBy:    '',
      whatsappNotified:  extras.whatsappNotified || 'Notified',
      mailGenerated:     'No',
      queryMail:         'No',
      ttForMail:         p.tt || '',
      currentStatus:     extras.currentStatus || 'Running'
    };
  }

  function getCompiled24HString(dateId, hhId, mmId) {
    const dEl = document.getElementById(dateId);
    const hEl = document.getElementById(hhId);
    const mEl = document.getElementById(mmId);
    if (!dEl || !hEl || !mEl || !dEl.value) return '';
    const [yyyy, mo, dd] = dEl.value.split('-');
    const now = new Date();
    const isToday = (now.getFullYear() === +yyyy && (now.getMonth() + 1) === +mo && now.getDate() === +dd);
    return isToday ? `${hEl.value}:${mEl.value}` : `${hEl.value}:${mEl.value} (${dd}/${mo}/${yyyy.slice(-2)})`;
  }

  function waShare(text, group) {
    const url = 'https://wa.me/' + (group || '') + '?text=' + encodeURIComponent(text || '');
    window.open(url, '_blank');
  }

  // --- 2. PREVIEW TEXT GENERATION FORMATTERS ---
  function ticketText(p) {
    const lines = [
      `Incident Notification || Incident Category: ${p.category || ''}`,
      `BTS/Area: ${p.bts || ''}`,
      `Impacted Client: ${p.ic == null ? 'NO' : p.ic}`,
      `Fault Time: ${p.faultTime || ''} ETR: ${p.etr || 'Yet to be shared'}`,
      `Root Cause: ${p.rootCause || 'Yet to identify'}`,
      `Ticket ID: ${p.tt || ''}`,
      '------------------------------------------------------------------'
    ];

    if (p.ping) {
      const pingStr = (typeof p.ping === 'string') ? p.ping : (p.ping.ip || '');
      if (pingStr.trim()) lines.push('\n' + pingStr.trim());
    }

    if (p.laser) {
      const laserStr = (typeof p.laser === 'string') ? p.laser : (p.laser.ip || '');
      if (laserStr.trim()) lines.push('\n' + laserStr.trim());
    }
    return lines.join('\n');
  }

  function closeText(p) {
    const lines = [
      `Close Notification || Incident Category: ${p.closeCategory || ''}`,
      `BTS/Area: ${p.bts || ''}`,
      `Impacted Client: ${p.ic == null ? 'NO' : p.ic}`,
      `Fault Time: ${p.faultTime || ''}  Restored Time: ${p.restoredTime || ''}  Duration: ${p.duration || ''}`,
      `Root Cause: ${p.rootCause || 'Yet to identify'}`,
      `Ticket ID: ${p.tt || ''}`,
      '------------------------------------------------------------------'
    ];

    if (p.ping) {
      const pingStr = (typeof p.ping === 'string') ? p.ping : (p.ping.ip || '');
      if (pingStr.trim()) lines.push('\n' + pingStr.trim());
    }

    if (p.laser) {
      const laserStr = (typeof p.laser === 'string') ? p.laser : (p.laser.ip || '');
      if (laserStr.trim()) lines.push('\n' + laserStr.trim());
    }
    return lines.join('\n');
  }

  // --- 3. MAIN DASHBOARD PAGE RENDER ENGINE ---
  function render() {
    const inc = Array.isArray(S.get('incidents')) ? S.get('incidents') : [];
    const rosters = S.get('rosters', []);

    let view = document.getElementById('main_view') || document.getElementById('content') || document.querySelector('.main-content');
    if (!view) {
      const dashboardMain = document.querySelector('.content-wrapper') || document.querySelector('.main');
      if (dashboardMain) {
        view = dashboardMain;
      } else {
        let isolatedBox = document.getElementById('spa_ticket_isolation_wrapper');
        if (!isolatedBox) {
          isolatedBox = document.createElement('div');
          isolatedBox.id = 'spa_ticket_isolation_wrapper';
          document.body.appendChild(isolatedBox);
        }
        view = isolatedBox;
      }
    }

    let hhOpts = ''; for(let i=0; i<24; i++) { let s = String(i).padStart(2, '0'); hhOpts += `<option value="${s}">${s}</option>`; }
    let mmOpts = ''; for(let i=0; i<60; i++) { let s = String(i).padStart(2, '0'); mmOpts += `<option value="${s}">${s}</option>`; }

    const previewSvg = `<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" height="13" width="13" style="margin-right:5px; flex-shrink:0; display:inline-block;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    const confirmSvg = `<svg stroke="currentColor" fill="none" stroke-width="2.5" viewBox="0 0 24 24" height="13" width="13" style="margin-right:5px; flex-shrink:0; display:inline-block;"><path d="M20 6L9 17l-5-5"></path></svg>`;
    const clearSvg   = `<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" height="13" width="13" style="margin-right:5px; flex-shrink:0; display:inline-block;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    const copySvg    = `<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" height="13" width="13" style="margin-right:5px; flex-shrink:0; display:inline-block;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    const whatsAppSvg = `<svg fill="currentColor" viewBox="0 0 24 24" height="13" width="13" style="margin-right:5px; flex-shrink:0; display:inline-block;"><path d="M12.004 22c-2.043 0-4.01-.527-5.74-1.53l-.412-.24-4.269 1.12 1.139-4.162-.263-.42a9.862 9.862 0 0 1-1.51-5.263c0-5.462 4.443-9.905 9.908-9.905 2.647 0 5.134 1.03 7.005 2.902a9.845 9.845 0 0 1 2.901 7.003c-.004 5.464-4.446 9.905-9.911 9.905zm8.472-18.337A11.83 11.83 0 0 0 12.004 0C5.438 0 .093 5.346.089 11.92c0 2.102.55 4.156 1.594 5.966L0 24l6.305-1.654a11.822 11.822 0 0 0 5.694 1.458h.005c6.565 0 11.91-5.344 11.914-11.92a11.84 11.84 0 0 0-3.442-8.416zM17.65 14.53c-.31-.155-1.83-.903-2.112-1.004-.282-.102-.489-.153-.693.153-.204.306-.79 1.004-.97 1.209-.178.204-.357.229-.666.074-.31-.155-1.306-.481-2.489-1.537-.92-.821-1.542-1.836-1.722-2.142-.18-.306-.019-.472.136-.626.14-.139.31-.324.465-.486.155-.162.207-.278.31-.463.104-.185.052-.347-.026-.501-.077-.154-.693-1.67-.95-2.286-.25-.603-.505-.521-.693-.531-.179-.009-.383-.01-.588-.01-.204 0-.537.077-.817.385-.28.307-1.07 1.047-1.07 2.553 0 1.506 1.096 2.96 1.241 3.164.145.204 2.156 3.293 5.224 4.617.73.315 1.3.503 1.745.644.734.233 1.4.2 1.928.121.588-.087 1.83-.748 2.087-1.433.258-.685.258-1.274.18-1.396-.077-.123-.282-.195-.591-.351z"></path></svg>`;
    const bStyle = `display:inline-flex; align-items:center; justify-content:center; white-space:nowrap; font-size:11px; padding:6px 10px; font-weight:500; height:32px; flex:1;`;

    view.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <h3>Create Ticket</h3>
          <div class="row">
            <div class="col-6"><label>Incident Category</label><select id="t_category"></select></div>
            <div class="col-6"><label>BTS/Area</label><input id="t_bts" placeholder="e.g. BL_Sonagazi POP" /></div>
          </div>
          <div class="row" style="margin-top:10px">
            <div class="col-4"><label>Impacted Client</label><select id="t_ic"><option value="NO">NO</option><option value="YES">YES</option></select></div>
            <div class="col-4" id="t_ic_value_wrap" style="display:none"><label>IC Details</label><input id="t_ic_value" placeholder="e.g. 255, Partial" /></div>
            <div class="col-4"><label>ETR</label><input id="t_etr" placeholder="Yet to be shared" /></div>
          </div>
          <div class="row" style="margin-top:10px">
            <div class="col-4"><label>Fault Date</label><input id="t_fault_date" type="date" /></div>
            <div class="col-4">
              <label>Fault Time (24h)</label>
              <div style="display:flex; align-items:center; gap:4px;">
                <select id="t_fault_hh">${hhOpts}</select>
                <span style="font-weight:bold;">:</span>
                <select id="t_fault_mm">${mmOpts}</select>
              </div>
            </div>
            <div class="col-4"><label>Ticket ID</label><input id="t_tt" placeholder="L3-02Jun26-000" /></div>
          </div>
          <div class="row" style="margin-top:10px">
            <div class="col-12">
              <label>Ping Status</label>
              <textarea id="t_pingip" class="ticket-mono" rows="5" placeholder="Paste full ping logs here..."></textarea>
            </div>
          </div>
          <div class="row" style="margin-top:10px">
            <div class="col-12">
              <label>Laser info</label>
              <textarea id="t_laserinfo" class="ticket-mono" rows="4" placeholder="Paste full laser info log here..."></textarea>
            </div>
          </div>
          <div class="row" style="margin-top:10px">
            <div class="col-12"><label>Root Cause</label><input id="t_root" value="Yet to identify" /></div>
          </div>
          <div style="margin-top:14px; display:flex; flex-direction:column; gap:8px;">
            <div class="flex" style="gap:6px;">
              <button class="btn" id="t_preview" style="${bStyle}">${previewSvg}Preview Format</button>
              <button class="btn success" id="t_confirm" style="${bStyle}">${confirmSvg}Confirm & Save to Incident Log</button>
            </div>
            <div class="flex" style="gap:6px;">
              <button class="btn" id="t_clear" style="${bStyle}">${clearSvg}Clear</button>
              <button class="btn ghost" id="t_copy" style="${bStyle}">${copySvg}Copy</button>
              <button class="btn" id="t_wa" style="background:#25D366; color:#fff; border:none; ${bStyle}">${whatsAppSvg}WhatsApp Share</button>
            </div>
          </div>
          <div id="t_ai" class="muted" style="margin-top:5px"></div>
          <div class="ticket-preview" id="t_previewBox" style="margin-top:10px">Fill the form and click Preview Format.</div>
        </div>

        <div class="card">
          <h3>Close Ticket</h3>
          <div class="row">
            <div class="col-6"><label>Close Category</label><select id="c_cat"></select></div>
            <div class="col-6"><label>Ticket ID</label><input id="c_tt" placeholder="L3-..." /></div>
          </div>
          <div class="row" style="margin-top:10px">
            <div class="col-6"><label>BTS/Area</label><input id="c_bts" placeholder="Auto-filled from TT" /></div>
            <div class="col-6"></div>
          </div>
          <div class="row" style="margin-top:10px">
            <div class="col-3"><label>Impacted Client</label><select id="c_ic"><option value="NO">NO</option><option value="YES">YES</option></select></div>
            <div class="col-3" id="c_ic_value_wrap" style="display:none"><label>IC Details</label><input id="c_ic_value" placeholder="e.g. 255, Partial" /></div>
            <div class="col-6"><label>Outage Duration</label><div id="c_duration_display" class="ticket-preview" style="min-height:34px; padding:6px 10px">—</div></div>
          </div>
          <div class="row" style="margin-top:10px">
            <div class="col-6"><label>Fault Date</label><input id="c_fault_date" type="date" /></div>
            <div class="col-6">
              <label>Fault Time</label>
              <div style="display:flex; align-items:center; gap:4px;">
                <select id="c_fault_hh">${hhOpts}</select>
                <span style="font-weight:bold;">:</span>
                <select id="c_fault_mm">${mmOpts}</select>
              </div>
            </div>
          </div>
          <div class="row" style="margin-top:10px">
            <div class="col-6"><label>Restoration Date</label><input id="c_time_date" type="date" /></div>
            <div class="col-6">
              <label>Restoration Time</label>
              <div style="display:flex; align-items:center; gap:4px;">
                <select id="c_time_hh">${hhOpts}</select>
                <span style="font-weight:bold;">:</span>
                <select id="c_time_mm">${mmOpts}</select>
              </div>
            </div>
          </div>
          <div class="row" style="margin-top:10px">
            <div class="col-12">
              <label>Ping Status</label>
              <textarea id="c_pingip" class="ticket-mono" rows="5" placeholder="Paste full close ping logs here..."></textarea>
            </div>
          </div>
          <div class="row" style="margin-top:10px">
            <div class="col-12">
              <label>Laser info</label>
              <textarea id="c_laserinfo" class="ticket-mono" rows="4" placeholder="Paste full close laser info logs here..."></textarea>
            </div>
          </div>
          <div class="row" style="margin-top:10px">
            <div class="col-6"><label>Root Cause</label><input id="c_root" value="Yet to identify" /></div>
            <div class="col-6"><label>Status</label><select id="c_status"><option value="Running">Running</option><option value="Solved">Solved</option></select></div>
          </div>
          <div style="margin-top:14px; display:flex; flex-direction:column; gap:8px;">
            <div class="flex" style="gap:6px;">
              <button class="btn" id="c_preview" style="${bStyle}">${previewSvg}Preview Close</button>
              <button class="btn success" id="c_confirm" style="${bStyle}">${confirmSvg}Confirm Close & Sync</button>
            </div>
            <div class="flex" style="gap:6px;">
              <button class="btn" id="c_clear" style="${bStyle}">${clearSvg}Clear</button>
              <button class="btn ghost" id="c_copy" style="${bStyle}">${copySvg}Copy</button>
              <button class="btn" id="c_wa" style="background:#25D366; color:#fff; border:none; ${bStyle}">${whatsAppSvg}WhatsApp Share</button>
            </div>
          </div>
          <div class="ticket-preview" id="c_previewBox" style="margin-top:10px">Close preview will appear here.</div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <h3>Incident Log (this month)</h3>
        <div class="flex" style="gap:10px; margin-bottom:10px;">
          <input id="inc_search" placeholder="Filter by BTS / TT / zone…" style="max-width:280px" />
          <select id="inc_filter">
            <option value="">All status</option>
            <option value="Running">Running</option>
            <option value="Solved">Solved</option>
          </select>
          <button class="btn ghost" id="inc_export">Export CSV</button>
        </div>
        <div class="table-wrap" style="max-height:300px; overflow:auto">
          <table class="data" id="inc_table">
            <thead>
              <tr><th>Date</th><th>Ticket ID</th><th>BTS/Area</th><th>Incident Category</th><th>Zone</th><th>IC</th><th>Fault</th><th>Restored</th><th>Dur</th><th>Status</th><th>Dept</th></tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    const f = (id) => document.getElementById(id);

    const createCats = ["Traffic Full", "Traffic Fall", "Service Interruption", "SureCom Device Down", "Wireless Link Down", "NTTN Link Down", "NTTN Link Laser High Issue", "FO Link Down", "FO Link Laser High Issue", "L3 BRAS Down (Link3 Own BRAS)", "Distributor BRAS Down", "GP POP Down", "GP Site Down", "BL POP Down", "BL Site Down", "BL Capacity Link Down", "Router Down", "Switch Down", "BTS Down", "BL E1 Link Down", "IIG Link Down", "OLT Down", "PON Down"];
    const closeCats = ["Traffic Increased", "SureCom Device Up", "Wireless Link Up", "Service Interruption Solved", "NTTN Link Up", "NTTN Link Laser High Issue Up", "FO Link Up", "FO Link Laser High Issue Up", "L3 BRAS Up", "L3 BRAS Up & Stable", "Distributor BRAS Up", "Distributor BRAS Up & Stable", "GP POP Up", "GP Site Up", "BL POP Up", "BL Site Up", "BL Capacity Link Up", "Router Up", "Router Up & Stable", "Switch Up", "Switch Up & Stable", "BTS Up & Stable", "BL E1 Link Up", "IIG Link Up", "OLT Up", "PON Up"];

    if(f('t_category')) f('t_category').innerHTML = createCats.map(c => `<option value="${c}">${c}</option>`).join('');
    if(f('c_cat')) f('c_cat').innerHTML = closeCats.map(c => `<option value="${c}">${c}</option>`).join('');

    function syncICValue(selectId, wrapId, inputId) {
      const wrap = f(wrapId); if (!wrap) return;
      const v = f(selectId).value;
      wrap.style.display = v === 'YES' ? '' : 'none';
      if (v !== 'YES') f(inputId).value = '';
    }
    if(f('t_ic')) f('t_ic').addEventListener('change', () => syncICValue('t_ic', 't_ic_value_wrap', 't_ic_value'));
    if(f('c_ic')) f('c_ic').addEventListener('change', () => syncICValue('c_ic', 'c_ic_value_wrap', 'c_ic_value'));
    syncICValue('t_ic', 't_ic_value_wrap', 't_ic_value');
    syncICValue('c_ic', 'c_ic_value_wrap', 'c_ic_value');

    function liveDuration() {
      const faultStr = getCompiled24HString('c_fault_date', 'c_fault_hh', 'c_fault_mm');
      const restoredStr = getCompiled24HString('c_time_date', 'c_time_hh', 'c_time_mm');
      const disp = f('c_duration_display');
      if (disp) disp.textContent = formatDuration(faultStr, restoredStr) || '—';
    }

    ['c_fault_date', 'c_fault_hh', 'c_fault_mm', 'c_time_date', 'c_time_hh', 'c_time_mm'].forEach(id => {
      if(f(id)) f(id).addEventListener('change', liveDuration);
    });

    function gatherCreate() {
      return {
        category: f('t_category') ? f('t_category').value.trim() : '',
        bts: f('t_bts') ? f('t_bts').value.trim() : '',
        ic: f('t_ic') && f('t_ic').value === 'YES' ? (f('t_ic_value').value.trim() || 'YES') : 'NO',
        faultTime: getCompiled24HString('t_fault_date', 't_fault_hh', 't_fault_mm'),
        etr: f('t_etr') ? f('t_etr').value.trim() : '',
        tt: f('t_tt') ? f('t_tt').value.trim() : '',
        rootCause: f('t_root') ? f('t_root').value.trim() : '',
        laser: f('t_laserinfo') ? f('t_laserinfo').value.trim() : '',
        ping: { ip: f('t_pingip') ? f('t_pingip').value : '' }
      };
    }

    function gatherClose() {
      return {
        closeCategory: f('c_cat') ? f('c_cat').value.trim() : '',
        bts: f('c_bts') ? f('c_bts').value.trim() : '',
        ic: f('c_ic') && f('c_ic').value === 'YES' ? (f('c_ic_value').value.trim() || 'YES') : 'NO',
        faultTime: getCompiled24HString('c_fault_date', 'c_fault_hh', 'c_fault_mm'),
        restoredTime: getCompiled24HString('c_time_date', 'c_time_hh', 'c_time_mm'),
        duration: (f('c_duration_display') && f('c_duration_display').textContent.trim() !== '—') ? f('c_duration_display').textContent.trim() : '',
        rootCause: f('c_root') ? f('c_root').value.trim() : 'Yet to identify',
        tt: f('c_tt') ? f('c_tt').value.trim() : '',
        ping: { ip: f('c_pingip') ? f('c_pingip').value : '' },
        laser: f('c_laserinfo') ? f('c_laserinfo').value.trim() : ''
      };
    }

    function aiLabel() {
      const p = gatherCreate();
      if (typeof AI !== 'undefined' && AI.classify && f('t_ai')) {
        const cls = AI.classify(p.category, p.bts);
        f('t_ai').innerHTML = `AI suggests → <b>${U.escapeHtml(cls.dept)}</b> · Issue: <b>${U.escapeHtml(cls.issue)}</b> · Zone: <b>${U.escapeHtml(AI.inferZone(p.bts)||'-')}</b>`;
      }
    }
    ['t_category','t_bts','t_ic','t_tt'].forEach(id => f(id) && f(id).addEventListener('input', aiLabel));

    if(f('t_category')) {
      f('t_category').addEventListener('change', () => {
        ['t_bts','t_ic_value','t_fault_date','t_etr','t_tt','t_laserinfo','t_pingip'].forEach(id => { if (f(id)) f(id).value = ''; });
        if(f('t_fault_hh')) f('t_fault_hh').value = '00'; if(f('t_fault_mm')) f('t_fault_mm').value = '00';
        f('t_root').value = 'Yet to identify'; f('t_ic').value = 'NO';
        f('t_ic_value_wrap').style.display = 'none'; f('t_previewBox').textContent = 'Fill the form and click Preview Format.';
        aiLabel();
      });
    }

    if(f('c_cat')) {
      f('c_cat').addEventListener('change', () => {
        // Reset the form-only fields that belong to this card. The
        // Ticket ID and the look-up-derived BTS / fault / restoration
        // fields are intentionally left alone so changing the Close
        // Category doesn't wipe the operator's ticket linkage.
        ['c_ic_value','c_pingip','c_laserinfo'].forEach(id => { if (f(id)) f(id).value = ''; });
        if(f('c_root')) f('c_root').value = 'Yet to identify';
        if(f('c_ic')) f('c_ic').value = 'NO';
        if(f('c_ic_value_wrap')) f('c_ic_value_wrap').style.display = 'none';
        f('c_previewBox').textContent = 'Close preview will appear here.';
      });
    }

    if(f('c_tt')) {
      f('c_tt').addEventListener('input', () => {
        const tt = f('c_tt').value.trim();
        const incRow = inc.find(i => i.ticketId === tt);
        if (!incRow) return;

        if(f('c_bts')) f('c_bts').value = incRow.incidentName || '';
        // Don't clobber a Close Category the operator has already
        // picked. Only seed c_cat from the incident row when it is
        // empty — once the operator commits to a category, it sticks.
        if (f('c_cat') && !f('c_cat').value) {
          f('c_cat').value = incRow.incidentSubCategory || incRow.incidentCategory || '';
        }
        if(incRow.faultDate && f('c_fault_date')) f('c_fault_date').value = incRow.faultDate;

        if (incRow.faultTime && typeof incRow.faultTime === 'string') {
          let cleanFTime = incRow.faultTime.replace(/(AM|PM)/i, '').trim();
          if (cleanFTime.includes(':')) {
            const [hh, mm] = cleanFTime.split(':');
            if (f('c_fault_hh')) f('c_fault_hh').value = pad2(hh.trim());
            if (f('c_fault_mm')) f('c_fault_mm').value = pad2(mm.trim());
          }
        }
        if (f('c_root') && (!f('c_root').value || f('c_root').value === 'Yet to identify')) {
          f('c_root').value = incRow.rootCause || 'Yet to identify';
        }
        liveDuration();
      });
    }

    if(f('t_preview')) f('t_preview').addEventListener('click', () => { f('t_previewBox').textContent = ticketText(gatherCreate()); });
    if(f('c_preview')) f('c_preview').addEventListener('click', () => { f('c_previewBox').textContent = closeText(gatherClose()); });

    if(f('t_copy')) f('t_copy').addEventListener('click', () => { navigator.clipboard.writeText(f('t_previewBox').textContent).then(() => { if(typeof U !== 'undefined' && U.toast) U.toast('Copied to clipboard', 'success'); }); });
    if(f('c_copy')) f('c_copy').addEventListener('click', () => { navigator.clipboard.writeText(f('c_previewBox').textContent).then(() => { if(typeof U !== 'undefined' && U.toast) U.toast('Copied to clipboard', 'success'); }); });

    if(f('t_wa')) f('t_wa').addEventListener('click', () => { if(typeof waShare !== 'undefined') waShare(f('t_previewBox').textContent, S.get('wa_group', '')); });
    if(f('c_wa')) f('c_wa').addEventListener('click', () => { if(typeof waShare !== 'undefined') waShare(f('c_previewBox').textContent, S.get('wa_group', '')); });

    // Create form reset
    if(f('t_clear')) {
      f('t_clear').addEventListener('click', () => {
        ['t_bts','t_ic_value','t_fault_date','t_etr','t_tt','t_laserinfo','t_pingip'].forEach(id => { if(f(id)) f(id).value = ''; });
        if(f('t_fault_hh')) f('t_fault_hh').value = '00'; if(f('t_fault_mm')) f('t_fault_mm').value = '00';
        f('t_root').value = 'Yet to identify'; f('t_ic').value = 'NO';
        f('t_ic_value_wrap').style.display = 'none'; f('t_previewBox').textContent = 'Fill the form and click Preview Format.';
      });
    }

    // Close form reset (new) — mirrors the create clear engine
    if(f('c_clear')) {
      f('c_clear').addEventListener('click', () => {
        ['c_bts','c_ic_value','c_fault_date','c_time_date','c_tt','c_pingip','c_laserinfo'].forEach(id => { if (f(id)) f(id).value = ''; });
        ['c_fault_hh','c_fault_mm','c_time_hh','c_time_mm'].forEach(id => { if(f(id)) f(id).value = '00'; });
        if(f('c_duration_display')) f('c_duration_display').textContent = '—';
        if(f('c_root')) f('c_root').value = 'Yet to identify';
        if(f('c_ic')) f('c_ic').value = 'NO';
        if(f('c_ic_value_wrap')) f('c_ic_value_wrap').style.display = 'none';
        if(f('c_previewBox')) f('c_previewBox').textContent = 'Close preview will appear here.';
        if(f('c_status')) f('c_status').value = 'Solved';
      });
    }

    f('t_confirm').addEventListener('click', () => {
      // Surface failures loudly from now on — silent returns were the cause
      // of the previous "button does nothing" bug.
      try {
        const p = gatherCreate();
        if (!p.bts || !p.tt) {
          if (typeof U !== 'undefined' && U.toast) U.toast('BTS/Area and TT are required', 'warn');
          return;
        }
        if (typeof rowFromTicket !== 'function') {
          const msg = 'rowFromTicket helper is missing — cannot build Incident Log row';
          console.error('[t_confirm]', msg, { p });
          if (typeof U !== 'undefined' && U.toast) U.toast(msg, 'error');
          return;
        }

        const cls = AI.classify(p.category, p.bts);
        const ses = AI.engineerAt(new Date(), rosters);
        const now = new Date();
        const cleanTime24 = pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());

        // Build the row in the exact schema incidentLog.js reads back. The
        // mapping is explicit so it stays auditable:
        //   Ticket [Incident Category] -> Incident Log [Incident Sub-Category]
        //   Ticket [BTS/Area]          -> Incident Log [Incident Name]
        //   Ticket [Impacted Client]   -> Incident Log [Impacted Client]
        //   Ticket [Fault Date]        -> Incident Log [Fault Date] (yyyy-mm-dd)
        //   Ticket [Fault Time]        -> Incident Log [Fault Time]
        //   Ticket [Ticket ID]         -> Incident Log [Ticket ID]
        //   Ticket [Root Cause]        -> Incident Log [Root Cause]
        const row = rowFromTicket(p, {
          session: ses.shift,
          sessionEngineers: ses.engineers.map(e => e.name).join(', '),
          name: ses.engineers[0] ? ses.engineers[0].name : '',
          forwardDepartment: cls.dept,
          responsibleTeam: cls.dept,
          issueType: cls.issue,
          currentStatus: 'Running',
          whatsappNotified: 'Notified',
          informedTimeMedia: cleanTime24 + ' via WhatsApp'
        });
        // Belt-and-braces: ensure the user-facing labels are stored under the
        // exact keys incidentLog.js looks up (L77-L105).
        row.incidentSubCategory = p.category || row.incidentSubCategory || '';
        row.incidentCategory    = row.incidentCategory || p.category || '';
        row.incidentName        = p.bts || row.incidentName || '';
        row.impactedClient      = p.ic != null && p.ic !== '' ? String(p.ic) : (row.impactedClient || 'NO');
        row.faultDate           = (f('t_fault_date') && f('t_fault_date').value) || row.faultDate || '';
        row.ticketId            = p.tt  || row.ticketId  || '';
        row.rootCause           = p.rootCause || row.rootCause || 'Yet to identify';

        S.add('incidents', row);
        AI.learn(p.category, cls.dept);
        if (typeof U !== 'undefined' && U.toast) U.toast('Saved to Incident Log', 'success');
      } catch (err) {
        console.error('[t_confirm] failed:', err);
        if (typeof U !== 'undefined' && U.toast) U.toast('Save failed: ' + (err && err.message ? err.message : err), 'error');
        return;
      }

      // 1) Refresh the in-page mini log so the new row appears immediately.
      if (typeof renderInc === 'function') renderInc();
      // 2) Re-render the master Incident Log page if it's been registered.
      if (window.NMCPages && typeof window.NMCPages.incidentLog === 'function') {
        try { window.NMCPages.incidentLog(); } catch (e) { /* not yet registered */ }
      }
      // 3) Re-render this page so the form clears and local closures pick up
      //    the fresh `inc` array.
      render();
    });

    f('c_confirm').addEventListener('click', () => {
      try {
        const p = gatherClose();
        if (!p.tt) { if (typeof U !== 'undefined' && U.toast) U.toast('Ticket ID is required to close', 'warn'); return; }

        // CASE B: Ticket ID / TT does NOT match any row in the Incident Log.
        // We do a strict, case-sensitive lookup on the Ticket ID column. If
        // nothing matches, we block the update and surface a clear warning.
        const idx = inc.findIndex(i => (i.ticketId || '').trim() === p.tt);
        if (idx < 0) {
          if (typeof U !== 'undefined' && U.toast) U.toast('TT match kore nai — Ticket ID "' + p.tt + '" was not found in the Incident Log', 'error');
          return;
        }

        // CASE A: TT matches. Recompute the outage duration from the actual
        // date+time fields (not from whatever the user typed in the display
        // field), so multi-day outages calculate correctly. The live display
        // is then re-pushed into the in-page field and the store row.
        const faultDt    = parseDateTime(f('c_fault_date') && f('c_fault_date').value,
                                         f('c_fault_hh')   && f('c_fault_hh').value,
                                         f('c_fault_mm')   && f('c_fault_mm').value);
        const restoredDt = parseDateTime(f('c_time_date')  && f('c_time_date').value,
                                         f('c_time_hh')    && f('c_time_hh').value,
                                         f('c_time_mm')    && f('c_time_mm').value);
        const duration = formatDurationFromDates(faultDt, restoredDt);

        // Push the recomputed duration back into the in-page display so the
        // user sees what we actually saved.
        const disp = f('c_duration_display');
        if (disp) disp.textContent = duration || '—';

        S.update('incidents', inc[idx].id, {
          // Close Ticket [Restoration Date]   -> Incident Log [Restoration Date]
          restorationDate: (f('c_time_date') && f('c_time_date').value) || '',
          // Close Ticket [Restoration Time]   -> Incident Log [Restoration Time]
          restorationTime: p.restoredTime,
          // Auto-calculated [Outage Duration]  -> Incident Log [Duration]
          duration: duration,
          // Close Ticket [Root Cause]          -> Incident Log [Root Cause]
          rootCause: p.rootCause,
          // Close Ticket [Status]              -> Incident Log [Current Status]
          currentStatus: f('c_status') ? f('c_status').value : 'Solved',
          // Close Category is also captured as the resolution action
          actionTaken: p.closeCategory
        });
        if (typeof U !== 'undefined' && U.toast) U.toast('Ticket Closed & Synchronized', 'success');

        // Mirror the create flow: refresh both the in-page mini log and the
        // master Incident Log page so the closed status / duration show up
        // without a manual refresh.
        if (typeof renderInc === 'function') renderInc();
        if (window.NMCPages && typeof window.NMCPages.incidentLog === 'function') {
          try { window.NMCPages.incidentLog(); } catch (e) { /* not yet registered */ }
        }
        render();
      } catch (err) {
        console.error('[c_confirm] failed:', err);
        if (typeof U !== 'undefined' && U.toast) U.toast('Close failed: ' + (err && err.message ? err.message : err), 'error');
      }
    });

    function renderInc() {
      const q = f('inc_search') ? f('inc_search').value.toLowerCase() : '';
      const st = f('inc_filter') ? f('inc_filter').value : '';
      const rows = inc.filter(i =>
        (!q || [i.ticketId, i.incidentName, i.incidentSubCategory].some(v => (v||'').toLowerCase().includes(q))) &&
        (!st || i.currentStatus === st)
      );
      const tb = document.querySelector('#inc_table tbody');
      if (tb) tb.innerHTML = rows.slice(0, 40).map(i => `<tr><td>${i.date || ''}</td><td><code>${i.ticketId || ''}</code></td><td>${i.incidentName || ''}</td><td>${i.incidentSubCategory || ''}</td><td>${i.zone || ''}</td><td>${i.impactedClient || ''}</td><td>${i.faultTime || ''}</td><td>${i.restorationTime || ''}</td><td>${i.duration || ''}</td><td><span class="status">${i.currentStatus || ''}</span></td><td>${i.forwardDepartment || ''}</td></tr>`).join('');
    }
    if (f('inc_search')) f('inc_search').addEventListener('input', renderInc);
    if (f('inc_filter')) f('inc_filter').addEventListener('change', renderInc);
    renderInc();
    aiLabel();
  }

  window.NMCPages.tickets = render;
})();
