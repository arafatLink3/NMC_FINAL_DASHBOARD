const fs = require('fs');
const text = fs.readFileSync('June-2026/NMC Duty Schedule June-2026 - June-2026.csv', 'utf8');

function csvToRows(t) {
  const rows = []; let row = [], cell = '', inQ = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQ) {
      if (ch === '"') { if (t[i+1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\r') {}
      else if (ch === '\n') { row.push(cell); cell = ''; rows.push(row); row = []; }
      else cell += ch;
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const rows = csvToRows(text);
// Just look at cols 18+ for any footer / special rows
console.log('Cols 18-26 for each row:');
for (let r = 0; r < rows.length; r++) {
  const tail = [];
  for (let c = 18; c < rows[r].length; c++) {
    if (rows[r][c] && rows[r][c].trim()) tail.push(`c${c}=${rows[r][c].trim()}`);
  }
  console.log(`r${String(r).padStart(2)} date="${rows[r][0]}"  | ${tail.join(' | ')}`);
}
