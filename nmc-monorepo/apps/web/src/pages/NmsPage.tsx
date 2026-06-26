// NMS Quick Links — port of NMC Dashboard/js/pages/nms.js.
// URLs are NEVER written to the DOM. The list of link metadata (id,
// name, category, desc) is rendered, and the actual href is resolved
// at click-time from a runtime Map built during config load. Cards
// use href="javascript:void(0)" (same trick the legacy page used).

import { useEffect, useMemo, useRef, useState } from 'react';
import { IconSearch } from '../lib/icons';

// Network endpoints — try the API first, fall back to the static bundle.
const CONFIG_URL = (typeof window !== 'undefined'
  && (window as unknown as { NMC_NMS_LINKS_URL?: string }).NMC_NMS_LINKS_URL)
  || '/api/nms';
const FALLBACK_URL = '/data/nms-links.json';

// The API returns the generic CRUD shape: { rows: [...], total }.
// Each row's free-form payload lives in row.data (jsonb) and contains
// the legacy fields { id, name, url, category, desc }.
type ApiRow = { id: number; data: LegacyNmsLinkMeta };
type ApiList = { rows: ApiRow[]; total: number };

type LegacyNmsLinkMeta = {
  id: string;
  name: string;
  url: string;
  category: string;
  desc: string;
};

const FALLBACK_LINKS: LegacyNmsLinkMeta[] = [
  { id: 'whatsupgold', name: 'WhatsUpGold', url: 'http://10.20.20.243/NmConsole/?g=(73bbd44a-69ad-48ab-acbe-83c0f6ddc0f0)', category: 'NMS', desc: 'Network monitoring dashboard' },
  { id: 'zabbix', name: 'Zabbix', url: 'http://10.20.20.36/zabbix/', category: 'NMS', desc: 'Network monitoring & alerting' },
  { id: 'cacti', name: 'Cacti', url: 'http://10.20.20.91/cacti/', category: 'NMS', desc: 'Network graphing (Poller)' },
  { id: 'corero', name: 'Corero', url: 'https://cloud.corero.com/grafana', category: 'Security', desc: 'DDoS mitigation console' },
  { id: 'nexusguard', name: 'Nexusguard', url: 'https://portal.nexusguard.com/', category: 'Security', desc: 'DDoS scrubbing portal' },
  { id: 'nce-ip', name: 'NCE-IP', url: 'http://10.20.20.181:8084', category: 'NCE', desc: 'NCE-IP radio controller' },
  { id: 'fastnetmon', name: 'FastNetMon', url: 'http://10.20.20.51:8080', category: 'NMS', desc: 'BGP / flow anomaly detection' },
  { id: 'observium', name: 'Observium', url: 'https://observium.omicron-bd.com/', category: 'NMS', desc: 'Auto-discovery network monitor' },
  { id: 'outlook', name: 'Outlook (Web)', url: 'https://outlook.office365.com/', category: 'Office', desc: 'Corporate mail' },
  { id: 'whatsapp', name: 'WhatsApp Web', url: 'https://web.whatsapp.com/', category: 'Office', desc: 'Quick chat from the desk' },
  { id: 'quickcall', name: 'QuickCall', url: 'http://10.20.20.42/quickcall/', category: 'Office', desc: 'Internal call/paging console' },
  { id: 'nagios', name: 'Nagios', url: 'https://nagios.omicron-bd.com/nagios/', category: 'NMS', desc: 'Service & host availability' },
];

