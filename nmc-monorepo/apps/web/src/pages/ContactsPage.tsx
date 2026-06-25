// Contacts — global contact DB.
// Direct port of the legacy `NMC Dashboard/js/pages/contacts.js` (global
// department tree, Google-Sheet CSV sync, AI search + reinforcement, edit
// modal, sheet-meta footer line) onto React + the existing store/AI/bus.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useCollection } from '../lib/store';
import { suggestContact, learnContact } from '@nmc/ai';
import { IconSearch, IconPlus, IconCheck, IconTrash, IconX, IconDownload } from '../lib/icons';
import { bus } from '../lib/bus';
import type { ContactRecord } from '@nmc/api-client';

// ---------------------------------------------------------------------------
// Google Sheet — Master Directory tab (gid=1311561267). Same source as the
// standalone contact.html; only the specific sheet tab is targeted via &gid=
// Sheet columns: Department, Name, Designation, Phone Number, Escalation, ID, Area, IP Phone
// ---------------------------------------------------------------------------
const SHEET_ID = '1_G63SYdudf3tiA_TzY5dtJD6oOkWWK8_lgg39D_tqjU';
const SHEET_GID = '1311561267';
const SHEET_CSV = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

// ---------------------------------------------------------------------------
// Department tree — collapsible list with sub-departments. Key values are the
// canonical dept values stored on a contact.
// ---------------------------------------------------------------------------
type DeptNode = { key: string; label: string; children?: DeptNode[] };

const DEPT_TREE: DeptNode[] = [
  { key: 'NMC',   label: 'NMC' },
  { key: 'NGNC',  label: 'NGNC' },
  { key: 'BNOC',  label: 'BNOC' },
  { key: 'S&T',   label: 'S&T' },
  { key: 'BTS & Power', label: 'Power' },
  {
    key: 'NCSS', label: 'NCSS', children: [
      { key: 'NCSS - Dhaka',        label: 'Zonal - Dhaka' },
      { key: 'NCSS - Dhaka Outer',  label: 'Zonal - Dhaka Outer' },
      { key: 'NCSS - CTG',          label: 'Zonal - CTG' },
      { key: 'NCSS - North',        label: 'Zonal - North' },
      { key: 'NCSS - Sylhet',       label: 'Zonal - Sylhet' },
      { key: 'NCSS - Khulna',       label: 'Zonal - Khulna' },
    ],
  },
  {
    key: 'Others', label: 'Others', children: [
      { key: 'Telco/NTTN',   label: 'Telco/NTTN' },
      { key: 'MIS',          label: 'MIS' },
      { key: 'I&I',          label: 'I&I' },
      { key: 'BSCCL',        label: 'BSCCL' },
      { key: 'Velocity IIG', label: 'Velocity IIG' },
      { key: 'Solarwinds',   label: 'Solarwinds' },
      { key: 'Helpdesk',     label: 'Helpdesk' },
      { key: 'IT',           label: 'IT' },
      { key: 'Web',          label: 'Web' },
      { key: 'HR',           label: 'HR' },
      { key: 'TISD',         label: 'TISD' },
      { key: 'SAT',          label: 'SAT' },
      { key: 'Store',        label: 'Store' },
      { key: 'Others',       label: 'Others' },
    ],
  },
];

// Flat list of every recognized department key (for dropdowns / iteration)
const DEPTS: string[] = (function flatten(nodes: DeptNode[], out: string[]): string[] {
  for (const n of nodes) { out.push(n.key); if (n.children) flatten(n.children, out); }
  return out;
})(DEPT_TREE, []);

