// pages/about.js
(function () {
  function render() {
    const view = document.getElementById('view');
    view.innerHTML = `
      <div class="card">
        <h3>About NMC Portal</h3>
        <p>This portal is a single-page automation tool for the Network Monitoring Center (NMC).</p>
        <ul>
          <li><b>Storage:</b> 100% local (localStorage). No backend, no subscription.</li>
          <li><b>AI:</b> rule-based engine that classifies categories, suggests contacts, parses ticket text and infers zones.</li>
          <li><b>Sharing:</b> one-click WhatsApp and Outlook mail for tickets, close notifications and reports.</li>
          <li><b>Excel:</b> import & export CSV for Contacts, BRAS, SCR, Roster, CCB and Incident Log.</li>
        </ul>
        <h3>Quick Start</h3>
        <ol>
          <li>Open the <b>Dashboard</b> to see today's shift and running incidents.</li>
          <li>Create a ticket from the <b>Tickets</b> page — paste raw text, click <b>Parse with AI</b>, then confirm.</li>
          <li>The row is auto-added to the <b>Incident Log</b>.</li>
          <li>When solved, open the same TT in <b>Tickets → Close</b>, set the restored time and confirm — the close notification is shared to WhatsApp automatically.</li>
          <li>Weekly / Monthly reports are ready in the <b>Reports</b> tab.</li>
        </ol>
        <h3>Departments</h3>
        <ul>
          <li><b>NGNC</b> — Next-Gen Network Center (L2/L3 ops, NTTN, IIG, backbone, DDoS)</li>
          <li><b>BNOC</b> — Broadband NOC (BRAS, BRAS capacity, subscriber impact)</li>
          <li><b>NCSS</b> — Core & Security Services (routing, BGP, security events)</li>
          <li><b>Survey & Transmission</b> — physical link, survey, transmission ops</li>
          <li><b>BTS & Power Infrastructure</b> — site, BTS, power/Surecom</li>
        </ul>
        <h3>Shifts</h3>
        <ul>
          <li><b>Morning:</b> 08:00 – 16:00</li>
          <li><b>Evening:</b> 14:00 – 22:00</li>
          <li><b>Night:</b> 22:00 – 08:00</li>
          <li class="muted">The 14:00 – 16:00 window is the collision window (both Morning and Evening are on duty).</li>
        </ul>
      </div>
    `;
  }
  window.NMCPages = window.NMCPages || {};
  window.NMCPages.about = render;
})();
