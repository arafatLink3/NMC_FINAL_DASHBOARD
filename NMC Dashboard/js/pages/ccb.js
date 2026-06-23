// pages/ccb.js — Change Control Board / NCR / Planned Incident Database
(function () {
  const S = window.NMCStore, U = window.NMCUI;

  function render() {
    const view = document.getElementById('view');
    const ccb = S.list('ccb');
    const now = new Date();

    function statusOf(c) {
      const s = new Date(c.startAt), e = new Date(c.endAt);
      if (now < s) return { tag: 'y', label: 'Upcoming' };
      if (now > e) return { tag: 'g', label: 'Completed' };
      return { tag: 'r', label: 'Ongoing' };
    }

    view.innerHTML = `
      <div class="card">
        <div class="flex" style="flex-wrap:wrap;gap:8px">
          <h3 style="margin-right:auto">CCB / NCR / Planned Maintenance</h3>
          <input id="c_q" placeholder="Search…" style="max-width:220px" />
          <select id="c_kind">
            <option value="">All kinds</option>
            <option>CCB</option><option>NCR</option><option>PID</option>
          </select>
          <button class="btn ghost" id="c_export">Export CSV</button>
          <button class="btn success" id="c_add">+ Add</button>
        </div>

        <div class="table-wrap" style="margin-top:10px;max-height:520px;overflow:auto">
          <table class="data">
            <thead><tr><th>Kind</th><th>ID</th><th>Title</th><th>Start</th><th>End</th><th>Owner</th><th>Status</th><th>Action</th></tr></thead>
            <tbody id="c_tb"></tbody>
          </table>
        </div>
      </div>
    `;

    const $ = (id) => document.getElementById(id);
    function refresh() {
      const q = $('c_q').value.toLowerCase();
      const k = $('c_kind').value;
      const rows = ccb.filter(c =>
        (!q || [c.title, c.id, c.owner, c.notes].some(v => (v||'').toLowerCase().includes(q))) &&
        (!k || c.kind === k)
      );
      document.getElementById('c_tb').innerHTML = rows.map(c => {
        const st = statusOf(c);
        return `<tr data-id="${c.id}">
          <td><span class="tag ${c.kind==='CCB'?'p':c.kind==='NCR'?'r':'y'}">${U.escapeHtml(c.kind||'')}</span></td>
          <td><code>${U.escapeHtml(c.cbId||'')}</code></td>
          <td>${U.escapeHtml(c.title||'')}</td>
          <td>${U.escapeHtml(c.startAt||'')}</td>
          <td>${U.escapeHtml(c.endAt||'')}</td>
          <td>${U.escapeHtml(c.owner||'')}</td>
          <td><span class="status ${st.tag==='g'?'solved':st.tag==='y'?'pending':'running'}">${st.label}</span></td>
          <td><button class="btn ghost sm" data-del="${c.id}">✕</button></td>
        </tr>`;
      }).join('') || `<tr><td colspan="8" class="muted" style="text-align:center;padding:20px">No records</td></tr>`;
      document.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        S.removeItem('ccb', +b.dataset.del);
        U.toast('Removed', 'success');
        render();
      }));
    }
    $('c_q').addEventListener('input', refresh);
    $('c_kind').addEventListener('change', refresh);
    $('c_export').addEventListener('click', () => S.download('ccb.csv', S.exportCSV(ccb, [
      { key: 'kind' }, { key: 'cbId' }, { key: 'title' },
      { key: 'startAt' }, { key: 'endAt' },
      { key: 'owner' }, { key: 'notes' }
    ])));
    $('c_add').addEventListener('click', () => edit(null));

    function edit(id) {
      const c = id ? ccb.find(x => x.id === id) : { kind:'CCB', startAt:new Date().toISOString().slice(0,16), endAt:new Date(Date.now()+3600000).toISOString().slice(0,16) };
      const html = `<h3>${id?'Edit':'New'} CCB / NCR / PID</h3>
        <div class="row">
          <div class="col-3"><label>Kind</label><select id="e_k">${['CCB','NCR','PID'].map(k=>`<option ${c.kind===k?'selected':''}>${k}</option>`).join('')}</select></div>
          <div class="col-5"><label>ID</label><input id="e_id" value="${U.escapeHtml(c.cbId||'')}" placeholder="CCB-2026-001" /></div>
          <div class="col-4"><label>Owner</label><input id="e_o" value="${U.escapeHtml(c.owner||'')}" /></div>
          <div class="col-12"><label>Title</label><input id="e_t" value="${U.escapeHtml(c.title||'')}" /></div>
          <div class="col-6"><label>Start</label><input id="e_s" type="datetime-local" value="${U.escapeHtml(c.startAt||'')}" /></div>
          <div class="col-6"><label>End</label><input id="e_e" type="datetime-local" value="${U.escapeHtml(c.endAt||'')}" /></div>
          <div class="col-12"><label>Notes</label><textarea id="e_n" rows="3" style="width:100%">${U.escapeHtml(c.notes||'')}</textarea></div>
        </div>
        <div class="flex" style="margin-top:10px;justify-content:flex-end">
          <button class="btn ghost" id="e_cancel">Cancel</button>
          ${id?'<button class="btn danger" id="e_del">Delete</button>':''}
          <button class="btn success" id="e_save">Save</button>
        </div>`;
      U.openModal(html);
      document.getElementById('e_cancel').addEventListener('click', U.closeModal);
      document.getElementById('e_save').addEventListener('click', () => {
        const obj = { kind:e('e_k').value, cbId:e('e_id').value, owner:e('e_o').value, title:e('e_t').value, startAt:e('e_s').value, endAt:e('e_e').value, notes:e('e_n').value };
        if (id) S.update('ccb', id, obj); else S.add('ccb', obj);
        U.closeModal(); U.toast('Saved', 'success'); render();
      });
      if (id) document.getElementById('e_del').addEventListener('click', () => { S.removeItem('ccb', id); U.closeModal(); U.toast('Deleted','success'); render(); });
    }
    function e(id) { return document.getElementById(id); }
    refresh();
  }

  window.NMCPages = window.NMCPages || {};
  window.NMCPages.ccb = render;
})();
