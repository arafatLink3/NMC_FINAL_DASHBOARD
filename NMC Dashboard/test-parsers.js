// Quick test harness for rosterParsers.js — run with:  node test-parsers.js
// Loads each June-2026 CSV, runs the matching parser, prints a summary.
const fs = require('fs');
const path = require('path');

global.window = global;
global.document = {};

// Proper CSV parser that respects quoted multi-line cells
function parseCSV(text) {
  const rows = [];
  let row = [];
  let buf = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { buf += '"'; i++; }  // escaped quote
        else inQ = false;
      } else buf += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(buf); buf = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(buf); buf = '';
        // Skip empty rows
        if (row.some(x => x !== '')) rows.push(row);
        row = [];
      } else buf += ch;
    }
  }
  if (buf !== '' || row.length) { row.push(buf); if (row.some(x => x !== '')) rows.push(row); }
  return rows;
}

// Load parsers
require('./js/rosterParsers.js');
const P = global.window.NMCRosterParsers;

const dir = path.join(__dirname, 'June-2026');
const files = fs.readdirSync(dir);
console.log('Files in June-2026:', files);

const want = {
  'NMC Duty Schedule June-2026 - June-2026.csv':               'parseNMC',
  'BNOC_Duty_Schedule-June-26_.xlsx - Sheet1.csv':             'parseBNOC',
  "NGNC Duty Schedule June'26.xlsx - Roster.csv":              'parseNGNC',
  'NCSS Duty Schedule June-2026.xlsx - Eng.Schedule.csv':      'parseNCSS',
  'S&T duty schedule for June 2026.xlsx - June 2026.csv':      'parseSNT',
  'BTS & Power Infra Duty roster month of June-2026 - Sheet1.csv': 'parseBTS'
};

for (const fname of files) {
  if (!want[fname]) continue;
  const fn = want[fname];
  console.log('\n=========================================');
  console.log('FILE:', fname, '→', fn);
  const text = fs.readFileSync(path.join(dir, fname), 'utf8');
  const rows = parseCSV(text);
  console.log('  rows:', rows.length, ' cols(row0):', (rows[0] || []).length);
  let out;
  try {
    out = P[fn](rows, { filename: fname, batchId: 'TEST' });
  } catch (e) {
    console.log('  PARSE ERROR:', e.message);
    console.log(e.stack);
    continue;
  }
  const byDate = {};
  for (const r of out) {
    const k = r.date + '|' + r.shift;
    byDate[k] = (byDate[k] || 0) + 1;
  }
  console.log('  total rows:', out.length, ' unique(date+shift):', Object.keys(byDate).length);
  const dates = [...new Set(out.map(r => r.date))].sort();
  console.log('  date range:', dates[0], '→', dates[dates.length - 1], '  unique dates:', dates.length);
  const shifts = {};
  for (const r of out) shifts[r.shift] = (shifts[r.shift] || 0) + 1;
  console.log('  shifts:', shifts);
  console.log('  first 3 rows:');
  for (const r of out.slice(0, 3)) console.log('   ', r.date, r.shift, '[' + r.engineers.join(', ') + ']');
  // Show one row per weekday for BTS to verify expansion
  if (fn === 'parseBTS') {
    const seen = new Set();
    for (const r of out) {
      const wd = new Date(r.date + 'T00:00:00Z').getUTCDay();
      const key = r.shift + '|' + wd;
      if (!seen.has(key)) { seen.add(key); console.log('   BTS sample', r.date, '(' + ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][wd] + ')', r.shift, '[' + r.engineers.join(', ') + ']'); }
    }
  }
}
