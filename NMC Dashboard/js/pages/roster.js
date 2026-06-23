// pages/roster.js — Duty roster: 6 department boxes, CSV upload, hover/click for contact
(function () {
  const S = window.NMCStore, U = window.NMCUI, AI = window.NMCAI;

  // Shift definitions.  `priority` controls the display order in the
  // Roster table — lower number = shown first.  The user-specified
  // duty-shift priority (time-wise) is:
  //   1. General          → always first
  //   2. Morning          → starts the day
  //   3. Early Evening    → the late-afternoon overlap window
  //   4. Evening          → the regular evening
  //   5. Late Evening     → the late-evening home-office shift
  // After that, Night (overnight) and the meta buckets (Weekend,
  // Custom, Leave) follow in that order.
  const SHIFTS = [
    { name: 'General',       priority: 1, start: 0,  end: 0,  color: '#6ad29c' },
    { name: 'Morning',       priority: 2, start: 8,  end: 16, color: '#ffd166' },
    { name: 'Early Evening', priority: 3, start: 13, end: 21, color: '#a3c9ff' },
    { name: 'Evening',       priority: 4, start: 14, end: 22, color: '#4f8cff' },
    { name: 'Late Evening',  priority: 5, start: 16, end: 24, color: '#b18cff' },
    { name: 'Night',         priority: 6, start: 22, end: 32, color: '#7ad7f0' },
    { name: 'Weekend',       priority: 7, start: 0,  end: 0,  color: '#9aa4b2' },
    { name: 'Custom',        priority: 8, start: 0,  end: 0,  color: '#c98bff' },
    { name: 'Leave',         priority: 9, start: 0,  end: 0,  color: '#ff7a90' }
  ];

  // NCSS shift labels include the duty timeframe in parens, e.g.
  //   "Morning (8:00 am -5:00 pm)", "Custom (Compensatory)",
  //   "Night (10:00 PM - 8:00 AM)".  Map those back to the base shift
  // for color / start-time lookup.
  function shiftBaseName(label) {
    if (!label) return '';
    const m = String(label).match(/^([A-Za-z &]+?)\s*\(/);
    return m ? m[1].trim() : String(label);
  }
  function findShift(label) {
    if (!label) return null;
    return SHIFTS.find(s => s.name === label) ||
           SHIFTS.find(s => s.name === shiftBaseName(label)) ||
           null;
  }

  // Numeric priority for a shift label, used to order rows.  Unknown
  // shifts (e.g. an unparsed time slot) sort to the end.
  function shiftPriority(label) {
    const sh = findShift(label);
    return sh ? sh.priority : 999;
  }

  // 6 boxes, in order
  const BOXES = [
    { key: 'NMC',         label: 'NMC',         color: '#4f8cff' },
    { key: 'NGNC',        label: 'NGNC',        color: '#7ad7f0' },
    { key: 'BNOC',        label: 'BNOC',        color: '#6ad29c' },
    { key: 'NCSS Dhaka',  label: 'NCSS Dhaka',  color: '#ffb454' },
    { key: 'S&T',         label: 'S&T',         color: '#c98bff' },
    { key: 'BTS & Power', label: 'BTS & Power', color: '#ff7a90' }
  ];

  // Map a free-form dept string to one of the 6 box keys
  function deptKey(s) {
    if (!s) return '';
    const t = String(s).trim();
    const low = t.toLowerCase();
    if (low === 'nmc') return 'NMC';
    if (low === 'ngnc') return 'NGNC';
    if (low === 'bnoc') return 'BNOC';
    if (low === 'ncss dhaka' || low === 'ncss-dhaka' || (low === 'ncss' && /dhaka/i.test(t))) return 'NCSS Dhaka';
    if (low === 's&t' || low === 's & t' || low === 'survey & transmission' || low === 'survey and transmission') return 'S&T';
    if (low === 'bts & power' || low === 'bts and power' || low === 'bts & power infrastructure' || low === 'bts and power infrastructure') return 'BTS & Power';
    // NCSS but not Dhaka — hide (per user: only NCSS Dhaka is shown)
    if (low === 'ncss' || low.startsWith('ncss ')) return '';
    return ''; // unknown department — hidden
  }

  // Map a box key to the matching parser function in NMCRosterParsers
  function parserForDept(key) {
    const P = window.NMCRosterParsers;
    if (!P) return null;
    if (key === 'NMC')         return P.parseNMC;
    if (key === 'NGNC')        return P.parseNGNC;
    if (key === 'BNOC')        return P.parseBNOC;
    if (key === 'NCSS Dhaka')  return P.parseNCSS;
    if (key === 'S&T')         return P.parseSNT;
    if (key === 'BTS & Power') return P.parseBTS;
    return null;
  }

  // Simple CSV → rows[][] parser (handles quoted cells with embedded newlines)
  function csvToRows(text) {
    const rows = [];
    let row = [], cell = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else inQ = false;
        } else { cell += ch; }
      } else {
        if (ch === '"') { inQ = true; }
        else if (ch === ',') { row.push(cell); cell = ''; }
        else if (ch === '\r') { /* skip */ }
        else if (ch === '\n') { row.push(cell); cell = ''; rows.push(row); row = []; }
        else { cell += ch; }
      }
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function escapeAttr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }

    // Copy `text` to the clipboard.  Uses the async Clipboard API where
    // available (HTTPS / localhost); falls back to a hidden <textarea> +
    // document.execCommand('copy') for file:// and other non-secure
    // contexts where navigator.clipboard is undefined.  Resolves true on
    // success, false otherwise.
    function copyToClipboard(text) {
      const val = String(text == null ? '' : text);
      if (!val) return Promise.resolve(false);
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(val)
          .then(() => true)
          .catch(() => fallbackCopy(val));
      }
      return Promise.resolve(fallbackCopy(val));
    }
    function fallbackCopy(text) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        return !!ok;
      } catch (_) { return false; }
    }
  function render() {
    const view = document.getElementById('view');
    const rosters = S.list('rosters');
    const contacts = S.list('contacts');

    const today = new Date().toISOString().slice(0, 10);

    view.innerHTML = `
      <div class="card">
        <div class="flex" style="flex-wrap:wrap;gap:8px;align-items:center">
          <h3 style="margin-right:auto">Duty Roster</h3>
          <input id="r_qname" placeholder="Search name…" style="max-width:200px" />
          <input id="r_date" type="date" value="${today}" title="Filter by date" />
          <select id="r_dept" title="Department for CSV upload">
            <option value="">— Upload dept —</option>
            ${BOXES.map(b => `<option value="${U.escapeHtml(b.key)}">${U.escapeHtml(b.label)}</option>`).join('')}
          </select>
          <button class="btn ghost" id="r_load" title="Upload a CSV duty roster sheet">📋 Load Sheet</button>
          <input type="file" id="r_file" accept=".csv,.txt" style="display:none" />
        </div>
      </div>

      <div id="r_boxes" class="roster-grid"></div>
    `;

    const $ = (id) => document.getElementById(id);

    // Tooltip element (single, shared)
    const tip = document.createElement('div');
    tip.className = 'roster-tip';
    tip.style.cssText = 'position:fixed;z-index:9999;background:var(--card);color:var(--text);padding:8px 10px;border-radius:8px;border:1px solid var(--border);box-shadow:0 6px 20px rgba(0,0,0,.2);font-size:13px;pointer-events:none;opacity:0;transition:opacity .12s;max-width:240px';
    document.body.appendChild(tip);

    function showTip(html, ev) {
      tip.innerHTML = html;
      tip.style.opacity = '1';
      const x = Math.min(ev.clientX + 12, window.innerWidth - 260);
      const y = Math.min(ev.clientY + 12, window.innerHeight - 80);
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    }
    function hideTip() { tip.style.opacity = '0'; }

    function lookupPhone(name) {
      if (!name) return null;
      if (window.NMCFindContact) return window.NMCFindContact(name);
      const q = String(name).trim().toLowerCase();
      return contacts.find(c => (c.name||'').toLowerCase() === q)
          || contacts.find(c => (c.name||'').toLowerCase().includes(q))
          || null;
    }

    // Convert a roster row to the [start, end] millisecond window for the
    // day+shift the row is bound to. Falls back to the full day if shift
    // info is missing/unknown.
    function rowWindow(r) {
      const dayStart = r.date ? new Date(r.date + 'T00:00:00').getTime() : null;
      const dayEnd   = r.date ? new Date(r.date + 'T23:59:59').getTime() : null;
      if (!dayStart) return [null, null];
      const sh = findShift(r.shift);
      if (!sh) return [dayStart, dayEnd];
      // Allow end=32 to mean 08:00 the next day by using a fresh Date.
      const sBase = new Date(r.date + 'T00:00:00');
      const eBase = new Date(r.date + 'T00:00:00');
      const sMs = sBase.getTime() + sh.start * 3600 * 1000;
      const eMs = eBase.getTime() + sh.end   * 3600 * 1000;
      return [sMs, eMs];
    }

    function inWindow(r, fromMs, toMs) {
      if (fromMs == null && toMs == null) return true;
      const [s, e] = rowWindow(r);
      if (s == null) return false;
      if (fromMs != null && e != null && e < fromMs) return false;
      if (toMs   != null && s > toMs)              return false;
      return true;
    }

    function renderBox(box, rows) {
      // Filter to this box's department first (each box only shows its own
      // dept's schedule). Use deptKey() for fuzzy matching so parsers
      // can stamp rows with the same free-form dept strings.
      const deptRows = rows.filter(r => deptKey(r.department) === box.key);
      const visibleRows = deptRows.filter(r => {
        const qn = ($('r_qname').value || '').toLowerCase();
        if (qn) {
          const engs = (r.engineers || []).join(' ').toLowerCase();
          if (!engs.includes(qn) && !(r.notes||'').toLowerCase().includes(qn)) return false;
        }
        return true;
      }).slice().sort((a, b) => {
        // 1) shift priority (lower number = higher in the list)
        const dp = shiftPriority(a.shift) - shiftPriority(b.shift);
        if (dp) return dp;
        // 2) then by date (so the same shift on different days groups)
        if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
        // 3) then by shift label text (e.g. "Morning (8:00 am -5:00 pm)"
        //    vs "Morning (9:00 am -6:00 pm)")
        if (a.shift !== b.shift) return a.shift < b.shift ? -1 : 1;
        return 0;
      });

      const body = visibleRows.map(r => {
      const sh = findShift(r.shift);
        const shiftBg = sh ? sh.color + '22' : '';
        const shiftFg = sh ? sh.color : '';
        const engs = (r.engineers || []);
        const engHtml = engs.map(name => {
          const c = lookupPhone(name);
          const phone = c ? (c.phone || c.ipPhone || '') : '';
          return `<span class="chip" data-name="${escapeAttr(name)}" style="cursor:pointer;${phone?'':'opacity:.7'}">${U.escapeHtml(name)}${phone?' 📞':''}</span>`;
        }).join(' ');
        return `<tr data-id="${r.id}">
          <td><span class="tag" style="background:${shiftBg};color:${shiftFg}">${U.escapeHtml(r.shift)}</span></td>
          <td>${engHtml || '<span class="muted">—</span>'}</td>
          <td>${U.escapeHtml(r.notes||'')}</td>
        </tr>`;
      }).join('') || `<tr><td colspan="3" class="muted" style="text-align:center;padding:14px">No schedule</td></tr>`;

      return `
        <div class="card roster-box" data-box="${box.key}">
          <div class="flex" style="align-items:center;gap:8px">
            <span class="dot" style="background:${box.color};width:10px;height:10px;border-radius:50%;display:inline-block"></span>
            <h3 style="margin:0">${U.escapeHtml(box.label)}</h3>
            <span class="muted" style="margin-left:auto">${visibleRows.length} shift(s)</span>
          </div>
          <div class="table-wrap" style="margin-top:8px;max-height:280px;overflow:auto">
            <table class="data">
              <thead><tr><th>Shift</th><th>Engineers</th><th>Notes</th></tr></thead>
              <tbody>${body}</tbody>
            </table>
          </div>
        </div>`;
    }

    function refresh() {
      // Single date filter: show rows whose date matches the picked date.
      const dateVal = $('r_date').value;
      const dayRows = dateVal
        ? rosters.filter(r => r.date === dateVal)
        : rosters;

      // Render all 6 boxes; each renderBox filters to its own department
      // (no schedule for a dept → "No schedule" placeholder).
      const html = BOXES.map(b => renderBox(b, dayRows)).join('');
      const wrap = document.getElementById('r_boxes');
      wrap.innerHTML = html;

      // Per-row delete button was removed per user request — rows are now
      // managed only by re-uploading the department's CSV sheet.

      // Hover/click on engineer chips -> phone tooltip
      wrap.querySelectorAll('.chip[data-name]').forEach(c => c.addEventListener('mouseenter', ev => {
        const name = c.dataset.name;
        const match = lookupPhone(name);
        const tipHtml = match
          ? `<b>${U.escapeHtml(match.name)}</b><br>${U.escapeHtml(match.role||'')}<br>📞 ${U.escapeHtml(match.phone||match.ipPhone||'—')}<br>${U.escapeHtml(match.email||'')}`
          : `<b>${U.escapeHtml(name)}</b><br><span class="muted">No contact match</span>`;
        showTip(tipHtml, ev);
      }));
      wrap.querySelectorAll('.chip[data-name]').forEach(c => c.addEventListener('mousemove', ev => {
        const x = Math.min(ev.clientX + 12, window.innerWidth - 260);
        const y = Math.min(ev.clientY + 12, window.innerHeight - 80);
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
      }));
      wrap.querySelectorAll('.chip[data-name]').forEach(c => c.addEventListener('mouseleave', hideTip));
      wrap.querySelectorAll('.chip[data-name]').forEach(c => c.addEventListener('click', ev => {
        const name = c.dataset.name;
        const match = lookupPhone(name);
        const phone = match && (match.phone || match.ipPhone);
        if (phone) {
          copyToClipboard(phone).then(ok => {
            if (ok) {
              U.toast(`Copied ${phone} for ${match.name || name}`, 'info', 2500);
              // Brief visual confirmation on the chip itself
              c.classList.add('chip-copied');
              setTimeout(() => c.classList.remove('chip-copied'), 900);
            } else {
              U.toast(`Could not copy — phone: ${phone}`, 'warn', 4000);
            }
          });
        } else {
          U.toast('No contact number for ' + name, 'warn');
        }
      }));
    }

    // Re-render the boxes whenever filter inputs change.
    ['change', 'input'].forEach(evt => {
      ['r_date', 'r_qname'].forEach(id => {
        const el = $(id);
        if (el) el.addEventListener(evt, refresh);
      });
    });

    // CSV upload: Load Sheet button → file picker → parse → store → re-render
    $('r_load').addEventListener('click', () => {
      const deptKey = $('r_dept').value;
      if (!deptKey) {
        U.toast('Select a department first', 'warn');
        return;
      }
      $('r_file').click();
    });

    $('r_file').addEventListener('change', (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const deptKeyVal = $('r_dept').value;
      if (!deptKeyVal) {
        U.toast('Select a department first', 'warn');
        ev.target.value = '';
        return;
      }
      const parser = parserForDept(deptKeyVal);
      if (!parser) {
        const P = window.NMCRosterParsers;
        const reason = !P
          ? 'parser module not loaded (check console)'
          : ('No parser for ' + deptKeyVal + ' yet');
        console.warn('Roster upload blocked:', reason, { deptKey: deptKeyVal, availableParsers: P ? Object.keys(P) : null });
        U.toast(reason, 'warn');
        ev.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const rows = csvToRows(text);
          const batchId = 'batch-' + Date.now().toString(36);
          const parsed = parser(rows, { filename: file.name, batchId });
          if (!parsed.length) {
            U.toast('No rows parsed from ' + file.name, 'warn');
            ev.target.value = '';
            return;
          }
          // Assign IDs + createdAt to each parsed row, then drop previous
          // rows for the same department (replace on re-upload) and save once.
          const now = new Date().toISOString();
          const newRows = parsed.map(r => Object.assign(
            { id: S.uid('roster'), createdAt: now },
            r
          ));
          const existing = S.list('rosters');
          const kept = existing.filter(r => deptKey(r.department) !== deptKeyVal);
          S.set('rosters', kept.concat(newRows));
          U.toast(newRows.length + ' rows loaded for ' + deptKeyVal, 'success');
          render();
        } catch (err) {
          console.error('Roster parse error', err);
          U.toast('Parse error: ' + err.message, 'warn');
        }
        ev.target.value = '';
      };
      reader.readAsText(file);
    });

    refresh();
  }

  window.NMCPages = window.NMCPages || {};
  window.NMCPages.roster = render;
})();
