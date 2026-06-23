// pages/settings.js — Portal settings (WhatsApp group, theme, backup)
(function () {
  const S = window.NMCStore, U = window.NMCUI;

  function render() {
    const view = document.getElementById('view');
    const sets = S.get('settings', { wa_group: '', shift_collision_window: '14-16', theme: 'dark' });

    view.innerHTML = `
      <div class="card">
        <h3>Settings</h3>
        <div class="row">
          <div class="col-6">
            <label>WhatsApp Group ID (for wa.me link)</label>
            <input id="s_wa" value="${U.escapeHtml(sets.wa_group||'')}" placeholder="8801XXXXXXXXX" />
            <div class="muted" style="margin-top:4px">Use the group's invite number. Leave blank to share to "any contact".</div>
          </div>
          <div class="col-6">
            <label>Shift collision window (HH-HH)</label>
            <input id="s_col" value="${U.escapeHtml(sets.shift_collision_window||'14-16')}" />
            <div class="muted" style="margin-top:4px">Used by AI to detect overlap between Morning and Evening roster.</div>
          </div>
          <div class="col-6">
            <label>Default ticket type</label>
            <select id="s_tt">
              <option ${sets.ticketType==='Major'?'selected':''}>Major</option>
              <option ${sets.ticketType==='Minor'?'selected':''}>Minor</option>
              <option ${sets.ticketType==='Informational'?'selected':''}>Informational</option>
            </select>
          </div>
          <div class="col-6">
            <label>Default department (forward)</label>
            <select id="s_dept">
              <option ${sets.defaultDept==='NGNC'?'selected':''}>NGNC</option>
              <option ${sets.defaultDept==='BNOC'?'selected':''}>BNOC</option>
              <option ${sets.defaultDept==='NCSS'?'selected':''}>NCSS</option>
              <option ${sets.defaultDept==='Survey & Transmission'?'selected':''}>Survey & Transmission</option>
              <option ${sets.defaultDept==='BTS & Power Infrastructure'?'selected':''}>BTS & Power Infrastructure</option>
            </select>
          </div>
        </div>
        <div class="flex" style="margin-top:12px">
          <button class="btn success" id="s_save">Save</button>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <h3>Backup & Restore</h3>
        <div class="flex">
          <button class="btn" id="bk_export">⬇ Export all data (JSON)</button>
          <button class="btn warn" id="bk_import">⬆ Import JSON</button>
          <button class="btn danger" id="bk_reset">⚠ Reset everything</button>
        </div>
        <div class="muted" style="margin-top:6px">All data is stored in your browser (localStorage). Use Export to back up.</div>
      </div>

      <div class="card" style="margin-top:14px">
        <h3>Storage</h3>
        <div id="s_storage" class="muted">Calculating…</div>
      </div>

      <div class="card" style="margin-top:14px">
        <h3>Dropdown Manager <span class="muted" style="font-weight:400;font-size:12px">— choose which values appear in Incident Log & Ticket form fields</span></h3>
        <div class="muted" style="margin-bottom:10px">Each row is a field from the incident log. Type a value and press <b>Add</b> (or Enter) to append. Click <b>×</b> on a chip to remove it. Empty a field to keep it as free-text. <b>Session / Session Engineers / Name</b> auto-pull from the roster; <b>Fault Time / Restoration Time</b> default to 24h 15-min slots; <b>Fault Date / Restoration Date / Date</b> use native date pickers. <b>Duration</b> is auto-calculated from those four fields and <b>&gt;4h Duration</b> is auto-derived. Free-text-only fields (dates, ticket ID, names, etc.) are marked accordingly and disabled.</div>
        <div class="flex" style="margin-bottom:10px">
          <button class="btn warn" id="dd_reset">↺ Reset all dropdowns to defaults</button>
          <button class="btn success" id="dd_addfield">+ Enable dropdown on free-text field</button>
        </div>
        <div id="dd_list"></div>
      </div>
    `;

    const $ = (id) => document.getElementById(id);
    $('s_save').addEventListener('click', () => {
      const obj = {
        wa_group: $('s_wa').value.trim(),
        shift_collision_window: $('s_col').value.trim(),
        ticketType: $('s_tt').value,
        defaultDept: $('s_dept').value
      };
      S.set('settings', obj);
      U.toast('Settings saved', 'success');
    });

    $('bk_export').addEventListener('click', () => {
      const all = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('nmc.')) {
          try { all[k] = JSON.parse(localStorage.getItem(k)); }
          catch { all[k] = localStorage.getItem(k); }
        }
      }
      const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'nmc-backup-' + new Date().toISOString().slice(0,10) + '.json';
      a.click();
    });
    $('bk_import').addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json';
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          try {
            const obj = JSON.parse(r.result);
            Object.keys(obj).forEach(k => { if (k.startsWith('nmc.')) localStorage.setItem(k, JSON.stringify(obj[k])); });
            U.toast('Imported backup', 'success');
            render();
          } catch (e) { U.toast('Invalid JSON', 'danger'); }
        };
        r.readAsText(f);
      };
      inp.click();
    });
    $('bk_reset').addEventListener('click', () => {
      if (!confirm('Erase ALL NMC data? This cannot be undone.')) return;
      Object.keys(localStorage).filter(k => k.startsWith('nmc.')).forEach(k => localStorage.removeItem(k));
      U.toast('All data cleared. Reloading…', 'success');
      setTimeout(() => location.reload(), 800);
    });

    // Storage usage
    let total = 0, count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('nmc.')) {
        total += (localStorage.getItem(k) || '').length;
        count++;
      }
    }
    document.getElementById('s_storage').textContent = `${count} keys · ${(total/1024).toFixed(1)} KB used in this browser.`;

    // ===== Dropdown Manager =====
    // Same field list as incidentLog.js COLS. Free-text-only fields are marked
    // as `textOnly: true` so the manager can label them as such.
    const FIELDS = [
      { key: 'session',               label: 'Session (auto from roster)', textOnly: false },
      { key: 'sessionEngineers',      label: 'Session Engineers (auto from roster)', textOnly: false },
      { key: 'name',                  label: 'Name (acting engineer, auto from roster)', textOnly: false },
      { key: 'date',                  label: 'Date (date picker)',         textOnly: true  },
      { key: 'incidentName',          label: 'Incident Name',              textOnly: true  },
      { key: 'incidentCategory',      label: 'Incident Category',          textOnly: false },
      { key: 'incidentSubCategory',   label: 'Incident Sub-Category',      textOnly: false },
      { key: 'zone',                  label: 'Zone',                       textOnly: false },
      { key: 'serviceImpacted',       label: 'Service Impacted',           textOnly: false },
      { key: 'impactedClient',        label: 'Impacted Client',            textOnly: true  },
      { key: 'faultDate',             label: 'Fault Date (date picker)',   textOnly: true  },
      { key: 'faultTime',             label: 'Fault Time (24h)',           textOnly: false },
      { key: 'restorationDate',       label: 'Restoration Date (date picker)', textOnly: true  },
      { key: 'restorationTime',       label: 'Restoration Time (24h)',     textOnly: false },
      { key: 'duration',              label: 'Duration (auto)',            textOnly: true  },
      { key: 'durationOver4h',        label: '>4h Duration (auto)',        textOnly: false },
      { key: 'ticketId',              label: 'Ticket ID',                  textOnly: true  },
      { key: 'ticketType',            label: 'Ticket Type',                textOnly: false },
      { key: 'rootCause',             label: 'Root Cause',                 textOnly: true  },
      { key: 'rcaProvider',           label: 'RCA Provider Name',          textOnly: true  },
      { key: 'rcaProviderContact',    label: 'RCA Provider Contact',       textOnly: true  },
      { key: 'actionTaken',           label: 'Action Taken',               textOnly: true  },
      { key: 'issueType',             label: 'Issue Type',                 textOnly: false },
      { key: 'forwardDepartment',     label: 'Forward Department',         textOnly: false },
      { key: 'responsibleTeam',       label: 'Responsible Team',           textOnly: false },
      { key: 'informedPerson',        label: 'Informed Person',            textOnly: true  },
      { key: 'informedTimeMedia',     label: 'Informed Time/Media',        textOnly: true  },
      { key: 'ticketUpdateBy',        label: 'Ticket Update By',           textOnly: true  },
      { key: 'whatsappNotified',      label: 'WhatsApp Notified',          textOnly: false },
      { key: 'mailGenerated',         label: 'Mail Generated',             textOnly: false },
      { key: 'queryMail',             label: 'Query Mail',                 textOnly: true  },
      { key: 'ttForMail',             label: 'TT for Mail',                textOnly: true  },
      { key: 'currentStatus',         label: 'Current Status',             textOnly: false },
      { key: 'rcaDocumentStatus',     label: 'RCA Document Status',        textOnly: false }
    ];

    function renderDDList() {
      const all = window.NMCStore.get('dropdownOptions', null) || window.NMCAI.DropdownConfig.defaults;
      const host = document.getElementById('dd_list');
      host.innerHTML = FIELDS.map(f => {
        const opts = (all[f.key] || []);
        const chips = opts.map((v, i) => `<span class="tag" data-key="${f.key}" data-idx="${i}" style="cursor:pointer">${U.escapeHtml(v)} <b style="color:var(--tag-red);margin-left:4px">×</b></span>`).join(' ');
        const isOff = opts.length === 0;
        const status = f.textOnly
          ? '<span class="muted" style="font-size:11px">free text</span>'
          : (isOff
              ? '<span class="muted" style="font-size:11px">free text (no dropdown)</span>'
              : '<span class="muted" style="font-size:11px">' + opts.length + ' option(s)</span>');
        return `
          <div class="dd-row" data-key="${f.key}" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #1f2a3d">
            <label style="min-width:200px;margin:0"><b>${U.escapeHtml(f.label)}</b> <code style="font-size:10px;color:var(--code-muted)">${f.key}</code></label>
            <span style="flex:1;display:flex;flex-wrap:wrap;gap:4px" class="dd-chips">${chips || '<span class="muted" style="font-size:11px">—</span>'}</span>
            ${f.textOnly ? '' : `<input class="dd-add" data-key="${f.key}" placeholder="add option…" style="max-width:160px" />
              <button class="btn ghost dd-addbtn" data-key="${f.key}">Add</button>`}
            ${status}
          </div>
        `;
      }).join('');

      // Wire up chip removal
      host.querySelectorAll('.tag[data-key]').forEach(t => {
        t.addEventListener('click', () => {
          const k = t.dataset.key, i = +t.dataset.idx;
          const cur = (window.NMCStore.get('dropdownOptions', null) || window.NMCAI.DropdownConfig.defaults);
          const arr = (cur[k] || []).slice();
          arr.splice(i, 1);
          cur[k] = arr;
          window.NMCStore.set('dropdownOptions', cur);
          U.toast('Removed', 'success');
          renderDDList();
        });
      });
      // Wire up add
      host.querySelectorAll('.dd-add').forEach(inp => {
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(inp); } });
      });
      host.querySelectorAll('.dd-addbtn').forEach(b => {
        b.addEventListener('click', () => doAdd(host.querySelector('.dd-add[data-key="' + b.dataset.key + '"]')));
      });
    }
    function doAdd(inp) {
      if (!inp) return;
      const k = inp.dataset.key;
      const v = inp.value.trim();
      if (!v) return;
      const cur = window.NMCStore.get('dropdownOptions', null) || window.NMCAI.DropdownConfig.defaults;
      const arr = (cur[k] || []).slice();
      if (arr.indexOf(v) < 0) arr.push(v);
      cur[k] = arr;
      window.NMCStore.set('dropdownOptions', cur);
      inp.value = '';
      U.toast('Added', 'success');
      renderDDList();
    }
    renderDDList();
    document.getElementById('dd_reset').addEventListener('click', () => {
      if (!confirm('Reset every dropdown back to factory defaults? Your custom options will be lost.')) return;
      window.NMCAI.DropdownConfig.reset();
      U.toast('Dropdowns reset to defaults', 'success');
      renderDDList();
    });
    document.getElementById('dd_addfield').addEventListener('click', () => {
      const k = prompt('Field key to enable as dropdown (must be a valid incident-log column):', 'informedPerson');
      if (!k) return;
      const cur = window.NMCStore.get('dropdownOptions', null) || window.NMCAI.DropdownConfig.defaults;
      if (!cur[k]) cur[k] = [];
      window.NMCStore.set('dropdownOptions', cur);
      renderDDList();
      U.toast('Field enabled — add options below', 'success');
    });
  }

  window.NMCPages = window.NMCPages || {};
  window.NMCPages.settings = render;
})();
