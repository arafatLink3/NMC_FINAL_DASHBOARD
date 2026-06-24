// Tickets page — ported 1-to-1 from `NMC Dashboard/js/pages/tickets.js`.
// Same two-card layout (Create Ticket + Close Ticket), same dropdown lists,
// same preview-text format, same rowFromTicket mapping into the Incident Log,
// same on-shift engineer / AI classify behaviour, same WhatsApp share.
//
// The only changes are:
//   * DOM strings  →  React JSX
//   * document.getElementById  →  local refs / state
//   * window.NMCStore / NMCAI  →  `store` from `../lib/store` and the
//     `@nmc/ai` package functions.
//   * U.toast(...)  →  `useNotif().push(...)` (the existing toast UI).
//   * Row keys aligned to `IncidentRecord` so the master Incident Log
//     page (IncidentLogPage.tsx) reads them back correctly.

import { useEffect, useMemo, useState } from 'react';
import { engineerAt, inferZone, classify, learn } from '@nmc/ai';
import type { IncidentRecord, RosterRecord, Settings } from '@nmc/api-client';
import { useCollection, store } from '../lib/store';
import { useNotif } from '../lib/notif';

// --- 1. CORE UTILITIES & 24-HOUR TIME ENGINE ---
const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Parses an ISO yyyy-mm-dd date + "HH" / "MM" select values into a real Date.
 * Returns null if any piece is missing or invalid. Multi-day outages are
 * handled naturally because we construct a single absolute timestamp from
 * (date, hours, minutes) — no manual hour arithmetic that could mis-count
 * across DST or month boundaries.
 */
