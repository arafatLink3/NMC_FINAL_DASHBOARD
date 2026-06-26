// BRAS Database Management — port of NMC Dashboard/js/pages/bras.js.
// Keeps the exact 11-column schema, the 10 production fallback rows,
// search/filter, .csv + .xlsx upload (via SheetJS at window.XLSX), and
// client-side CSV export. Renders through the existing theme classes
// (.card, table.data, .tag.b/g/y, .muted, .nowrap, .btn.*, .empty).

import { useEffect, useRef, useState } from 'react';
import { IconDownload, IconFile, IconSearch } from '../lib/icons';
import { useNotif } from '../lib/notif';

// SheetJS is loaded on demand for .xlsx parsing. The legacy page used the
// global `window.XLSX` exactly the same way.
declare global {
  interface Window {
    XLSX?: {
      read: (data: ArrayBuffer, opts: { type: 'array' }) => { Sheets: Record<string, unknown>; SheetNames: string[] };
      utils: { sheet_to_json: (ws: unknown, opts: { header: number; defval: string }) => unknown[][] };
    };
  }
}

// 11 target columns — used for both the <thead> and the CSV export header.
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
  { data: 'mis_branch_name', title: 'MIS Branch Name' },
] as const;

type BrasRow = {
  sl: string;
  bras_name: string;
  loopback: string;
  zone: string;
  sa_team_leader: string;
  service_agent_name: string;
  service_agent_contact_number: string;
  commission: string;
  nttn: string;
  scr_id: string;
  mis_branch_name: string;
};

// Initial production fallback dataset (the 10 rows from the legacy SPA).
const BRAS_LOCAL_DATA: BrasRow[] = [
  { sl: '1', bras_name: 'BANCHARAMPUR_BTS_DIST_BRAS_01', loopback: '10.20.231.9', zone: 'Dhaka/Dhaka Outer', sa_team_leader: 'Saeed Bin Shamim', service_agent_name: 'Dhaka Cable Network', service_agent_contact_number: '01701205706', commission: '40%', nttn: 'F@H', scr_id: '120162', mis_branch_name: 'Brahmanbaria-Nabinagar-BTS-Jibonganj (SA)' },
  { sl: '2', bras_name: 'SATKHIRA_PARULIA_DEBHATA_BTS_DIST_BRAS_01', loopback: '10.20.231.89', zone: 'KHULNA', sa_team_leader: 'Rezaul Islam ', service_agent_name: 'Friends Internet Service Center', service_agent_contact_number: '01730988316', commission: '40%', nttn: 'SCL', scr_id: 'lnk3_140322_014_nb', mis_branch_name: 'Satkhira-Debhata-BTS-Debhata (SA)' },
  { sl: '3', bras_name: 'TETULIA_PANCHAGARH_DST_BRAS_1', loopback: '10.20.231.60', zone: 'NORTH', sa_team_leader: 'Faruck Hossain', service_agent_name: 'Tetulia Broadband', service_agent_contact_number: '01744511490', commission: '40%', nttn: 'F@H', scr_id: '90357', mis_branch_name: 'Panchagarh-Tetulia-BTS-Tetulia (SA)' },
  { sl: '4', bras_name: 'JOYNOGOR_KASBA_DIST_BRAS_01', loopback: '10.20.231.207', zone: 'DHAKA', sa_team_leader: 'Saeed Bin Shamim', service_agent_name: 'Re Dot Net 2', service_agent_contact_number: '01793954313', commission: '40%', nttn: 'F@H', scr_id: '136041', mis_branch_name: 'Brahmanbaria-Kasba-BTS-Joynogor Bazar (SA)' },
  { sl: '5', bras_name: 'Khulna_Paikgasa_BTS_City_market_DST_BRAS_01', loopback: '10.20.231.75', zone: 'KHULNA', sa_team_leader: 'Rezaul Islam ', service_agent_name: 'Doyal Internet, Kopilmoni, Paikgacha, Khulna', service_agent_contact_number: '01912111599', commission: '40%', nttn: 'SCL', scr_id: 'lnk3_010126_033_nb', mis_branch_name: 'Khulna-Paikgasa-BTS-City Market (SA)' },
  { sl: '6', bras_name: 'HABIGANJ_MADHABPUR_HOROSHPUR_BTS_DIST_BRAS_01', loopback: '10.20.231.194', zone: 'SYLHET', sa_team_leader: 'Rezaul Islam ', service_agent_name: 'Sijan Power Network', service_agent_contact_number: '01773362662', commission: '40%', nttn: 'SCL', scr_id: 'lnk3_140525_030_nb', mis_branch_name: 'Habiganj-Madhabpur-BTS-Horoshpur (SA)' },
  { sl: '7', bras_name: 'SATKHIRA_SHYAMNAGAR_JHAPA_BTS_DIST_BRAS_01', loopback: '10.20.231.65', zone: 'KHULNA', sa_team_leader: 'Rezaul Islam ', service_agent_name: 'Rudra Satellite Cables', service_agent_contact_number: '01998044145', commission: '40%', nttn: 'SCL', scr_id: 'lnk3_181225_040_nb', mis_branch_name: 'Satkhira-Shyamnagar-BTS-Jhapa (SA)' },
  { sl: '8', bras_name: 'MUNSHIGANJ_TONGIBARI_BAGIA_BTS_DIST_BRAS_1', loopback: '10.20.231.97', zone: 'DHAKA', sa_team_leader: 'Saeed Bin Shamim', service_agent_name: 'Super Speed Internet', service_agent_contact_number: '01918358916', commission: '40%', nttn: 'SCL', scr_id: 'lnk3_300322_060_nb', mis_branch_name: 'Munshiganj-Tongibari-BTS-Tongibari (SA)' },
  { sl: '9', bras_name: 'BIROL_DINAJPUR_DIST_BRAS_01', loopback: '10.20.231.246', zone: 'NORTH', sa_team_leader: 'Faruck Hossain', service_agent_name: 'Birol Online', service_agent_contact_number: '01727803290', commission: '40%', nttn: 'SCL', scr_id: 'lnk3_091125_048_nb', mis_branch_name: 'Dinajpur-Birol-BTS-Birol (SA)' },
  { sl: '10', bras_name: 'GAIBANDHA_PACHPIR_BAZAR_BTS_DIST_1', loopback: '10.20.231.124', zone: 'NORTH', sa_team_leader: 'Faruck Hossain', service_agent_name: 'Jonocollan Cable Network', service_agent_contact_number: '01713930981', commission: '40%', nttn: 'F@H', scr_id: '97800', mis_branch_name: 'Gaibandha-Sundarganj-BTS-Pach Pir Bazar (SA)' },
];

