/**
 * rosterParsers.ts — Department-specific duty-roster parsers.
 *
 * Ported from the legacy NMC Dashboard JS file (`NMC Dashboard/js/rosterParsers.js`).
 * Each parser takes a 2-D sheet of cells and an opts object, and returns
 * a list of normalised roster rows:
 *
 *   { date:'YYYY-MM-DD', shift, engineers, department, notes, source, batchId }
 *
 * Canonical shift vocabulary (matches the existing roster.ts SHIFTS):
 *   Morning  — 08:00–16:00 ish
 *   Evening  — 14:00–22:00 ish
 *   Night    — 22:00–08:00 ish
 *   Weekend  — Fri/Sat/Holiday on sites that split weekday/weekend columns
 *   Leave    — out-of-office
 *   Custom   — anything we can't map; surfaces in the "Other" bucket
 *
 * Parser status (verified against the June-2026 sample files):
 *   parseBTS   ✅ BTS weekday-column grid       (Time Slot × Sun..Sat)
 *   parseNGNC  ✅ NGNC employee × day grid      (name × day-of-month with M/E/EE/D-O/LE codes)
 *   parseNMC   ✅ NMC fixed-position shift table (cols 1..17 = Gen/Morn/Eve/Night/Wknd/Leave)
 *   parseBNOC  ✅ BNOC 5-shift × 5-name columns
 *   parseSNT   ✅ S&T column-header shifts
 *   parseNCSS  ✅ NCSS multi-site calendar
 */

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

export type Cell = string | number | null | undefined;
export type Row = Cell[];
export type Sheet = Row[];

export interface RosterOpts {
  filename?: string;
  batchId?: string;
  /** Optional month hint when the filename does not encode the month. */
  month?: { year: number; month0: number };
}

export interface ParsedRosterRow {
  date: string;          // YYYY-MM-DD
  shift: string;
  engineers: string[];
  department: string;
  notes?: string;
  source?: string;
  batchId?: string;
}

// ----- helpers ---------------------------------------------------------------

function norm(v: Cell): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function isBlank(v: Cell): boolean {
  const s = norm(v);
  return s === '' || /^-+$/.test(s);
}

function yr(y: number): number {
  return y < 100 ? 2000 + y : y;
}

