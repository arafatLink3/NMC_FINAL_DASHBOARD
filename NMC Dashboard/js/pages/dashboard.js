// pages/dashboard.js
(function () {
  const S = window.NMCStore, U = window.NMCUI, AI = window.NMCAI, C = window.NMCCharts;

  function statCard(label, value, color, icon) {
    return `<div class="card kpi ${color||''}"><div class="ic">${icon||'📈'}</div>
      <div><div class="v">${value}</div><div class="l">${label}</div></div></div>`;
  }

  function buildTrend(incidents) {
    // last 14 days counts
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
      days.push({ key: d.toISOString().slice(0,10), label: d.toLocaleDateString(undefined,{month:'short', day:'numeric'}), count: 0 });
    }
    incidents.forEach(i => {
      const t = faultTimestamp(i);
      if (!t) return;
      const k = t.toISOString().slice(0,10);
      const d = days.find(x => x.key === k);
      if (d) d.count++;
    });
    return days;
  }

  // Combine faultDate+faultTime into a real Date, falling back to the row's
  // own `date`, then to `createdAt`. Returns null if none can form a valid
  // Date (so callers can early-out without hitting `Invalid time value`).
  function faultTimestamp(i) {
    if (i.faultDate && i.faultTime) {
      const d = new Date(AI.parseTimeToISO(i.faultDate, i.faultTime));
      if (!isNaN(d.getTime())) return d;
    }
    if (i.faultTime && /T/.test(i.faultTime)) {
      // legacy rows that still stored faultTime as a full ISO timestamp
      const d = new Date(i.faultTime);
      if (!isNaN(d.getTime())) return d;
    }
    if (i.date) {
      const d = new Date(i.date + 'T00:00:00');
      if (!isNaN(d.getTime())) return d;
    }
    if (i.createdAt) {
      const d = new Date(i.createdAt);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  function pieData(incidents) {
    const map = {};
    incidents.forEach(i => { const k = i.incidentSubCategory || i.incidentCategory || 'Other'; map[k] = (map[k]||0)+1; });
    return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a,b)=>b.value-a.value).slice(0, 8);
  }

  // Module-scoped tracker for the document-level click listener we attach
  // to dismiss the hover popover. render() is re-invoked on every nav,
  // so we keep the previous handler here and removeEventListener before
  // binding a new one — otherwise the listener pile-up would slow the
  // page down over time and call hideTip() once per old render.
  let _prevTipDismiss = null;

  function render() {
    const view = document.getElementById('view');
    const incidents = S.list('incidents');
    const tickets = S.list('tickets');
    const open = incidents.filter(i => i.currentStatus === 'Running' || i.currentStatus === 'RCA Pending ticket' || i.currentStatus === 'Non-ticket running').length;
    const solved = incidents.filter(i => i.currentStatus === 'Solved' || i.currentStatus === 'Non-Ticket solved').length;
    const nonTicket = incidents.filter(i => /non-ticket/i.test(i.currentStatus || '')).length;
    const over4h = incidents.filter(i => i.duration && />/.test(String(i.duration))).length;
    const trend = buildTrend(incidents);
    const pie = pieData(incidents);

    view.innerHTML = `
      <div class="card" style="margin-bottom:12px">
        <h3>Welcome back, NMC Engineer 👋</h3>
        <div class="muted">Live summary of the incidents, tickets and maintenance windows relevant to your shift.</div>
      </div>

      <div class="kpi">
        ${statCard('Incidents (this month)', incidents.length, 'info', '📒')}
        ${statCard('Open / Running', open, 'warning', '🚧')}
        ${statCard('Solved', solved, 'success', '✅')}
        ${statCard('Non-Ticket Logs', nonTicket, '', '📝')}
        ${statCard('> 4h Duration', over4h, 'danger', '⏰')}
      </div>

      <div class="grid-2">
        <div class="card chart-card">
          <h3>Incident Trend (last 14 days)</h3>
          <div id="trendChart" style="height:240px"></div>
        </div>
        <div class="card chart-card">
          <h3>By Sub-Category</h3>
          <div id="pieChart" style="height:240px"></div>
        </div>
      </div>

      <div class="grid-2" style="margin-top:14px">
        <div class="card">
          <h3>Open Tickets — Hover for details</h3>
          <div id="openList"></div>
        </div>
        <div class="card">
          <h3>Reminders (1h+ still running)</h3>
          <div id="reminderList"></div>
        </div>
      </div>
    `;

    C.line(document.getElementById('trendChart'), [{ label: 'Incidents', values: trend.map(t=>t.count), labels: trend.map(t=>t.label) }]);
    C.pie(document.getElementById('pieChart'), pie.length ? pie : [{ label: 'No data', value: 1 }]);

    // open list (hover to show one by one)
    const openList = document.getElementById('openList');
    const openInc = incidents.filter(i => i.currentStatus === 'Running' || i.currentStatus === 'RCA Pending ticket' || i.currentStatus === 'Non-ticket running');
    if (!openInc.length) openList.innerHTML = `<div class="empty">No open tickets</div>`;
    else openList.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>TT</th><th>BTS/Area</th><th>Sub-Category</th><th>Fault</th><th>Zone</th><th>Status</th></tr></thead><tbody>
      ${openInc.slice(0, 30).map(i => {
        // Build a rich hover popover with the full incident record so the
        // user can see everything (TT, BTS, Sub-Cat, client, fault/restore
        // timestamps, duration, RCA, action taken, departments, etc.)
        // without having to click through to the Incident Log. The HTML
        // is built as raw markup but every dynamic value goes through
        // U.escapeHtml — only the fixed <div>/<span> skeleton is trusted.
        const tipRow = (k, v) => {
          const val = (v == null || v === '') ? '' : String(v);
          return `<div class="tip-row"><span class="tip-k">${U.escapeHtml(k)}</span><span class="tip-v${val ? '' : ' muted'}">${val ? U.escapeHtml(val) : '—'}</span></div>`;
        };
        const faultDate = i.faultDate || i.date || '';
        const restDate  = i.restorationDate || i.date || '';
        const faultWhen = faultDate ? `${faultDate} ${i.faultTime || ''}`.trim() : (i.faultTime || '');
        const restWhen  = restDate  ? `${restDate} ${i.restorationTime || ''}`.trim() : (i.restorationTime || '');
        const tipHtml = [
          `<div class="tip-h">${U.escapeHtml(i.incidentName || 'Incident')}</div>`,
          tipRow('Ticket ID', i.ticketId),
          tipRow('Sub-Category', i.incidentSubCategory),
          tipRow('Issue Type', i.issueType),
          tipRow('Impacted Client', i.impactedClient),
          tipRow('Service Impacted', i.serviceImpacted),
          tipRow('Zone', i.zone),
          tipRow('Fault', faultWhen),
          tipRow('Restoration', restWhen),
          tipRow('Duration', i.duration),
          tipRow('Duration > 4h', i.durationOver4h),
          tipRow('Root Cause', i.rootCause),
          tipRow('RCA Provider', i.rcaProvider),
          tipRow('Action Taken', i.actionTaken),
          tipRow('Forward Dept', i.forwardDepartment),
          tipRow('Responsible Team', i.responsibleTeam),
          tipRow('Informed Person', i.informedPerson),
          tipRow('Informed Time/Media', i.informedTimeMedia),
          tipRow('Ticket Update By', i.ticketUpdateBy),
          tipRow('Query Mail', i.queryMail),
          tipRow('Status', i.currentStatus)
        ].join('');
        return `<tr data-tip="${U.escapeHtml(tipHtml)}">
        <td><code>${U.escapeHtml(i.ticketId||'-')}</code></td>
        <td>${U.escapeHtml(i.incidentName||'-')}</td>
        <td>${U.escapeHtml(i.incidentSubCategory||'-')}</td>
        <td>${U.escapeHtml(i.faultTime||'-')}</td>
        <td>${U.escapeHtml(i.zone||'-')}</td>
        <td><span class="status running">${U.escapeHtml(i.currentStatus)}</span></td>
      </tr>`;
      }).join('')}
      </tbody></table></div>`;

    // Wire the hover popover for the Open Tickets table. The popover
    // element (#dashTip) is created once per render and lives in the
    // body so it can use position:fixed (escaping any overflow:auto on
    // the table-wrap). Rows that have a data-tip attribute participate.
    let tip = document.getElementById('dashTip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'dashTip';
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    const showTip = (tr, clientX, clientY) => {
      const html = tr.getAttribute('data-tip');
      if (!html) return;
      tip.innerHTML = html;
      // Show first so we can measure, then position so it doesn't clip
      // the viewport edges.
      tip.classList.add('open');
      const rect = tip.getBoundingClientRect();
      const pad = 10;
      let x = clientX + 14;
      let y = clientY + 14;
      if (x + rect.width + pad > window.innerWidth)  x = clientX - rect.width - 14;
      if (y + rect.height + pad > window.innerHeight) y = clientY - rect.height - 14;
      if (x < pad) x = pad;
      if (y < pad) y = pad;
      tip.style.left = x + 'px';
      tip.style.top  = y + 'px';
    };
    const hideTip = () => { tip.classList.remove('open'); };
    const tipRows = openList.querySelectorAll('tr[data-tip]');
    tipRows.forEach(tr => {
      tr.addEventListener('mouseenter', (ev) => showTip(tr, ev.clientX, ev.clientY));
      tr.addEventListener('mousemove',  (ev) => showTip(tr, ev.clientX, ev.clientY));
      tr.addEventListener('mouseleave', hideTip);
    });
    // Dismiss the popover when the user clicks anywhere else on the page
    // (touch users can't mouseleave; this also covers outside-tap-to-close).
    // Detach the previous render's handler first so listeners don't pile up
    // across navigations.
    if (_prevTipDismiss) document.removeEventListener('click', _prevTipDismiss);
    _prevTipDismiss = (ev) => { if (!openList.contains(ev.target)) hideTip(); };
    document.addEventListener('click', _prevTipDismiss);

    // reminders
    const remList = document.getElementById('reminderList');
    const now = new Date();
    const rems = openInc.map(i => {
      const t = faultTimestamp(i);
      const mins = t ? Math.floor((now - t)/60000) : 0;
      return { i, mins };
    }).filter(x => x.mins > 60).sort((a,b)=>b.mins-a.mins);
    if (!rems.length) remList.innerHTML = `<div class="empty">No reminders — all open incidents are < 1h</div>`;
    else remList.innerHTML = rems.slice(0, 12).map(r => `
      <div class="reminder ${r.mins > 240 ? 'danger' : ''}">
        <strong>${U.escapeHtml(r.i.ticketId || '')} ${U.escapeHtml(r.i.incidentName || '')} — ${r.mins} min</strong>
        <div class="muted">${U.escapeHtml(r.i.incidentSubCategory || '')} · ${U.escapeHtml(r.i.zone || '')}</div>
        <div class="flex" style="margin-top:6px">
          <a class="btn sm" href="#/tickets">Open</a>
          <button class="btn ghost sm" data-snooze="${r.i.id}">Snooze 1h</button>
        </div>
      </div>`).join('');
    remList.querySelectorAll('[data-snooze]').forEach(b => b.addEventListener('click', () => {
      S.set('rem-' + b.dataset.snooze, new Date().toISOString());
      U.toast('Snoozed for 1h', 'success');
      render();
    }));
  }

  window.NMCPages = window.NMCPages || {};
  window.NMCPages.dashboard = render;

  // Re-render on theme change so charts pick up the new palette instantly
  let _themeTimer = null;
  document.addEventListener('nmc:themechange', () => {
    clearTimeout(_themeTimer);
    _themeTimer = setTimeout(() => {
      // Only re-render if the dashboard is currently mounted
      if (document.getElementById('trendChart')) render();
    }, 60);
  });
})();
