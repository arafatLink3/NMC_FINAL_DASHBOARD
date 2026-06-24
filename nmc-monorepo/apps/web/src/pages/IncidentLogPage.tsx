// Incident Log — full 33-column master table, search, filter, AI bulk auto-fill
// / recheck, CSV import/export, manual entry. Direct port of
//   `D:\Test_NMC_Dashboard\NMC Dashboard\js\pages\incidentLog.js`
// keeping the same look, behavior, column order, status palette, modal flow,
// dropdowns, INFERRED rendering, FIXED_ENGINEERS, and dropdown-config persistence.
import { useEffect, useMemo, useRef, useState } from 'react';
import { store, useCollection } from '../lib/store';
import {
  IconPlus, IconDownload, IconSearch, IconRefresh, IconCheck, IconX,
  IconFilter,
} from '../lib/icons';
import {
  fmtDMYHM, fmtLongDuration, durationBetween,
} from '../lib/format';
import type { IncidentRecord } from '@nmc/api-client';
import {
  classify, inferZone, ZONE_LIST,
  getAllDropdowns, setDropdown, resetDropdowns, buildTimeOptions,
  type DropdownOptions,
} from '@nmc/ai';
import { workbookToXLSX } from '../lib/xlsx';

// ---------- fixed engineer roster (mirrors legacy FIXED_ENGINEERS) ----------
const FIXED_ENGINEERS: Record<string, string[]> = {
  BNOC: ['Onkar', 'Mamun', 'Rony', 'Noman', 'Shuvo', 'Mithu', 'Rahat', 'Asif', 'Liton', 'Rashed', 'Sabbir', 'Alam'],
  NCSS: ['Pintu', 'Shams', 'Selim', 'Rashed', 'Nazmul', 'Suvo', 'Imran'],
  NGNC: ['Noman', 'Mamun', 'Hasan', 'Rony', 'Rajib'],
  'Survey & Transmission': ['Bappy', 'Sohag', 'Imran', 'Jasim', 'Rana', 'Sabbir', 'Liton'],
  'BTS & Power Infrastructure': ['Babul', 'Selim', 'Nazmul', 'Rana', 'Sabbir'],
  IPTSB: ['Rony', 'Noman', 'Mamun', 'Liton'],
  'I&I': ['Onkar', 'Mithu', 'Rahat', 'Sabbir', 'Asif'],
};
const ALL_ENGINEERS = Array.from(
  new Set(Object.values(FIXED_ENGINEERS).flat()),
).sort();

// ---------- dropdown config (persisted in localStorage, mirrors legacy) ----
const DD_KEY = 'nmc.incidentDropdowns';
function readDD(): DropdownOptions {
  try {
    const raw = localStorage.getItem(DD_KEY);
    if (!raw) return resetDropdowns();
    return getAllDropdowns(JSON.parse(raw));
  } catch { return resetDropdowns(); }
}
function writeDD(dd: DropdownOptions) {
  try { localStorage.setItem(DD_KEY, JSON.stringify(dd)); } catch {}
}

// ---------- column definitions (mirrors legacy COLS — 33 columns) ----------
type Col = { key: string; label: string; w?: number };
const COLS: Col[] = [
  { key: 'session',          label: 'Session',           w: 70 },
  { key: 'name',             label: 'Name' },
  { key: 'incidentName',     label: 'Incident' },
  { key: 'category',         label: 'Category' },
  { key: 'subCategory',      label: 'Sub-category' },
  { key: 'zone',             label: 'Zone' },
  { key: 'ic',               label: 'IC' },
  { key: 'faultTime',        label: 'Fault',             w: 130 },
  { key: 'restorationTime',  label: 'Restored',          w: 130 },
  { key: 'duration',         label: 'Duration',          w: 110 },
  { key: 'ticketId',         label: 'TT',                w: 90 },
  { key: 'type',             label: 'Type' },
  { key: 'rootCause',        label: 'Root cause' },
  { key: 'rcaProvider',      label: 'RCA provider' },
  { key: 'actionTaken',      label: 'Action' },
  { key: 'issueType',        label: 'Issue type' },
  { key: 'department',       label: 'Dept' },
  { key: 'team',             label: 'Team' },
  { key: 'informedPerson',   label: 'Informed' },
  { key: 'whatsapp',         label: 'WhatsApp' },
  { key: 'mail',             label: 'Mail' },
  { key: 'currentStatus',    label: 'Status' },
];

// ---------- status palette (mirrors legacy isResolvedRow + age buckets) ----
type StatusClass = 'solved' | 'sky' | 'orange' | 'yellow' | 'ash';
function isResolvedRow(r: IncidentRecord): boolean {
  const s = String((r as { currentStatus?: string }).currentStatus ?? '').toLowerCase().trim();
  const solved = String((r as { solved?: string }).solved ?? '').toLowerCase().trim();
  return s === 'solved' || solved === 'yes';
}
function statusClass(r: IncidentRecord): StatusClass {
  if (isResolvedRow(r)) return 'solved';
  const ft = (r as { faultTime?: string }).faultTime;
  if (!ft) return 'ash';
  const age = Date.now() - new Date(ft).getTime();
  if (age < 60 * 60 * 1000) return 'yellow';
  if (age < 4 * 60 * 60 * 1000) return 'sky';
  return 'orange';
}
function statusDotClass(r: IncidentRecord): StatusClass {
  if (isResolvedRow(r)) return 'solved';
  const s = String((r as { currentStatus?: string }).currentStatus ?? '').toLowerCase().trim();
  if (s === 'rca pending ticket') return 'sky';
  if (s === 'non-ticket running') return 'orange';
  if (s === 'running') return 'yellow';
  return 'ash';
}

