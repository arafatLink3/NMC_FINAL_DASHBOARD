// Roster — 3 shifts × departments + "who is on duty now" widget +
//           six department parsers (BTS / NGNC / NMC / BNOC / S&T / NCSS)
//           paste-CSV uploader.

import { useEffect, useMemo, useState } from 'react';
import {
  engineerAt,
  NMCRosterParsers,
  parseRosterDate,
  type RosterOpts,
  type ParsedRosterRow,
} from '@nmc/ai';
import { useCollection } from '../lib/store';
import { useApi } from '../lib/api';
import { useNotif } from '../lib/notif';
import { bus } from '../lib/bus';
import type { RosterRecord } from '@nmc/api-client';

// Canonical six departments used by the design.html blueprint sidebar/header.
const DEPARTMENTS = [
  { key: 'all',   label: 'All departments' },
  { key: 'NMC',   label: 'NMC' },
  { key: 'BNOC',  label: 'BNOC' },
  { key: 'NGNC',  label: 'NGNC' },
  { key: 'NCSS',  label: 'NCSS' },
  { key: 'S&T',   label: 'S&T' },
  { key: 'BTS & Power', label: 'Survey & Transmission (BTS & Power)' },
];

const PARSER_CHOICES: { key: keyof typeof NMCRosterParsers; label: string; hint: string }[] = [
  { key: 'parseBTS',  label: 'BTS & Power (weekday grid)',         hint: 'Row 0 = Time Slot + Sun..Sat columns' },
  { key: 'parseNGNC', label: 'NGNC (employee × day-of-month)',     hint: 'Codes: M / EE / E / LE / N / GEN' },
  { key: 'parseNMC',  label: 'NMC (date × shift, fixed positions)', hint: 'Cols 1..17 = Gen/Morn/Eve/Night/Wknd/Leave' },
  { key: 'parseBNOC', label: 'BNOC (5 shift-groups × 5 names)',     hint: 'Cols 1..5, 10..14, 16..17, 18..22, 23..28' },
  { key: 'parseSNT',  label: 'S&T (column-header shifts)',          hint: 'Cols 1..4 = Morning/Evening/Weekend/Leave' },
  { key: 'parseNCSS', label: 'NCSS (multi-site wide calendar)',     hint: 'Row 0=area, row 1=time-slot, cols 2..142' },
];