function iso(y: number, m0: number, d: number): string | null {
  if (!y || m0 < 0 || m0 > 11 || !d) return null;
  const dt = new Date(Date.UTC(y, m0, d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

export function parseDate(raw: Cell, _opts?: RosterOpts): string | null {
  const s = norm(raw);
  if (!s) return null;
  const get = (m: RegExpMatchArray | null, i: number): string | undefined =>
    m ? m[i] : undefined;
  let m: RegExpMatchArray | null;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(+(get(m, 1) ?? ''), +(get(m, 2) ?? '') - 1, +(get(m, 3) ?? ''));
  m = s.match(/^(\d{1,5})[\/\- ]([A-Za-z]{3,9})[\/\- ](\d{2,4})$/);
  if (m) {
    const mon = MONTHS[(get(m, 2) ?? '').toLowerCase()];
    if (mon !== undefined) return iso(yr(+(get(m, 3) ?? '')), mon, +(get(m, 1) ?? ''));
  }
  m = s.match(/^([A-Za-z]{3,9})[\/\- ](\d{1,5})[\/\- ](\d{2,4})$/);
  if (m) {
    const mon = MONTHS[(get(m, 1) ?? '').toLowerCase()];
    if (mon !== undefined) return iso(yr(+(get(m, 3) ?? '')), mon, +(get(m, 2) ?? ''));
  }
  m = s.match(/([A-Za-z]{3,9})\s+(\d{1,5}),?\s+(\d{4})/);
  if (m) {
    const mon = MONTHS[(get(m, 1) ?? '').toLowerCase()];
    if (mon !== undefined) return iso(yr(+(get(m, 3) ?? '')), mon, +(get(m, 2) ?? ''));
  }
  m = s.match(/(\d{1,5})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (m) {
    const mon = MONTHS[(get(m, 2) ?? '').toLowerCase()];
    if (mon !== undefined) return iso(yr(+(get(m, 3) ?? '')), mon, +(get(m, 1) ?? ''));
  }
  return null;
}

export function splitNames(raw: Cell): string[] {
  const s = norm(raw);
  if (!s) return [];
  return s
    .split(/[\/;|\n]|\s+and\s+|\s+&\s+/)
    .map((x) => norm(x))
    .filter((x) => x && !/^(weekend|holiday|leave|n\/a|na)$/i.test(x))
    .filter((x) => x.length <= 60);
}

function makeRow(
  dateISO: string,
  shift: string,
  names: string[],
  department: string,
  source: string,
  batchId: string | undefined,
  notes?: string,
): ParsedRosterRow {
  return {
    date: dateISO,
    shift: shift || 'Custom',
    engineers: names || [],
    department,
    notes: notes || '',
    source: source || '',
    batchId: batchId || '',
  };
}

function sniffMonthFromFilename(opts?: RosterOpts): { year: number; month0: number } | null {
  const fname = (opts && opts.filename) || '';
  const m = fname.match(/([A-Za-z]+)[\-\/ ,.']+(\d{2,4})/);
  if (m && m[1] && m[2]) {
    const mon = MONTHS[m[1].toLowerCase()];
    if (mon !== undefined) return { year: yr(+m[2]), month0: mon };
  }
  return null;
}

// =========================================================================
//  PARSER: BTS  — weekday-column grid (Time Slot × Sun..Sat)
// =========================================================================
export function parseBTS(rows: Sheet, opts: RosterOpts): ParsedRosterRow[] {
  const out: ParsedRosterRow[] = [];
  const dept = 'BTS & Power';
  if (!rows.length) return out;

  const headerRow0BTS = rows[0];
  if (!headerRow0BTS) return out;
  const header = headerRow0BTS.map((c) => norm(c).toLowerCase());
  const dayCol: Record<string, number> = {};
  for (let c = 0; c < header.length; c++) {
    const h = header[c];
    if (h === undefined) continue;
    if (/^sun/.test(h)) dayCol.Sun = c;
    else if (/^mon/.test(h)) dayCol.Mon = c;
    else if (/^tue/.test(h)) dayCol.Tue = c;
    else if (/^wed/.test(h)) dayCol.Wed = c;
    else if (/^thu/.test(h)) dayCol.Thu = c;
    else if (/^fri/.test(h)) dayCol.Fri = c;
    else if (/^sat/.test(h)) dayCol.Sat = c;
  }
  if (!Object.keys(dayCol).length) return out;

  const monthInfo = (opts && opts.month) || sniffMonthFromFilename(opts);
  if (!monthInfo) return out;
  const { year, month0 } = monthInfo;

  const byWeekday: Record<string, string[]> = {};
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(Date.UTC(year, month0, d));
    if (dt.getUTCMonth() !== month0) break;
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()];
    if (!wd) continue;
    (byWeekday[wd] = byWeekday[wd] || []).push(dt.toISOString().slice(0, 10));
  }

  let slotLabel: string | null = null;
  let slotShift: string | null = null;
  let slotNames: Record<string, string>[] = [];

  function flush() {
    if (!slotLabel || !slotNames.length) return;
    for (const wd of Object.keys(byWeekday)) {
      const col = dayCol[wd];
      if (col === undefined) continue;
      const names = slotNames.map((n) => n[wd]).filter((s): s is string => typeof s === 'string' && s.length > 0);
      if (!names.length) continue;
      const dates = byWeekday[wd] || [];
      for (const dateISO of dates) {
        out.push(makeRow(dateISO, slotShift || 'Custom', names, dept, 'BTS-Duty', opts.batchId, slotLabel || undefined));
      }
    }
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const firstCell = norm(row[0]).toLowerCase();
    if (/^on\s*call|^escalation|^nb\s*:|^holiday/.test(firstCell)) break;
    const ts = firstCell;
    if (ts) {
      flush();
      slotLabel = ts;
      slotShift = timeSlotToShift(ts);
      slotNames = [];
    } else {
      if (!slotLabel) continue;
      const perDay: Record<string, string> = {};
      for (const wd of Object.keys(dayCol)) {
        const idx = dayCol[wd];
        if (idx === undefined) continue;
        const cell = norm(row[idx]);
        if (cell && !/^weekend$/i.test(cell)) perDay[wd] = cell;
      }
      if (Object.keys(perDay).length) slotNames.push(perDay);
    }
  }
  flush();
  return out;
}

function timeSlotToShift(label: string): string {
  const m = label.match(/(\d{1,2})(?::\d{2})?\s*(am|pm)?\s*[\-\/ ]\s*(\d{1,2})(?::\d{2})?\s*(am|pm)?/i);
  if (!m || !m[1] || !m[3]) return 'Custom';
  let h1 = +m[1];
  const ap1 = (m[2] || '').toLowerCase();
  let h2 = +m[3];
  const ap2 = (m[4] || '').toLowerCase();
  if (ap1 === 'pm' && h1 < 12) h1 += 12;
  if (ap1 === 'am' && h1 === 12) h1 = 0;
  if (ap2 === 'pm' && h2 < 12) h2 += 12;
  if (ap2 === 'am' && h2 === 12) h2 = 0;
  if (h1 >= 6 && h1 < 14) return 'Morning';
  if (h1 >= 12 && h1 < 18 && h2 >= 20) return 'Evening';
  if (h1 >= 18 || h1 < 6) return 'Night';
  if (h1 >= 12 && h1 < 18) return 'Evening';
  return 'Custom';
}

// =========================================================================
//  PARSER: NGNC  — employee × day-of-month grid (M / E / EE / D-O / LE codes)
// =========================================================================
export function parseNGNC(rows: Sheet, opts: RosterOpts): ParsedRosterRow[] {
  const out: ParsedRosterRow[] = [];
  const dept = 'NGNC';
  const headerRow0NGNC = rows[0];
  if (!headerRow0NGNC) return out;

  const header = headerRow0NGNC.map((c) => norm(c));
  const dayCol: Record<number, number> = {};
  for (let c = 1; c < header.length; c++) {
    const cell = header[c];
    if (cell === undefined) continue;
    const d = +cell;
    if (d >= 1 && d <= 31) dayCol[d] = c;
  }
  if (!Object.keys(dayCol).length) return out;

  const monthInfo = (opts && opts.month) || sniffMonthFromFilename(opts);
  if (!monthInfo) return out;
  const { year, month0 } = monthInfo;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const name = norm(row[0]);
    if (!name) continue;
    for (const d of Object.keys(dayCol)) {
      const dayNum = +d;
      const idx = dayCol[dayNum];
      if (idx === undefined) continue;
      const cell = norm(row[idx]);
      if (!cell) continue;
      const code = cell.toUpperCase();
      if (code === 'D/O' || code === 'LEAVE' || code === 'WEEKEND') continue;
      const label = ngCodeToLabel(code);
      if (!label) continue;
      const dateISO = iso(year, month0, dayNum);
      if (!dateISO) continue;
      out.push(makeRow(dateISO, label, [name], dept, 'NGNC-Duty', opts.batchId));
    }
  }
  return out;
}

function ngCodeToLabel(code: string): string | null {
  if (/^M$/.test(code))   return 'Morning (9.00 AM - 6.00 PM)';
  if (/^EE$/.test(code))  return 'Early Evening (11.00 AM - 8.00 PM)';
  if (/^E$/.test(code))   return 'Evening (2.00 PM - 10.00 PM)';
  if (/^LE$/.test(code))  return 'Late Evening (4.00 PM - 12.00 AM)';
  if (/^N$/.test(code))   return 'Night';
  if (/^GEN$/.test(code)) return 'Custom';
  return null;
}

// =========================================================================
//  PARSER: NMC  — fixed-position shift table (cols 1..17 = Gen/Morn/Eve/Night/Wknd/Leave)
// =========================================================================
export function parseNMC(rows: Sheet, opts: RosterOpts): ParsedRosterRow[] {
  const out: ParsedRosterRow[] = [];
  const dept = 'NMC';
  if (!rows || !rows.length) return out;

  const colShift = (c: number): string | null => {
    if (c === 1)            return 'General';
    if (c >= 2 && c <= 4)   return 'Morning';
    if (c >= 5 && c <= 7)   return 'Evening';
    if (c >= 8 && c <= 9)   return 'Night';
    if (c >= 10 && c <= 14) return 'Weekend';
    if (c >= 15 && c <= 17) return 'Leave';
    return null;
  };

  const buckets = new Map<string, { date: string; shift: string; names: string[] }>();
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.length) continue;
    const dateRaw = norm(row[0]);
    if (!dateRaw || /^date$/i.test(dateRaw)) continue;
    if (/^holiday$/i.test(dateRaw)) continue;
    const dateISO = parseDate(dateRaw, opts);
    if (!dateISO) continue;
    for (let c = 1; c <= 17; c++) {
      const shift = colShift(c);
      if (!shift) continue;
      const cell = norm(row[c]);
      if (!cell) continue;
      const names = splitNames(cell);
      if (!names.length) continue;
      const key = dateISO + '|' + shift;
      if (!buckets.has(key)) buckets.set(key, { date: dateISO, shift, names: [] });
      const b = buckets.get(key)!;
      for (const n of names) if (!b.names.includes(n)) b.names.push(n);
    }
  }

  for (const b of buckets.values()) {
    out.push(makeRow(b.date, b.shift, b.names, dept, 'NMC-Duty', opts.batchId));
  }
  const order: Record<string, number> = {
    General: 0, Morning: 1, Evening: 2, Night: 3, Weekend: 4, Leave: 5, Custom: 6,
  };
  out.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : (order[a.shift] || 9) - (order[b.shift] || 9),
  );
  return out;
}

