// pages/mail.js — Mail center with all 6 templates
(function () {
  const S = window.NMCStore, U = window.NMCUI, AI = window.NMCAI;

  const TPLS = {
    nttn: {
      label: 'NTTN Issue Mail',
      fields: [
        { id: 'm_nttn_pop', label: 'NTTN POP / Link' },
        { id: 'm_nttn_noc', label: 'NTTN NOC Email', placeholder: 'noc@vendor.com' },
        { id: 'm_nttn_issue', label: 'Issue' },
        { id: 'm_nttn_time', label: 'Fault Time' }
      ],
      build: (v) => `Subject: NTTN Issue – ${v.m_nttn_pop}

Dear NTTN Team,

We are observing an issue on ${v.m_nttn_pop}.

• Issue: ${v.m_nttn_issue}
• Fault Time: ${v.m_nttn_time}

Please check and update ETR at the earliest.

Regards,
NMC`
    },
    iig: {
      label: 'IIG Down / Traffic Fall',
      fields: [
        { id: 'm_iig_name', label: 'IIG Name' },
        { id: 'm_iig_noc', label: 'IIG NOC Email' },
        { id: 'm_iig_pct', label: 'Traffic %' },
        { id: 'm_iig_time', label: 'Time' }
      ],
      build: (v) => `Subject: ${v.m_iig_name} – ${v.m_iig_pct} traffic fall / down

Dear ${v.m_iig_name} NOC,

We observe ${v.m_iig_pct} traffic fall at ${v.m_iig_time}.

Please investigate and confirm the status.

Regards,
NMC`
    },
    telco: {
      label: 'Telco POP Issue',
      fields: [
        { id: 'm_telco_name', label: 'Telco (BL/GP/Robi/STL)' },
        { id: 'm_telco_noc', label: 'Telco NOC Email' },
        { id: 'm_telco_issue', label: 'Issue' },
        { id: 'm_telco_pop', label: 'POP / BTS' }
      ],
      build: (v) => `Subject: ${v.m_telco_name} POP issue – ${v.m_telco_pop}

Dear ${v.m_telco_name} NOC,

We are seeing an issue at ${v.m_telco_pop}: ${v.m_telco_issue}.

Kindly check and respond with ETR.

Regards,
NMC`
    },
    bras: {
      label: 'BRAS Bandwidth – Zone-wise',
      fields: [
        { id: 'm_bras_zone', label: 'Zone' },
        { id: 'm_bras_pct', label: 'Avg utilization %' },
        { id: 'm_bras_top', label: 'Top BRAS (comma)' }
      ],
      build: (v) => `Subject: ${v.m_bras_zone} – BRAS bandwidth high

Dear Team,

Average BRAS bandwidth utilization in ${v.m_bras_zone} is ${v.m_bras_pct}%.

Top loaded BRAS: ${v.m_bras_top}

Please plan capacity uplift if sustained.

Regards,
NMC`
    },
    weekly: {
      label: 'Weekly Report (Sun)',
      fields: [
        { id: 'm_week', label: 'Week ending', type: 'date' },
        { id: 'm_week_total', label: 'Total incidents' },
        { id: 'm_week_solved', label: 'Solved' },
        { id: 'm_week_open', label: 'Open' },
        { id: 'm_week_top', label: 'Top category' }
      ],
      build: (v) => `Subject: NMC Weekly Report – ${v.m_week}

Hi All,

Please find the weekly summary:
• Total: ${v.m_week_total}
• Solved: ${v.m_week_solved}
• Open: ${v.m_week_open}
• Top category: ${v.m_week_top}

Regards,
NMC`
    },
    monthly: {
      label: 'Monthly Report',
      fields: [
        { id: 'm_month', label: 'Month', type: 'month' },
        { id: 'm_m_total', label: 'Total incidents' },
        { id: 'm_m_solved', label: 'Solved' },
        { id: 'm_m_running', label: 'Running' },
        { id: 'm_m_top', label: 'Top category' },
        { id: 'm_m_outage', label: 'Total outage (HH:MM)' }
      ],
      build: (v) => `Subject: NMC Monthly Report – ${v.m_month}

Hi All,

Please find the monthly summary:
• Total: ${v.m_m_total}
• Solved: ${v.m_m_solved}
• Running: ${v.m_m_running}
• Top category: ${v.m_m_top}
• Total outage: ${v.m_m_outage}

Regards,
NMC`
    },

    // ---- Provider-specific templates (TO / CC / Subject / Message) ----
    bw_report: {
      label: 'BW Report (Bandwidth)',
      provider: true,
      to: 'noc@bw-report.com.bd',
      cc: 'nmc@bahon.com.bd',
      subject: 'Bandwidth utilization report – {date}',
      message: `Dear Team,

Please find the bandwidth utilization report for {date}.

Highlights:
- Peak utilization: {peak}
- Avg utilization: {avg}
- Top interfaces: {top}

Please review and share feedback.

Regards,
NMC`,
      fields: [
        { id: 'm_date', label: 'Date', type: 'date' },
        { id: 'm_peak', label: 'Peak utilization' },
        { id: 'm_avg', label: 'Avg utilization' },
        { id: 'm_top', label: 'Top interfaces' }
      ]
    },
    // F@H  (uses SCR ID as the unique identifier)
    fh: {
      label: 'F@H (Fiber@Home)',
      provider: true,
      to: 'noc@fiberathome.net',
      cc: 'nmc@link3.net; noc@link3.net; infrastructure@link3.net; mtarek@link3.net; khayom.parvez@fiberathome.net',
      subject: 'Regarding {route} Connectivity Down',
      message: `Dear Concern,

We are getting down {route} link from {time} to till now. Please check and let us know the update urgently.

Route Name : {route}
SCR ID      : {scr}

We are waiting for your reply.

Regards,
NMC`,
      fields: [
        { id: 'm_route', label: 'Route (e.g. Dhaka to Sylhet)' },
        { id: 'm_time',  label: 'Down time (HH:MM)' },
        { id: 'm_scr',   label: 'SCR ID', placeholder: 'e.g. 41' }
      ]
    },
    // Summit  (uses SCR ID as the unique identifier)
    summit: {
      label: 'Summit Communications',
      provider: true,
      to: 'noc.nttn@summitcommunications.net',
      cc: 'nmc@link3.net; noc@link3.net; infrastructure@link3.net; mtarek@link3.net; corenetwork@link3.net; ngnc@link3.net; bnoc@link3.net; tarek@link3.net; abu.sayeed@summitcommunications.net',
      subject: 'Regarding {route} Connectivity Down',
      message: `Dear Concern,

We are getting down {route} link from {time} to till now. Please check and let us know the update urgently.

Route Name : {route}
SCR ID      : {scr}

We are waiting for your response.

Regards,
NMC`,
      fields: [
        { id: 'm_route', label: 'Route (e.g. Dhaka to Sylhet)' },
        { id: 'm_time',  label: 'Down time (HH:MM)' },
        { id: 'm_scr',   label: 'SCR ID', placeholder: 'e.g. lnk3_110116_75_nb' }
      ]
    },
    bl: {
      label: 'BL (Banglalink)',
      provider: true,
      to: 'noc@banglalink.net',
      cc: 'nmc@bahon.com.bd',
      subject: 'Banglalink – {pop} issue',
      message: `Dear Banglalink NOC,

Reporting an issue at {pop}: {issue}.

Please check and confirm ETR.

Regards,
NMC`,
      fields: [
        { id: 'm_pop', label: 'POP / BTS' },
        { id: 'm_issue', label: 'Issue' }
      ]
    },
    gp: {
      label: 'GP (Grameenphone)',
      provider: true,
      to: 'noc@grameenphone.com',
      cc: 'nmc@bahon.com.bd',
      subject: 'GP POP issue – {pop}',
      message: `Dear Grameenphone NOC,

Reporting an issue at {pop}: {issue}.

Please check and confirm ETR.

Regards,
NMC`,
      fields: [
        { id: 'm_pop', label: 'POP / BTS' },
        { id: 'm_issue', label: 'Issue' }
      ]
    },
    // BTCL  (uses VLAN ID as the unique identifier)
    btcl: {
      label: 'BTCL',
      provider: true,
      to: 'noc@btcl.gov.bd; dgm.noc@btcl.gov.bd',
      cc: 'nmc@link3.net; noc@link3.net; infrastructure@link3.net; corenetwork@link3.net; ngnc@link3.net; bnoc@link3.net; tarek@link3.net',
      subject: 'Regarding {route} Connectivity down',
      message: `Dear Concern,

We are getting down {route} link from {time} to till now. Please be informed that the link is connected from {pop}.

Route Name : {route}
VLAN ID     : {vlan}

We are waiting for your reply.

Thanks & Regards,
NMC`,
      fields: [
        { id: 'm_route', label: 'Route (e.g. Dhaka to Barisal)' },
        { id: 'm_time',  label: 'Down time (HH:MM)' },
        { id: 'm_pop',   label: 'Connected from POP', placeholder: 'e.g. Gulshan POP' },
        { id: 'm_vlan',  label: 'VLAN ID', placeholder: 'e.g. 1042' }
      ]
    },
    // Bahon  (uses Link ID as the unique identifier)
    bahon: {
      label: 'BAHON (Internal)',
      provider: true,
      to: 'noc@bahon.com; support@bahon.com',
      cc: 'nmc@link3.net; noc@link3.net; infrastructure@link3.net; mtarek@link3.net; corenetwork@link3.net; ngnc@link3.net; bnoc@link3.net; tofayel.ahammed@link3.net; rakibul.hassan@link3.net; ujjal.biswas@link3.net; subrata.sarker@link3.net; bipul.chandra@link3.net',
      subject: 'Regarding {route} link down',
      message: `Dear Concern,

We are observing {route} link again down from {time} to till now. Please check and let us know the update urgently.

Route Name : {route}
Link ID     : {link}

We are waiting for your reply.

Regards,
NMC`,
      fields: [
        { id: 'm_route', label: 'Route (e.g. Dhaka - Ashulia)' },
        { id: 'm_time',  label: 'Down time (HH:MM)' },
        { id: 'm_link',  label: 'Link ID', placeholder: 'e.g. LT-BW005' }
      ]
    },
    etl_iig: {
      label: 'ETL-IIG',
      provider: true,
      to: 'noc@etl-iig.com',
      cc: 'nmc@bahon.com.bd',
      subject: 'ETL-IIG link down – {link}',
      message: `Dear ETL-IIG NOC,

We are observing a link down on {link} since {time}.

Impact: {impact}

Please provide ETR.

Regards,
NMC`,
      fields: [
        { id: 'm_link', label: 'Link' },
        { id: 'm_time', label: 'Fault time' },
        { id: 'm_impact', label: 'Impact' }
      ]
    },
    iconix_ix: {
      label: 'ICONIX_IX',
      provider: true,
      to: 'noc@iconix-ix.com',
      cc: 'nmc@bahon.com.bd',
      subject: 'ICONIX_IX peering issue – {member}',
      message: `Dear ICONIX_IX NOC,

Reporting a peering / IX issue with member {member}: {issue}.

Please check and confirm.

Regards,
NMC`,
      fields: [
        { id: 'm_member', label: 'Member / ASN' },
        { id: 'm_issue', label: 'Issue' }
      ]
    }
  };

  function render() {
    const view = document.getElementById('view');
    const mailLog = S.list('mailLog');

    view.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <h3>Compose Mail</h3>
          <div class="row">
            <div class="col-12">
              <label>Template</label>
              <select id="m_tpl">${Object.keys(TPLS).map(k => `<option value="${k}">${TPLS[k].label}</option>`).join('')}</select>
            </div>
            <div class="col-12" id="m_fields"></div>
          </div>
          <div class="flex" style="margin-top:10px">
            <button class="btn" id="m_gen">Generate</button>
            <button class="btn ghost" id="m_copy">📋 Copy</button>
            <button class="btn success" id="m_wa">📤 WhatsApp</button>
            <button class="btn warn" id="m_mail">✉ Open in Outlook</button>
          </div>
        </div>
        <div class="card">
          <h3>Preview</h3>
          <pre id="m_preview" class="ticket-preview" style="white-space:pre-wrap;min-height:200px">Pick a template, fill the fields and click Generate.</pre>
        </div>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>Mail Log</h3>
        <div class="table-wrap" style="max-height:300px;overflow:auto">
          <table class="data">
            <thead><tr><th>Time</th><th>Template</th><th>Subject</th><th>To</th><th>Action</th></tr></thead>
            <tbody>${mailLog.slice().reverse().slice(0,40).map(m => `<tr>
              <td>${U.escapeHtml(m.time)}</td>
              <td>${U.escapeHtml(m.template)}</td>
              <td>${U.escapeHtml(m.subject)}</td>
              <td>${U.escapeHtml(m.to||'')}</td>
              <td><button class="btn ghost sm" data-id="${m.id}">Reuse</button></td>
            </tr>`).join('') || '<tr><td colspan="5" class="muted" style="text-align:center;padding:20px">No mails yet</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;

    const $ = (id) => document.getElementById(id);
    function renderFields() {
      const k = $('m_tpl').value;
      const t = TPLS[k];
      const providerMeta = t.provider
        ? `<div class="col-6"><label>To</label><input id="m_to" value="${U.escapeHtml(t.to||'')}" /></div>
           <div class="col-6"><label>CC</label><input id="m_cc" value="${U.escapeHtml(t.cc||'')}" /></div>`
        : '';
      $('m_fields').innerHTML = providerMeta + (t.fields || []).map(f =>
        `<div class="col-12"><label>${f.label}</label><input id="${f.id}" type="${f.type||'text'}" placeholder="${f.placeholder||''}" /></div>`
      ).join('');
    }
    $('m_tpl').addEventListener('change', renderFields);
    renderFields();

    function buildOutput(k, v) {
      const t = TPLS[k];
      if (t.provider) {
        // Substitute {placeholder} tokens in subject and message
        const sub = (s) => (s || '').replace(/\{(\w+)\}/g, (_, k) => v[k] || '');
        const subject = sub(t.subject);
        const message = sub(t.message);
        return `To: ${v.m_to || t.to || ''}\nCC: ${v.m_cc || t.cc || ''}\nSubject: ${subject}\n\n${message}`;
      }
      return t.build(v);
    }

    $('m_gen').addEventListener('click', () => {
      const k = $('m_tpl').value;
      const t = TPLS[k];
      const v = {};
      (t.fields || []).forEach(f => v[f.id] = (document.getElementById(f.id) || {}).value || '');
      if (t.provider) {
        v.m_to = ($('m_to') || {}).value || t.to || '';
        v.m_cc = ($('m_cc') || {}).value || t.cc || '';
      }
      const out = buildOutput(k, v);
      $('m_preview').textContent = out;
    });
    $('m_copy').addEventListener('click', () => {
      navigator.clipboard.writeText($('m_preview').textContent).then(() => U.toast('Copied', 'success'));
    });
    $('m_wa').addEventListener('click', () => {
      const txt = $('m_preview').textContent;
      window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
    });
    $('m_mail').addEventListener('click', () => {
      const txt = $('m_preview').textContent;
      // Strip "To:" / "CC:" lines for mailto body
      const clean = txt.replace(/^To:.*\n/gm, '').replace(/^CC:.*\n/gm, '');
      const m = clean.match(/^Subject:\s*(.+)$/m);
      const subject = m ? m[1] : 'NMC Mail';
      const body = clean.replace(/^Subject:.*\n/, '');
      const to = (txt.match(/^To:\s*(.+)$/m) || [])[1] || '';
      const cc = (txt.match(/^CC:\s*(.+)$/m) || [])[1] || '';
      const params = ['subject=' + encodeURIComponent(subject), 'body=' + encodeURIComponent(body)];
      if (to) params.push('to=' + encodeURIComponent(to));
      if (cc) params.push('cc=' + encodeURIComponent(cc));
      window.location.href = 'mailto:?' + params.join('&');
    });

    // Log on generate
    $('m_gen').addEventListener('click', () => {
      const txt = $('m_preview').textContent;
      const clean = txt.replace(/^To:.*\n/gm, '').replace(/^CC:.*\n/gm, '');
      const m = clean.match(/^Subject:\s*(.+)$/m);
      const k = $('m_tpl').value;
      const t = TPLS[k];
      const subj = m ? m[1] : t.label;
      const toMatch = (txt.match(/^To:\s*(.+)$/m) || [])[1] || '';
      const toField = ((t.fields || []).find(f => /email/i.test(f.id)) || {}).id;
      const to = toMatch || (toField ? (document.getElementById(toField) || {}).value : '') || '';
      S.add('mailLog', { time: new Date().toLocaleString(), template: t.label, subject: subj, to });
    }, { once: true });

    // Reuse
    document.querySelectorAll('button[data-id]').forEach(b => b.addEventListener('click', e => {
      const item = mailLog.find(m => m.id === +b.dataset.id);
      if (!item) return;
      $('m_tpl').value = Object.keys(TPLS).find(k => TPLS[k].label === item.template) || 'nttn';
      renderFields();
      const t = TPLS[$('m_tpl').value];
      if (t.provider) {
        $('m_preview').textContent = `To: ${t.to || ''}\nCC: ${t.cc || ''}\nSubject: ${item.subject}\n`;
      } else {
        $('m_preview').textContent = 'Subject: ' + item.subject + '\n';
      }
    }));
  }

  window.NMCPages = window.NMCPages || {};
  window.NMCPages.mail = render;
})();
