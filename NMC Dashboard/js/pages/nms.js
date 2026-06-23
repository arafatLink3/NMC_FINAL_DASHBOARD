// pages/nms.js — Quick links to all NMS / monitoring tools
// Architecture:
//   - All link URLs live in the BACKEND CONFIG FILE: data/nms-links.json
//     (or, when a real backend exists, served at GET /api/nms-links).
//   - The frontend NEVER embeds URLs in the HTML source. URLs are stored
//     in a runtime-only Map keyed by link id, and resolved ONLY at the
//     moment the user clicks a card. The DOM never sees the raw URL.
//   - Cards render only name + category + description, so "View Source"
//     shows no link targets, no href, and no data-url attributes.
//
// Production-ready features: URL validation, safe window.open,
// internal-domain detection, reachability probe, debug logging,
// toast-based error UI, and overflow/layout protection.
(function () {
  const S = window.NMCStore, U = window.NMCUI;

  // ---------------------------------------------------------------------------
  // Backend config endpoint
  //   Priority:
  //     1) GET /api/nms-links  (if a real backend is deployed)
  //     2) GET data/nms-links.json  (static-config fallback, same payload)
  //   The override `NMC_NMS_LINKS_URL` lets a deployment point at any other
  //   config layer (e.g. a CDN, a static site generator output, an S3
  //   bucket) without touching this file.
  // ---------------------------------------------------------------------------
  const CONFIG_URL = (function () {
    try {
      if (typeof window !== 'undefined' && window.NMC_NMS_LINKS_URL) return window.NMC_NMS_LINKS_URL;
    } catch (_) {}
    // Try the real backend first; fall through to the static JSON.
    return '/api/nms-links';
  })();
  const FALLBACK_URL = 'data/nms-links.json';

  // Runtime-only URL store: id -> url. Never written into the DOM.
  // This is a closure variable, not a global, so nothing else on the
  // page can read it from the markup.
  const urlById = new Map();
  // Public-facing metadata only (what the UI is allowed to render).
  let metaList = []; // [{ id, name, category, desc }]
  let loadError = null;

  // ---------------------------------------------------------------------------
  // URL helpers
  // ---------------------------------------------------------------------------
  function normalizeUrl(raw) {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (!s) return null;
    if (/^(javascript|data|vbscript|file):/i.test(s)) return null;
    if (/^https?:\/\//i.test(s)) return s;
    return 'https://' + s;
  }

  function isInternalUrl(url) {
    try {
      const h = new URL(url).hostname.toLowerCase();
      if (!h) return false;
      if (/\.(local|internal|corp|lan|intranet|home|private)$/.test(h)) return true;
      if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
      if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
      if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
      if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
      return false;
    } catch (_) { return false; }
  }

  async function probe(url) {
    const t0 = Date.now();
    try {
      const ctl = (typeof AbortSignal !== 'undefined' && AbortSignal.timeout)
        ? AbortSignal.timeout(4000)
        : (() => { const ac = new AbortController(); setTimeout(() => ac.abort(), 4000); return ac.signal; })();
      await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: ctl });
      return { ok: true, ms: Date.now() - t0 };
    } catch (err) {
      const name = err && err.name;
      const reason = name === 'TimeoutError' || name === 'AbortError'
        ? 'timeout'
        : ((err && err.message) || 'unreachable');
      return { ok: false, reason, ms: Date.now() - t0 };
    }
  }

  function openSafe(url) {
    try {
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      return !!w;
    } catch (err) {
      console.error('[NMS] window.open threw', err);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Config loader — fetches the link list from the backend config layer.
  // Tries /api/nms-links first; if that 404s (no backend in this build),
  // falls back to data/nms-links.json. Either way, the response is the
  // same shape:
  //   { "links": [ { id, name, url, category, desc }, ... ] }
  // ---------------------------------------------------------------------------
  async function loadConfig() {
    async function getJson(url) {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      return r.json();
    }
    let data;
    try {
      data = await getJson(CONFIG_URL);
    } catch (primaryErr) {
      console.warn('[NMS] primary config endpoint failed, falling back', primaryErr);
      data = await getJson(FALLBACK_URL);
    }
    const list = Array.isArray(data) ? data : (data && data.links) || [];
    if (!list.length) throw new Error('Empty config payload');

    urlById.clear();
    metaList = list.map(item => {
      const id = String(item.id || item.name || '').trim();
      const name = String(item.name || '').trim();
      const url = normalizeUrl(item.url);
      const category = String(item.category || 'Other').trim();
      const desc = String(item.desc || '').trim();
      if (!id || !name || !url) return null;
      urlById.set(id, url); // runtime-only storage; never serialized into the DOM
      return { id, name, category, desc };
    }).filter(Boolean);

    if (!metaList.length) throw new Error('No valid links in config payload');
    loadError = null;
    console.log('[NMS] loaded', metaList.length, 'link(s) from backend config');
    return { links: metaList, source: data && data.source || 'config' };
  }

  // ---------------------------------------------------------------------------
  // Click handler — delegated. Resolves the URL from the runtime map and
  // opens via window.open. The DOM never carries the URL string.
  // ---------------------------------------------------------------------------
  async function handleCardClick(e) {
    const a = e.target.closest('a.nms-card');
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();

    const id   = a.dataset.id;
    const name = a.dataset.name || (a.querySelector('h3') ? a.querySelector('h3').textContent.trim() : 'Link');
    if (!id) {
      console.warn('[NMS] card has no id', { name });
      U.toast && U.toast('Link is not reachable or invalid.', 'error');
      return;
    }

    // Special-case log for WhatsUpGold so the redirect path is easy to
    // confirm in the console.
    if (name === 'WhatsUpGold') console.log('WhatsUpGold clicked');

    // Resolve the URL from runtime memory only.
    const url = urlById.get(id);
    console.log('[NMS] clicked link', { id, name, hasUrl: !!url });

    if (!url) {
      console.warn('[NMS] invalid URL', { id, name });
      U.toast && U.toast('Invalid URL', 'error');
      return;
    }
    console.log('[NMS] final URL before redirect', url);

    const internal = isInternalUrl(url);
    console.log('[NMS] final formatted URL', { url, internal });

    if (internal) {
      U.toast && U.toast('Opening internal system — make sure you are on VPN.', 'info');
    }

    console.log('[NMS] probing reachability…');
    const r = await probe(url);
    console.log('[NMS] validation result', r);

    if (!r.ok) {
      console.error('[NMS] probe failed', { id, name, url, reason: r.reason });
      const msg = internal
        ? 'Internal system not reachable. Please check VPN or DNS.'
        : 'Link is not reachable or invalid.';
      U.toast && U.toast(msg, 'error');
      return;
    }

    const opened = openSafe(url);
    if (!opened) {
      console.warn('[NMS] popup blocked or open failed', { id, name });
      U.toast && U.toast('Popup blocked — please allow popups for this site.', 'warn');
    } else {
      console.log('[NMS] opened in new tab', { id, name });
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  async function render() {
    const view = document.getElementById('view');
    const filter = { q: '', cat: '' };

    // Show a placeholder while we load, then either populate or show the
    // error UI if the backend config is unreachable.
    view.innerHTML = `
      <div class="card">
        <div class="flex" style="flex-wrap:wrap;gap:8px">
          <h3 style="margin-right:auto">NMS Quick Links</h3>
          <input id="n_q" placeholder="Search…" style="max-width:240px" />
          <select id="n_cat"><option value="">All</option></select>
        </div>
        <div class="nms-grid" id="n_grid" style="margin-top:12px">
          <div class="muted" style="padding:30px;text-align:center">Loading link directory…</div>
        </div>
      </div>
    `;

    try {
      await loadConfig();
    } catch (err) {
      loadError = err;
      console.error('[NMS] failed to load config', err);
      document.getElementById('n_grid').innerHTML =
        `<div class="muted" style="padding:30px;text-align:center">` +
        `Link directory unavailable. ${U.escapeHtml(err && err.message ? err.message : String(err))}` +
        `</div>`;
      U.toast && U.toast('Could not load NMS link directory.', 'error');
      ensureLayoutStyles();
      return;
    }

    // Card markup contains ONLY id, name, category, and description.
    // There is no href, no data-url, and no other attribute that could
    // leak the raw URL into the DOM.
    function card(t) {
      return `<a class="card nms-card"
                href="javascript:void(0)"
                data-id="${U.escapeHtml(t.id)}"
                data-name="${U.escapeHtml(t.name)}"
                role="button"
                aria-label="${U.escapeHtml(t.name)} — ${U.escapeHtml(t.category)}">
        <div class="nms-cat">${U.escapeHtml(t.category)}</div>
        <h3>${U.escapeHtml(t.name)}</h3>
        <div class="muted">${U.escapeHtml(t.desc || '')}</div>
        <div class="muted nms-url" aria-hidden="true">Click to open</div>
      </a>`;
    }

    function refresh() {
      const q = filter.q.toLowerCase();
      const rows = metaList.filter(t =>
        (!q || [t.name, t.desc, t.category].some(v => (v || '').toLowerCase().includes(q))) &&
        (!filter.cat || t.category === filter.cat));
      document.getElementById('n_grid').innerHTML = rows.map(card).join('') ||
        `<div class="muted" style="padding:30px;text-align:center">No links match.</div>`;
    }

    // Populate category dropdown from runtime meta.
    const catSel = document.getElementById('n_cat');
    const cats = [...new Set(metaList.map(t => t.category))];
    catSel.innerHTML = '<option value="">All</option>' +
      cats.map(c => `<option>${U.escapeHtml(c)}</option>`).join('');

    document.getElementById('n_q').addEventListener('input', e => { filter.q = e.target.value; refresh(); });
    catSel.addEventListener('change', e => { filter.cat = e.target.value; refresh(); });

    // Delegated click handler — survives refresh() re-renders of #n_grid.
    const grid = document.getElementById('n_grid');
    if (grid && !grid.__nmsBound) {
      grid.addEventListener('click', handleCardClick);
      grid.__nmsBound = true;
    }
    refresh();
    ensureLayoutStyles();
    detectOverflow();
  }

  // ---------------------------------------------------------------------------
  // Layout protection
  // ---------------------------------------------------------------------------
  let __nmsStyleInjected = false;
  function ensureLayoutStyles() {
    if (__nmsStyleInjected) return;
    __nmsStyleInjected = true;
    const css = `
#view, #app, body { box-sizing: border-box; max-width: 100%; overflow-x: hidden; }
#view *, #app *  { box-sizing: border-box; max-width: 100%; min-width: 0; }
.nms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  width: 100%;
  max-width: 100%;
}
.nms-card {
  display: block; width: 100%; max-width: 100%; min-width: 240px;
  min-height: 0; height: auto; overflow: hidden;
  text-decoration: none; color: inherit; cursor: pointer;
  word-wrap: break-word; overflow-wrap: anywhere;
  word-break: break-word; white-space: normal; hyphens: auto;
}
.nms-card h3, .nms-card .nms-cat, .nms-card .muted {
  white-space: normal; overflow-wrap: anywhere;
  word-break: break-word; max-width: 100%;
}
.nms-url {
  display: block; white-space: normal; overflow-wrap: anywhere;
  word-break: break-all; font-size: 11px; line-height: 1.35;
  max-width: 100%; min-width: 0; user-select: none;
}
@media (max-width: 640px) {
  .nms-grid { grid-template-columns: 1fr; }
  .nms-card { min-width: 0; }
}
`;
    let el = document.getElementById('nms-layout-style');
    if (!el) {
      el = document.createElement('style');
      el.id = 'nms-layout-style';
      el.appendChild(document.createTextNode(css));
      document.head.appendChild(el);
    }
  }

  function detectOverflow() {
    if (typeof document === 'undefined' || !document.body) return;
    const all = document.querySelectorAll('#view *');
    const offenders = [];
    all.forEach(el => {
      const sw = el.scrollWidth, cw = el.clientWidth;
      if (sw > cw + 1) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: el.className && el.className.toString ? el.className.toString() : '',
          id:  el.id || '',
          scrollWidth: sw, clientWidth: cw
        });
      }
    });
    if (offenders.length) {
      console.warn('[NMS] overflow detected on', offenders.length, 'element(s):', offenders);
    } else {
      console.log('[NMS] overflow scan: clean (no element wider than its container).');
    }
  }

  window.NMCPages = window.NMCPages || {};
  window.NMCPages.nms = render;
})();