// =========================================================================
//  PARSER: BNOC  — 5 shift-groups × 5 name columns
// =========================================================================
export function parseBNOC(rows: Sheet, opts: RosterOpts): ParsedRosterRow[] {
  const out: ParsedRosterRow[] = [];
  const dept = 'BNOC';
  if (!rows || !rows.length) return out;
  const groups: { shift: string; start: number; end: number }[] = [
    { shift: 'Morning', start: 1,  end: 5  },
    { shift: 'Evening', start: 10, end: 14 },
    { shift: 'Evening', start: 16, end: 17 },
    { shift: 'Evening', start: 18, end: 22 },
    { shift: 'Weekend', start: 23, end: 28 },
  ];
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.length) continue;
    const dateISO = parseDate(norm(row[0]), opts);
    if (!dateISO) continue;
    for (const g of groups) {
      const names: string[] = [];
      for (let c = g.start; c <= g.end; c++) {
        const cell = norm(row[c]);
        if (!cell) continue;
        if (/^holiday$/i.test(cell)) continue;
        for (const n of splitNames(cell)) if (!names.includes(n)) names.push(n);
      }
      if (names.length) {
        out.push(makeRow(dateISO, g.shift, names, dept, 'BNOC-Duty', opts.batchId));
      }
    }
  }
  return out;
}