// Strip leading slash + trim; the spreadsheet stores "/01701205706" but the
// UI must render "01701205706" per the dataset spec.
function sanitizeContact(raw: string | null | undefined): string {
  if (raw == null) return '';
  return String(raw).replace(/^\/+/, '').trim();
}

// Generic CSV parser: handles quoted cells, embedded commas, CR/LF.
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', inQ = false;
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
  return rows;
}

// 0-indexed column → BrasRow mapping (matches COLUMNS_SCHEMA order).
function rowToRecord(arr: unknown[]): BrasRow {
  const cell = (i: number) =>
    arr[i] == null ? '' : String(arr[i]).replace(/"/g, '').trim();
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
    mis_branch_name: cell(10),
  };
}

function parseAOA(aoa: unknown[][]): BrasRow[] {
  const out: BrasRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || r.every((c) => c == null || String(c).trim() === '')) continue;
    out.push(rowToRecord(r));
  }
  return out;
}

function buildTd(value: string, opts: { cls?: string; style?: string } = {}): string {
  const cls = opts.cls ? ` class="${opts.cls}"` : '';
  const style = opts.style ? ` style="${opts.style}"` : '';
  const display = (value == null || String(value).trim() === '') ? '-' : String(value);
  return `<td${cls}${style}>${escapeHtmlInner(display)}</td>`;
}

function escapeHtmlInner(v: string): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Render one row using the legacy inline styles so the table looks identical
// to the legacy BRAS page (muted SL, monospace loopback/contact/scr, tags
// for zone/commission/nttn, ellipsis on overflow cells).
function renderRowHtml(r: BrasRow): string {
  return [
    buildTd(r.sl,                          { cls: 'muted nowrap', style: 'max-width:48px' }),
    buildTd(r.bras_name,                   { cls: 'nowrap', style: 'max-width:240px;font-weight:600;overflow:hidden;text-overflow:ellipsis' }),
    buildTd(r.loopback,                    { cls: 'nowrap', style: 'font-family:Consolas,JetBrains Mono,monospace;color:var(--info)' }),
    buildTd(r.zone,                        { cls: 'tag b nowrap' }),
    buildTd(r.sa_team_leader,              { cls: 'nowrap', style: 'max-width:160px;overflow:hidden;text-overflow:ellipsis' }),
    buildTd(r.service_agent_name,          { cls: 'nowrap', style: 'max-width:200px;overflow:hidden;text-overflow:ellipsis' }),
    buildTd(sanitizeContact(r.service_agent_contact_number), { cls: 'nowrap', style: 'font-family:Consolas,JetBrains Mono,monospace' }),
    buildTd(r.commission,                  { cls: 'tag g nowrap right' }),
    buildTd(r.nttn,                        { cls: 'tag y nowrap' }),
    buildTd(r.scr_id,                      { cls: 'nowrap', style: 'font-family:Consolas,JetBrains Mono,monospace;color:var(--muted)' }),
    buildTd(r.mis_branch_name,             { cls: 'nowrap', style: 'max-width:320px;overflow:hidden;text-overflow:ellipsis' }),
  ].join('');
}