function parseDateTime(
  dateStr: string,
  hhStr: string | number,
  mmStr: string | number,
): Date | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m || !m[1] || !m[2] || !m[3]) return null;
  const yyyy = +m[1];
  const mo = +m[2] - 1;
  const dd = +m[3];
  const hh = typeof hhStr === 'number' ? hhStr : parseInt(hhStr, 10);
  if (!Number.isFinite(hh)) return null;
  const mm = typeof mmStr === 'number' ? mmStr : parseInt(mmStr, 10);
  if (!Number.isFinite(mm)) return null;
  const d = new Date(yyyy, mo, dd, hh, mm, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

/** "X hours Y minutes" or "D days H hrs M mins" — safe for multi-day outages. */
function formatDurationFromDates(
  faultDate: Date | null,
  restoredDate: Date | null,
): string {
  if (!faultDate || !restoredDate) return '';
  let diff = restoredDate.getTime() - faultDate.getTime();
  if (diff < 0) diff = 0;
  const days = Math.floor(diff / 86400000);
  diff -= days * 86400000;
  const hrs = Math.floor(diff / 3600000);
  diff -= hrs * 3600000;
  const mins = Math.floor(diff / 60000);
  if (days > 0) return `${days} days ${hrs} hrs ${mins} mins`;
  if (hrs > 0) return `${hrs} hrs ${mins} mins`;
  return `${mins} mins`;
}

function buildCompiled24HString(
  date: string,
  hh: string,
  mm: string,
): string {
  if (!date) return '';
  const parts = date.split('-');
  const yyyy = parts[0] || '';
  const mo = parts[1] || '';
  const dd = parts[2] || '';
  const now = new Date();
  const isToday =
    now.getFullYear() === +yyyy &&
    now.getMonth() + 1 === +mo &&
    now.getDate() === +dd;
  return isToday
    ? `${hh}:${mm}`
    : `${hh}:${mm} (${dd}/${mo}/${yyyy.slice(-2)})`;
}

function waShare(text: string, group: string) {
  const url =
    'https://wa.me/' +
    (group || '') +
    '?text=' +
    encodeURIComponent(text || '');
  window.open(url, '_blank', 'noopener');
}

// --- 2. PREVIEW TEXT GENERATION FORMATTERS ---

type TicketPayload = {
  category?: string;
  bts?: string;
  ic?: string | number;
  faultTime?: string;
  etr?: string;
  rootCause?: string;
  tt?: string;
  ping?: { ip?: string } | string;
  laser?: { ip?: string } | string;
  closeCategory?: string;
  restoredTime?: string;
  duration?: string;
};

function ticketText(p: TicketPayload): string {
  const lines: string[] = [
    `Incident Notification || Incident Category: ${p.category || ''}`,
    `BTS/Area: ${p.bts || ''}`,
    `Impacted Client: ${p.ic == null ? 'NO' : p.ic}`,
    `Fault Time: ${p.faultTime || ''} ETR: ${p.etr || 'Yet to be shared'}`,
    `Root Cause: ${p.rootCause || 'Yet to identify'}`,
    `Ticket ID: ${p.tt || ''}`,
    '------------------------------------------------------------------',
  ];
  if (p.ping) {
    const pingStr = typeof p.ping === 'string' ? p.ping : p.ping.ip || '';
    if (pingStr.trim()) lines.push('\n' + pingStr.trim());
  }
  if (p.laser) {
    const laserStr =
      typeof p.laser === 'string' ? p.laser : p.laser.ip || '';
    if (laserStr.trim()) lines.push('\n' + laserStr.trim());
  }
  return lines.join('\n');
}

function closeText(p: TicketPayload): string {
  const lines: string[] = [
    `Close Notification || Incident Category: ${p.closeCategory || ''}`,
    `BTS/Area: ${p.bts || ''}`,
    `Impacted Client: ${p.ic == null ? 'NO' : p.ic}`,
    `Fault Time: ${p.faultTime || ''}  Restored Time: ${
      p.restoredTime || ''
    }  Duration: ${p.duration || ''}`,
    `Root Cause: ${p.rootCause || 'Yet to identify'}`,
    `Ticket ID: ${p.tt || ''}`,
    '------------------------------------------------------------------',
  ];
  if (p.ping) {
    const pingStr = typeof p.ping === 'string' ? p.ping : p.ping.ip || '';
    if (pingStr.trim()) lines.push('\n' + pingStr.trim());
  }
  if (p.laser) {
    const laserStr =
      typeof p.laser === 'string' ? p.laser : p.laser.ip || '';
    if (laserStr.trim()) lines.push('\n' + laserStr.trim());
  }
  return lines.join('\n');
}

// Build an Incident Log row skeleton from a Ticket-Page payload (p) plus
// the contextual extras the t_confirm handler computes (AI classification,
// on-shift engineer, current timestamp, default status). The keys match
// the `IncidentRecord` schema in `@nmc/api-client` so the row renders
// in the master log without further patching.
function rowFromTicket(
  p: TicketPayload,
  extras: Record<string, any> = {},
): Partial<IncidentRecord> {
  const icRaw = p.ic != null ? String(p.ic) : 'NO';
  const icNum = parseInt(icRaw, 10);
  const icStr =
    Number.isFinite(icNum) && icNum > 0 ? 'YES' : 'NO';
  const pingStr =
    typeof p.ping === 'string' ? p.ping : p.ping && p.ping.ip ? p.ping.ip : '';
  const laserStr =
    typeof p.laser === 'string'
      ? p.laser
      : p.laser && p.laser.ip
        ? p.laser.ip
        : '';
  const actParts: string[] = [];
  if (pingStr && pingStr.trim()) actParts.push('Ping: ' + pingStr.trim());
  if (laserStr && laserStr.trim())
    actParts.push('Laser: ' + laserStr.trim());
  const nowIso = new Date().toISOString();
  return {
    // Identity / context
    session: extras.session || '',
    name: extras.name || '',
    date: (extras.faultDate as string) || nowIso.slice(0, 10),

    // Classification
    incidentName: p.bts || '',
    category: p.category || '',
    subCategory: p.category || '',
    zone: extras.zone || '',

    // Service / client
    ic: icStr,
    faultTime: p.faultTime || '',

    // Ticket linkage
    ticketId: p.tt || '',
    rootCause: p.rootCause || 'Yet to identify',

    // Action
    actionTaken: actParts.join(' | '),

    // AI classification
    issueType: extras.issueType || '',
    department: extras.forwardDepartment || '',
    team: extras.forwardDepartment || '',

    // Status
    whatsapp: extras.whatsappNotified || 'Notified',
    currentStatus: extras.currentStatus || 'open',
    informedTimeMedia: extras.informedTimeMedia || '',
    solved: 'no',
  };
}

// --- 3. INCIDENT TYPE (matches `useCollection<IncidentRecord>`) ---

type Incident = IncidentRecord;

const CREATE_CATEGORIES = [
  'Traffic Full',
  'Traffic Fall',
  'Service Interruption',
  'SureCom Device Down',
  'Wireless Link Down',
  'NTTN Link Down',
  'NTTN Link Laser High Issue',
  'FO Link Down',
  'FO Link Laser High Issue',
  'L3 BRAS Down (Link3 Own BRAS)',
  'Distributor BRAS Down',
  'GP POP Down',
  'GP Site Down',
  'BL POP Down',
  'BL Site Down',
  'BL Capacity Link Down',
  'Router Down',
  'Switch Down',
  'BTS Down',
  'BL E1 Link Down',
  'IIG Link Down',
  'OLT Down',
  'PON Down',
];

const CLOSE_CATEGORIES = [
  'Traffic Increased',
  'SureCom Device Up',
  'Wireless Link Up',
  'Service Interruption Solved',
  'NTTN Link Up',
  'NTTN Link Laser High Issue Up',
  'FO Link Up',
  'FO Link Laser High Issue Up',
  'L3 BRAS Up',
  'L3 BRAS Up & Stable',
  'Distributor BRAS Up',
  'Distributor BRAS Up & Stable',
  'GP POP Up',
  'GP Site Up',
  'BL POP Up',
  'BL Site Up',
  'BL Capacity Link Up',
  'Router Up',
  'Router Up & Stable',
  'Switch Up',
  'Switch Up & Stable',
  'BTS Up & Stable',
  'BL E1 Link Up',
  'IIG Link Up',
  'OLT Up',
  'PON Up',
];

const btnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  whiteSpace: 'nowrap',
  fontSize: 11,
  padding: '6px 10px',
  fontWeight: 500,
  height: 32,
  flex: 1,
};