// Reject dangerous schemes so a malformed config file can't trigger XSS.
function normalizeUrl(raw: string): string | null {
  if (!raw) return null;
  let url = String(raw).trim();
  if (!url) return null;
  const low = url.toLowerCase();
  if (
    low.startsWith('javascript:') ||
    low.startsWith('data:') ||
    low.startsWith('vbscript:') ||
    low.startsWith('file:')
  ) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = 'http://' + url;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

// The legacy page "internal" heuristic — used for display only (decides
// whether to show the .nms-url "Click to open" sub-text).
function isInternalUrl(raw: string): boolean {
  let host = '';
  try { host = new URL(raw).hostname.toLowerCase(); } catch { return false; }
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1') return true;
  if (host.startsWith('10.')) return true;
  if (host.startsWith('192.168.')) return true;
  const m = host.match(/^172\.(\d+)\./);
  if (m && m[1]) { const octet = parseInt(m[1], 10); if (octet >= 16 && octet <= 31) return true; }
  if (host.endsWith('.local') || host.endsWith('.corp') || host.endsWith('.intranet')) return true;
  return false;
}

// 4s HEAD-ish probe via no-cors — only used to decide between an internal
// "Click to open" hint vs an external "Opens in a new tab" hint. We never
// gate the click itself on this; the user can always openSafe().
function probe(url: string): Promise<'ok' | 'fail'> {
  return new Promise((resolve) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => { ctrl.abort(); resolve('fail'); }, 4000);
      fetch(url, { method: 'GET', mode: 'no-cors', signal: ctrl.signal })
        .then(() => { clearTimeout(t); resolve('ok'); })
        .catch(() => { clearTimeout(t); resolve('fail'); });
    } catch { resolve('fail'); }
  });
}

function openSafe(url: string) {
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) {
    // Popup blocked — best effort: navigate the current tab to the URL
    // rather than silently dropping the click.
    try { window.location.href = url; } catch { /* ignore */ }
  }
}

// Inject the legacy layout CSS once. We co-locate the styles here (matching
// legacy behaviour) but prefer the global theme classes if present.
function ensureLayoutStyles() {
  if (typeof document === 'undefined') return;
  const id = 'nms-layout-styles';
  if (document.getElementById(id)) return;
  const css = `
    .nms-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(260px,1fr)); gap: 14px; }
    .nms-card { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; cursor: pointer; transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease; position: relative; }
    .nms-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-2); border-color: var(--accent); }
    .nms-card h4 { margin: 0 0 4px; font-size: 15px; color: var(--fg); display: flex; align-items: center; gap: 8px; }
    .nms-card .nms-cat { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--chip); color: var(--muted); }
    .nms-card .nms-desc { font-size: 12.5px; color: var(--muted); margin: 6px 0 0; min-height: 32px; }
    .nms-card .nms-url { font-size: 11.5px; color: var(--muted); margin-top: 6px; opacity: .85; }
    .nms-card .nms-id { font-size: 10.5px; color: var(--muted); font-family: Consolas, "JetBrains Mono", monospace; opacity: .65; }
  `;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}

// Categories are derived from the loaded meta, with the four legacy buckets
// sorted to the top when present (matches the order the legacy page showed).
const PRIORITY_CATEGORIES = ['NMS', 'Security', 'NCE', 'Office'];

