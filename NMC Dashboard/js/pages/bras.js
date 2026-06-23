// pages/bras.js — BRAS Database Management (themed to match roster.js + theme.css)
(function () {
    // 11 Target columns defined explicitly matching user spreadsheet format.
    // Used both for the static <thead> layout and for the CSV export header row.
    const COLUMNS_SCHEMA = [
        { data: 'sl', title: 'SL' },
        { data: 'bras_name', title: 'BRAS Name' },
        { data: 'loopback', title: 'Loopback' },
        { data: 'zone', title: 'Zone' },
        { data: 'sa_team_leader', title: 'SA Team Leader' },
        { data: 'service_agent_name', title: 'Service Agent Name' },
        { data: 'service_agent_contact_number', title: 'Service Agent contact number' },
        { data: 'commission', title: 'Commission' },
        { data: 'nttn', title: 'NTTN' },
        { data: 'scr_id', title: 'SCR ID' },
        { data: 'mis_branch_name', title: 'MIS Branch Name' }
    ];

    // INITIAL PRODUCTION FALLBACK DATASET (The 10 rows provided by user)
    let BRAS_LOCAL_DATA = [
        { sl: "1", bras_name: "BANCHARAMPUR_BTS_DIST_BRAS_01", loopback: "10.20.231.9", zone: "Dhaka/Dhaka Outer", sa_team_leader: "Saeed Bin Shamim", service_agent_name: "Dhaka Cable Network", service_agent_contact_number: "01701205706", commission: "40%", nttn: "F@H", scr_id: "120162", mis_branch_name: "Brahmanbaria-Nabinagar-BTS-Jibonganj (SA)" },
        { sl: "2", bras_name: "SATKHIRA_PARULIA_DEBHATA_BTS_DIST_BRAS_01", loopback: "10.20.231.89", zone: "KHULNA", sa_team_leader: "Rezaul Islam ", service_agent_name: "Friends Internet Service Center", service_agent_contact_number: "01730988316", commission: "40%", nttn: "SCL", scr_id: "lnk3_140322_014_nb", mis_branch_name: "Satkhira-Debhata-BTS-Debhata (SA)" },
        { sl: "3", bras_name: "TETULIA_PANCHAGARH_DST_BRAS_1", loopback: "10.20.231.60", zone: "NORTH", sa_team_leader: "Faruck Hossain", service_agent_name: "Tetulia Broadband", service_agent_contact_number: "01744511490", commission: "40%", nttn: "F@H", scr_id: "90357", mis_branch_name: "Panchagarh-Tetulia-BTS-Tetulia (SA)" },
        { sl: "4", bras_name: "JOYNOGOR_KASBA_DIST_BRAS_01", loopback: "10.20.231.207", zone: "DHAKA", sa_team_leader: "Saeed Bin Shamim", service_agent_name: "Re Dot Net 2", service_agent_contact_number: "01793954313", commission: "40%", nttn: "F@H", scr_id: "136041", mis_branch_name: "Brahmanbaria-Kasba-BTS-Joynogor Bazar (SA)" },
        { sl: "5", bras_name: "Khulna_Paikgasa_BTS_City_market_DST_BRAS_01", loopback: "10.20.231.75", zone: "KHULNA", sa_team_leader: "Rezaul Islam ", service_agent_name: "Doyal Internet, Kopilmoni, Paikgacha, Khulna", service_agent_contact_number: "01912111599", commission: "40%", nttn: "SCL", scr_id: "lnk3_010126_033_nb", mis_branch_name: "Khulna-Paikgasa-BTS-City Market (SA)" },
        { sl: "6", bras_name: "HABIGANJ_MADHABPUR_HOROSHPUR_BTS_DIST_BRAS_01", loopback: "10.20.231.194", zone: "SYLHET", sa_team_leader: "Rezaul Islam ", service_agent_name: "Sijan Power Network", service_agent_contact_number: "01773362662", commission: "40%", nttn: "SCL", scr_id: "lnk3_140525_030_nb", mis_branch_name: "Habiganj-Madhabpur-BTS-Horoshpur (SA)" },
        { sl: "7", bras_name: "SATKHIRA_SHYAMNAGAR_JHAPA_BTS_DIST_BRAS_01", loopback: "10.20.231.65", zone: "KHULNA", sa_team_leader: "Rezaul Islam ", service_agent_name: "Rudra Satellite Cables", service_agent_contact_number: "01998044145", commission: "40%", nttn: "SCL", scr_id: "lnk3_181225_040_nb", mis_branch_name: "Satkhira-Shyamnagar-BTS-Jhapa (SA)" },
        { sl: "8", bras_name: "MUNSHIGANJ_TONGIBARI_BAGIA_BTS_DIST_BRAS_1", loopback: "10.20.231.97", zone: "DHAKA", sa_team_leader: "Saeed Bin Shamim", service_agent_name: "Super Speed Internet", service_agent_contact_number: "01918358916", commission: "40%", nttn: "SCL", scr_id: "lnk3_300322_060_nb", mis_branch_name: "Munshiganj-Tongibari-BTS-Tongibari (SA)" },
        { sl: "9", bras_name: "BIROL_DINAJPUR_DIST_BRAS_01", loopback: "10.20.231.246", zone: "NORTH", sa_team_leader: "Faruck Hossain", service_agent_name: "Birol Online", service_agent_contact_number: "01727803290", commission: "40%", nttn: "SCL", scr_id: "lnk3_091125_048_nb", mis_branch_name: "Dinajpur-Birol-BTS-Birol (SA)" },
        { sl: "10", bras_name: "GAIBANDHA_PACHPIR_BAZAR_BTS_DIST_1", loopback: "10.20.231.124", zone: "NORTH", sa_team_leader: "Faruck Hossain", service_agent_name: "Jonocollan Cable Network", service_agent_contact_number: "01713930981", commission: "40%", nttn: "F@H", scr_id: "97800", mis_branch_name: "Gaibandha-Sundarganj-BTS-Pach Pir Bazar (SA)" }
    ];

    // --- Utilities (mirroring the helpers in roster.js) ---------------------

    // XML/HTML escape for safe inline rendering inside <td>.
    function escapeHtml(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Strip leading slash + trim; the spreadsheet stores "/01701205706" but the
    // UI must render "01701205706" per the dataset spec.
    function sanitizeContact(raw) {
        return raw == null ? '' : String(raw).replace(/^\/+/, '').trim();
    }

    // True for BRAS name, loopback, MIS branch — cells that often overflow.
    function buildTd(value, opts) {
        const opts2 = opts || {};
        const display = (value == null || String(value).trim() === '') ? '-' : String(value);
        const cls = opts2.cls ? ` class="${opts2.cls}"` : '';
        const style = opts2.style ? ` style="${opts2.style}"` : '';
        return `<td${cls}${style}>${escapeHtml(display)}</td>`;
    }

    // --- Roster-style page render -------------------------------------------

    function render() {
        const view = document.getElementById('view');
        if (!view) return;

        view.innerHTML = `
          <div class="card">
            <div class="flex" style="flex-wrap:wrap;gap:8px;align-items:center">
              <h3 style="margin-right:auto">BRAS Database</h3>
              <span id="b_metrics_count" class="muted" style="font-size:12px"></span>
              <input id="b_q" placeholder="Search grid…" style="max-width:220px" />
              <input id="b_file" type="file" accept=".csv,.xlsx,.xls" style="display:none" />
              <button class="btn ghost" id="b_upload" title="Upload a BRAS sheet (.xlsx / .csv) from C:\\NMC_Dashboard\\bras_database">📋 Upload Sheet</button>
              <button class="btn success" id="b_export" title="Download currently filtered rows as CSV">⬇ Export CSV</button>
            </div>
          </div>

          <div class="card" style="margin-top:14px;padding:0">
            <div class="table-wrap" style="border:0;border-radius:var(--radius);max-height:calc(100vh - 220px)">
              <table class="data bras-grid">
                <thead>
                  <tr>
                    <th>SL</th>
                    <th>BRAS Name</th>
                    <th>Loopback</th>
                    <th>Zone</th>
                    <th>SA Team Leader</th>
                    <th>Service Agent Name</th>
                    <th>Service Agent contact number</th>
                    <th>Commission</th>
                    <th>NTTN</th>
                    <th>SCR ID</th>
                    <th>MIS Branch Name</th>
                  </tr>
                </thead>
                <tbody id="b_tbody"></tbody>
              </table>
            </div>
            <div id="b_empty" class="empty" style="display:none">No BRAS records available</div>
          </div>
        `;

        // Render initial fallback rows (client-side only; no network)
        drawRows(BRAS_LOCAL_DATA);
        updateCounter(BRAS_LOCAL_DATA.length);

        // Search box → live filter (roster.js-style: re-render rows on each input)
        document.getElementById('b_q').addEventListener('input', () => {
            const q = (document.getElementById('b_q').value || '').trim().toLowerCase();
            if (!q) { drawRows(BRAS_LOCAL_DATA); updateCounter(BRAS_LOCAL_DATA.length); return; }
            const filtered = BRAS_LOCAL_DATA.filter(r => COLUMNS_SCHEMA.some(c => {
                const v = c.data === 'service_agent_contact_number' ? sanitizeContact(r[c.data]) : r[c.data];
                return v != null && String(v).toLowerCase().includes(q);
            }));
            drawRows(filtered);
            updateCounter(filtered.length, BRAS_LOCAL_DATA.length);
        });

        // Upload Sheet → trigger hidden file picker
        document.getElementById('b_upload').addEventListener('click', () => {
            document.getElementById('b_file').click();
        });

        // File picker change → branch CSV vs XLSX, then parse + redraw
        document.getElementById('b_file').addEventListener('change', (ev) => {
            const file = ev.target.files && ev.target.files[0];
            if (!file) return;
            const name = (file.name || '').toLowerCase();
            if (name.endsWith('.csv')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const records = parseCSV(String(e.target.result || ''));
                        if (!records.length) { toast('No rows parsed from ' + file.name, 'warn'); return; }
                        BRAS_LOCAL_DATA = records;
                        drawRows(BRAS_LOCAL_DATA);
                        updateCounter(BRAS_LOCAL_DATA.length);
                        toast(records.length + ' rows loaded from ' + file.name, 'success');
                    } catch (err) {
                        toast('Parse error: ' + err.message, 'warn');
                    } finally { ev.target.value = ''; }
                };
                reader.readAsText(file);
            } else {
                // .xlsx / .xls — needs SheetJS at window.XLSX
                if (!window.XLSX) {
                    toast('SheetJS (XLSX) not loaded. Save the sheet as .csv and re-upload.', 'warn');
                    ev.target.value = '';
                    return;
                }
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const bytes = new Uint8Array(e.target.result);
                        const wb = window.XLSX.read(bytes, { type: 'array' });
                        const ws = wb.Sheets[wb.SheetNames[0]];
                        const aoa = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                        const records = parseAOA(aoa);
                        if (!records.length) { toast('No rows parsed from ' + file.name, 'warn'); return; }
                        BRAS_LOCAL_DATA = records;
                        drawRows(BRAS_LOCAL_DATA);
                        updateCounter(BRAS_LOCAL_DATA.length);
                        toast(records.length + ' rows loaded from ' + file.name, 'success');
                    } catch (err) {
                        toast('Excel parse error: ' + err.message, 'warn');
                    } finally { ev.target.value = ''; }
                };
                reader.readAsArrayBuffer(file);
            }
        });

        // Export CSV (uses current filter if any)
        document.getElementById('b_export').addEventListener('click', () => {
            const q = (document.getElementById('b_q').value || '').trim().toLowerCase();
            const rows = q
                ? BRAS_LOCAL_DATA.filter(r => COLUMNS_SCHEMA.some(c => {
                    const v = c.data === 'service_agent_contact_number' ? sanitizeContact(r[c.data]) : r[c.data];
                    return v != null && String(v).toLowerCase().includes(q);
                }))
                : BRAS_LOCAL_DATA;
            exportCSV(rows);
        });
    }

    // --- Drawing & parsing ---------------------------------------------------

    // Render the rows into the static <tbody> in a theme-conforming way.
    function drawRows(rows) {
        const tbody = document.getElementById('b_tbody');
        const empty = document.getElementById('b_empty');
        if (!tbody) return;
        if (!rows || !rows.length) {
            tbody.innerHTML = '';
            if (empty) empty.style.display = '';
            return;
        }
        if (empty) empty.style.display = 'none';

        const html = rows.map(r => {
            // Per-cell classes / inline styles mirror the theme:
            //   - SL         → muted
            //   - BRAS Name  → bold, ellipsis on overflow
            //   - Loopback   → monospace (network IP)
            //   - Zone       → .tag.b
            //   - SA TL      → ellipsis
            //   - Agent      → ellipsis
            //   - Contact    → monospace, slash-stripped
            //   - Commission → .tag.g
            //   - NTTN       → .tag.y
            //   - SCR ID     → monospace
            //   - MIS Branch → ellipsis (wider)
            return `<tr>
                ${buildTd(r.sl,                          { cls: 'muted nowrap', style: 'max-width:48px' })}
                ${buildTd(r.bras_name,                   { cls: 'nowrap', style: 'max-width:240px;font-weight:600;overflow:hidden;text-overflow:ellipsis' })}
                ${buildTd(r.loopback,                    { cls: 'nowrap', style: 'font-family:Consolas,JetBrains Mono,monospace;color:var(--info)' })}
                ${buildTd(r.zone,                        { cls: 'nowrap' })}
                ${buildTd(r.sa_team_leader,              { cls: 'nowrap', style: 'max-width:160px;overflow:hidden;text-overflow:ellipsis' })}
                ${buildTd(r.service_agent_name,          { cls: 'nowrap', style: 'max-width:200px;overflow:hidden;text-overflow:ellipsis' })}
                ${buildTd(sanitizeContact(r.service_agent_contact_number), { cls: 'nowrap', style: 'font-family:Consolas,JetBrains Mono,monospace' })}
                ${buildTd(r.commission,                  { cls: 'nowrap right' })}
                ${buildTd(r.nttn,                        { cls: 'nowrap' })}
                ${buildTd(r.scr_id,                      { cls: 'nowrap', style: 'font-family:Consolas,JetBrains Mono,monospace;color:var(--muted)' })}
                ${buildTd(r.mis_branch_name,             { cls: 'nowrap', style: 'max-width:320px;overflow:hidden;text-overflow:ellipsis' })}
            </tr>`;
        }).join('');
        tbody.innerHTML = html;
    }

    function updateCounter(shown, total) {
        const el = document.getElementById('b_metrics_count');
        if (!el) return;
        if (total == null) el.textContent = shown + ' record(s)';
        else el.textContent = shown + ' / ' + total + ' record(s)';
    }

    // Robust CSV parser: handles quoted cells, embedded commas, and CR/LF.
    function parseCSV(text) {
        const rows = [];
        let row = [], cell = '', inQ = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (inQ) {
                if (ch === '"') {
                    if (text[i + 1] === '"') { cell += '"'; i++; }
                    else inQ = false;
                } else cell += ch;
            } else {
                if (ch === '"') inQ = true;
                else if (ch === ',') { row.push(cell); cell = ''; }
                else if (ch === '\r') { /* skip */ }
                else if (ch === '\n') { row.push(cell); cell = ''; rows.push(row); row = []; }
                else cell += ch;
            }
        }
        if (cell || row.length) { row.push(cell); rows.push(row); }
        // Drop header row + blank trailing rows, then map.
        const out = [];
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || r.every(c => String(c).trim() === '')) continue;
            out.push(rowToRecord(r));
        }
        return out;
    }

    // Map an array-of-arrays (XLSX output) to the same record shape.
    function parseAOA(aoa) {
        const out = [];
        for (let i = 1; i < aoa.length; i++) {
            const r = aoa[i];
            if (!r || r.every(c => c == null || String(c).trim() === '')) continue;
            out.push(rowToRecord(r));
        }
        return out;
    }

    // 0-indexed column → object mapping (matches COLUMNS_SCHEMA order).
    function rowToRecord(arr) {
        const cell = (i) => arr[i] == null ? '' : String(arr[i]).replace(/"/g, '').trim();
        return {
            sl: cell(0),
            bras_name: cell(1),
            loopback: cell(2),
            zone: cell(3),
            sa_team_leader: cell(4),
            service_agent_name: cell(5),
            service_agent_contact_number: cell(6).replace(/^\/+/, ''),
            commission: cell(7),
            nttn: cell(8),
            scr_id: cell(9),
            mis_branch_name: cell(10)
        };
    }

    // Client-side CSV export (Blob + dynamic <a download>). No network call.
    function exportCSV(rows) {
        if (!rows || !rows.length) { toast('Nothing to export', 'warn'); return; }
        const headers = COLUMNS_SCHEMA.map(c => c.title);
        const lines = [headers.join(',')];
        rows.forEach(r => {
            const vals = COLUMNS_SCHEMA.map(c => {
                const raw = c.data === 'service_agent_contact_number' ? sanitizeContact(r[c.data]) : r[c.data];
                const t = raw == null ? '' : String(raw).replace(/"/g, '""');
                return '"' + t + '"';
            });
            lines.push(vals.join(','));
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'bras_records.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        toast('Exported ' + rows.length + ' row(s) as CSV', 'success');
    }

    // Toast helper that uses the global U.toast if present, else falls back to alert.
    function toast(msg, kind) {
        const U = window.NMCUI;
        if (U && typeof U.toast === 'function') U.toast(msg, kind || 'info', 2500);
        else try { alert(msg); } catch (_) {}
    }

    window.NMCPages = window.NMCPages || {};
    window.NMCPages.bras = render;
})();