export function BrasPage() {
  const [rows, setRows] = useState<BrasRow[]>(BRAS_LOCAL_DATA);
  const [q, setQ] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { push } = useNotif();

  // SheetJS is loaded lazily (matches legacy behaviour — only on .xlsx upload).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.XLSX) return;
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.async = true;
    s.onerror = () => push('Could not load SheetJS for .xlsx parsing', 'warn');
    document.head.appendChild(s);
  }, [push]);

  const qLower = q.trim().toLowerCase();
  const filtered = qLower
    ? rows.filter((r) =>
        COLUMNS_SCHEMA.some((c) => {
          const v = c.data === 'service_agent_contact_number'
            ? sanitizeContact(r[c.data as keyof BrasRow])
            : r[c.data as keyof BrasRow];
          return v != null && String(v).toLowerCase().includes(qLower);
        }),
      )
    : rows;

  const tbodyHtml = filtered.length ? filtered.map((r) => `<tr>${renderRowHtml(r)}</tr>`).join('') : '';
  const emptyDisplay = filtered.length === 0 ? '' : 'none';

  function onUploadClick() { fileInputRef.current?.click(); }

  function onFileChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const grid = parseCSV(String(e.target?.result || ''));
          if (!grid.length) { push('No rows parsed from ' + file.name, 'warn'); return; }
          const out: BrasRow[] = [];
          for (let i = 1; i < grid.length; i++) {
            const r = grid[i];
            if (!r || r.every((c) => String(c).trim() === '')) continue;
            out.push(rowToRecord(r));
          }
          if (!out.length) { push('No rows parsed from ' + file.name, 'warn'); return; }
          setRows(out);
          push(out.length + ' rows loaded from ' + file.name, 'success');
        } catch (err) {
          push('Parse error: ' + (err as Error).message, 'warn');
        } finally {
          ev.target.value = '';
        }
      };
      reader.readAsText(file);
    } else {
      // .xlsx / .xls — needs SheetJS at window.XLSX
      if (!window.XLSX) {
        push('SheetJS (XLSX) not loaded. Save the sheet as .csv and re-upload.', 'warn');
        ev.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const bytes = new Uint8Array(e.target?.result as ArrayBuffer);
          const wb = window.XLSX!.read(bytes, { type: 'array' });
          const firstName = wb.SheetNames[0];
          const ws = firstName ? wb.Sheets[firstName] : undefined;
          if (!ws) { push('No sheet found in ' + file.name, 'warn'); return; }
          const aoa = window.XLSX!.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
          const records = parseAOA(aoa);
          if (!records.length) { push('No rows parsed from ' + file.name, 'warn'); return; }
          setRows(records);
          push(records.length + ' rows loaded from ' + file.name, 'success');
        } catch (err) {
          push('Excel parse error: ' + (err as Error).message, 'warn');
        } finally {
          ev.target.value = '';
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }

  function onExport() {
    if (!filtered.length) { push('Nothing to export', 'warn'); return; }
    const headers = COLUMNS_SCHEMA.map((c) => c.title);
    const lines = [headers.join(',')];
    filtered.forEach((r) => {
      const vals = COLUMNS_SCHEMA.map((c) => {
        const raw = c.data === 'service_agent_contact_number'
          ? sanitizeContact(r[c.data as keyof BrasRow])
          : r[c.data as keyof BrasRow];
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
    push('Exported ' + filtered.length + ' row(s) as CSV', 'success');
  }

  const counterLabel = qLower
    ? `${filtered.length} / ${rows.length} record(s)`
    : `${rows.length} record(s)`;

  return (
    <div>
      <div className="card">
        <div className="flex" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <h3 style={{ marginRight: 'auto' }}>BRAS Database</h3>
          <span className="muted" style={{ fontSize: 12 }}>{counterLabel}</span>
          <div style={{ position: 'relative' }}>
            <IconSearch size={14} style={{ position: 'absolute', left: 8, top: 11, color: 'var(--muted)' }} />
            <input
              id="b_q"
              placeholder="Search grid…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ maxWidth: 220, paddingLeft: 28 }}
            />
          </div>
          <input
            id="b_file"
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />
          <button className="btn ghost" onClick={onUploadClick} title="Upload a BRAS sheet (.xlsx / .csv) from C:\\NMC_Dashboard\\bras_database">
            <IconFile size={14} /> Upload Sheet
          </button>
          <button className="btn success" onClick={onExport} title="Download currently filtered rows as CSV">
            <IconDownload size={14} /> Export CSV
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14, padding: 0 }}>
        <div className="table-wrap bras-grid" style={{ border: 0, borderRadius: 'var(--radius)', maxHeight: 'calc(100vh - 220px)' }}>
          <table className="data bras-grid">
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
            <tbody dangerouslySetInnerHTML={{ __html: tbodyHtml }} />
          </table>
        </div>
        <div id="b_empty" className="empty" style={{ display: emptyDisplay }}>No BRAS records available</div>
      </div>
    </div>
  );
}