// ---------- AI helpers (mirror A.bulkAutoFill / A.recheckWorkbook) ----------
function inferMissing(r: IncidentRecord, _contacts: ContactLite[]): IncidentRecord {
  const out: Record<string, unknown> = { ...r };
  const inferred: string[] = [];

  // Text blob for inference
  const blob = [
    out.incidentName, out.issueType, out.rootCause, out.actionTaken,
    (r as { contactName?: string }).contactName, (r as { details?: string }).details,
  ].filter(Boolean).join(' ');

  // 1) zone
  if (!out.zone && blob) {
    const z = inferZone(blob);
    if (z) { out.zone = z; inferred.push('zone'); }
  }

  // 2) category / subCategory / department / team / issueType via classify()
  const cat = String(out.category ?? '');
  if (blob || cat) {
    const res = classify(cat, blob);
    if (res) {
      if (!out.category && res.category) {
        out.category = res.category;
        inferred.push('category');
      }
      if (!out.subCategory && res.category && res.category !== out.category) {
        out.subCategory = res.category;
        inferred.push('subCategory');
      }
      if (!out.department && res.department) {
        out.department = res.department;
        inferred.push('department');
      }
      if (!out.team && res.responsibleTeam) {
        out.team = res.responsibleTeam;
        inferred.push('team');
      }
      if (!out.issueType && res.issue) {
        out.issueType = res.issue;
        inferred.push('issueType');
      }
    }
  }

  // Mark inferred keys for UI badges
  if (inferred.length) (out as { _inferred?: string[] })._inferred = inferred;
  return out as IncidentRecord;
}

type ContactLite = { name: string; phone?: string; email?: string; designation?: string };

// ---------- CSV helpers (papaparse not used here — small inline parser) ----
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cell += ch; }
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
        row = []; cell = '';
        if (ch === '\r' && text[i + 1] === '\n') i++;
      } else { cell += ch; }
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function toCSV(rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>): string {
  return rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

// ---------- helpers ----------
function timeOptions(): string[] { return buildTimeOptions(); }
function hhmmFromISO(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return ''; }
}
function dateFromISO(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch { return ''; }
}
function norm(s: unknown): string { return String(s ?? '').toLowerCase().trim(); }

// ---------- multi-condition filter model ----------
type FilterFieldKind = 'text' | 'number' | 'date';
type TextOp = 'contains' | 'equals' | 'notContains' | 'startsWith' | 'isEmpty' | 'isNotEmpty';
type NumberOp = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte';
type DateOp = 'on' | 'before' | 'after' | 'between' | 'isEmpty' | 'isNotEmpty';
type FilterOp = TextOp | NumberOp | DateOp;

type FilterRow = {
  id: string;
  field: string;             // key into COLS or special 'duration'
  op: FilterOp;
  value: string;             // raw text input
  value2?: string;           // for "between" (date)
  number?: number;           // parsed numeric value (for number fields)
  number2?: number;          // parsed numeric value (number between)
};

type FilterFieldDef = {
  key: string;        // matches COLS.key or 'duration'
  label: string;      // shown in field picker
  kind: FilterFieldKind;
};

const FILTER_FIELDS: FilterFieldDef[] = [
  ...COLS.filter((c) => c.key !== 'duration').map<FilterFieldDef>((c) => ({
    key: c.key, label: c.label, kind: c.key === 'faultTime' || c.key === 'restorationTime' ? 'date' : 'text',
  })),
  { key: 'duration', label: 'Duration (HH:MM)', kind: 'number' },
];

const TEXT_OPS: { op: TextOp; label: string }[] = [
  { op: 'contains',    label: 'contains' },
  { op: 'equals',      label: 'equals' },
  { op: 'notContains', label: 'does not contain' },
  { op: 'startsWith',  label: 'starts with' },
  { op: 'isEmpty',     label: 'is empty' },
  { op: 'isNotEmpty',  label: 'is not empty' },
];

const NUMBER_OPS: { op: NumberOp; label: string }[] = [
  { op: 'eq',  label: '=' },
  { op: 'neq', label: '≠' },
  { op: 'gt',  label: '>' },
  { op: 'gte', label: '≥' },
  { op: 'lt',  label: '<' },
  { op: 'lte', label: '≤' },
];

const DATE_OPS: { op: DateOp; label: string }[] = [
  { op: 'on',       label: 'on' },
  { op: 'before',   label: 'before' },
  { op: 'after',    label: 'after' },
  { op: 'between',  label: 'between' },
  { op: 'isEmpty',  label: 'is empty' },
  { op: 'isNotEmpty', label: 'is not empty' },
];

function opsFor(kind: FilterFieldKind): { op: FilterOp; label: string }[] {
  if (kind === 'number') return NUMBER_OPS;
  if (kind === 'date') return DATE_OPS;
  return TEXT_OPS;
}

function defaultOp(kind: FilterFieldKind): FilterOp {
  if (kind === 'number') return 'eq';
  if (kind === 'date') return 'on';
  return 'contains';
}

let FILTER_ID = 0;
function newFilterRow(): FilterRow {
  FILTER_ID += 1;
  const first = FILTER_FIELDS[0]!;
  return { id: `f${FILTER_ID}`, field: first.key, op: defaultOp(first.kind), value: '' };
}

// Convert a "HH:MM" or "H:MM" or "MM" duration string to total minutes.
function durationToMinutes(s: string): number | null {
  const str = s.trim();
  if (!str) return null;
  if (str.includes(':')) {
    const [h, m] = str.split(':');
    const hh = Number(h);
    const mm = Number(m);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  }
  const n = Number(str);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 60);
}

function getFieldString(r: IncidentRecord, key: string): string {
  if (key === 'duration') {
    return fmtLongDuration(durationBetween(
      (r as { faultTime?: string }).faultTime,
      (r as { restorationTime?: string }).restorationTime,
    ));
  }
  const v = (r as Record<string, unknown>)[key];
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  return String(v);
}