// --- 4. MAIN PAGE ---

export function TicketsPage() {
  const [incidents] = useCollection<IncidentRecord>('incidents');
  const [rosters] = useCollection<RosterRecord>('roster');
  const [settingsRows] = useCollection<Settings>('settings');

  // Adapt the flat RosterRecord rows into the nested form
  // `engineerAt(date, rosters)` expects. If a RosterRecord already has a
  // nested engineers array, we pass it through unchanged.
  const nestedRosters = useMemo(
    () =>
      (rosters || []).map((r: any) => ({
        date: r.date || '',
        dept: r.dept || 'General',
        shift: (r.shift || 'Morning') as
          | 'Morning'
          | 'Evening'
          | 'Night',
        engineers: Array.isArray(r.engineers)
          ? r.engineers.map((e: any) =>
              typeof e === 'string' ? { name: e } : e,
            )
          : r.name
            ? [{ name: r.name, phone: r.phone, dept: r.dept }]
            : [],
      })),
    [rosters],
  );

  // WA group is stored as the singleton row at `nmc.settings[0]`.
  const waGroup = useMemo(() => {
    const s = (settingsRows || [])[0];
    return (s && (s.wa_group as any)) || '';
  }, [settingsRows]);

  return (
    <div>
      <h2 style={{ margin: '4px 0 12px' }}>Tickets</h2>

      <div className="grid-2">
        <div className="card">
          <h3>Create Ticket</h3>
          <CreateTicketCard
            rosters={nestedRosters}
            incidents={incidents}
            waGroup={waGroup}
          />
        </div>
        <div className="card">
          <h3>Close Ticket</h3>
          <CloseTicketCard incidents={incidents} waGroup={waGroup} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Incident Log (this month)</h3>
        <IncidentsMiniTable incidents={incidents} />
      </div>
    </div>
  );
}

// --- 5. CREATE TICKET CARD ---

