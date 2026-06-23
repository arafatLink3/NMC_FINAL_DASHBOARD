// pages/contact.js
(function () {
  const S = window.NMCStore, U = window.NMCUI;
  function render() {
    const view = document.getElementById('view');
    const contacts = S.list('contacts');
    const wa = (S.get('settings', {}) || {}).wa_group || '';
    const waURL = wa ? ('https://wa.me/' + wa) : 'https://wa.me/';
    view.innerHTML = `
      <div class="card">
        <h3>Contact / Help</h3>
        <p>This portal is private to NMC. For tool issues, contact your NMC admin.</p>
        <div class="row">
          <div class="col-6">
            <h3>NMC Engineer (default)</h3>
            <p>Name: <b>Iftekhairul Abedin</b></p>
            <p>Role: NMC Engineer — Automation</p>
            <p>WhatsApp group: ${wa ? `<a href="${waURL}" target="_blank">open</a>` : '<span class="muted">set in Settings</span>'}</p>
          </div>
          <div class="col-6">
            <h3>Quick directory</h3>
            <ul>${contacts.slice(0, 10).map(c => `<li>${U.escapeHtml(c.name||'')} — <span class="muted">${U.escapeHtml(c.role||'')}</span></li>`).join('')}</ul>
            <a class="btn" href="#/contacts">Open full contacts →</a>
          </div>
        </div>
        <div class="muted" style="margin-top:14px">Version 1.0.0 — pure HTML/CSS/JS, no backend, no subscription.</div>
      </div>
    `;
  }
  window.NMCPages = window.NMCPages || {};
  window.NMCPages.contact = render;
})();
