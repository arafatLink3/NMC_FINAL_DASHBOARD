// pages/scr.js — Long-haul NTTN Capacity Share / SCR IDs
(function () {
  const S = window.NMCStore, U = window.NMCUI;

  function render() {
    const view = document.getElementById('view');
    const scr = S.list('scr');
    const bras = S.list('bras');

    view.innerHTML = `
      <div class="card">
        <div class="flex" style="flex-wrap:wrap;gap:8px">
          <h3 style="margin-right:auto">SCR / Long-Haul Capacity</h3>
          <input id="s_q" placeholder="Search vendor, capacity, ID…" style="max-width:280px" />
          <button class="btn ghost" id="s_import">Import CSV</button>
          <button class="btn ghost" id="s_export">Export CSV</button>
          <button class="btn success" id="s_add">+ Add</button>
        </div>
        <div class="muted" style="margin-top:6px">${scr.length} SCR records · ${bras.length} BRAS</div>
        <div class="table-wrap" style="margin-top:10px;max-height:520px;overflow:auto">
          <table class="data">
            <thead><tr><th>SCR ID</th><th>Vendor</th><th>Link</th><th>Capacity</th><th>Used</th><th>Free</th><th>Notes</th><th></th></tr></thead>
            <tbody id="s_tb"></tbody>
          </table>
        </div>
      </div>
    `;

    const $ = (id) => document.getElementById(id);
    function refresh() {
      const q = $('s_q').value.toLowerCase();
      const rows = scr.filter(s => !q || [s.scrId, s.vendor, s.link, s.capacity, s.notes].some(v => (v||'').toLowerCase().includes(q)));
      document.getElementById('s_tb').innerHTML = rows.map(s => {
        const free = (parseFloat(s.capacity)||0) - (parseFloat(s.used)||0);
        return `<tr data-id="${s.id}">
          <td><code>${U.escapeHtml(s.scrId||'')}</code></td>
          <td>${U.escapeHtml(s.vendor||'')}</td>
          <td>${U.escapeHtml(s.link||'')}</td>
          <td>${U.escapeHtml(s.capacity||'')}</td>
          <td>${U.escapeHtml(s.used||'')}</td>
          <td>${free} ${s.unit||'Gbps'}</td>
          <td>${U.escapeHtml(s.notes||'')}</td>
          <td><button class="btn ghost sm" data-del="${s.id}">✕</button></td>
        </tr>`;
      }).join('') || `<tr><td colspan="8" class="muted" style="text-align:center;padding:20px">No SCR records</td></tr>`;
      document.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        S.removeItem('scr', +b.dataset.del);
        U.toast('Removed', 'success');
        render();
      }));
    }
    $('s_q').addEventListener('input', refresh);
    $('s_export').addEventListener('click', () => S.download('scr.csv', S.exportCSV(scr, [{key:'scrId'},{key:'vendor'},{key:'link'},{key:'capacity'},{key:'used'},{key:'unit'},{key:'notes'}])));
    $('s_import').addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.csv';
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => { window.NMCStore.csvParse(r.result).forEach(rw => S.add('scr', rw)); U.toast('Imported', 'success'); render(); };
        r.readAsText(f);
      };
      inp.click();
    });
    $('s_add').addEventListener('click', () => edit(null));

    function edit(id) {
      const s = id ? scr.find(x => x.id === id) : { scrId:'', vendor:'', link:'', capacity:'', used:'', unit:'Gbps', notes:'' };
      const html = `<h3>${id?'Edit':'New'} SCR</h3>
        <div class="row">
          <div class="col-6"><label>SCR ID</label><input id="e_id" value="${U.escapeHtml(s.scrId||'')}" /></div>
          <div class="col-6"><label>Vendor</label><input id="e_v" value="${U.escapeHtml(s.vendor||'')}" /></div>
          <div class="col-12"><label>Link</label><input id="e_l" value="${U.escapeHtml(s.link||'')}" /></div>
          <div class="col-4"><label>Capacity</label><input id="e_c" value="${U.escapeHtml(s.capacity||'')}" /></div>
          <div class="col-4"><label>Used</label><input id="e_u" value="${U.escapeHtml(s.used||'')}" /></div>
          <div class="col-4"><label>Unit</label><input id="e_un" value="${U.escapeHtml(s.unit||'Gbps')}" /></div>
          <div class="col-12"><label>Notes</label><input id="e_n" value="${U.escapeHtml(s.notes||'')}" /></div>
        </div>
        <div class="flex" style="margin-top:10px;justify-content:flex-end">
          <button class="btn ghost" id="e_cancel">Cancel</button>
          ${id?'<button class="btn danger" id="e_del">Delete</button>':''}
          <button class="btn success" id="e_save">Save</button>
        </div>`;
      U.openModal(html);
      document.getElementById('e_cancel').addEventListener('click', U.closeModal);
      document.getElementById('e_save').addEventListener('click', () => {
        const obj = { scrId:e('e_id').value, vendor:e('e_v').value, link:e('e_l').value, capacity:e('e_c').value, used:e('e_u').value, unit:e('e_un').value, notes:e('e_n').value };
        if (id) S.update('scr', id, obj); else S.add('scr', obj);
        U.closeModal(); U.toast('Saved', 'success'); render();
      });
      if (id) document.getElementById('e_del').addEventListener('click', () => { S.removeItem('scr', id); U.closeModal(); U.toast('Deleted','success'); render(); });
    }
    function e(id) { return document.getElementById(id); }
    refresh();
  }

  window.NMCPages = window.NMCPages || {};
  window.NMCPages.scr = render;
})();