function getFieldDate(r: IncidentRecord, key: string): Date | null {
  const raw = (r as Record<string, unknown>)[key];
  if (typeof raw !== 'string' || !raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getFieldMinutes(r: IncidentRecord, key: string): number | null {
  if (key !== 'duration') {
    const v = (r as Record<string, unknown>)[key];
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return durationToMinutes(fmtLongDuration(durationBetween(
    (r as { faultTime?: string }).faultTime,
    (r as { restorationTime?: string }).restorationTime,
  )));
}

function rowMatchesFilter(r: IncidentRecord, f: FilterRow): boolean {
  const def = FILTER_FIELDS.find((x) => x.key === f.field);
  if (!def) return true;

  if (def.kind === 'text') {
    const hay = getFieldString(r, f.field).toLowerCase();
    const v = f.value.trim().toLowerCase();
    switch (f.op as TextOp) {
      case 'contains':    return v ? hay.includes(v) : true;
      case 'equals':      return hay === v;
      case 'notContains': return v ? !hay.includes(v) : true;
      case 'startsWith':  return v ? hay.startsWith(v) : true;
      case 'isEmpty':     return hay === '';
      case 'isNotEmpty':  return hay !== '';
    }
  }

  if (def.kind === 'number') {
    const minutes = getFieldMinutes(r, f.field);
    const n = f.number ?? NaN;
    switch (f.op as NumberOp) {
      case 'eq':  return minutes !== null && minutes === n;
      case 'neq': return minutes === null || minutes !== n;
      case 'gt':  return minutes !== null && minutes > n;
      case 'gte': return minutes !== null && minutes >= n;
      case 'lt':  return minutes !== null && minutes < n;
      case 'lte': return minutes !== null && minutes <= n;
    }
  }

  if (def.kind === 'date') {
    const d = getFieldDate(r, f.field);
    const v = f.value ? new Date(f.value) : null;
    const v2 = f.value2 ? new Date(f.value2) : null;
    switch (f.op as DateOp) {
      case 'on':      return d !== null && v !== null && !Number.isNaN(v.getTime())
                       && sameDay(d, v);
      case 'before':  return d !== null && v !== null && !Number.isNaN(v.getTime())
                       && d.getTime() < v.getTime();
      case 'after':   return d !== null && v !== null && !Number.isNaN(v.getTime())
                       && d.getTime() > v.getTime();
      case 'between': {
        if (!d || !v || !v2 || Number.isNaN(v.getTime()) || Number.isNaN(v2.getTime())) return false;
        const lo = Math.min(v.getTime(), v2.getTime());
        const hi = Math.max(v.getTime(), v2.getTime());
        return d.getTime() >= lo && d.getTime() <= hi + 24 * 3600 * 1000 - 1;
      }
      case 'isEmpty':    return d === null;
      case 'isNotEmpty': return d !== null;
    }
  }
  return true;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
}

function rowValueForExport(r: IncidentRecord, key: string): string | number {
  if (key === 'duration') return fmtLongDuration(durationBetween(
    (r as { faultTime?: string }).faultTime,
    (r as { restorationTime?: string }).restorationTime,
  ));
  const v = (r as Record<string, unknown>)[key];
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  return String(v);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// =====================================================================
// Page component
// =====================================================================
export function IncidentLogPage() {
  const [rows, setRows] = useCollection<IncidentRecord>('incidents');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'closed' | 'archived'>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [dd, setDd] = useState<DropdownOptions>(() => readDD());
  const fileRef = useRef<HTMLInputElement>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  function saveDD(next: DropdownOptions) {
    setDd(next);
    writeDD(next);
  }

  function updateFilterRow(id: string, patch: Partial<FilterRow>) {
    setFilterRows((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }
  function addFilterRow() {
    setFilterRows((prev) => [...prev, newFilterRow()]);
  }
  function removeFilterRow(id: string) {
    setFilterRows((prev) => prev.filter((f) => f.id !== id));
  }
  function clearFilterRows() {
    setFilterRows([]);
  }

  // -- filter + search (mirrors legacy applyFilter) -------------------------
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const activeFilters = filterRows.filter((f) => {
      // a row is "active" if it has a value (or uses an "is empty/is not empty" op)
      if (f.op === 'isEmpty' || f.op === 'isNotEmpty') return true;
      if (f.op === 'between') return !!(f.value || f.value2);
      const def = FILTER_FIELDS.find((x) => x.key === f.field);
      if (def?.kind === 'number') return Number.isFinite(f.number);
      return f.value.trim() !== '';
    });
    return rows.filter((r) => {
      const status = norm(r.currentStatus);
      const solved = isResolvedRow(r);
      const archived = norm((r as { archived?: string }).archived) === 'yes';
      if (filter === 'open' && (solved || archived)) return false;
      if (filter === 'closed' && !solved) return false;
      if (filter === 'archived' && !archived) return false;
      if (activeFilters.length && !activeFilters.every((f) => rowMatchesFilter(r, f))) return false;
      if (!term) return true;
      const blob = COLS.map((c) => String((r as Record<string, unknown>)[c.key] ?? '')).join(' ').toLowerCase();
      const contact = [
        (r as { contactName?: string }).contactName,
        (r as { contactPhone?: string }).contactPhone,
        (r as { contactEmail?: string }).contactEmail,
        (r as { details?: string }).details,
        (r as { address?: string }).address,
        (r as { informedPerson?: string }).informedPerson,
      ].join(' ').toLowerCase();
      return (blob + ' ' + contact).includes(term);
    });
  }, [rows, q, filter, filterRows]);

  // -- counts (mirrors legacy counts) --------------------------------------
  // Counts respect search + filters so the tabs always show what's visible.
  const counts = useMemo(() => {
    const term = q.trim().toLowerCase();
    const activeFilters = filterRows.filter((f) => {
      if (f.op === 'isEmpty' || f.op === 'isNotEmpty') return true;
      if (f.op === 'between') return !!(f.value || f.value2);
      const def = FILTER_FIELDS.find((x) => x.key === f.field);
      if (def?.kind === 'number') return Number.isFinite(f.number);
      return f.value.trim() !== '';
    });
    function predicate(r: IncidentRecord, want: 'all' | 'open' | 'closed' | 'archived'): boolean {
      const solved = isResolvedRow(r);
      const archived = norm((r as { archived?: string }).archived) === 'yes';
      if (want === 'open' && (solved || archived)) return false;
      if (want === 'closed' && !solved) return false;
      if (want === 'archived' && !archived) return false;
      if (activeFilters.length && !activeFilters.every((f) => rowMatchesFilter(r, f))) return false;
      if (!term) return true;
      const blob = COLS.map((c) => String((r as Record<string, unknown>)[c.key] ?? '')).join(' ').toLowerCase();
      const contact = [
        (r as { contactName?: string }).contactName,
        (r as { contactPhone?: string }).contactPhone,
        (r as { contactEmail?: string }).contactEmail,
        (r as { details?: string }).details,
        (r as { address?: string }).address,
        (r as { informedPerson?: string }).informedPerson,
      ].join(' ').toLowerCase();
      return (blob + ' ' + contact).includes(term);
    }
    return {
      all: rows.filter((r) => predicate(r, 'all')).length,
      open: rows.filter((r) => predicate(r, 'open')).length,
      closed: rows.filter((r) => predicate(r, 'closed')).length,
      archived: rows.filter((r) => predicate(r, 'archived')).length,
    };
  }, [rows, q, filterRows]);

  // -- export CSV -----------------------------------------------------------
  function exportCsv() {
    const headers = COLS.map((c) => c.label);
    const lines = filtered.map((r) => COLS.map((c) => rowValueForExport(r, c.key)));
    const csv = toCSV([headers, ...lines]);
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      `incidents-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  // -- export XLSX ----------------------------------------------------------
  function exportXlsx() {
    const headers = COLS.map((c) => c.label);
    const rowsOut: (string | number)[][] = filtered.map((r) =>
      COLS.map((c) => rowValueForExport(r, c.key)),
    );
    const blob = workbookToXLSX(headers, rowsOut);
    downloadBlob(blob, `incidents-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // -- import CSV (mirrors legacy importCsv / parseCsv) --------------------
  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const grid = parseCSV(String(reader.result ?? ''));
        if (grid.length < 2) return;
        const head = (grid[0] ?? []).map((s) => s.trim());
        const idx = (k: string) => head.findIndex((h) => norm(h) === norm(k));
        const get = (row: string[], key: string) => {
          const i = idx(key);
          return i >= 0 ? (row[i] ?? '').trim() : '';
        };
        const incoming: IncidentRecord[] = [];
        for (let r = 1; r < grid.length; r++) {
          const row = grid[r];
          if (!row || row.every((c) => !c.trim())) continue;
          const id = get(row, 'id') || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
          incoming.push({
            id,
            session: get(row, 'Session') || 'Day',
            name: get(row, 'Name'),
            incidentName: get(row, 'Incident'),
            category: get(row, 'Category'),
            subCategory: get(row, 'Sub-category'),
            zone: get(row, 'Zone'),
            ic: get(row, 'IC'),
            faultTime: get(row, 'Fault') || undefined,
            restorationTime: get(row, 'Restored') || undefined,
            ticketId: get(row, 'TT') || undefined,
            type: get(row, 'Type'),
            rootCause: get(row, 'Root cause'),
            rcaProvider: get(row, 'RCA provider'),
            actionTaken: get(row, 'Action'),
            issueType: get(row, 'Issue type'),
            department: get(row, 'Dept'),
            team: get(row, 'Team'),
            informedPerson: get(row, 'Informed'),
            whatsapp: get(row, 'WhatsApp'),
            mail: get(row, 'Mail'),
            currentStatus: get(row, 'Status') || 'Running',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as IncidentRecord);
        }
        // merge by id
        const map = new Map(rows.map((r) => [r.id, r]));
        for (const inc of incoming) map.set(inc.id, { ...(map.get(inc.id) ?? {}), ...inc });
        setRows(Array.from(map.values()));
      } catch {
        // swallow — toast is emitted by the store on set
      }
    };
    reader.readAsText(file);
  }

  // -- AI: bulk auto-fill (mirrors A.bulkAutoFill) -------------------------
  function bulkAutoFill() {
    const contacts = useContactsLite();
    const next = rows.map((r) => {
      const has = isResolvedRow(r);
      const out: Record<string, unknown> = { ...r };
      if (!out.zone || !out.subCategory || !out.team || !out.issueType) {
        const filled = inferMissing(r, contacts);
        Object.assign(out, filled);
      }
      return out as IncidentRecord;
    });
    setRows(next);
  }

  // -- AI: recheck workbook (mirrors A.recheckWorkbook) ---------------------
  function recheck() {
    const contacts = useContactsLite();
    const next = rows.map((r) => {
      const inf = inferMissing(r, contacts);
      return inf;
    });
    setRows(next);
  }

  // -- add new row (mirrors legacy addNewRow) -------------------------------
  function addNew() {
    const inc = store.add<IncidentRecord>('incidents', {
      session: 'Day',
      name: '',
      incidentName: '',
      category: '',
      subCategory: '',
      zone: '',
      ic: '',
      faultTime: undefined,
      restorationTime: undefined,
      ticketId: undefined,
      type: '',
      rootCause: '',
      rcaProvider: '',
      actionTaken: '',
      issueType: '',
      department: '',
      team: '',
      informedPerson: '',
      whatsapp: '',
      mail: '',
      currentStatus: 'Running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as IncidentRecord);
    setEditId(inc.id);
  }

  return (
    <div>
      {/* ---------- top bar ---------- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, flex: 1 }}>Incident Log</h2>

        <div style={{ position: 'relative' }}>
          <IconSearch size={14} style={{ position: 'absolute', left: 8, top: 11, color: 'var(--muted)' }} />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            style={{ paddingLeft: 28, width: 240 }}
          />
        </div>

        <button
          className={`btn ghost ${filterRows.length ? 'active' : ''}`}
          onClick={() => setShowFilters((v) => !v)}
          title="Multi-condition filter"
          aria-pressed={showFilters}
        >
          <IconFilter size={14} />
          Filters{filterRows.length ? ` (${filterRows.length})` : ''}
        </button>
        <button className="btn ghost" onClick={bulkAutoFill} title="AI bulk auto-fill">
          <IconRefresh size={14} /> AI Auto-fill
        </button>
        <button className="btn ghost" onClick={recheck} title="AI re-check">
          <IconCheck size={14} /> AI Recheck
        </button>
        <button className="btn ghost" onClick={() => fileRef.current?.click()}>
          <IconDownload size={14} style={{ transform: 'rotate(180deg)' }} /> Import CSV
        </button>
        <input
          ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ''; }}
        />
        <div style={{ position: 'relative' }}>
          <button
            className="btn ghost"
            onClick={() => setExportMenuOpen((v) => !v)}
            title="Download filtered data"
            aria-haspopup="menu"
            aria-expanded={exportMenuOpen}
          >
            <IconDownload size={14} /> Export ▾
          </button>
          {exportMenuOpen && (
            <div
              role="menu"
              style={{
                position: 'absolute', right: 0, top: 'calc(100% + 4px)',
                background: 'var(--bg-elev, #fff)', color: 'var(--fg, inherit)',
                border: '1px solid var(--border, rgba(0,0,0,.15))', borderRadius: 6,
                boxShadow: '0 6px 18px rgba(0,0,0,.18)', zIndex: 30, minWidth: 200,
                padding: 4,
              }}
              onMouseLeave={() => setExportMenuOpen(false)}
            >
              <button
                className="btn ghost"
                style={{ width: '100%', justifyContent: 'flex-start', display: 'flex', gap: 8 }}
                onClick={() => { exportCsv(); setExportMenuOpen(false); }}
                title={`Download ${filtered.length} filtered rows as CSV`}
              >
                <IconDownload size={14} /> Download CSV
                <span style={{ marginLeft: 'auto', fontSize: 11, opacity: .7 }}>.csv</span>
              </button>
              <button
                className="btn ghost"
                style={{ width: '100%', justifyContent: 'flex-start', display: 'flex', gap: 8 }}
                onClick={() => { exportXlsx(); setExportMenuOpen(false); }}
                title={`Download ${filtered.length} filtered rows as Excel`}
              >
                <IconDownload size={14} /> Download Excel
                <span style={{ marginLeft: 'auto', fontSize: 11, opacity: .7 }}>.xlsx</span>
              </button>
            </div>
          )}
        </div>
        <button className="btn" onClick={() => { addNew(); }}><IconPlus size={14} /> Add</button>
      </div>

      {/* ---------- multi-condition filter panel ---------- */}
      {showFilters && (
        <div
          className="card"
          style={{
            marginBottom: 10, padding: 12,
            borderStyle: 'dashed',
            background: 'var(--bg-elev, rgba(0,0,0,.02))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <IconFilter size={14} />
            <strong style={{ flex: 1 }}>Filters</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              All conditions are combined with <code>AND</code>
            </span>
            <button className="btn ghost sm" onClick={addFilterRow}>+ Add filter</button>
            <button
              className="btn ghost sm"
              onClick={clearFilterRows}
              disabled={filterRows.length === 0}
            >Clear all</button>
            <button
              className="btn ghost sm"
              onClick={() => setShowFilters(false)}
              title="Close filter panel"
            ><IconX size={12} /></button>
          </div>
          {filterRows.length === 0 ? (
            <div className="muted" style={{ fontSize: 12, padding: '8px 4px' }}>
              No filters yet. Click <strong>+ Add filter</strong> to add a condition
              (e.g. <em>Zone contains Dhaka</em>, <em>Status equals Solved</em>,
              <em> Fault date after 2026-06-01</em>, <em>Duration &gt; 60</em>).
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {filterRows.map((f) => {
                const def = FILTER_FIELDS.find((x) => x.key === f.field) ?? FILTER_FIELDS[0]!;
                const opChoices = opsFor(def.kind);
                const showValue =
                  f.op !== 'isEmpty' && f.op !== 'isNotEmpty';
                const isNumeric = def.kind === 'number';
                const isDate = def.kind === 'date';
                const isBetween = f.op === 'between';
                return (
                  <div
                    key={f.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(160px, 1.1fr) minmax(140px, 1fr) minmax(180px, 1.4fr) minmax(140px, 1fr) auto',
                      gap: 6, alignItems: 'center',
                    }}
                  >
                    <select
                      className="input"
                      value={f.field}
                      onChange={(e) => {
                        const k = e.target.value;
                        const ndef = FILTER_FIELDS.find((x) => x.key === k) ?? FILTER_FIELDS[0]!;
                        updateFilterRow(f.id, {
                          field: k,
                          op: defaultOp(ndef.kind),
                          value: '', value2: undefined,
                          number: undefined, number2: undefined,
                        });
                      }}
                    >
                      {FILTER_FIELDS.map((d) => (
                        <option key={d.key} value={d.key}>{d.label}</option>
                      ))}
                    </select>
                    <select
                      className="input"
                      value={f.op}
                      onChange={(e) => updateFilterRow(f.id, { op: e.target.value as FilterOp })}
                    >
                      {opChoices.map((o) => (
                        <option key={o.op} value={o.op}>{o.label}</option>
                      ))}
                    </select>
                    {showValue ? (
                      isNumeric ? (
                        <input
                          className="input"
                          type="number"
                          step="1"
                          placeholder="e.g. 60"
                          value={Number.isFinite(f.number) ? (f.number as number) : ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? undefined : Number(e.target.value);
                            updateFilterRow(f.id, { number: v });
                          }}
                        />
                      ) : isDate ? (
                        <input
                          className="input"
                          type="date"
                          value={f.value}
                          onChange={(e) => updateFilterRow(f.id, { value: e.target.value })}
                        />
                      ) : (
                        <input
                          className="input"
                          type="text"
                          placeholder="value…"
                          value={f.value}
                          onChange={(e) => updateFilterRow(f.id, { value: e.target.value })}
                        />
                      )
                    ) : (
                      <span className="muted" style={{ fontSize: 12, paddingLeft: 4 }}>
                        (no value needed)
                      </span>
                    )}
                    {isBetween ? (
                      <input
                        className="input"
                        type="date"
                        value={f.value2 ?? ''}
                        onChange={(e) => updateFilterRow(f.id, { value2: e.target.value })}
                      />
                    ) : (
                      <span className="muted" style={{ fontSize: 11, opacity: .5 }}>—</span>
                    )}
                    <button
                      className="btn ghost sm"
                      onClick={() => removeFilterRow(f.id)}
                      title="Remove filter"
                    ><IconX size={12} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---------- filter tabs (mirrors legacy applyFilter) ---------- */}
      <div className="tabs" style={{ marginBottom: 10 }}>
        {([
          ['all', `All (${counts.all})`],
          ['open', `Open (${counts.open})`],
          ['closed', `Closed (${counts.closed})`],
          ['archived', `Archived (${counts.archived})`],
        ] as const).map(([k, label]) => (
          <div
            key={k}
            className={`tab ${filter === k ? 'active' : ''}`}
            onClick={() => setFilter(k)}
          >{label}</div>
        ))}
      </div>

      {/* ---------- master table ---------- */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 240px)' }}>
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 24 }} />
                {COLS.map((c) => (
                  <th key={c.key} style={{ minWidth: c.w }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={COLS.length + 1}><div className="empty">No incidents match.</div></td></tr>
              )}
              {filtered.map((r) => {
                const sc = statusClass(r);
                const dc = statusDotClass(r);
                return (
                  <tr
                    key={r.id}
                    className={`st-row-${sc}`}
                    onClick={() => setEditId(r.id)}
                    style={{ cursor: 'pointer' }}
                    title="Click to edit"
                  >
                    <td><span className={`dot`} style={{ background: `var(--st-${dc}-line, var(--muted))` }} /></td>
                    {COLS.map((c) => {
                      if (c.key === 'duration') {
                        return (
                          <td key={c.key}>{fmtLongDuration(durationBetween(
                            (r as { faultTime?: string }).faultTime,
                            (r as { restorationTime?: string }).restorationTime,
                          ))}</td>
                        );
                      }
                      if (c.key === 'currentStatus') {
                        const v = String((r as Record<string, unknown>)[c.key] ?? '');
                        return (
                          <td key={c.key}>
                            {v ? <span className={`status st-${dc}`}>{v}</span> : '—'}
                          </td>
                        );
                      }
                      const v = (r as Record<string, unknown>)[c.key];
                      return (
                        <td key={c.key}>{v === null || v === undefined || v === '' ? '—' : String(v)}</td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- edit modal ---------- */}
      {editId && (
        <IncidentEditModal
          id={editId}
          rows={rows}
          dd={dd}
          onClose={() => setEditId(null)}
          onSave={(next) => {
            setRows(rows.map((r) => (r.id === next.id ? next : r)));
            setEditId(null);
          }}
          onAddOption={(key, list) => saveDD(setDropdown(dd, key, list))}
        />
      )}

      {addOpen && (
        <AddIncidentModal
          dd={dd}
          onClose={() => setAddOpen(false)}
          onSave={(inc) => { setRows([...rows, inc]); setAddOpen(false); }}
          onAddOption={(key, list) => saveDD(setDropdown(dd, key, list))}
        />
      )}
    </div>
  );
}

// =====================================================================
// Add modal (mirrors legacy openAddModal — minimal entry form)
// =====================================================================
function AddIncidentModal(props: {
  dd: DropdownOptions;
  onClose: () => void;
  onSave: (i: IncidentRecord) => void;
  onAddOption: (key: keyof DropdownOptions, list: string[]) => void;
}) {
  const { dd, onClose, onSave, onAddOption } = props;
  const [f, setF] = useState<Partial<IncidentRecord>>({
    session: 'Day',
    currentStatus: 'Running',
    faultTime: new Date().toISOString(),
  });
  function up<K extends keyof IncidentRecord>(k: K, v: IncidentRecord[K]) { setF((p) => ({ ...p, [k]: v })); }
  function save() {
    if (!f.category && !f.subCategory && !f.incidentName) return;
    const inc = store.add<IncidentRecord>('incidents', {
      id: crypto.randomUUID(),
      session: f.session ?? 'Day',
      name: f.name ?? '',
      incidentName: f.incidentName ?? '',
      category: f.category ?? '',
      subCategory: f.subCategory ?? '',
      zone: f.zone ?? '',
      ic: f.ic ?? '',
      faultTime: f.faultTime,
      restorationTime: f.restorationTime,
      ticketId: f.ticketId,
      type: f.type ?? '',
      rootCause: f.rootCause ?? '',
      rcaProvider: f.rcaProvider ?? '',
      actionTaken: f.actionTaken ?? '',
      issueType: f.issueType ?? '',
      department: f.department ?? '',
      team: f.team ?? '',
      informedPerson: f.informedPerson ?? '',
      whatsapp: f.whatsapp ?? '',
      mail: f.mail ?? '',
      currentStatus: f.currentStatus ?? 'Running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as IncidentRecord);
    onSave(inc);
  }
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ flex: 1, margin: 0 }}>New incident</h3>
          <button className="btn ghost sm" onClick={onClose}><IconX size={12} /></button>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="col-6">
            <label>Session</label>
            <DDInput
              field="session" value={f.session ?? 'Day'} dd={dd}
              onChange={(v) => up('session', v)}
              onAddOption={(l) => onAddOption('session', l)}
            />
          </div>
          <div className="col-6"><label>Name</label>
            <input value={f.name ?? ''} onChange={(e) => up('name', e.target.value)} />
          </div>
          <div className="col-12"><label>Incident</label>
            <input value={f.incidentName ?? ''} onChange={(e) => up('incidentName', e.target.value)} />
          </div>
          <div className="col-6"><label>Category</label>
            <DDInput field="incidentCategory" value={f.category ?? ''} dd={dd}
              onChange={(v) => up('category', v)} onAddOption={(l) => onAddOption('incidentCategory', l)} />
          </div>
          <div className="col-6"><label>Sub-category</label>
            <DDInput field="incidentSubCategory" value={f.subCategory ?? ''} dd={dd}
              onChange={(v) => up('subCategory', v)} onAddOption={(l) => onAddOption('incidentSubCategory', l)} />
          </div>
          <div className="col-6"><label>Zone</label>
            <DDInput field="zone" value={f.zone ?? ''} dd={dd}
              onChange={(v) => up('zone', v)} onAddOption={(l) => onAddOption('zone', l)} />
          </div>
          <div className="col-6"><label>IC</label>
            <input value={f.ic ?? ''} onChange={(e) => up('ic', e.target.value)} />
          </div>
          <div className="col-6"><label>Status</label>
            <DDInput field="currentStatus" value={f.currentStatus ?? 'Running'} dd={dd}
              onChange={(v) => up('currentStatus', v)} onAddOption={(l) => onAddOption('currentStatus', l)} />
          </div>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Edit modal (mirrors legacy openEditModal — full 30+ fields)
// =====================================================================
function IncidentEditModal(props: {
  id: string;
  rows: IncidentRecord[];
  dd: DropdownOptions;
  onClose: () => void;
  onSave: (r: IncidentRecord) => void;
  onAddOption: (key: keyof DropdownOptions, list: string[]) => void;
}) {
  const { id, rows, dd, onClose, onSave, onAddOption } = props;
  const original = rows.find((r) => r.id === id);
  const [f, setF] = useState<Partial<IncidentRecord>>(() => original ?? {});

  useEffect(() => {
    if (original) setF(original);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!original) return null;

  function up<K extends keyof IncidentRecord>(k: K, v: IncidentRecord[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  // Time pickers: date + HH:MM (mirrors legacy time pickers)
  const faultDate = dateFromISO((f as { faultTime?: string }).faultTime);
  const faultTime = hhmmFromISO((f as { faultTime?: string }).faultTime);
  const restDate = dateFromISO((f as { restorationTime?: string }).restorationTime);
  const restTime = hhmmFromISO((f as { restorationTime?: string }).restorationTime);

  function setFault(date: string, time: string) {
    if (!date && !time) { up('faultTime', undefined as unknown as string); return; }
    if (!time) { up('faultTime', new Date(date + 'T00:00:00').toISOString()); return; }
    const d = new Date(date || new Date().toISOString().slice(0, 10) + 'T00:00:00');
    const [hh, mm] = time.split(':').map(Number);
    d.setHours(hh || 0, mm || 0, 0, 0);
    up('faultTime', d.toISOString());
  }
  function setRest(date: string, time: string) {
    if (!date && !time) { up('restorationTime', undefined as unknown as string); return; }
    if (!time) { up('restorationTime', new Date(date + 'T00:00:00').toISOString()); return; }
    const d = new Date(date || new Date().toISOString().slice(0, 10) + 'T00:00:00');
    const [hh, mm] = time.split(':').map(Number);
    d.setHours(hh || 0, mm || 0, 0, 0);
    up('restorationTime', d.toISOString());
  }

  // Live duration (mirrors legacy live duration display)
  const liveDur = durationBetween((f as { faultTime?: string }).faultTime, (f as { restorationTime?: string }).restorationTime);

  function save() {
    if (!original) return;
    const next: IncidentRecord = {
      ...original,
      ...f,
      id: original.id,
      updatedAt: new Date().toISOString(),
    } as IncidentRecord;
    onSave(next);
  }

  const team = String((f as { team?: string }).team ?? '');
  const ownerList = team && FIXED_ENGINEERS[team] ? FIXED_ENGINEERS[team] : ALL_ENGINEERS;

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 720, maxWidth: '95vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ flex: 1, margin: 0 }}>Edit incident <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>#{original.id.slice(-6)}</span></h3>
          <button className="btn ghost sm" onClick={onClose}><IconX size={12} /></button>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          {/* row 1: session / name */}
          <div className="col-3"><label>Session</label>
            <DDInput field="session" value={f.session ?? 'Day'} dd={dd}
              onChange={(v) => up('session', v)} onAddOption={(l) => onAddOption('session', l)} />
          </div>
          <div className="col-9"><label>Name</label>
            <input value={f.name ?? ''} onChange={(e) => up('name', e.target.value)} />
          </div>

          {/* row 2: incident */}
          <div className="col-12"><label>Incident</label>
            <input value={f.incidentName ?? ''} onChange={(e) => up('incidentName', e.target.value)} />
          </div>

          {/* row 3: category / sub / zone */}
          <div className="col-4"><label>Category</label>
            <DDInput field="incidentCategory" value={f.category ?? ''} dd={dd}
              onChange={(v) => up('category', v)} onAddOption={(l) => onAddOption('incidentCategory', l)} />
          </div>
          <div className="col-4"><label>Sub-category</label>
            <DDInput field="incidentSubCategory" value={f.subCategory ?? ''} dd={dd}
              onChange={(v) => up('subCategory', v)} onAddOption={(l) => onAddOption('incidentSubCategory', l)} />
          </div>
          <div className="col-4"><label>Zone</label>
            <DDInput field="zone" value={f.zone ?? ''} dd={dd}
              onChange={(v) => up('zone', v)} onAddOption={(l) => onAddOption('zone', l)} />
          </div>

          {/* row 4: ic / status / type */}
          <div className="col-3"><label>IC</label>
            <input value={f.ic ?? ''} onChange={(e) => up('ic', e.target.value)} />
          </div>
          <div className="col-3"><label>Status</label>
            <DDInput field="currentStatus" value={f.currentStatus ?? 'Running'} dd={dd}
              onChange={(v) => up('currentStatus', v)} onAddOption={(l) => onAddOption('currentStatus', l)} />
          </div>
          <div className="col-3"><label>Type</label>
            <DDInput field="ticketType" value={f.type ?? ''} dd={dd}
              onChange={(v) => up('type', v)} onAddOption={(l) => onAddOption('ticketType', l)} />
          </div>
          <div className="col-3"><label>TT</label>
            <input value={f.ticketId ?? ''} onChange={(e) => up('ticketId', e.target.value)} />
          </div>

          {/* row 5: issue / root cause / rca provider */}
          <div className="col-4"><label>Issue type</label>
            <DDInput field="issueType" value={f.issueType ?? ''} dd={dd}
              onChange={(v) => up('issueType', v)} onAddOption={(l) => onAddOption('issueType', l)} />
          </div>
          <div className="col-4"><label>Root cause</label>
            <input value={f.rootCause ?? ''} onChange={(e) => up('rootCause', e.target.value)} />
          </div>
          <div className="col-4"><label>RCA provider</label>
            <input value={f.rcaProvider ?? ''} onChange={(e) => up('rcaProvider', e.target.value)} />
          </div>

          {/* row 6: dept / team / informed */}
          <div className="col-3"><label>Dept</label>
            <DDInput field="forwardDepartment" value={f.department ?? ''} dd={dd}
              onChange={(v) => up('department', v)} onAddOption={(l) => onAddOption('forwardDepartment', l)} />
          </div>
          <div className="col-3"><label>Team</label>
            <DDInput field="responsibleTeam" value={f.team ?? ''} dd={dd}
              onChange={(v) => up('team', v)} onAddOption={(l) => onAddOption('responsibleTeam', l)} />
          </div>
          <div className="col-3"><label>Informed</label>
            <input value={f.informedPerson ?? ''} onChange={(e) => up('informedPerson', e.target.value)} />
          </div>
          <div className="col-3"><label>WhatsApp</label>
            <DDInput field="whatsappNotified" value={f.whatsapp ?? ''} dd={dd}
              onChange={(v) => up('whatsapp', v)} onAddOption={(l) => onAddOption('whatsappNotified', l)} />
          </div>

          {/* row 7: mail / action taken */}
          <div className="col-3"><label>Mail</label>
            <DDInput field="mailGenerated" value={f.mail ?? ''} dd={dd}
              onChange={(v) => up('mail', v)} onAddOption={(l) => onAddOption('mailGenerated', l)} />
          </div>
          <div className="col-9"><label>Action taken</label>
            <input value={f.actionTaken ?? ''} onChange={(e) => up('actionTaken', e.target.value)} />
          </div>

          {/* row 8: contact fields (mirrors legacy contact line) */}
          <div className="col-4"><label>Contact name</label>
            <input value={(f as { contactName?: string }).contactName ?? ''}
              onChange={(e) => up('contactName' as keyof IncidentRecord, e.target.value as unknown as IncidentRecord[keyof IncidentRecord])} />
          </div>
          <div className="col-3"><label>Phone</label>
            <input value={(f as { contactPhone?: string }).contactPhone ?? ''}
              onChange={(e) => up('contactPhone' as keyof IncidentRecord, e.target.value as unknown as IncidentRecord[keyof IncidentRecord])} />
          </div>
          <div className="col-5"><label>Email</label>
            <input value={(f as { contactEmail?: string }).contactEmail ?? ''}
              onChange={(e) => up('contactEmail' as keyof IncidentRecord, e.target.value as unknown as IncidentRecord[keyof IncidentRecord])} />
          </div>

          {/* row 9: address / details */}
          <div className="col-6"><label>Address</label>
            <input value={(f as { address?: string }).address ?? ''}
              onChange={(e) => up('address' as keyof IncidentRecord, e.target.value as unknown as IncidentRecord[keyof IncidentRecord])} />
          </div>
          <div className="col-6"><label>Details</label>
            <input value={(f as { details?: string }).details ?? ''}
              onChange={(e) => up('details' as keyof IncidentRecord, e.target.value as unknown as IncidentRecord[keyof IncidentRecord])} />
          </div>

          {/* row 10: time pickers (date + HH:MM) */}
          <div className="col-3"><label>Fault date</label>
            <input type="date" value={faultDate} onChange={(e) => setFault(e.target.value, faultTime)} />
          </div>
          <div className="col-3"><label>Fault time</label>
            <select value={faultTime} onChange={(e) => setFault(faultDate, e.target.value)}>
              <option value="">—</option>
              {timeOptions().map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="col-3"><label>Restored date</label>
            <input type="date" value={restDate} onChange={(e) => setRest(e.target.value, restTime)} />
          </div>
          <div className="col-3"><label>Restored time</label>
            <select value={restTime} onChange={(e) => setRest(restDate, e.target.value)}>
              <option value="">—</option>
              {timeOptions().map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* row 11: live duration (mirrors legacy c_duration_display) */}
          <div className="col-12">
            <label>Duration</label>
            <div id="c_duration_display" className="ticket-mono">
              {liveDur ? fmtLongDuration(liveDur) : '—'}
            </div>
          </div>
        </div>

        <div className="actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }} />
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn" onClick={save}>Save</button>
        </div>

        {/* meta */}
        <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          created {fmtDMYHM(original.createdAt)} · updated {fmtDMYHM((f as { updatedAt?: string }).updatedAt ?? original.updatedAt)}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// DDInput — combobox with "Add new…" inline. Mirrors legacy
// dropdownsWithAddNew (DROPDOWN_DEFAULTS union + persist in nmc.* keys).
// =====================================================================
function DDInput(props: {
  field: keyof DropdownOptions;
  value: string;
  dd: DropdownOptions;
  onChange: (v: string) => void;
  onAddOption: (list: string[]) => void;
}) {
  const { field, value, dd, onChange, onAddOption } = props;
  const list = (dd[field] as string[] | undefined) ?? [];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const merged = useMemo(() => {
    const set = new Set<string>(list);
    if (value) set.add(value);
    return Array.from(set);
  }, [list, value]);

  function commit(v: string) {
    onChange(v);
    if (v && !list.includes(v)) onAddOption([...list, v]);
  }
  function addNew() {
    const v = draft.trim();
    if (!v) return;
    if (!list.includes(v)) onAddOption([...list, v]);
    onChange(v);
    setDraft('');
  }

  return (
    <div className="dept-dropdown">
      <div className="trigger" onClick={() => setOpen((o) => !o)}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value || '—'}
        </span>
        <span className="caret">▾</span>
      </div>
      {open && (
        <div className="panel" onMouseLeave={() => setOpen(false)}>
          <input
            autoFocus
            placeholder="type to filter…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (merged.includes(draft)) commit(draft);
                else addNew();
              }
            }}
            style={{ marginBottom: 6 }}
          />
          <div className="count">{merged.length} options</div>
          <div className="sheet-list">
            {merged
              .filter((m) => !draft || m.toLowerCase().includes(draft.toLowerCase()))
              .map((m) => (
                <div
                  key={m}
                  className={`item ${m === value ? 'selected' : ''}`}
                  onClick={() => { commit(m); setOpen(false); }}
                >{m}</div>
              ))}
            {draft && !merged.some((m) => m.toLowerCase() === draft.toLowerCase()) && (
              <div className="item" style={{ color: 'var(--primary)' }} onClick={addNew}>
                + Add “{draft}”
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- contact lookup (lightweight, no legacy dep) -------------------
function useContactsLite(): ContactLite[] {
  try {
    const raw = localStorage.getItem('nmc.contacts');
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((c: Record<string, unknown>) => ({
      name: String(c.name ?? c.fullName ?? ''),
      phone: String(c.phone ?? c.contact ?? ''),
      email: String(c.email ?? ''),
      designation: String(c.designation ?? c.role ?? ''),
    })).filter((c) => c.name);
  } catch { return []; }
}

// re-export zone list for any future inline use
export { ZONE_LIST };