export function RosterPage() {
  const [rows, setRows] = useCollection<RosterRecord>('roster');
  const [dept, setDept] = useState<string>('all');
  const [now, setNow] = useState(new Date());
  const [paste, setPaste] = useState('');
  const [parserKey, setParserKey] = useState<keyof typeof NMCRosterParsers>('parseNMC');
  const [filename, setFilename] = useState('June-2026.csv');
  const [preview, setPreview] = useState<ParsedRosterRow[]>([]);
  const api = useApi();
  const notif = useNotif();

  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);

  const depts = useMemo(
    () => Array.from(new Set(rows.map((r) => r.dept ?? 'General'))),
    [rows],
  );
  const filtered = rows.filter((r) => (dept === 'all' ? true : (r.dept ?? 'General') === dept));

  const onDuty = useMemo(() => {
    const out: { dept: string; shift: string; engineers: string[]; collision: boolean }[] = [];
    for (const r of rows) {
      const engineers = (Array.isArray((r as unknown as { engineers?: unknown[] }).engineers)
        ? ((r as unknown as { engineers: unknown[] }).engineers)
        : []
      )
        .map((x) => (typeof x === 'string' ? { name: x } : (x as { name?: string }) || { name: '' }))
        .map((x) => x.name ?? '')
        .filter(Boolean);
      const entry = {
        date: r.date ?? '',
        dept: r.dept ?? 'General',
        shift: r.shift ?? 'Morning',
        engineers: engineers.map((n) => ({ name: n })),
      };
      const e = engineerAt(now, [entry]);
      if (e) out.push({
        dept: r.dept ?? 'General',
        shift: e.shift,
        engineers: e.engineers.map((x) => x.name),
        collision: e.collision,
      });
    }
    return out;
  }, [rows, now]);

  function csvToRows(text: string): string[][] {
    return text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        // Minimal CSV split that keeps quoted commas intact.
        const out: string[] = [];
        let cur = '';
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') { inQuote = !inQuote; continue; }
          if (ch === ',' && !inQuote) { out.push(cur); cur = ''; continue; }
          cur += ch;
        }
        out.push(cur);
        return out.map((c) => c.trim());
      });
  }

  function runParser() {
    if (!paste.trim()) {
      notif.push('Paste a CSV (or part of a sheet) first.', 'warn');
      return;
    }
    const sheet = csvToRows(paste);
    const opts: RosterOpts = { filename, batchId: crypto.randomUUID() };
    const fn = NMCRosterParsers[parserKey] as (rows: string[][], opts: RosterOpts) => ParsedRosterRow[];
    try {
      const parsed = fn(sheet, opts);
      setPreview(parsed);
      notif.push(`Parsed ${parsed.length} roster rows.`, 'info');
    } catch (err) {
      notif.push(`Parser failed: ${(err as Error).message}`, 'danger');
    }
  }

  async function commitPreview() {
    if (preview.length === 0) return;
    const next = [...rows];
    for (const p of preview) {
      const id = `rs-${p.date}-${p.department}-${p.shift}-${p.engineers.join(',')}`.replace(/\s+/g, '_');
      const engineers = p.engineers.map((name) => ({ name }));
      const lead = p.engineers[0] ?? p.department;
      next.push({
        id,
        name: lead,
        shift: p.shift,
        start: p.date,
        end: p.date,
        date: p.date,
        dept: p.department,
        team: p.department,
        group: p.department,
        engineers,
        source: p.source,
        batchId: p.batchId,
        notes: p.notes,
      } as unknown as RosterRecord);
    }
    setRows(next);
    // Also push to the server (best-effort — silent if endpoint missing).
    try {
      await fetch('/api/roster/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows: preview }),
      });
    } catch {
      // local-only mirror is fine
    }
    bus.emit('notify', { id: crypto.randomUUID(), text: `Saved ${preview.length} roster rows.`, type: 'success', createdAt: new Date().toISOString() });
    setPreview([]);
    setPaste('');
  }

  return (
    <div>
      <h2 style={{ margin: '4px 0 12px' }}>Duty Roster</h2>

      {/* On duty now */}
      <div className="card">
        <h3>On duty now</h3>
        {onDuty.length === 0 && <div className="empty">No active shifts.</div>}
        {onDuty.map((o, i) => (
          <div key={i} className="reminder" style={{ borderLeftColor: o.collision ? 'var(--danger)' : 'var(--primary)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="tag b">{o.dept}</span>
              <span className="tag p">{o.shift}</span>
              <span style={{ flex: 1 }}>{o.engineers.join(', ')}</span>
              {o.collision && <span className="tag r">collision 14–16</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Parser uploader */}
      <div className="card">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, flex: 1 }}>Import roster</h3>
          <select value={parserKey} onChange={(e) => setParserKey(e.target.value as keyof typeof NMCRosterParsers)}>
            {PARSER_CHOICES.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="filename (used to sniff month)"
            style={{ minWidth: 200 }}
          />
          <button className="btn primary sm" onClick={runParser}>Parse</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
          {PARSER_CHOICES.find((p) => p.key === parserKey)?.hint}
        </div>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="Paste CSV rows here (first line = header)…"
          rows={6}
          style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
        />
        {preview.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <strong>{preview.length}</strong>
              <span style={{ color: 'var(--muted)' }}>rows parsed. Review below, then commit.</span>
              <button className="btn success sm" onClick={commitPreview}>Save all</button>
              <button className="btn ghost sm" onClick={() => setPreview([])}>Discard</button>
            </div>
            <div className="table-wrap" style={{ maxHeight: 220, overflow: 'auto' }}>
              <table className="data">
                <thead><tr><th>Date</th><th>Dept</th><th>Shift</th><th>Engineers</th></tr></thead>
                <tbody>
                  {preview.map((p, i) => (
                    <tr key={i}>
                      <td>{p.date}</td>
                      <td>{p.department}</td>
                      <td>{p.shift}</td>
                      <td>{p.engineers.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Filtered table */}
      <div className="card">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, flex: 1 }}>All entries</h3>
          <select value={dept} onChange={(e) => setDept(e.target.value)}>
            {DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            {depts.filter((d) => !DEPARTMENTS.some((c) => c.key === d)).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Dept</th><th>Shift</th><th>Engineers</th></tr></thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={4}><div className="empty">No roster entries.</div></td></tr>
              )}
              {filtered.map((r, i) => (
                <tr key={r.id ?? i}>
                  <td>{r.date}</td>
                  <td>{r.dept ?? 'General'}</td>
                  <td>{r.shift}</td>
                  <td>{(r.engineers ?? []).map((e) => (typeof e === 'string' ? e : e.name)).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Suppress unused-import warning for the symbol retained for callers that
// want to reuse the same date-format heuristic as the parsers.
void parseRosterDate;
// `api` is reserved for future server-side sync; keep the hook invocation alive.
void useApi;