function CreateTicketCard({
  rosters,
  incidents,
  waGroup,
}: {
  rosters: Parameters<typeof engineerAt>[1];
  incidents: IncidentRecord[];
  waGroup: any;
}) {
  const { push } = useNotif();
  const today = new Date();
  const [category, setCategory] = useState('');
  const [bts, setBts] = useState('');
  const [ic, setIc] = useState<'NO' | 'YES'>('NO');
  const [icValue, setIcValue] = useState('');
  const [etr, setEtr] = useState('');
  const [faultDate, setFaultDate] = useState(today.toISOString().slice(0, 10));
  const [faultHh, setFaultHh] = useState(
    pad2(today.getHours()).padStart(2, '0'),
  );
  const [faultMm, setFaultMm] = useState('00');
  const [tt, setTt] = useState('');
  const [root, setRoot] = useState('Yet to identify');
  const [pingIp, setPingIp] = useState('');
  const [laserInfo, setLaserInfo] = useState('');
  const [preview, setPreview] = useState(
    'Fill the form and click Preview Format.',
  );
  const [aiLabel, setAiLabel] = useState('');

  const hhOpts = useMemo(
    () => Array.from({ length: 24 }, (_, i) => pad2(i)),
    [],
  );
  const mmOpts = useMemo(
    () => Array.from({ length: 60 }, (_, i) => pad2(i)),
    [],
  );

  // AI label refresh — mirrors the legacy aiLabel() in tickets.js
  useEffect(() => {
    if (!category && !bts) {
      setAiLabel('');
      return;
    }
    const cls = classify(category || '', bts || '');
    const zone = inferZone(bts || '');
    setAiLabel(
      `AI suggests → ${cls.dept} · Issue: ${cls.issue} · Zone: ${
        zone || '-'
      }`,
    );
  }, [category, bts]);

  function gather() {
    return {
      category: category.trim(),
      bts: bts.trim(),
      ic: ic === 'YES' ? icValue.trim() || 'YES' : 'NO',
      faultTime: buildCompiled24HString(faultDate, faultHh, faultMm),
      etr: etr.trim(),
      tt: tt.trim(),
      rootCause: root.trim(),
      laser: laserInfo.trim(),
      ping: { ip: pingIp },
    };
  }

  function onPreview() {
    setPreview(ticketText(gather()));
  }

  function onClear() {
    setBts('');
    setIcValue('');
    setFaultDate(today.toISOString().slice(0, 10));
    setEtr('');
    setTt('');
    setLaserInfo('');
    setPingIp('');
    setFaultHh(pad2(today.getHours()).padStart(2, '0'));
    setFaultMm('00');
    setRoot('Yet to identify');
    setIc('NO');
    setPreview('Fill the form and click Preview Format.');
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(preview);
      push('Copied to clipboard', 'success');
    } catch {
      /* ignore */
    }
  }

  function onWa() {
    const groupId = waGroup && (waGroup.id || waGroup) || '';
    waShare(preview, typeof groupId === 'string' ? groupId : '');
  }

  function onConfirm() {
    try {
      const p = gather();
      if (!p.bts || !p.tt) {
        push('BTS/Area and TT are required', 'warn');
        return;
      }
      const cls = classify(p.category, p.bts);
      const ses = engineerAt(new Date(), rosters || []);
      const now = new Date();
      const cleanTime24 =
        pad2(now.getHours()) +
        ':' +
        pad2(now.getMinutes()) +
        ':' +
        pad2(now.getSeconds());

      const row = rowFromTicket(p, {
        session: ses.shift,
        name: ses.engineers && ses.engineers[0] ? ses.engineers[0].name : '',
        forwardDepartment: cls.dept,
        issueType: cls.issue,
        currentStatus: 'open',
        whatsappNotified: 'Notified',
        informedTimeMedia: cleanTime24 + ' via WhatsApp',
        faultDate: faultDate,
      });
      // Stamp exact save time so the master log can sort/filter precisely
      // even when faultTime is rounded to the minute.
      (row as any).createdAt = now.toISOString();
      (row as any).updatedAt = now.toISOString();
      (row as any).informedPerson = cleanTime24 + ' via WhatsApp';

      store.add('incidents', row);
      // The store itself already toasts "Added to incidents"; suppress
      // the duplicate and show our own, more specific, success message.
      try {
        // `learn(currentMap, category, dept)` mutates the AI training map.
        // Tickets page doesn't read the map itself, so pass an empty seed.
        learn({}, p.category, cls.dept);
      } catch {
        /* learn is best-effort */
      }
      push('Saved to Incident Log', 'success');
      onClear();
    } catch (err: any) {
      console.error('[t_confirm] failed:', err);
      push(
        'Save failed: ' + (err && err.message ? err.message : err),
        'danger',
      );
    }
  }

  function onCategoryChange(c: string) {
    setCategory(c);
    setBts('');
    setIcValue('');
    setFaultDate(today.toISOString().slice(0, 10));
    setEtr('');
    setTt('');
    setLaserInfo('');
    setPingIp('');
    setFaultHh(pad2(today.getHours()).padStart(2, '0'));
    setFaultMm('00');
    setRoot('Yet to identify');
    setIc('NO');
    setPreview('Fill the form and click Preview Format.');
  }

  return (
    <div>
      <div className="row">
        <div className="col-6">
          <label>Incident Category</label>
          <select
            id="t_category"
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
          >
            <option value="">— select —</option>
            {CREATE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6">
          <label>BTS/Area</label>
          <input
            id="t_bts"
            placeholder="e.g. BL_Sonagazi POP"
            value={bts}
            onChange={(e) => setBts(e.target.value)}
          />
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="col-4">
          <label>Impacted Client</label>
          <select
            id="t_ic"
            value={ic}
            onChange={(e) => setIc(e.target.value as 'NO' | 'YES')}
          >
            <option value="NO">NO</option>
            <option value="YES">YES</option>
          </select>
        </div>
        <div
          className="col-4"
          id="t_ic_value_wrap"
          style={{ display: ic === 'YES' ? '' : 'none' }}
        >
          <label>IC Details</label>
          <input
            id="t_ic_value"
            placeholder="e.g. 255, Partial"
            value={icValue}
            onChange={(e) => setIcValue(e.target.value)}
          />
        </div>
        <div className="col-4">
          <label>ETR</label>
          <input
            id="t_etr"
            placeholder="Yet to be shared"
            value={etr}
            onChange={(e) => setEtr(e.target.value)}
          />
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="col-4">
          <label>Fault Date</label>
          <input
            id="t_fault_date"
            type="date"
            value={faultDate}
            onChange={(e) => setFaultDate(e.target.value)}
          />
        </div>
        <div className="col-4">
          <label>Fault Time (24h)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <select
              id="t_fault_hh"
              value={faultHh}
              onChange={(e) => setFaultHh(e.target.value)}
            >
              {hhOpts.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <span style={{ fontWeight: 'bold' }}>:</span>
            <select
              id="t_fault_mm"
              value={faultMm}
              onChange={(e) => setFaultMm(e.target.value)}
            >
              {mmOpts.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="col-4">
          <label>Ticket ID</label>
          <input
            id="t_tt"
            placeholder="L3-02Jun26-000"
            value={tt}
            onChange={(e) => setTt(e.target.value)}
          />
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="col-12">
          <label>Ping Status</label>
          <textarea
            id="t_pingip"
            className="ticket-mono"
            rows={5}
            placeholder="Paste full ping logs here..."
            value={pingIp}
            onChange={(e) => setPingIp(e.target.value)}
          />
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="col-12">
          <label>Laser info</label>
          <textarea
            id="t_laserinfo"
            className="ticket-mono"
            rows={4}
            placeholder="Paste full laser info log here..."
            value={laserInfo}
            onChange={(e) => setLaserInfo(e.target.value)}
          />
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="col-12">
          <label>Root Cause</label>
          <input
            id="t_root"
            value={root}
            onChange={(e) => setRoot(e.target.value)}
          />
        </div>
      </div>
      <div
        style={{
          marginTop: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn"
            id="t_preview"
            style={btnStyle}
            onClick={onPreview}
          >
            <IconPreview /> Preview Format
          </button>
          <button
            className="btn success"
            id="t_confirm"
            style={btnStyle}
            onClick={onConfirm}
          >
            <IconCheck /> Confirm &amp; Save to Incident Log
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn"
            id="t_clear"
            style={btnStyle}
            onClick={onClear}
          >
            <IconClear /> Clear
          </button>
          <button
            className="btn ghost"
            id="t_copy"
            style={btnStyle}
            onClick={onCopy}
          >
            <IconCopy /> Copy
          </button>
          <button
            className="btn"
            id="t_wa"
            style={{
              ...btnStyle,
              background: '#25D366',
              color: '#fff',
              border: 'none',
            }}
            onClick={onWa}
          >
            <IconWhatsApp /> WhatsApp Share
          </button>
        </div>
      </div>
      <div id="t_ai" className="muted" style={{ marginTop: 5 }}>
        {aiLabel}
      </div>
      <div
        className="ticket-preview"
        id="t_previewBox"
        style={{ marginTop: 10 }}
      >
        {preview}
      </div>
    </div>
  );
}

// --- 6. CLOSE TICKET CARD ---

function CloseTicketCard({
  incidents,
  waGroup,
}: {
  incidents: IncidentRecord[];
  waGroup: any;
}) {
  const { push } = useNotif();
  const today = new Date();
  const [closeCategory, setCloseCategory] = useState('');
  const [tt, setTt] = useState('');
  const [bts, setBts] = useState('');
  const [ic, setIc] = useState<'NO' | 'YES'>('NO');
  const [icValue, setIcValue] = useState('');
  const [faultDate, setFaultDate] = useState('');
  const [faultHh, setFaultHh] = useState('00');
  const [faultMm, setFaultMm] = useState('00');
  const [restoredDate, setRestoredDate] = useState(
    today.toISOString().slice(0, 10),
  );
  const [restoredHh, setRestoredHh] = useState(
    pad2(today.getHours()).padStart(2, '0'),
  );
  const [restoredMm, setRestoredMm] = useState(
    pad2(Math.floor(today.getMinutes() / 15) * 15),
  );
  const [pingIp, setPingIp] = useState('');
  const [laserInfo, setLaserInfo] = useState('');
  const [root, setRoot] = useState('Yet to identify');
  const [status, setStatus] = useState('Running');
  const [duration, setDuration] = useState('—');
  const [preview, setPreview] = useState('Close preview will appear here.');

  const hhOpts = useMemo(
    () => Array.from({ length: 24 }, (_, i) => pad2(i)),
    [],
  );
  const mmOpts = useMemo(
    () => Array.from({ length: 60 }, (_, i) => pad2(i)),
    [],
  );

  // Live duration re-compute on every change (mirrors `liveDuration()`)
  useEffect(() => {
    const faultStr = buildCompiled24HString(faultDate, faultHh, faultMm);
    const restoredStr = buildCompiled24HString(
      restoredDate,
      restoredHh,
      restoredMm,
    );
    const faultDt = parseDateTime(faultDate, faultHh, faultMm);
    const restoredDt = parseDateTime(
      restoredDate,
      restoredHh,
      restoredMm,
    );
    setDuration(formatDurationFromDates(faultDt, restoredDt) || '—');
  }, [faultDate, faultHh, faultMm, restoredDate, restoredHh, restoredMm]);

  // TT lookup — fills BTS / fault date / fault time / root cause from the
  // matching incident row, just like the legacy c_tt `input` listener.
  useEffect(() => {
    const code = tt.trim();
    if (!code) return;
    const incRow = (incidents || []).find(
      (i) => (i.ticketId || '').trim() === code,
    );
    if (!incRow) return;
    if (!bts) setBts(String(incRow.incidentName || ''));
    if (!closeCategory) {
      setCloseCategory(
        String(
          incRow.incidentSubCategory || incRow.incidentCategory || '',
        ),
      );
    }
    if (incRow.faultDate && !faultDate)
      setFaultDate(String(incRow.faultDate));

    if (incRow.faultTime && typeof incRow.faultTime === 'string') {
      const clean = incRow.faultTime.replace(/(AM|PM)/i, '').trim();
      if (clean.includes(':')) {
        const [hh, mm] = clean.split(':');
        if (hh) setFaultHh(pad2(parseInt(hh.trim(), 10) || 0));
        if (mm) setFaultMm(pad2(parseInt(mm.trim(), 10) || 0));
      }
    }
    if (!root || root === 'Yet to identify') {
      setRoot(incRow.rootCause || 'Yet to identify');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tt, incidents]);

  function gather() {
    return {
      closeCategory: closeCategory.trim(),
      bts: bts.trim(),
      ic: ic === 'YES' ? icValue.trim() || 'YES' : 'NO',
      faultTime: buildCompiled24HString(faultDate, faultHh, faultMm),
      restoredTime: buildCompiled24HString(
        restoredDate,
        restoredHh,
        restoredMm,
      ),
      duration: duration && duration !== '—' ? duration : '',
      rootCause: root.trim() || 'Yet to identify',
      tt: tt.trim(),
      ping: { ip: pingIp },
      laser: laserInfo.trim(),
    };
  }

  function onPreview() {
    setPreview(closeText(gather()));
  }

  function onClear() {
    setBts('');
    setIcValue('');
    setFaultDate('');
    setRestoredDate(today.toISOString().slice(0, 10));
    setTt('');
    setPingIp('');
    setLaserInfo('');
    setFaultHh('00');
    setFaultMm('00');
    setRestoredHh(pad2(today.getHours()).padStart(2, '0'));
    setRestoredMm(pad2(Math.floor(today.getMinutes() / 15) * 15));
    setRoot('Yet to identify');
    setIc('NO');
    setDuration('—');
    setPreview('Close preview will appear here.');
    setStatus('Solved');
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(preview);
      push('Copied to clipboard', 'success');
    } catch {
      /* ignore */
    }
  }

  function onWa() {
    const groupId =
      waGroup && (waGroup.id || waGroup) ? String(waGroup.id || waGroup) : '';
    waShare(preview, groupId);
  }

  function onConfirm() {
    try {
      const p = gather();
      if (!p.tt) {
        push('Ticket ID is required to close', 'warn');
        return;
      }
      const incRow = (incidents || []).find(
        (i) => (i.ticketId || '').trim() === p.tt,
      );
      if (!incRow) {
        push(
          'TT match kore nai — Ticket ID "' +
            p.tt +
            '" was not found in the Incident Log',
          'danger',
        );
        return;
      }

      // Recompute the outage duration from the date+time fields so multi-day
      // outages calculate correctly. Then push the recomputed value back into
      // the local display and the store row.
      const faultDt = parseDateTime(faultDate, faultHh, faultMm);
      const restoredDt = parseDateTime(
        restoredDate,
        restoredHh,
        restoredMm,
      );
      const newDur = formatDurationFromDates(faultDt, restoredDt);
      setDuration(newDur || '—');

      const nowIso = new Date().toISOString();
      const finalStatus = status || 'Solved';
      store.update('incidents', incRow.id, {
        restorationDate: restoredDate,
        restorationTime: p.restoredTime,
        endTime: p.restoredTime,
        duration: newDur,
        rootCause: p.rootCause,
        currentStatus: finalStatus,
        solved: finalStatus === 'Solved' || finalStatus === 'Closed' ? 'yes' : 'no',
        actionTaken: p.closeCategory,
        updatedAt: nowIso,
        restoredDate: restoredDate,
      } as any);
      // The store itself already toasts "Updated in incidents"; show our
      // own, more user-friendly success message.
      push('Ticket Closed & Synchronized', 'success');
      onClear();
    } catch (err: any) {
      console.error('[c_confirm] failed:', err);
      push(
        'Close failed: ' + (err && err.message ? err.message : err),
        'danger',
      );
    }
  }

  function onCategoryChange(c: string) {
    setCloseCategory(c);
    // Reset form-only fields; ticket-id / look-up fields stay (legacy parity)
    setIcValue('');
    setPingIp('');
    setLaserInfo('');
    setRoot('Yet to identify');
    setIc('NO');
    setPreview('Close preview will appear here.');
  }

  return (
    <div>
      <div className="row">
        <div className="col-6">
          <label>Close Category</label>
          <select
            id="c_cat"
            value={closeCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
          >
            <option value="">— select —</option>
            {CLOSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6">
          <label>Ticket ID</label>
          <input
            id="c_tt"
            placeholder="L3-..."
            value={tt}
            onChange={(e) => setTt(e.target.value)}
          />
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="col-6">
          <label>BTS/Area</label>
          <input
            id="c_bts"
            placeholder="Auto-filled from TT"
            value={bts}
            onChange={(e) => setBts(e.target.value)}
          />
        </div>
        <div className="col-6"></div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="col-3">
          <label>Impacted Client</label>
          <select
            id="c_ic"
            value={ic}
            onChange={(e) => setIc(e.target.value as 'NO' | 'YES')}
          >
            <option value="NO">NO</option>
            <option value="YES">YES</option>
          </select>
        </div>
        <div
          className="col-3"
          id="c_ic_value_wrap"
          style={{ display: ic === 'YES' ? '' : 'none' }}
        >
          <label>IC Details</label>
          <input
            id="c_ic_value"
            placeholder="e.g. 255, Partial"
            value={icValue}
            onChange={(e) => setIcValue(e.target.value)}
          />
        </div>
        <div className="col-6">
          <label>Outage Duration</label>
          <div
            id="c_duration_display"
            className="ticket-preview"
            style={{ minHeight: 34, padding: '6px 10px' }}
          >
            {duration}
          </div>
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="col-6">
          <label>Fault Date</label>
          <input
            id="c_fault_date"
            type="date"
            value={faultDate}
            onChange={(e) => setFaultDate(e.target.value)}
          />
        </div>
        <div className="col-6">
          <label>Fault Time</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <select
              id="c_fault_hh"
              value={faultHh}
              onChange={(e) => setFaultHh(e.target.value)}
            >
              {hhOpts.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <span style={{ fontWeight: 'bold' }}>:</span>
            <select
              id="c_fault_mm"
              value={faultMm}
              onChange={(e) => setFaultMm(e.target.value)}
            >
              {mmOpts.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="col-6">
          <label>Restoration Date</label>
          <input
            id="c_time_date"
            type="date"
            value={restoredDate}
            onChange={(e) => setRestoredDate(e.target.value)}
          />
        </div>
        <div className="col-6">
          <label>Restoration Time</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <select
              id="c_time_hh"
              value={restoredHh}
              onChange={(e) => setRestoredHh(e.target.value)}
            >
              {hhOpts.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <span style={{ fontWeight: 'bold' }}>:</span>
            <select
              id="c_time_mm"
              value={restoredMm}
              onChange={(e) => setRestoredMm(e.target.value)}
            >
              {mmOpts.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="col-12">
          <label>Ping Status</label>
          <textarea
            id="c_pingip"
            className="ticket-mono"
            rows={5}
            placeholder="Paste full close ping logs here..."
            value={pingIp}
            onChange={(e) => setPingIp(e.target.value)}
          />
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="col-12">
          <label>Laser info</label>
          <textarea
            id="c_laserinfo"
            className="ticket-mono"
            rows={4}
            placeholder="Paste full close laser info logs here..."
            value={laserInfo}
            onChange={(e) => setLaserInfo(e.target.value)}
          />
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="col-6">
          <label>Root Cause</label>
          <input
            id="c_root"
            value={root}
            onChange={(e) => setRoot(e.target.value)}
          />
        </div>
        <div className="col-6">
          <label>Status</label>
          <select
            id="c_status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="Running">Running</option>
            <option value="Solved">Solved</option>
          </select>
        </div>
      </div>
      <div
        style={{
          marginTop: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn"
            id="c_preview"
            style={btnStyle}
            onClick={onPreview}
          >
            <IconPreview /> Preview Close
          </button>
          <button
            className="btn success"
            id="c_confirm"
            style={btnStyle}
            onClick={onConfirm}
          >
            <IconCheck /> Confirm Close &amp; Sync
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn"
            id="c_clear"
            style={btnStyle}
            onClick={onClear}
          >
            <IconClear /> Clear
          </button>
          <button
            className="btn ghost"
            id="c_copy"
            style={btnStyle}
            onClick={onCopy}
          >
            <IconCopy /> Copy
          </button>
          <button
            className="btn"
            id="c_wa"
            style={{
              ...btnStyle,
              background: '#25D366',
              color: '#fff',
              border: 'none',
            }}
            onClick={onWa}
          >
            <IconWhatsApp /> WhatsApp Share
          </button>
        </div>
      </div>
      <div
        className="ticket-preview"
        id="c_previewBox"
        style={{ marginTop: 10 }}
      >
        {preview}
      </div>
    </div>
  );
}

// --- 7. INCIDENT LOG MINI-TABLE ---

function IncidentsMiniTable({ incidents }: { incidents: Incident[] }) {
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');

  const rows = useMemo(() => {
    const term = q.toLowerCase();
    return (incidents || []).filter(
      (i) =>
        (!q ||
          [i.ticketId, i.incidentName, i.incidentSubCategory].some((v) =>
            String(v || '')
              .toLowerCase()
              .includes(term),
          )) &&
        (!st || i.currentStatus === st),
    );
  }, [incidents, q, st]);

  function onExport() {
    const cols = [
      'date',
      'ticketId',
      'incidentName',
      'incidentSubCategory',
      'zone',
      'impactedClient',
      'faultTime',
      'restorationTime',
      'duration',
      'currentStatus',
      'forwardDepartment',
    ];
    const csv = [cols.join(',')]
      .concat(
        rows.map((r) =>
          cols
            .map((c) => {
              const v = (r as any)[c];
              if (v == null) return '';
              const s = String(v).replace(/"/g, '""');
              return /[,"\n]/.test(s) ? `"${s}"` : s;
            })
            .join(','),
        ),
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'incidents.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <input
          id="inc_search"
          placeholder="Filter by BTS / TT / zone…"
          style={{ maxWidth: 280 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          id="inc_filter"
          value={st}
          onChange={(e) => setSt(e.target.value)}
        >
          <option value="">All status</option>
          <option value="Running">Running</option>
          <option value="Solved">Solved</option>
        </select>
        <button className="btn ghost" id="inc_export" onClick={onExport}>
          Export CSV
        </button>
      </div>
      <div
        className="table-wrap"
        style={{ maxHeight: 300, overflow: 'auto' }}
      >
        <table className="data" id="inc_table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Ticket ID</th>
              <th>BTS/Area</th>
              <th>Incident Category</th>
              <th>Zone</th>
              <th>IC</th>
              <th>Fault</th>
              <th>Restored</th>
              <th>Dur</th>
              <th>Status</th>
              <th>Dept</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 40).map((i) => (
              <tr key={i.id}>
                <td>{String(i.date || '')}</td>
                <td>
                  <code>{String(i.ticketId || '')}</code>
                </td>
                <td>{String(i.incidentName || '')}</td>
                <td>{String(i.incidentSubCategory || '')}</td>
                <td>{String(i.zone || '')}</td>
                <td>{String(i.impactedClient || '')}</td>
                <td>{String(i.faultTime || '')}</td>
                <td>{String(i.restorationTime || '')}</td>
                <td>{String(i.duration || '')}</td>
                <td>
                  <span className="status">
                    {String(i.currentStatus || '')}
                  </span>
                </td>
                <td>{String(i.forwardDepartment || '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- 8. ICON HELPERS (inline SVGs — no icon-library dependency) ---

function svgProps(children: React.ReactNode, size = 13) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    style: {
      marginRight: 5,
      flexShrink: 0,
      display: 'inline-block' as const,
    },
    children,
  };
}

function IconPreview() {
  return (
    <svg {...svgProps(
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>,
    )} />
  );
}

function IconCheck() {
  return (
    <svg
      {...svgProps(<path d="M20 6L9 17l-5-5" />, 13)}
      strokeWidth={2.5}
    />
  );
}

function IconClear() {
  return (
    <svg {...svgProps(
      <>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </>,
    )} />
  );
}

function IconCopy() {
  return (
    <svg {...svgProps(
      <>
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </>,
    )} />
  );
}

function IconWhatsApp() {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{
        marginRight: 5,
        flexShrink: 0,
        display: 'inline-block',
      }}
    >
      <path d="M12.004 22c-2.043 0-4.01-.527-5.74-1.53l-.412-.24-4.269 1.12 1.139-4.162-.263-.42a9.862 9.862 0 0 1-1.51-5.263c0-5.462 4.443-9.905 9.908-9.905 2.647 0 5.134 1.03 7.005 2.902a9.845 9.845 0 0 1 2.901 7.003c-.004 5.464-4.446 9.905-9.911 9.905zm8.472-18.337A11.83 11.83 0 0 0 12.004 0C5.438 0 .093 5.346.089 11.92c0 2.102.55 4.156 1.594 5.966L0 24l6.305-1.654a11.822 11.822 0 0 0 5.694 1.458h.005c6.565 0 11.91-5.344 11.914-11.92a11.84 11.84 0 0 0-3.442-8.416zM17.65 14.53c-.31-.155-1.83-.903-2.112-1.004-.282-.102-.489-.153-.693.153-.204.306-.79 1.004-.97 1.209-.178.204-.357.229-.666.074-.31-.155-1.306-.481-2.489-1.537-.92-.821-1.542-1.836-1.722-2.142-.18-.306-.019-.472.136-.626.14-.139.31-.324.465-.486.155-.162.207-.278.31-.463.104-.185.052-.347-.026-.501-.077-.154-.693-1.67-.95-2.286-.25-.603-.505-.521-.693-.531-.179-.009-.383-.01-.588-.01-.204 0-.537.077-.817.385-.28.307-1.07 1.047-1.07 2.553 0 1.506 1.096 2.96 1.241 3.164.145.204 2.156 3.293 5.224 4.617.73.315 1.3.503 1.745.644.734.233 1.4.2 1.928.121.588-.087 1.83-.748 2.087-1.433.258-.685.258-1.274.18-1.396-.077-.123-.282-.195-.591-.351z" />
    </svg>
  );
}