// Map a contact's stored dept to a tree-node key (for filtering and counts).
function nodeKeyOf(dept: string | undefined | null): string {
  if (!dept) return '';
  const low = String(dept).trim().toLowerCase();
  const direct: Record<string, string> = {
    'nmc': 'NMC', 'ngnc': 'NGNC', 'bnoc': 'BNOC',
    's&t': 'S&T', 's & t': 'S&T', 'survey & transmission': 'S&T', 'survey and transmission': 'S&T',
    'bts & power': 'BTS & Power', 'bts and power': 'BTS & Power',
    'bts & power infrastructure': 'BTS & Power', 'bts and power infrastructure': 'BTS & Power',
  };
  if (direct[low]) return direct[low];
  if (low.startsWith('ncss')) {
    if (low.includes('dhaka outer') || low.includes('outer dhaka')) return 'NCSS - Dhaka Outer';
    if (low.includes('dhaka'))   return 'NCSS - Dhaka';
    if (low.includes('ctg') || low.includes('chittagong')) return 'NCSS - CTG';
    if (low.includes('north'))  return 'NCSS - North';
    if (low.includes('sylhet')) return 'NCSS - Sylhet';
    if (low.includes('khulna')) return 'NCSS - Khulna';
    return 'NCSS';
  }
  if (low.startsWith('telco') || low.startsWith('nttn') || low === 'iptsb' || low.includes('iptsb')) return 'Telco/NTTN';
  if (low === 'mis')                                       return 'MIS';
  if (low === 'i&i' || low === 'i & i')                    return 'I&I';
  if (low === 'bsccl' || low === 'bsscl')                  return 'BSCCL';
  if (low.includes('velocity') || low.includes('iig'))     return 'Velocity IIG';
  if (low.includes('solar') || low.includes('solarwinds')) return 'Solarwinds';
  if (low.includes('help'))                                return 'Helpdesk';
  if (low === 'it')                                        return 'IT';
  if (low === 'web')                                       return 'Web';
  if (low === 'hr')                                        return 'HR';
  if (low === 'tisd')                                      return 'TISD';
  if (low === 'sat')                                       return 'SAT';
  if (low === 'store')                                     return 'Store';
  return 'Others';
}

// Normalize a free-form department string to a canonical key (used when
// saving to the store). Falls back to the original input if nothing matched.
function normalizeDept(s: string | undefined | null): string {
  if (!s) return '';
  const k = nodeKeyOf(s);
  return k || String(s);
}

// Recursively gather every leaf key (no children) for a node key.
function leafKeysFor(nodeKey: string): string[] {
  function find(nodes: DeptNode[]): string[] | null {
    for (const n of nodes) {
      if (n.key === nodeKey) {
        if (n.children) return n.children.map((c) => c.key);
        return [n.key];
      }
      if (n.children) {
        const r = find(n.children);
        if (r) return r;
      }
    }
    return null;
  }
  return find(DEPT_TREE) ?? [nodeKey];
}

// ---------------------------------------------------------------------------
// CSV — simple parser that handles quoted fields with embedded commas.
// ---------------------------------------------------------------------------
type SheetRow = Record<string, string>;

function parseCSV(text: string): SheetRow[] {
  const rows: string[][] = [];
  let cur: string[] = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        cur.push(field); field = '';
        if (cur.length > 1 || cur[0] !== '') rows.push(cur);
        cur = [];
      } else field += c;
    }
  }
  if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
  if (!rows.length) return [];
  const header = (rows[0] ?? []).map((h: string) => h.trim());
  return rows.slice(1)
    .filter((r) => r.some((v) => v && v.trim() !== ''))
    .map((r) => {
      const o: SheetRow = {};
      header.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
      return o;
    });
}