// =========================================================================
//  PARSER: S&T  — column-header shifts
// =========================================================================
export function parseSNT(rows: Sheet, opts: RosterOpts): ParsedRosterRow[] {
  const out: ParsedRosterRow[] = [];
  const dept = 'S&T';
  if (!rows || !rows.length) return out;
  const colShift: Record<number, string> = { 1: 'Morning', 2: 'Evening', 3: 'Weekend', 4: 'Leave' };
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.length) continue;
    const dateRaw = norm(row[0]);
    if (!dateRaw) continue;
    const dateISO = parseDate(dateRaw, opts);
    if (!dateISO) continue;
    for (const c of Object.keys(colShift)) {
      const ci = +c;
      const cell = norm(row[ci]);
      if (!cell) continue;
      const clean = cell.replace(/\.{2,}\s*$/, '').trim();
      if (/^holiday$/i.test(clean)) continue;
      const shift = colShift[ci];
      if (!shift) continue;
      const names = splitNames(clean);
      if (names.length) {
        out.push(makeRow(dateISO, shift, names, dept, 'S&T-Duty', opts.batchId));
      }
    }
  }
  return out;
}

// =========================================================================
//  PARSER: NCSS  — wide multi-site calendar
// =========================================================================
export function parseNCSS(rows: Sheet, opts: RosterOpts): ParsedRosterRow[] {
  const out: ParsedRosterRow[] = [];
  const dept = 'NCSS Dhaka';
  if (!rows || !rows.length) return out;
  if (!rows[1] || rows[1].length < 3) return out;

  const colShift: (string | null)[] = [];
  const colShiftSlot: string[] = [];
  const slotRe = /(\d{1,2}):(\d{2})\s*(am|pm)\s*-\s*(\d{1,2}):(\d{2})\s*(am|pm)/i;
  const to24 = (h: string, mn: string, ap: string): number => {
    let hh = +h;
    if (/pm/i.test(ap) && hh < 12) hh += 12;
    if (/am/i.test(ap) && hh === 12) hh = 0;
    return hh + (+mn / 60);
  };
  let curShift: string | null = null;
  let curSlot = '';
  const headerRow1 = rows[1];
  if (!headerRow1) return out;
  for (let c = 2; c < headerRow1.length; c++) {
    const slot = norm(headerRow1[c]);
    if (slot) {
      curSlot = slot;
      if (/^compensatory$/i.test(slot)) curShift = 'Custom';
      else {
        const m = slot.match(slotRe);
        if (m && m[1] && m[2] && m[3] && m[4] && m[5] && m[6]) {
          const s = to24(m[1], m[2], m[3]);
          const e = to24(m[4], m[5], m[6]);
          if (s >= 7 && s <= 11) curShift = 'Morning';
          else if (s >= 10 && s <= 12 && e >= 19 && e <= 22) curShift = 'Evening';
          else if (s >= 13 && s <= 15) curShift = 'Evening';
          else if (s >= 21 && (e < s || e <= 9)) curShift = 'Night';
          else curShift = 'Custom';
        } else {
          curShift = null;
        }
      }
    }
    colShift[c] = curShift;
    colShiftSlot[c] = curSlot;
  }

  const colArea: (string | null)[] = [];
  let curArea = '';
  const headerRow0 = rows[0];
  if (headerRow0) {
    for (let c = 0; c < headerRow0.length; c++) {
      const v = norm(headerRow0[c]);
      if (v && !/^evening$/i.test(v)) curArea = v;
      colArea[c] = curArea || null;
    }
  }

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < 2) continue;
    const dateISO = parseDate(norm(row[1]), opts);
    if (!dateISO) continue;
    const isHoliday = /^holiday$/i.test(norm(row[0]));

    const buckets = new Map<string, { area: string; shift: string; names: string[] }>();
    const addBucket = (area: string, shift: string, name: string) => {
      const key = area + '|' + shift;
      if (!buckets.has(key)) buckets.set(key, { area, shift, names: [] });
      const arr = buckets.get(key)!.names;
      if (!arr.includes(name)) arr.push(name);
    };

    const labelFor = (shift: string | null, slotText: string): string => {
      if (!shift) return '';
      const s = norm(slotText);
      return s ? `${shift} (${s})` : shift;
    };

    for (let c = 2; c <= 137 && c < row.length; c++) {
      const cell = norm(row[c]);
      if (!cell) continue;
      const names = splitNames(cell);
      if (!names.length) continue;
      const shift = colShift[c];
      if (!shift) continue;
      const area = colArea[c] || '';
      const canon = isHoliday && (shift === 'Morning' || shift === 'Evening') ? 'Weekend' : shift;
      const effShift = labelFor(canon, colShiftSlot[c] ?? '');
      for (const n of names) addBucket(area, effShift, n);
    }

    const nightName = norm(row[138]);
    const nightOffice = norm(row[139]);
    if (nightName) {
      const names = splitNames(nightName);
      const area = 'Night' + (nightOffice ? ' @ ' + nightOffice : '');
      for (const n of names) addBucket(area, labelFor('Night', colShiftSlot[138] ?? ''), n);
    }

    const logName = norm(row[141]);
    const logOffice = norm(row[142]);
    if (logName) {
      const names = splitNames(logName);
      const area = 'Night Logical' + (logOffice ? ' @ ' + logOffice : '');
      for (const n of names) addBucket(area, labelFor('Night', colShiftSlot[141] ?? ''), n);
    }

    for (const { area, shift, names } of buckets.values()) {
      out.push(makeRow(dateISO, shift, names, dept, 'NCSS-Duty', opts.batchId, area));
    }
  }
  return out;
}

// =========================================================================
//  PUBLIC API
// =========================================================================
export const NMCRosterParsers = {
  parseBTS,
  parseNGNC,
  parseNMC,
  parseBNOC,
  parseSNT,
  parseNCSS,
  _internal: { norm, parseDate, splitNames, timeSlotToShift, ngCodeToLabel, MONTHS },
};

export default NMCRosterParsers;