export function NmsPage() {
  const [meta, setMeta] = useState<LegacyNmsLinkMeta[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('All');
  const [probeState, setProbeState] = useState<Record<string, 'ok' | 'fail'>>({});
  const [configError, setConfigError] = useState<string | null>(null);
  const urlById = useRef<Map<string, string>>(new Map());

  // Load config (URLs go into the runtime map; meta only goes to state).
  useEffect(() => {
    ensureLayoutStyles();
    const ctrl = new AbortController();
    (async () => {
      let list: LegacyNmsLinkMeta[] | null = null;
      let source: 'api' | 'static' | 'inline' = 'inline';
      try {
        const r = await fetch(CONFIG_URL, { signal: ctrl.signal });
        if (r.ok) {
          const j = (await r.json()) as ApiList | LegacyNmsLinkMeta[];
          const rows = Array.isArray(j) ? j : (Array.isArray(j.rows) ? j.rows : null);
          if (rows && rows.length) {
            const parsed: LegacyNmsLinkMeta[] = rows.map((row) => {
              const raw = row as ApiRow | LegacyNmsLinkMeta;
              return 'data' in raw && raw.data ? raw.data : raw as LegacyNmsLinkMeta;
            });
            if (parsed.length) { list = parsed; source = 'api'; }
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[NMS] CONFIG_URL fetch failed:', CONFIG_URL, e);
      }
      if (!list) {
        try {
          const r = await fetch(FALLBACK_URL, { signal: ctrl.signal });
          if (r.ok) {
            const j = (await r.json()) as LegacyNmsLinkMeta[];
            if (Array.isArray(j) && j.length) { list = j; source = 'static'; }
          } else {
            setConfigError('NMS links config unavailable (' + r.status + ' from ' + FALLBACK_URL + ')');
          }
        } catch (e) {
          setConfigError('NMS links config unavailable (' + (e as Error).message + ')');
        }
      }
      const final = (list && list.length ? list : FALLBACK_LINKS);
      if (!list) source = 'inline';
      const map = new Map<string, string>();
      final.forEach((m) => {
        const norm = normalizeUrl(m.url);
        if (norm) map.set(m.id, norm);
      });
      urlById.current = map;
      setMeta(final);
      // eslint-disable-next-line no-console
      console.log('[NMS] loaded', final.length, 'meta entries; URLs in map:', map.size, 'source:', source);
      // Kick off reachability probes (display-only).
      const out: Record<string, 'ok' | 'fail'> = {};
      await Promise.all(final.map(async (m) => {
        const u = map.get(m.id); if (!u) { out[m.id] = 'fail'; return; }
        out[m.id] = await probe(u);
      }));
      setProbeState(out);
    })();
    return () => ctrl.abort();
  }, []);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    meta.forEach((m) => seen.add(m.category));
    const rest = Array.from(seen).filter((c) => !PRIORITY_CATEGORIES.includes(c)).sort();
    return ['All', ...PRIORITY_CATEGORIES.filter((c) => seen.has(c)), ...rest];
  }, [meta]);

  const qLower = q.trim().toLowerCase();
  const filtered = meta.filter((m) => {
    if (cat !== 'All' && m.category !== cat) return false;
    if (!qLower) return true;
    return (
      m.name.toLowerCase().includes(qLower) ||
      m.id.toLowerCase().includes(qLower) ||
      (m.desc || '').toLowerCase().includes(qLower) ||
      m.category.toLowerCase().includes(qLower)
    );
  });

  function onCardClick(id: string) {
    const url = urlById.current.get(id);
    // eslint-disable-next-line no-console
    console.log('[NMS] click', id, '->', url);
    if (!url) {
      // eslint-disable-next-line no-alert
      window.alert('No URL configured for "' + id + '". The NMS links config could not be loaded.');
      return;
    }
    openSafe(url);
  }

  return (
    <div>
      <div className="card">
        <div className="flex" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <h3 style={{ marginRight: 'auto' }}>NMS Quick Links</h3>
          <div style={{ position: 'relative' }}>
            <IconSearch size={14} style={{ position: 'absolute', left: 8, top: 11, color: 'var(--muted)' }} />
            <input
              placeholder="Search links…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ maxWidth: 240, paddingLeft: 28 }}
            />
          </div>
          <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ maxWidth: 180 }}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {configError && (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{configError}</div>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="nms-grid">
          {filtered.map((m) => {
            const url = urlById.current.get(m.id);
            const internal = url ? isInternalUrl(url) : false;
            const state = probeState[m.id];
            const disabled = !url;
            return (
              <div
                key={m.id}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled}
                className="nms-card"
                data-id={m.id}
                onClick={() => { if (!disabled) onCardClick(m.id); }}
                onKeyDown={(e) => {
                  if (disabled) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onCardClick(m.id);
                  }
                }}
                title={url ? 'Open ' + m.name : 'URL not configured'}
                style={disabled ? { opacity: .55, cursor: 'not-allowed' } : undefined}
              >
                <h4>
                  <span>{m.name}</span>
                  <span className="nms-cat">{m.category}</span>
                </h4>
                <div className="nms-desc">{m.desc || '—'}</div>
                {url ? (
                  <div className="nms-url">
                    {state === 'ok'
                      ? (internal ? 'Click to open (internal)' : 'Click to open')
                      : state === 'fail'
                        ? 'Click to open (unreachable)'
                        : 'Click to open'}
                  </div>
                ) : (
                  <div className="nms-url" style={{ color: 'var(--warn, #c0392b)' }}>
                    URL not configured
                  </div>
                )}
                <div className="nms-id">id: {m.id}</div>
              </div>
            );
          })}
          {!filtered.length && (
            <div className="empty" style={{ gridColumn: '1 / -1' }}>
              {meta.length ? 'No links match your filter' : 'Loading NMS links…'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
