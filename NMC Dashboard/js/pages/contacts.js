// pages/contacts.js — Global contact list with Google Sheet sync, per-department filter, AI search
(function () {
  const S = window.NMCStore, U = window.NMCUI, AI = window.NMCAI;

  // Google Sheet — Master Directory tab (gid=1311561267) — same source as the
  // standalone contact.html, only the specific sheet tab is targeted via &gid=
  const SHEET_ID = '1_G63SYdudf3tiA_TzY5dtJD6oOkWWK8_lgg39D_tqjU';
  const SHEET_GID = '1311561267';
  const SHEET_CSV = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
  // Sheet columns: Department, Name, Designation, Phone Number, Escalation, ID, Area, IP Phone

  // Department tree — collapsible list with sub-departments
  // key values are the canonical dept values stored on a contact.
  const DEPT_TREE = [
    { key: 'NMC',   label: 'NMC' },
    { key: 'NGNC',  label: 'NGNC' },
    { key: 'BNOC',  label: 'BNOC' },
    { key: 'S&T',   label: 'S&T' },
    { key: 'BTS & Power', label: 'Power' },
    {
      key: 'NCSS', label: 'NCSS', children: [
        { key: 'NCSS - Dhaka',        label: 'Zonal - Dhaka' },
        { key: 'NCSS - Dhaka Outer',  label: 'Zonal - Dhaka Outer' },
        { key: 'NCSS - CTG',          label: 'Zonal - CTG' },
        { key: 'NCSS - North',        label: 'Zonal - North' },
        { key: 'NCSS - Sylhet',       label: 'Zonal - Sylhet' },
        { key: 'NCSS - Khulna',       label: 'Zonal - Khulna' }
      ]
    },
    {
      key: 'Others', label: 'Others', children: [
        { key: 'Telco/NTTN',   label: 'Telco/NTTN' },
        { key: 'MIS',          label: 'MIS' },
        { key: 'I&I',          label: 'I&I' },
        { key: 'BSCCL',        label: 'BSCCL' },
        { key: 'Velocity IIG', label: 'Velocity IIG' },
        { key: 'Solarwinds',   label: 'Solarwinds' },
        { key: 'Helpdesk',     label: 'Helpdesk' },
        { key: 'IT',           label: 'IT' },
        { key: 'Web',          label: 'Web' },
        { key: 'HR',           label: 'HR' },
        { key: 'TISD',         label: 'TISD' },
        { key: 'SAT',          label: 'SAT' },
        { key: 'Store',        label: 'Store' },
        { key: 'Others',       label: 'Others' }
      ]
    }
  ];

  // Flat list of every recognized department key (for dropdowns / iteration)
  const DEPTS = (function flatten(nodes, out) {
    nodes.forEach(n => { out.push(n.key); if (n.children) flatten(n.children, out); });
    return out;
  })(DEPT_TREE, []);

  // Map a contact's stored dept to a tree-node key (for filtering and counts)
  function nodeKeyOf(dept) {
    if (!dept) return '';
    const low = String(dept).trim().toLowerCase();
    // Direct keys
    const direct = {
      'nmc': 'NMC', 'ngnc': 'NGNC', 'bnoc': 'BNOC',
      's&t': 'S&T', 's & t': 'S&T', 'survey & transmission': 'S&T', 'survey and transmission': 'S&T',
      'bts & power': 'BTS & Power', 'bts and power': 'BTS & Power',
      'bts & power infrastructure': 'BTS & Power', 'bts and power infrastructure': 'BTS & Power'
    };
    if (direct[low]) return direct[low];
    // NCSS sub-zones
    if (low.startsWith('ncss')) {
      if (low.includes('dhaka outer') || low.includes('outer dhaka')) return 'NCSS - Dhaka Outer';
      if (low.includes('dhaka'))   return 'NCSS - Dhaka';
      if (low.includes('ctg') || low.includes('chittagong')) return 'NCSS - CTG';
      if (low.includes('north'))  return 'NCSS - North';
      if (low.includes('sylhet')) return 'NCSS - Sylhet';
      if (low.includes('khulna')) return 'NCSS - Khulna';
      return 'NCSS';
    }
    // Others buckets
    if (low.startsWith('telco') || low.startsWith('nttn') || low === 'iptsb' || low.includes('iptsb')) return 'Telco/NTTN';
    if (low === 'mis')                                       return 'MIS';
    if (low === 'i&i' || low === 'i & i')                    return 'I&I';
    if (low === 'bsccl' || low === 'bsscl')                  return 'BSCCL';
    if (low.includes('velocity') || low.includes('iig'))     return 'Velocity IIG';
    if (low.includes('solar') || low.includes('solarwinds')) return 'Solarwinds';
    if (low.includes('help'))                                return 'Helpdesk';
    if (low === 'it')                                        return 'IT';
    if (low === 'web')                                       return 'Web';
    if (low === 'hr')                                        return 'HR';
    if (low === 'tisd')                                      return 'TISD';
    if (low === 'sat')                                       return 'SAT';
    if (low === 'store')                                     return 'Store';
    return 'Others';
  }

  // Normalize a free-form department string to a canonical key (used when saving to store)
  function normalizeDept(s) {
    if (!s) return '';
    return nodeKeyOf(s) || s;
  }

  // Recursively gather every leaf key (no children) for a node key
  function leafKeysFor(nodeKey) {
    function find(nodes) {
      for (const n of nodes) {
        if (n.key === nodeKey) {
          if (n.children) return n.children.map(c => c.key);
          return [n.key];
        }
        if (n.children) {
          const r = find(n.children);
          if (r) return r;
        }
      }
      return null;
    }
    return find(DEPT_TREE) || [nodeKey];
  }

  // Parse CSV text into array of objects (simple, supports quoted fields with commas)
  function parseCSV(text) {
    const rows = [];
    let cur = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') inQ = false;
        else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { cur.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
          if (c === '\r' && text[i + 1] === '\n') i++;
          cur.push(field); field = '';
          if (cur.length > 1 || cur[0] !== '') rows.push(cur);
          cur = [];
        } else field += c;
      }
    }
    if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
    if (!rows.length) return [];
    const header = rows[0].map(h => h.trim());
    return rows.slice(1).filter(r => r.some(v => v && v.trim() !== '')).map(r => {
      const o = {};
      header.forEach((h, i) => o[h] = (r[i] || '').trim());
      return o;
    });
  }

  // Map a sheet row to the contact shape used in the app
  function rowToContact(r) {
    const rawDept = (r['Department'] || r['department'] || '').trim();
    const dept = normalizeDept(rawDept);
    return {
      name: r['Name'] || '',
      role: r['Designation'] || r['Role'] || '',
      organization: r['Area'] || r['Organization'] || '',
      zone: r['Area'] || r['Zone'] || '',
      dept: dept,
      rawDept: rawDept,
      phone: r['Phone Number'] || r['Phone'] || '',
      email: r['Escalation'] || r['Email'] || '',
      ipPhone: r['IP Phone'] || '',
      id_val: r['ID'] || '',
      source: 'sheet'
    };
  }

  // Expose contacts globally so other pages (roster) can lookup by name
  function publishGlobal() {
    window.NMCContacts = S.list('contacts');
  }

  // Load Google Sheet (one big sheet) and merge into the local contacts store
  async function loadSheet() {
    U.toast('Loading contacts from Google Sheet…', 'info');
    try {
      const res = await fetch(SHEET_CSV, { redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const rows = parseCSV(text);
      if (!rows.length) { U.toast('Sheet is empty', 'warn'); return; }
      const newOnes = rows.map(rowToContact);
      // Replace existing sheet-sourced contacts to keep things in sync
      const existing = S.list('contacts').filter(c => c.source !== 'sheet');
      const merged = existing.concat(newOnes);
      S.set('contacts', merged);
      S.set('contacts_sheet_meta', { time: new Date().toISOString(), count: newOnes.length });
      publishGlobal();
      U.toast(`Loaded ${newOnes.length} contacts from sheet`, 'success');
      render();
    } catch (e) {
      U.toast('Failed to load sheet: ' + e.message, 'error');
    }
  }

  function render() {
    publishGlobal();
    const view = document.getElementById('view');
    const contacts = S.list('contacts');
    const learn = S.get('contactLearn', {});
    const meta = S.get('contacts_sheet_meta', null);
    const activeDept = render._activeDept || 'ALL';
    const isOpen = !!render._open;
    const activeLabel = (function () {
      if (activeDept === 'ALL') return 'All Departments';
      for (const n of DEPT_TREE) {
        if (n.key === activeDept) return n.label;
        if (n.children) {
          const c = n.children.find(x => x.key === activeDept);
          if (c) return n.label + ' › ' + c.label;
        }
      }
      return activeDept;
    })();

    // Render the collapsible department list
    function nodeHTML(n, depth) {
      const hasKids = !!(n.children && n.children.length);
      const count = contacts.filter(c => leafKeysFor(n.key).includes(c.dept) || c.dept === n.key).length;
      const expanded = render._expanded && render._expanded[n.key];
      const isActive = activeDept === n.key;
      return `
        <li class="dept-node${isActive ? ' active' : ''}" data-key="${U.escapeHtml(n.key)}">
          <div class="dept-row depth-${depth}" data-key="${U.escapeHtml(n.key)}">
            ${hasKids
              ? `<span class="dept-caret${expanded ? ' open' : ''}" data-toggle="${U.escapeHtml(n.key)}">▸</span>`
              : `<span class="dept-caret leaf">·</span>`}
            <span class="dept-label" data-pick="${U.escapeHtml(n.key)}">${U.escapeHtml(n.label)}</span>
            <span class="dept-count">${count}</span>
          </div>
          ${hasKids ? `<ul class="dept-children${expanded ? ' open' : ''}">${n.children.map(c => nodeHTML(c, depth+1)).join('')}</ul>` : ''}
        </li>`;
    }

    view.innerHTML = `
      <div class="card">
        <div class="flex" style="flex-wrap:wrap;gap:8px">
          <h3 style="margin-right:auto">Contacts</h3>
          <input id="c_q" placeholder="Search name, role, vendor…" style="max-width:260px" />
          <button class="btn primary" id="c_search">🔍 Search</button>
          <button class="btn ghost" id="c_loadsheet">📋 Load Sheet</button>
          <button class="btn success" id="c_add">+ Add</button>
        </div>
        <div class="muted" id="c_meta" style="margin-top:6px">
          ${contacts.length} contacts · ${Object.keys(learn).length} learned mappings
          ${meta ? ` · Sheet: ${new Date(meta.time).toLocaleString()} (${meta.count})` : ''}
        </div>
        <div class="dept-dropdown${isOpen ? ' open' : ''}" id="c_deptdrop" style="margin-top:12px">
          <button class="dept-trigger" id="c_depttrigger" type="button" aria-haspopup="true" aria-expanded="${isOpen}">
            <span class="dept-trigger-label">
              <span class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em">Department:</span>
              <b>${U.escapeHtml(activeLabel)}</b>
            </span>
            <span class="dept-trigger-caret">▾</span>
          </button>
          <div class="dept-panel" id="c_deptpanel" role="menu">
            <ul class="dept-root">
              <li class="dept-node${activeDept==='ALL'?' active':''}" data-key="ALL">
                <div class="dept-row depth-0" data-key="ALL">
                  <span class="dept-caret leaf">·</span>
                  <span class="dept-label" data-pick="ALL">All Departments</span>
                  <span class="dept-count">${contacts.length}</span>
                </div>
              </li>
              ${DEPT_TREE.map(n => nodeHTML(n, 0)).join('')}
            </ul>
          </div>
        </div>
        <div class="table-wrap" style="margin-top:12px;max-height:560px;overflow:auto">
          <table class="data">
            <thead><tr>
              <th>Department</th><th>Name</th><th>Designation</th>
              <th>Phone Number</th><th>Escalation</th><th>ID</th>
              <th>Area</th><th>IP Phone</th>
            </tr></thead>
            <tbody id="c_tb"></tbody>
          </table>
        </div>
      </div>
    `;

    const $ = (id) => document.getElementById(id);
    function refresh() {
      const q = $('c_q').value;
      const dept = render._activeDept || 'ALL';
      const tb = document.getElementById('c_tb');
      let rows = contacts;
      if (dept !== 'ALL') {
        // Top-level nodes include their leaves; sub-dept keys are exact match.
        const node = DEPT_TREE.find(n => n.key === dept);
        if (node) {
          const keys = leafKeysFor(dept);
          rows = rows.filter(c => keys.includes(c.dept) || c.dept === dept);
        } else {
          rows = rows.filter(c => (c.dept || '') === dept);
        }
      }
      if (q) rows = AI.suggestContact(q, rows, 100);
      tb.innerHTML = rows.map(c => {
        return `<tr data-id="${c.id}">
          <td><span class="tag">${U.escapeHtml(c.dept||'NMC')}</span></td>
          <td><b>${U.escapeHtml(c.name||'')}</b></td>
          <td>${U.escapeHtml(c.role||'')}</td>
          <td>${U.escapeHtml(c.phone||'')}</td>
          <td>${U.escapeHtml(c.email||'')}</td>
          <td>${U.escapeHtml(c.id_val||'')}</td>
          <td>${U.escapeHtml(c.organization||c.zone||'')}</td>
          <td>${U.escapeHtml(c.ipPhone||'')}</td>
        </tr>`;
      }).join('') || `<tr><td colspan="8" class="muted" style="text-align:center;padding:20px">No contacts</td></tr>`;
      tb.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', e => {
        if (e.target.closest('button[data-learn]')) return;
        edit(+tr.dataset.id);
      }));
      tb.querySelectorAll('button[data-learn]').forEach(b => b.addEventListener('click', () => {
        const cid = +b.dataset.learn;
        const lk = S.get('contactLearn', {});
        lk[cid] = lk[cid] || {};
        lk[cid][q.toLowerCase()] = (lk[cid][q.toLowerCase()] || 0) + 1;
        S.set('contactLearn', lk);
        U.toast('AI learned this match', 'success');
        refresh();
      }));
    }

    // Per-department dropdown: open on click OR hover
    const drop = document.getElementById('c_deptdrop');
    const trig = document.getElementById('c_depttrigger');
    const panel = document.getElementById('c_deptpanel');
    let hoverTimer = null;
    function openDrop() {
      clearTimeout(hoverTimer);
      render._open = true;
      trig.setAttribute('aria-expanded', 'true');
      drop.classList.add('open');
    }
    function closeDrop() {
      render._open = false;
      trig.setAttribute('aria-expanded', 'false');
      drop.classList.remove('open');
    }
    trig.addEventListener('click', e => {
      e.stopPropagation();
      if (drop.classList.contains('open')) closeDrop(); else openDrop();
    });
    trig.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(openDrop, 120);
    });
    drop.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(closeDrop, 180);
    });
    drop.addEventListener('mouseenter', () => clearTimeout(hoverTimer));
    // Outside click closes
    document.addEventListener('click', function onDoc(e) {
      if (!drop.contains(e.target)) closeDrop();
    });
    // Esc closes
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') closeDrop();
    });

    // Caret toggle for sub-lists (in-place, no full re-render)
    panel.querySelectorAll('.dept-caret[data-toggle]').forEach(c => c.addEventListener('click', e => {
      e.stopPropagation();
      const k = c.dataset.toggle;
      const node = c.closest('.dept-node');
      const childList = node && node.querySelector(':scope > .dept-children');
      const caret = c;
      if (childList) {
        const willOpen = !childList.classList.contains('open');
        childList.classList.toggle('open', willOpen);
        caret.classList.toggle('open', willOpen);
        render._expanded = render._expanded || {};
        render._expanded[k] = willOpen;
      }
    }));
    function pickHandler(e) {
      e.stopPropagation();
      const t = e.currentTarget;
      const k = t.dataset.pick || t.dataset.key;
      render._activeDept = k;
      closeDrop();
      render();
    }
    panel.querySelectorAll('.dept-label[data-pick]').forEach(l => l.addEventListener('click', pickHandler));
    panel.querySelectorAll('.dept-row').forEach(r => r.addEventListener('click', pickHandler));

    $('c_q').addEventListener('input', refresh);
    $('c_search').addEventListener('click', refresh);
    $('c_loadsheet').addEventListener('click', loadSheet);
    $('c_add').addEventListener('click', () => edit(null));

    function edit(id) {
      const c = id ? contacts.find(x => x.id === id) : { name:'', role:'', dept:'NMC', organization:'', phone:'', email:'', ipPhone:'', zone:'' };
      const html = `
        <h3>${id ? 'Edit' : 'New'} Contact</h3>
        <div class="row">
          <div class="col-6"><label>Name</label><input id="e_name" value="${U.escapeHtml(c.name||'')}" /></div>
          <div class="col-6"><label>Designation</label><input id="e_role" value="${U.escapeHtml(c.role||'')}" /></div>
          <div class="col-6"><label>Department</label>
            <select id="e_dept">
              ${DEPTS.map(d => `<option value="${U.escapeHtml(d)}" ${c.dept===d?'selected':''}>${U.escapeHtml(d)}</option>`).join('')}
            </select>
          </div>
          <div class="col-6"><label>Area / Zone</label><input id="e_zone" value="${U.escapeHtml(c.zone||c.organization||'')}" /></div>
          <div class="col-6"><label>Phone</label><input id="e_phone" value="${U.escapeHtml(c.phone||'')}" /></div>
          <div class="col-6"><label>IP Phone</label><input id="e_ipphone" value="${U.escapeHtml(c.ipPhone||'')}" /></div>
          <div class="col-12"><label>Email / Escalation</label><input id="e_email" value="${U.escapeHtml(c.email||'')}" /></div>
        </div>
        <div class="flex" style="margin-top:10px;justify-content:flex-end">
          <button class="btn ghost" id="e_cancel">Cancel</button>
          ${id ? '<button class="btn danger" id="e_del">Delete</button>' : ''}
          <button class="btn success" id="e_save">Save</button>
        </div>`;
      U.openModal(html);
      $('e_cancel').addEventListener('click', U.closeModal);
      $('e_save').addEventListener('click', () => {
        const obj = {
          name: $('e_name').value, role: $('e_role').value, dept: $('e_dept').value,
          organization: $('e_zone').value, zone: $('e_zone').value,
          phone: $('e_phone').value, ipPhone: $('e_ipphone').value, email: $('e_email').value,
          source: 'manual'
        };
        if (id) S.update('contacts', id, obj); else S.add('contacts', obj);
        publishGlobal();
        U.closeModal();
        U.toast('Saved', 'success');
        render();
      });
      if (id) $('e_del').addEventListener('click', () => {
        S.removeItem('contacts', id); publishGlobal(); U.closeModal(); U.toast('Deleted', 'success'); render();
      });
    }
    refresh();
  }

  window.NMCPages = window.NMCPages || {};
  window.NMCPages.contacts = render;

  // Public helper for other pages (e.g. roster) to find a contact by name
  window.NMCFindContact = function (name) {
    if (!name) return null;
    const list = S.list('contacts');
    const q = String(name).trim().toLowerCase();
    return list.find(c => (c.name || '').toLowerCase() === q)
        || list.find(c => (c.name || '').toLowerCase().includes(q))
        || null;
  };
})();
