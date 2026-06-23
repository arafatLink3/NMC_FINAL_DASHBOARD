// rosterParsers.js — Department-specific duty-roster parsers.
//
// Each parser receives:
//   rows         Array<Array<string>>   raw 2-D sheet (rows of cells)
//   opts         { filename, batchId, month?: {year, month0} }
//
// Each parser returns:
//   Array<{ date:'YYYY-MM-DD', shift, engineers, department, notes, source, batchId }>
//
// Canonical shift vocabulary (matches roster.js SHIFTS):
//   Morning   — 08:00–16:00 ish
//   Evening   — 14:00–22:00 ish
//   Night     — 22:00–08:00 ish
//   Weekend   — Fri/Sat/Holiday on sites that split weekday/weekend columns
//   Leave     — out-of-office
//   Custom    — anything we can't map; surfaces in the "Other" bucket
//
// Status of each parser (verified against the June-2026 sample files):
//   parseBTS   ✅ BTS weekday-column grid    (Time Slot × Sun..Sat)
//   parseNGNC  ✅ NGNC employee × day grid   (name × day-of-month with M/E/EE/D-O/LE codes)
//   parseNMC   ✅ NMC fixed-position shift table (cols 1..17 = Gen/Morn/Eve/Night/Wknd/Leave)
//   parseBNOC  ⚠️  BNOC 5-shift × 5-name columns — see TODO
//   parseSNT   ⚠️  S&T column-header shifts  — see TODO
//   parseNCSS  ⚠️  NCSS multi-site calendar  — see TODO
//
(function () {
  'use strict';

  const MONTHS = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
  };

  // ==========================================================================
  //  SHARED HELPERS
  // ==========================================================================

  function norm(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/\s+/g, ' ').trim();
  }

  function isBlank(v) { return norm(v) === '' || /^-+$/.test(norm(v)); }

  // Parse common date strings: "01-Jun-2026", "1 June 2026", "Jun-01-2026",
  // "2026-06-01", "Monday, June 1, 2026".  Returns ISO 'YYYY-MM-DD' or null.
  function parseDate(raw, opts) {
    const s = norm(raw);
    if (!s) return null;
    let m;
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return iso(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,5})[\/\- ]([A-Za-z]{3,9})[\/\- ](\d{2,4})$/);
    if (m) { const mon = MONTHS[m[2].toLowerCase()]; if (mon !== undefined) return iso(yr(+m[3]), mon, +m[1]); }
    m = s.match(/^([A-Za-z]{3,9})[\/\- ](\d{1,5})[\/\- ](\d{2,4})$/);
    if (m) { const mon = MONTHS[m[1].toLowerCase()]; if (mon !== undefined) return iso(yr(+m[3]), mon, +m[2]); }
    m = s.match(/([A-Za-z]{3,9})\s+(\d{1,5}),?\s+(\d{4})/);
    if (m) { const mon = MONTHS[m[1].toLowerCase()]; if (mon !== undefined) return iso(yr(+m[3]), mon, +m[2]); }
    m = s.match(/(\d{1,5})\s+([A-Za-z]{3,9})\s+(\d{4})/);
    if (m) { const mon = MONTHS[m[2].toLowerCase()]; if (mon !== undefined) return iso(yr(+m[3]), mon, +m[1]); }
    return null;
  }

  function yr(y) { return y < 100 ? 2000 + y : y; }
  function iso(y, m0, d) {
    if (!y || m0 < 0 || m0 > 11 || !d) return null;
    const dt = new Date(Date.UTC(y, m0, d));
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
  }

  function splitNames(raw) {
    const s = norm(raw);
    if (!s) return [];
    return s
      .split(/[\/;|\n]|\s+and\s+|\s+&\s+/)
      .map(x => norm(x))
      .filter(x => x && !/^(weekend|holiday|leave|n\/a|na)$/i.test(x))
      .filter(x => x.length <= 60);
  }

  function canonicalShift(label) {
    const s = norm(label).toLowerCase();
    if (!s) return null;
    if (/(^|\s)(weekend|week-off|off\s*duty|day\s*off|d\/o)(\s|$)/.test(s)) return 'Weekend';
    if (/(^|\s)(leave|l\/l|el|cl|sl|holiday|absent|off|le)(\s|$)/.test(s)) return 'Leave';
    if (/(^|\s)(morning|day|am\s*shift|first\s*shift|9\s*am|8\s*am|9:00|8:00|10:00|11:00|09:00|08:00)/.test(s)) return 'Morning';
    if (/(^|\s)(evening|eve|pm\s*shift|second\s*shift|1\s*pm|2\s*pm|3\s*pm|14:00|13:00|15:00|ee)/.test(s)) return 'Evening';
    if (/(^|\s)(night|nocturnal|3rd\s*shift|graveyard|10\s*pm|11\s*pm|22:00|23:00|00:00|01:00|02:00)/.test(s)) return 'Night';
    if (/(^|\s)(late|extended|extra|additional|3-?shift|3rd)/.test(s)) return 'Evening';
    return 'Custom';
  }

  function makeRow(dateISO, shift, names, department, source, batchId, notes) {
    return {
      date: dateISO,
      shift: shift || 'Custom',
      engineers: names || [],
      department,
      notes: notes || '',
      source: source || '',
      batchId: batchId || ''
    };
  }

  // ==========================================================================
  //  PARSER: BTS
  //  BTS is a weekday-column grid:
  //      row 0:  "Time Slot", "Sunday", "Monday", ..., "Saturday"
  //      row 1+: "<time-slot-or-empty>", "<name>", ..., "<name>"
  //  Group rows into shift-blocks by time-slot boundary; expand each
  //  (weekday, name) cell into the actual dates in opts.month.
  // ==========================================================================
  function parseBTS(rows, opts) {
    const out = [];
    const dept = 'BTS & Power';
    if (!rows.length) return out;
    const header = rows[0].map(c => norm(c).toLowerCase());
    const dayCol = {};
    for (let c = 0; c < header.length; c++) {
      const h = header[c];
      if (/^sun/.test(h)) dayCol.Sun = c;
      else if (/^mon/.test(h)) dayCol.Mon = c;
      else if (/^tue/.test(h)) dayCol.Tue = c;
      else if (/^wed/.test(h)) dayCol.Wed = c;
      else if (/^thu/.test(h)) dayCol.Thu = c;
      else if (/^fri/.test(h)) dayCol.Fri = c;
      else if (/^sat/.test(h)) dayCol.Sat = c;
    }
    if (!Object.keys(dayCol).length) return out;
    const monthInfo = (opts && opts.month) || sniffBTSMonth(opts);
    if (!monthInfo) return out;
    const { year, month0 } = monthInfo;
    const byWeekday = {};
    for (let d = 1; d <= 31; d++) {
      const dt = new Date(Date.UTC(year, month0, d));
      if (dt.getUTCMonth() !== month0) break;
      const wd = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getUTCDay()];
      (byWeekday[wd] = byWeekday[wd] || []).push(dt.toISOString().slice(0, 10));
    }

    let slotLabel = null, slotShift = null, slotNames = [];
    function flush() {
      if (!slotLabel || !slotNames.length) return;
      for (const wd of Object.keys(byWeekday)) {
        const col = dayCol[wd];
        if (col === undefined) continue;
        const names = slotNames.map(n => n[wd]).filter(Boolean);
        if (!names.length) continue;
        for (const dateISO of byWeekday[wd]) {
          out.push(makeRow(dateISO, slotShift, names, dept, 'BTS-Duty', opts.batchId, slotLabel));
        }
      }
    }
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      // Stop at "On Call" / "Escalation" footer tables
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
        const perDay = {};
        for (const wd of Object.keys(dayCol)) {
          const cell = norm(row[dayCol[wd]]);
          if (cell && !/^weekend$/i.test(cell)) perDay[wd] = cell;
        }
        if (Object.keys(perDay).length) slotNames.push(perDay);
      }
    }
    flush();
    return out;
  }

  function timeSlotToShift(label) {
    const m = label.match(/(\d{1,2})(?::\d{2})?\s*(am|pm)?\s*[\-\/ ]\s*(\d{1,2})(?::\d{2})?\s*(am|pm)?/i);
    if (!m) return 'Custom';
    let h1 = +m[1], ap1 = (m[2] || '').toLowerCase();
    let h2 = +m[3], ap2 = (m[4] || '').toLowerCase();
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

  function sniffBTSMonth(opts) {
    const fname = (opts && opts.filename) || '';
    let m = fname.match(/([A-Za-z]+)[\-\/ ,]+(\d{4})/);
    if (m) { const mon = MONTHS[m[1].toLowerCase()]; if (mon !== undefined) return { year: +m[2], month0: mon }; }
    return null;
  }

  // ==========================================================================
  //  PARSER: NGNC
  //  NGNC is an employee × day-of-month grid:
  //      row 0: "Name", "1", "2", ..., "30"
  //      row 1: "",      "Mon", "Tue", ...      (weekday labels, optional)
  //      row 2+: "<name>", "M", "E", "M", "D/O", ...
  //  Each cell is a single shift code; skip "D/O" (weekend) and "LE" (leave).
  // ==========================================================================
  function parseNGNC(rows, opts) {
    const out = [];
    const dept = 'NGNC';
    if (!rows.length) return out;
    const header = rows[0].map(c => norm(c));
    const dayCol = {};
    for (let c = 1; c < header.length; c++) {
      const d = +header[c];
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
        const cell = norm(row[dayCol[d]]);
        if (!cell) continue;
        const code = cell.toUpperCase();
        if (code === 'D/O' || code === 'LEAVE' || code === 'WEEKEND') continue;
        const label = ngCodeToLabel(code);
        if (!label) continue;
        const dateISO = iso(year, month0, +d);
        if (!dateISO) continue;
        out.push(makeRow(dateISO, label, [name], dept, 'NGNC-Duty', opts.batchId));
      }
    }
    return out;
  }

  // NGNC shift-code → display label, including the duty timeframe in
  // parentheses (consistent with how NCSS labels are emitted).  Spec
  // (from the NGNC duty-schedule legend):
  //   M   = Morning        (9.00 AM - 6.00 PM, Office)
  //   EE  = Early Evening  (11.00 AM - 8.00 PM, Office)
  //   E   = Evening        (2.00 PM - 10.00 PM, Office)
  //   LE  = Late Evening   (4.00 PM - 12.00 AM, Home office)
  //   N   = Night
  function ngCodeToLabel(code) {
    if (/^M$/.test(code))   return 'Morning (9.00 AM - 6.00 PM)';
    if (/^EE$/.test(code))  return 'Early Evening (11.00 AM - 8.00 PM)';
    if (/^E$/.test(code))   return 'Evening (2.00 PM - 10.00 PM)';
    if (/^LE$/.test(code))  return 'Late Evening (4.00 PM - 12.00 AM)';
    if (/^N$/.test(code))   return 'Night';
    if (/^GEN$/.test(code)) return 'Custom';
    return 'Custom';
  }

  function sniffMonthFromFilename(opts) {
    const fname = (opts && opts.filename) || '';
    let m = fname.match(/([A-Za-z]+)[\-\/ ,.']+(\d{2,4})/);
    if (m) { const mon = MONTHS[m[1].toLowerCase()]; if (mon !== undefined) return { year: yr(+m[2]), month0: mon }; }
    return null;
  }

  // ==========================================================================
  //  PARSER: NMC
  //  NMC dumps a wide date × shift table.  Header row 0 has the shift labels
  //  spread across cols 1..17.  The column→shift mapping is FIXED by position
  //  (the header may or may not have content in every cell):
  //
  //      col  1         →  General  (1 col)
  //      cols 2..4      →  Morning  (SFT18, 3 cols)
  //      cols 5..7      →  Evening  (SFT89, 3 cols)
  //      cols 8..9      →  Night    (SFT15, 2 cols)
  //      cols 10..14    →  Weekend  (5 cols — sometimes used for Night overflow)
  //      cols 15..17    →  Leave    (3 cols)
  //      cols 18+       →  ignored  (per-row totals / footer notes)
  //
  //  Each data row has the date in col 0 ("Monday, June 1, 2026") and one
  //  engineer name per occupied cell.  Empty cells are skipped.  Holidays and
  //  footer rows either have no parseable date or have empty schedule cells
  //  and are skipped automatically.
  // ==========================================================================
  function parseNMC(rows, opts) {
    const out = [];
    const dept = 'NMC';
    if (!rows || !rows.length) return out;

    // Fixed column→shift map (verified against the June-2026 sample).
    const colShift = (c) => {
      if (c === 1)              return 'General';
      if (c >= 2  && c <= 4)    return 'Morning';
      if (c >= 5  && c <= 7)    return 'Evening';
      if (c >= 8  && c <= 9)    return 'Night';
      if (c >= 10 && c <= 14)   return 'Weekend';
      if (c >= 15 && c <= 17)   return 'Leave';
      return null;
    };

    // Walk every data row, collect (date, shift) → [names] buckets.
    const buckets = new Map();
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row.length) continue;
      const dateRaw = norm(row[0]);
      if (!dateRaw || /^date$/i.test(dateRaw)) continue;          // header row
      if (/^holiday$/i.test(dateRaw)) continue;                   // holiday marker
      const dateISO = parseDate(dateRaw, opts);
      if (!dateISO) continue;                                      // footer / notes
      for (let c = 1; c <= 17; c++) {
        const shift = colShift(c);
        if (!shift) continue;
        const cell = norm(row[c]);
        if (!cell) continue;
        const names = splitNames(cell);
        if (!names.length) continue;
        const key = dateISO + '|' + shift;
        if (!buckets.has(key)) buckets.set(key, { date: dateISO, shift, names: [] });
        const b = buckets.get(key);
        for (const n of names) if (!b.names.includes(n)) b.names.push(n);
      }
    }

    for (const b of buckets.values()) {
      out.push(makeRow(b.date, b.shift, b.names, dept, 'NMC-Duty', opts.batchId));
    }
    // Stable sort: date asc, then shift in a fixed order.
    const order = { General: 0, Morning: 1, Evening: 2, Night: 3, Weekend: 4, Leave: 5, Custom: 6 };
    out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (order[a.shift]||9) - (order[b.shift]||9)));
    return out;
  }

  // ==========================================================================
  //  PARSER: BNOC
  //  BNOC has 5 shift groups × 5 name columns each (with empty separator
  //  columns between groups).  Row 0 holds the time-range header for each
  //  group; row 1 holds shift codes.  Data rows start at row 2 with the
  //  date in col 0 and one engineer per occupied cell.
  //
  //  Column groups (verified against the June-2026 sample):
  //      cols   1..5    →  Morning  (09AM-06PM, SFT03)
  //      cols  10..14   →  Evening  (11AM-08PM, SFT07)
  //      cols  16..17   →  Evening  (03PM-12AM, SFT16)
  //      cols  18..22   →  Evening  (05PM-01AM, SFT29)
  //      cols  23..28   →  Weekend  (mixed, "WEEKEND" group)
  //  Cols 0, 6-9, 15, 29-34 are date / separator / padding.
  // ==========================================================================
  function parseBNOC(rows, opts) {
    const out = [];
    const dept = 'BNOC';
    if (!rows || !rows.length) return out;
    // Five shift groups, by canonical shift + their column span.
    const groups = [
      { shift: 'Morning',  start: 1,  end: 5  },
      { shift: 'Evening',  start: 10, end: 14 },
      { shift: 'Evening',  start: 16, end: 17 },
      { shift: 'Evening',  start: 18, end: 22 },
      { shift: 'Weekend',  start: 23, end: 28 }
    ];
    for (let r = 2; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row.length) continue;
      const dateISO = parseDate(norm(row[0]), opts);
      if (!dateISO) continue;
      for (const g of groups) {
        const names = [];
        for (let c = g.start; c <= g.end; c++) {
          const cell = norm(row[c]);
          if (!cell) continue;
          // BNOC occasionally uses a "Holiday" marker in name cells —
          // skip those (the WEEKEND group is captured separately).
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

  // ==========================================================================
  //  PARSER: S&T
  //  S&T uses shift labels as COLUMN HEADERS.  Row 0 holds the header; data
  //  rows start at row 1 with the date in col 0 and a comma-separated list
  //  of names in cols 1..4.  Cols 6..10 are a per-person summary table
  //  (name + Evening/Weekend/Leave/OFF counts) and are ignored.
  //
  //  Column map (verified against the June-2026 sample):
  //      col 0   →  date
  //      col 1   →  Morning  (09:00am - 06:00pm)
  //      col 2   →  Evening  (11:00am - 08:00pm)
  //      col 3   →  Weekend  (09:00am - 06:00pm)
  //      col 4   →  Leave
  //      cols 5-10 →  summary table (skipped)
  //
  //  Holiday handling: when a cell value is "Holiday", the entire row is
  //  treated as Weekend duty (engineers listed in that cell are Weekend).
  // ==========================================================================
  function parseSNT(rows, opts) {
    const out = [];
    const dept = 'S&T';
    if (!rows || !rows.length) return out;
    // col index → canonical shift
    const colShift = { 1: 'Morning', 2: 'Evening', 3: 'Weekend', 4: 'Leave' };
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row.length) continue;
      const dateRaw = norm(row[0]);
      if (!dateRaw) continue;
      const dateISO = parseDate(dateRaw, opts);
      if (!dateISO) continue;
      // For each shift column, gather names.  "Holiday" or "WEEKEND"
      // markers in name cells map to Weekend; otherwise split names.
      for (const c of Object.keys(colShift)) {
        const ci = +c;
        const cell = norm(row[ci]);
        if (!cell) continue;
        // The Excel export sometimes truncates with "..." — strip it.
        const clean = cell.replace(/\.{2,}\s*$/, '').trim();
        if (/^holiday$/i.test(clean)) continue;            // date-level marker, no engineers
        const shift = colShift[ci];
        const names = splitNames(clean);
        if (names.length) {
          out.push(makeRow(dateISO, shift, names, dept, 'S&T-Duty', opts.batchId));
        }
      }
    }
    return out;
  }

  // ==========================================================================
  //  PARSER: NCSS
  //  NCSS is a wide multi-site grid.  Two header rows describe the columns:
  //      row 0:  per-site group labels (Banani, Uttara, Gazipur, Dhanmondi,
  //              Motijheel, Banasree, Mirpur DOHS, Narayangonj, Savar, Night)
  //      row 1:  per-site time-slot labels (8:00 am-5:00 pm, 9:00 am-6:00 pm,
  //              ..., 10:00 PM-8:00 AM)
  //  Data rows start at row 2 with col 0 = "Holiday" flag (Fri/Sat) and
  //  col 1 = the date.
  //
  //  Column groups (verified against the June-2026 sample):
  //      col 0              →  Holiday flag (informational)
  //      col 1              →  date
  //      cols  2..22        →  Banani & Bashundhara
  //      cols 23..30        →  Uttara
  //      cols 31..54        →  Gazipur
  //      cols 55..69        →  Dhanmondi
  //      cols 70..84        →  Motijheel
  //      cols 85..101       →  Banasree
  //      cols 102..115      →  Mirpur DOHS
  //      cols 116..125      →  Narayangonj Office
  //      cols 126..137      →  Savar
  //      cols 138..142      →  Night monitoring team (Office / Lead / etc.)
  //
  //  Within each group, the time-slot text on row 1 maps each column to a
  //  canonical shift:
  //      "8:00 am -5:00 pm" / "9:00 am -6:00 pm"  →  Morning
  //      "10:00 AM - 7:00 PM" / "11:00 AM - 8:00 PM" →  Evening
  //      "12:00 pm -9:00 pm" / "3:00 PM - 11:59 PM" →  Evening
  //      "Compensatory"                              →  Custom
  //      "10:00 PM - 8:00 AM"                        →  Night
  // ==========================================================================
  function parseNCSS(rows, opts) {
    const out = [];
    // Stamp with the canonical box key ('NCSS Dhaka') so the per-box
    // dept filter in roster.js picks these rows up.  (Bare 'NCSS' would
    // be hidden by the filter — only Dhaka is shown.)
    const dept = 'NCSS Dhaka';
    if (!rows || !rows.length) return out;
    if (!rows[1] || rows[1].length < 3) return out;

    // --- Build colShift[c] and colShiftSlot[c] from row 1 ---------------
    //   - col 1 holds the literal "Date" label, not a time range.
    //   - Some time slots span multiple columns (the sub-header appears
    //     only in the first column of the group and the rest are blank
    //     in row 1) so we forward-fill the shift between non-empty cells.
    //   - colShiftSlot[c] = raw time-slot text (e.g. "8:00 am -5:00 pm",
    //     "Compensatory") — used to compose the displayed shift label
    //     so the user can see WHICH duty timeframe each row belongs to.
    //   - "Compensatory" cells are their own shift (mapped to "Custom"
    //     so the box shows them under "Other").
    const colShift = [];
    const colShiftSlot = []; // raw time-slot text per column (forward-filled)
    const slotRe = /(\d{1,2}):(\d{2})\s*(am|pm)\s*-\s*(\d{1,2}):(\d{2})\s*(am|pm)/i;
    const to24 = (h, mn, ap) => {
      let hh = +h;
      if (/pm/i.test(ap) && hh < 12) hh += 12;
      if (/am/i.test(ap) && hh === 12) hh = 0;
      return hh + (mn / 60);
    };
    let curShift = null;
    let curSlot = '';
    for (let c = 2; c < rows[1].length; c++) {
      const slot = norm(rows[1][c]);
      if (slot) {
        curSlot = slot;
        if (/^compensatory$/i.test(slot)) curShift = 'Custom';
        else {
          const m = slot.match(slotRe);
          if (m) {
            const s = to24(m[1], m[2], m[3]);
            const e = to24(m[4], m[5], m[6]);
            if (s >= 7 && s <= 11) curShift = 'Morning';
            // 10am-noon start, ends 7-10pm  → late-morning / afternoon
            else if (s >= 10 && s <= 12 && e >= 19 && e <= 22) curShift = 'Evening';
            // 1-3pm start, ends 9pm-12am  → afternoon / evening
            else if (s >= 13 && s <= 15) curShift = 'Evening';
            // 9-11pm start, ends 6-9am next day (e < s means next day)
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

    // --- Build colArea[c] from row 0 by forward-filling ----------------
    //   - The header alternates "Area" / "Evening" sub-section markers.
    //   - "Evening" sub-markers (e.g. c23 in Banani, c83 in Motijheel)
    //     do NOT change the current area; they just split the area into
    //     morning and evening sub-sections that we keep grouped together
    //     by the canonical shift detected in row 1.
    //   - "Night" at c138 marks the night-monitoring team columns.
    const colArea = [];
    let curArea = '';
    for (let c = 0; c < (rows[0] || []).length; c++) {
      const v = norm(rows[0][c]);
      if (v && !/^evening$/i.test(v)) curArea = v;
      colArea[c] = curArea || null;
    }

    // --- Process each data row ----------------------------------------
    //   col 0 = Holiday flag (some Fri/Sat rows)
    //   col 1 = date (e.g. "Monday, June 1, 2026")
    //   cols 2..137 = area engineer columns
    //   col 138     = Night Duty engineer name
    //   col 139     = office where the night engineer is stationed
    //   col 140     = Monitoring Team Lead
    //   col 141     = Night Logical team engineer
    //   col 142     = office where the night-logical engineer is stationed
    for (let r = 2; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length < 2) continue;
      const dateISO = parseDate(norm(row[1]), opts);
      if (!dateISO) continue;
      const isHoliday = /^holiday$/i.test(norm(row[0]));

      // bucket by (area|shift|location-suffix) → [names]
      //   For night columns we add the office location (e.g. "Banani")
      //   to the area so the user can see WHERE the night engineer is
      //   stationed that day.
      const buckets = new Map();
      const addBucket = (area, shift, name) => {
        const key = area + '|' + shift;
        if (!buckets.has(key)) buckets.set(key, { area, shift, names: [] });
        const arr = buckets.get(key).names;
        if (!arr.includes(name)) arr.push(name);
      };

      // Compose a shift label that includes the original time-slot text
      // from row 1 (e.g. "Morning (8:00 am -5:00 pm)", "Custom (Compensatory)").
      // This is what the user sees in the Roster box — the time range is
      // part of the shift, not a side note.
      const labelFor = (shift, slotText) => {
        if (!shift) return '';
        const s = norm(slotText);
        return s ? (shift + ' (' + s + ')') : shift;
      };

      // 1) Area engineer columns (2..137).
      for (let c = 2; c <= 137 && c < row.length; c++) {
        const cell = norm(row[c]);
        if (!cell) continue;
        const names = splitNames(cell);
        if (!names.length) continue;
        const shift = colShift[c];
        if (!shift) continue;
        const area = colArea[c] || '';
        const canon = (isHoliday && (shift === 'Morning' || shift === 'Evening'))
          ? 'Weekend'
          : shift;
        const effShift = labelFor(canon, colShiftSlot[c]);
        for (const n of names) addBucket(area, effShift, n);
      }

      // 2) Night Duty engineer (col 138) + Office Name (col 139).
      const nightName = norm(row[138]);
      const nightOffice = norm(row[139]);
      if (nightName) {
        const names = splitNames(nightName);
        const area = 'Night' + (nightOffice ? ' @ ' + nightOffice : '');
        for (const n of names) addBucket(area, labelFor('Night', colShiftSlot[138]), n);
      }

      // 3) Monitoring Team Lead (col 140) — informational, skip.

      // 4) Night Logical team (col 141) + Logical night Office (col 142).
      const logName = norm(row[141]);
      const logOffice = norm(row[142]);
      if (logName) {
        const names = splitNames(logName);
        const area = 'Night Logical' + (logOffice ? ' @ ' + logOffice : '');
        for (const n of names) addBucket(area, labelFor('Night', colShiftSlot[141]), n);
      }

      for (const { area, shift, names } of buckets.values()) {
        out.push(makeRow(dateISO, shift, names, dept, 'NCSS-Duty', opts.batchId, area));
      }
    }
    return out;
  }

  // ==========================================================================
  //  PUBLIC API
  // ==========================================================================
  const _g = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : window);
  _g.NMCRosterParsers = {
    parseBTS,
    parseNGNC,
    parseNMC, parseBNOC, parseSNT, parseNCSS,
    _internal: { norm, parseDate, splitNames, canonicalShift, timeSlotToShift, ngCodeToLabel, MONTHS }
  };
})();

/* ============================================================================
 *  TODO: parsers still to implement
 * ============================================================================
 *
 *  parseNMC
 *    NMC dumps change layout per month.  June-2026 example (after multi-line
 *    cell merge):
 *      row 0 (data row 7): "Monday, June 1, 2026", "Peal, Masum", "Obayed",
 *                            "Mihir", ...  (column order matches header
 *                            shift labels in row 1, e.g. "SFT18  Morning",
 *                            "SFT15  Evening", "SFT15  Night", "Weekend",
 *                            "Leave")
 *    Approach: read header row to get the shift label per column, then
 *              for each date row emit one (date, shift) row with all
 *              non-blank names from that column.
 *
 *  parseBNOC
 *    BNOC has 5 shifts × 5 name columns each (with empty separator cols):
 *      row 0:  "09AM to 06PM", ..., "11AM to 8PM", ..., "3PM to 12AM", ...,
 *              "5PM to 1AM", ..., " WEEKEND "
 *      row 1:  "Date & Day", SFT03,... (shift codes)
 *      row 2+: "Monday, June 01, 2026", ANWAR, MITON, ...
 *    Approach: detect 5-column groups by reading row 0's non-empty time
 *              ranges, then for each (date row, shift group) gather names
 *              from the 5 columns.
 *
 *  parseSNT
 *    S&T (June-2026) has shift labels as COLUMN HEADERS, not in cells:
 *      row 0: "June -2026", "Morning\n(09:00am - 06:00pm)", "Evening\n(...)",
 *             "Weekend\n(...)", "Leave", ...
 *      row 5: "Monday, June 1, 2026", "Akram, Tarek, ...", "Taufiq", , ...
 *    Approach: read row 0 to map each column to a canonical shift, then
 *              for each data row emit (date, shift) with the names in that
 *              column.
 *
 *  parseNCSS
 *    NCSS is a wide multi-site grid where each row is a date label
 *    ("Monday, June 1, 2026") and each column is a (office, time-slot)
 *    bucket.  Some cells span multiple CSV rows (Excel wrapped text).
 *    This is the hardest layout; probably needs a per-month hand-written
 *    config.  Punt until the user asks for NCSS import.
 * ============================================================================
 */
