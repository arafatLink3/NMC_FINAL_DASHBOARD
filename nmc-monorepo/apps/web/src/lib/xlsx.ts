// Tiny XLSX writer — produces a real .xlsx (Office Open XML SpreadsheetML)
// that Excel and LibreOffice both open. No external deps: uses ./zip to
// assemble the OOXML parts into a stored (method 0) ZIP archive.
//
// Layout produced:
//   [Content_Types].xml
//   _rels/.rels
//   xl/workbook.xml
//   xl/_rels/workbook.xml.rels
//   xl/worksheets/sheet1.xml
//   xl/styles.xml
//   xl/sharedStrings.xml
//
// Caveats:
//   * Numbers are emitted as numbers when they're finite, else as inline strings.
//   * Booleans are emitted as inline strings ("TRUE"/"FALSE") so they sort with text.
//   * No styling beyond a single default cell format (Excel still opens it).
//   * We escape XML special chars on every text emission.

import { buildZip } from './zip';

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colLetter(n: number): string {
  // 1 → A, 26 → Z, 27 → AA
  let s = '';
  let v = n;
  while (v > 0) {
    const r = (v - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    v = Math.floor((v - 1) / 26);
  }
  return s;
}

type Cell = string | number | boolean | Date | null | undefined;

function cellXML(col: number, row: number, v: Cell, shared: string[]): string {
  const ref = `${colLetter(col)}${row}`;
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    const iso = v.toISOString();
    return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(iso)}</t></is></c>`;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    return `<c r="${ref}"><v>${v}</v></c>`;
  }
  if (typeof v === 'boolean') {
    return `<c r="${ref}" t="inlineStr"><is><t>${v ? 'TRUE' : 'FALSE'}</t></is></c>`;
  }
  const s = String(v);
  // Shared-string table for any text length > 12 to keep the inline path terse.
  if (s.length >= 8) {
    const idx = shared.indexOf(s);
    let pos: number;
    if (idx >= 0) pos = idx;
    else { shared.push(s); pos = shared.length - 1; }
    return `<c r="${ref}" t="s"><v>${pos}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(s)}</t></is></c>`;
}

export function workbookToXLSX(headers: string[], rows: Cell[][]): Blob {
  const shared: string[] = [];
  const rowParts: string[] = [];
  const totalCols = headers.length;
  const lastCol = colLetter(totalCols);

  // header row
  let head = '';
  for (let c = 0; c < totalCols; c++) head += cellXML(c + 1, 1, headers[c], shared);
  rowParts.push(`<row r="1">${head}</row>`);

  // data rows
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    let line = '';
    for (let c = 0; c < totalCols; c++) line += cellXML(c + 1, r + 2, row[c], shared);
    rowParts.push(`<row r="${r + 2}">${line}</row>`);
  }

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${lastCol}${rows.length + 1}"/>
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${(() => {
  let s = '';
  for (let c = 1; c <= totalCols; c++) s += `<col min="${c}" max="${c}" width="16" customWidth="0"/>`;
  return s;
})()}</cols>
<sheetData>${rowParts.join('')}</sheetData>
</worksheet>`;

  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">
${shared.map((s, i) => `<si><t xml:space="preserve">${xmlEscape(s)}</t></si>`).join('')}
</sst>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="1"><xf/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Incidents" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

  const zipBytes = buildZip({
    '[Content_Types].xml': contentTypes,
    '_rels/.rels': rootRels,
    'xl/workbook.xml': workbookXml,
    'xl/_rels/workbook.xml.rels': workbookRels,
    'xl/worksheets/sheet1.xml': sheet,
    'xl/styles.xml': stylesXml,
    'xl/sharedStrings.xml': sharedStringsXml,
  });

  return new Blob([zipBytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}