// Map a sheet row to the contact shape used in the app.
function rowToContact(r: SheetRow): ContactRecord {
  const rawDept = (r['Department'] || r['department'] || '').trim();
  const dept = normalizeDept(rawDept);
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: r['Name'] || '',
    role: r['Designation'] || r['Role'] || '',
    organization: r['Area'] || r['Organization'] || '',
    zone: r['Area'] || r['Zone'] || '',
    dept,
    rawDept,
    phone: r['Phone Number'] || r['Phone'] || '',
    email: r['Escalation'] || r['Email'] || '',
    ipPhone: r['IP Phone'] || '',
    id_val: r['ID'] || '',
    source: 'sheet',
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Sheet meta — stored alongside the contacts so the page can show "Sheet:
// loaded-at (count)" like the legacy footer.
// ---------------------------------------------------------------------------
type SheetMeta = { time: string; count: number };

function readSheetMeta(): SheetMeta | null {
  try {
    const raw = localStorage.getItem('nmc.contacts_sheet_meta');
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (o && typeof o.time === 'string' && typeof o.count === 'number') return o as SheetMeta;
    return null;
  } catch { return null; }
}

function writeSheetMeta(m: SheetMeta) {
  try { localStorage.setItem('nmc.contacts_sheet_meta', JSON.stringify(m)); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function ContactsPage() {
  const [rows, setRows] = useCollection<ContactRecord>('contacts');
  const [learnMap, setLearnMap] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('nmc.contactLearn') || '{}'); } catch { return {}; }
  });

  // Mirror legacy `render._activeDept` / `render._open` / `render._expanded`
  // (closure-scoped UI state) into a React ref so re-renders don't reset it.
  const uiRef = useRef<{ activeDept: string; open: boolean; expanded: Record<string, boolean> }>({
    activeDept: 'ALL', open: false, expanded: {},
  });
  const [uiTick, setUiTick] = useState(0); // bump to force re-render after UI changes
  const rerender = () => setUiTick((t) => t + 1);

  const [q, setQ] = useState('');
  const [meta, setMeta] = useState<SheetMeta | null>(() => readSheetMeta());
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [editing, setEditing] = useState<ContactRecord | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  // Mirror learn map to localStorage (legacy parity).
  useEffect(() => {
    try { localStorage.setItem('nmc.contactLearn', JSON.stringify(learnMap)); } catch { /* ignore */ }
  }, [learnMap]);

  // Active department node label (drives the dropdown trigger text).
  const activeLabel = useMemo(() => {
    const k = uiRef.current.activeDept;
    if (k === 'ALL') return 'All Departments';
    for (const n of DEPT_TREE) {
      if (n.key === k) return n.label;
      if (n.children) {
        const c = n.children.find((x) => x.key === k);
        if (c) return n.label + ' › ' + c.label;
      }
    }
    return k;
  }, [uiTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter + AI search — mirrors legacy `refresh()`.
  const filtered = useMemo(() => {
    const dept = uiRef.current.activeDept;
    let out: ContactRecord[] = rows;
    if (dept !== 'ALL') {
      const node = DEPT_TREE.find((n) => n.key === dept);
      if (node) {
        const keys = leafKeysFor(dept);
        out = out.filter((c) => keys.includes(c.dept || '') || (c.dept || '') === dept);
      } else {
        out = out.filter((c) => (c.dept || '') === dept);
      }
    }
    if (q.trim()) {
      out = suggestContact(q, out, Math.max(10, out.length), learnMap);
    }
    return out;
  }, [rows, q, learnMap, uiTick]); // eslint-disable-line react-hooks/exhaustive-deps

  function reinforce(id: string) {
    const next = learnContact(learnMap, q, id);
    setLearnMap(next);
    bus.emit('notify', {
      id: crypto.randomUUID(), text: 'AI learned this match', type: 'success',
      createdAt: new Date().toISOString(),
    });
  }

  // --- Department picker helpers -----------------------------------------
  function pickDept(key: string) {
    uiRef.current.activeDept = key;
    uiRef.current.open = false;
    rerender();
  }
  function toggleDept(key: string) {
    const cur = uiRef.current.expanded[key] ? false : true;
    uiRef.current.expanded[key] = cur;
    rerender();
  }

  async function loadSheet() {
    if (loadingSheet) return;
    setLoadingSheet(true);
    bus.emit('notify', {
      id: crypto.randomUUID(), text: 'Loading contacts from Google Sheet…', type: 'info',
      createdAt: new Date().toISOString(),
    });
    try {
      const res = await fetch(SHEET_CSV, { redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const sheetRows = parseCSV(text);
      if (!sheetRows.length) {
        bus.emit('notify', {
          id: crypto.randomUUID(), text: 'Sheet is empty', type: 'warn',
          createdAt: new Date().toISOString(),
        });
        return;
      }
      const newOnes = sheetRows.map(rowToContact);
      // Replace existing sheet-sourced contacts to keep things in sync.
      const manual = rows.filter((c) => c.source !== 'sheet');
      const merged: ContactRecord[] = [...manual, ...newOnes];
      setRows(merged);
      const m: SheetMeta = { time: new Date().toISOString(), count: newOnes.length };
      writeSheetMeta(m);
      setMeta(m);
      bus.emit('notify', {
        id: crypto.randomUUID(), text: `Loaded ${newOnes.length} contacts from sheet`,
        type: 'success', createdAt: new Date().toISOString(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      bus.emit('notify', {
        id: crypto.randomUUID(), text: 'Failed to load sheet: ' + msg, type: 'danger',
        createdAt: new Date().toISOString(),
      });
    } finally {
      setLoadingSheet(false);
    }
  }

  function saveContact(patch: Partial<ContactRecord> & { name: string }, id?: string) {
    const now = new Date().toISOString();
    if (id) {
      setRows(rows.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: now } : c)));
    } else {
      const c: ContactRecord = {
        id: crypto.randomUUID(),
        source: 'manual',
        createdAt: now, updatedAt: now,
        dept: 'NMC',
        ...patch,
      };
      setRows([c, ...rows]);
    }
    bus.emit('notify', {
      id: crypto.randomUUID(), text: 'Saved', type: 'success',
      createdAt: new Date().toISOString(),
    });
  }

  function deleteContact(id: string) {
    setRows(rows.filter((c) => c.id !== id));
    bus.emit('notify', {
      id: crypto.randomUUID(), text: 'Deleted', type: 'success',
      createdAt: new Date().toISOString(),
    });
  }

  function exportCsv() {
    const headers = ['Department', 'Name', 'Designation', 'Phone Number', 'Escalation', 'ID', 'Area', 'IP Phone'];
    const lines = [headers.join(',')];
    for (const c of rows) {
      const row = [
        c.rawDept || c.dept || '',
        c.name || '',
        c.role || '',
        c.phone || '',
        c.email || '',
        c.id_val || '',
        c.organization || c.zone || '',
        c.ipPhone || '',
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(row.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Render ------------------------------------------------------------
  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <h3 style={{ marginRight: 'auto' }}>Contacts</h3>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, role, vendor…"
            style={{ maxWidth: 260 }}
          />
          <button className="btn primary" onClick={() => { /* live filter via q */ }}>
            <IconSearch size={14} /> Search
          </button>
          <button className="btn ghost" onClick={loadSheet} disabled={loadingSheet}>
            📋 {loadingSheet ? 'Loading…' : 'Load Sheet'}
          </button>
          <button className="btn success" onClick={() => setAddingNew(true)}>
            <IconPlus size={14} /> Add
          </button>
          <button className="btn ghost" onClick={exportCsv} title="Export CSV">
            <IconDownload size={14} />
          </button>
        </div>

        <div className="muted" style={{ marginTop: 6 }}>
          {rows.length} contacts · {Object.keys(learnMap).length} learned mappings
          {meta && ` · Sheet: ${new Date(meta.time).toLocaleString()} (${meta.count})`}
        </div>

        {/* Department dropdown — collapsible tree, click OR hover open */}
        <DeptDropdown
          activeDept={uiRef.current.activeDept}
          open={uiRef.current.open}
          expanded={uiRef.current.expanded}
          counts={countByDept(rows)}
          onPick={pickDept}
          onToggle={toggleDept}
          onOpenChange={(o) => { uiRef.current.open = o; rerender(); }}
        />

        <div className="table-wrap" style={{ marginTop: 12, maxHeight: 560, overflow: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Department</th><th>Name</th><th>Designation</th>
                <th>Phone Number</th><th>Escalation</th><th>ID</th>
                <th>Area</th><th>IP Phone</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                    No contacts
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setEditing(c)}>
                  <td><span className="tag">{c.dept || 'NMC'}</span></td>
                  <td><b>{c.name || ''}</b></td>
                  <td>{c.role || ''}</td>
                  <td>{c.phone || ''}</td>
                  <td>{c.email || ''}</td>
                  <td>{(c.id_val as string) || ''}</td>
                  <td>{(c.organization as string) || (c.zone as string) || ''}</td>
                  <td>{(c.ipPhone as string) || ''}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {q.trim() && (
                      <button className="btn ghost sm" onClick={() => reinforce(c.id)} title="Reinforce AI match">
                        👍
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(editing || addingNew) && (
        <ContactEditModal
          contact={editing ?? blankContact()}
          onClose={() => { setEditing(null); setAddingNew(false); }}
          onSave={(patch) => {
            const id = editing?.id;
            saveContact(patch as Partial<ContactRecord> & { name: string }, id);
            setEditing(null); setAddingNew(false);
          }}
          onDelete={editing ? () => { deleteContact(editing.id); setEditing(null); } : undefined}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function blankContact(): ContactRecord {
  const now = new Date().toISOString();
  return {
    id: '', name: '', role: '', dept: 'NMC', organization: '', zone: '',
    phone: '', email: '', ipPhone: '', id_val: '', source: 'manual',
    createdAt: now, updatedAt: now,
  };
}

function countByDept(rows: ContactRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of rows) {
    const k = c.dept || '';
    if (!k) continue;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Department dropdown
// ---------------------------------------------------------------------------
function DeptDropdown(props: {
  activeDept: string;
  open: boolean;
  expanded: Record<string, boolean>;
  counts: Record<string, number>;
  onPick: (k: string) => void;
  onToggle: (k: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { activeDept, open, expanded, counts, onPick, onToggle, onOpenChange } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hoverTimer = useRef<number | null>(null);

  // Outside-click closes
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) onOpenChange(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onOpenChange(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  function openDrop() {
    if (hoverTimer.current) { window.clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    onOpenChange(true);
  }
  function closeDrop() {
    onOpenChange(false);
  }
  function onTriggerClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) closeDrop(); else openDrop();
  }
  function onTriggerEnter() {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => onOpenChange(true), 120);
  }
  function onWrapLeave() {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => onOpenChange(false), 180);
  }

  function renderNode(n: DeptNode, depth: number, isRoot = false): React.ReactNode {
    const hasKids = !!(n.children && n.children.length);
    const isExpanded = !!expanded[n.key];
    const isActive = activeDept === n.key;
    const count = counts[n.key] ?? 0;
    return (
      <li key={n.key} className={`dept-node${isActive ? ' active' : ''}`} data-key={n.key}>
        <div
          className={`dept-row depth-${depth}`}
          data-key={n.key}
          onClick={() => onPick(n.key)}
        >
          {hasKids ? (
            <span
              className={`dept-caret${isExpanded ? ' open' : ''}`}
              onClick={(e) => { e.stopPropagation(); onToggle(n.key); }}
            >▸</span>
          ) : (
            <span className="dept-caret leaf">·</span>
          )}
          <span className="dept-label">{n.label}</span>
          <span className="dept-count">{count}</span>
        </div>
        {hasKids && (
          <ul className={`dept-children${isExpanded ? ' open' : ''}`}>
            {n.children!.map((c) => renderNode(c, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={`dept-dropdown${open ? ' open' : ''}`}
      style={{ marginTop: 12 }}
      onMouseEnter={() => { if (hoverTimer.current) window.clearTimeout(hoverTimer.current); }}
      onMouseLeave={onWrapLeave}
    >
      <button
        type="button"
        className="dept-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={onTriggerClick}
        onMouseEnter={onTriggerEnter}
      >
        <span className="dept-trigger-label">
          <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Department:
          </span>
          <b>{activeDept === 'ALL' ? 'All Departments' : activeLabelFor(activeDept)}</b>
        </span>
        <span className="dept-trigger-caret">▾</span>
      </button>
      <div className="dept-panel" role="menu">
        <ul className="dept-root">
          <li className={`dept-node${activeDept === 'ALL' ? ' active' : ''}`} data-key="ALL">
            <div className="dept-row depth-0" data-key="ALL" onClick={() => onPick('ALL')}>
              <span className="dept-caret leaf">·</span>
              <span className="dept-label">All Departments</span>
              <span className="dept-count">{Object.values(counts).reduce((a, b) => a + b, 0)}</span>
            </div>
          </li>
          {DEPT_TREE.map((n) => renderNode(n, 0, true))}
        </ul>
      </div>
    </div>
  );
}

function activeLabelFor(k: string): string {
  for (const n of DEPT_TREE) {
    if (n.key === k) return n.label;
    if (n.children) {
      const c = n.children.find((x) => x.key === k);
      if (c) return n.label + ' › ' + c.label;
    }
  }
  return k;
}

// ---------------------------------------------------------------------------
// Edit / New modal — same fields as the legacy `edit()`.
// ---------------------------------------------------------------------------
function ContactEditModal(props: {
  contact: ContactRecord;
  onClose: () => void;
  onSave: (patch: Partial<ContactRecord> & { name: string }) => void;
  onDelete?: () => void;
}) {
  const { contact, onClose, onSave, onDelete } = props;
  const [form, setForm] = useState<ContactRecord>(contact);

  // Keep form in sync if the parent swaps the contact while open.
  useEffect(() => { setForm(contact); }, [contact]);

  function field<K extends keyof ContactRecord>(k: K, v: ContactRecord[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{contact.id ? 'Edit' : 'New'} Contact</h3>
        <div className="row">
          <div className="col-6">
            <label>Name</label>
            <input value={form.name ?? ''} onChange={(e) => field('name', e.target.value)} />
          </div>
          <div className="col-6">
            <label>Designation</label>
            <input value={form.role ?? ''} onChange={(e) => field('role', e.target.value)} />
          </div>
          <div className="col-6">
            <label>Department</label>
            <select
              value={form.dept ?? 'NMC'}
              onChange={(e) => { field('dept', e.target.value); field('rawDept', e.target.value); }}
            >
              {DEPTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="col-6">
            <label>Area / Zone</label>
            <input
              value={(form.zone ?? form.organization ?? '') as string}
              onChange={(e) => {
                field('zone', e.target.value);
                field('organization', e.target.value);
              }}
            />
          </div>
          <div className="col-6">
            <label>Phone</label>
            <input value={form.phone ?? ''} onChange={(e) => field('phone', e.target.value)} />
          </div>
          <div className="col-6">
            <label>IP Phone</label>
            <input value={(form.ipPhone ?? '') as string} onChange={(e) => field('ipPhone', e.target.value)} />
          </div>
          <div className="col-12">
            <label>Email / Escalation</label>
            <input value={form.email ?? ''} onChange={(e) => field('email', e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="btn ghost" onClick={onClose}>
            <IconX size={14} /> Cancel
          </button>
          {onDelete && (
            <button className="btn danger" onClick={onDelete}>
              <IconTrash size={14} /> Delete
            </button>
          )}
          <button
            className="btn success"
            disabled={!form.name?.trim()}
            onClick={() => {
              const name = (form.name || '').trim();
              if (!name) return;
              const dept = normalizeDept(form.dept);
              onSave({
                name,
                role: form.role || '',
                dept,
                rawDept: form.rawDept || form.dept || '',
                organization: form.zone || form.organization || '',
                zone: form.zone || '',
                phone: form.phone || '',
                ipPhone: form.ipPhone || '',
                email: form.email || '',
                id_val: form.id_val || '',
                source: contact.id ? (form.source || 'manual') : 'manual',
              });
            }}
          >
            <IconCheck size={14} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
