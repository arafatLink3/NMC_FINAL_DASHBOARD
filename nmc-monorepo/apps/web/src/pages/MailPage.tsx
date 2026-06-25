// Mail page — 6 templates (NTTN, IIG, Telco POP, BRAS, Weekly, Monthly) + log.

import { useEffect, useMemo, useState } from 'react';
import { useCollection } from '../lib/store';
import { IconCopy, IconShare, IconCheck, IconMail } from '../lib/icons';
import { bus } from '../lib/bus';
import { useApi } from '../lib/api';
import type { MailLogEntry } from '@nmc/api-client';

type Tpl = { id: string; label: string; build: () => string };

const TPLS: Tpl[] = [
  { id: 'nttn',   label: 'NTTN',       build: () => mailBody('NTTN') },
  { id: 'iig',    label: 'IIG',        build: () => iigBody(EMPTY_IIG) },
  { id: 'pop',    label: 'Telco POP',  build: () => mailBody('Telco POP') },
  { id: 'bras',   label: 'BRAS',       build: () => mailBody('BRAS Bandwidth') },
  { id: 'weekly', label: 'Weekly',     build: () => `Weekly NMC Report — ${new Date().toLocaleDateString()}\n\n` + section('Highlights') + section('Major incidents') + section('Actions taken') + section('Upcoming changes') },
  { id: 'month',  label: 'Monthly',    build: () => `Monthly NMC Report — ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}\n\n` + section('Summary') + section('KPIs') + section('Incidents by zone') + section('Lessons learned') },
];

function section(title: string) { return `## ${title}\n- …\n- …\n\n`; }

function mailBody(kind: string) {
  return [
    `Subject: ${kind} update — ${new Date().toLocaleDateString()}`,
    ``,
    `Dear Team,`,
    ``,
    `Please find the ${kind} status below:`,
    ``,
    `• Vendor / link / capacity / used / free`,
    `• …`,
    ``,
    `Regards,`,
    `NMC`,
  ].join('\n');
}

// ---- NTTN catalog (CSV upload + per-vendor route lookup) -------------
type NttnCatalogRow = {
  vendor: NttnVendor;
  aEnd: string;
  zEnd: string;
  scrId: string;
};

type NttnCatalogByVendor = Record<NttnVendor, NttnCatalogRow[]>;

const EMPTY_CATALOG: NttnCatalogByVendor = { Bahon: [], 'F@H': [], BTCL: [], SCL: [] };

const CATALOG_KEY_PREFIX = 'nttnCatalog:';

function catalogKey(vendor: NttnVendor): string {
  return `${CATALOG_KEY_PREFIX}${vendor}`;
}

function loadVendorCatalog(vendor: NttnVendor): NttnCatalogRow[] {
  try {
    const raw = localStorage.getItem(catalogKey(vendor));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as NttnCatalogRow[]) : [];
  } catch {
    return [];
  }
}

function loadAllCatalogs(): NttnCatalogByVendor {
  return {
    Bahon: loadVendorCatalog('Bahon'),
    'F@H': loadVendorCatalog('F@H'),
    BTCL: loadVendorCatalog('BTCL'),
    SCL: loadVendorCatalog('SCL'),
  };
}

function saveVendorCatalog(vendor: NttnVendor, rows: NttnCatalogRow[]): void {
  try {
    localStorage.setItem(catalogKey(vendor), JSON.stringify(rows));
  } catch {
    /* ignore quota errors */
  }
}

// Minimal CSV parser — same shape as IncidentLogPage's parseCSV.
function parseNttnCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cell += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
        row = []; cell = '';
        if (ch === '\r' && text[i + 1] === '\n') i++;
      } else cell += ch;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '');
}

function parseCatalogCsv(text: string, defaultVendor?: NttnVendor): NttnCatalogRow[] {
  const grid = parseNttnCsv(text);
  if (grid.length < 2) return [];
  const head = (grid[0] ?? []).map((s) => s.trim());
  const norm = head.map(normHeader);
  const idxA = norm.findIndex((h) => h === 'nttnaend' || h === 'aend');
  const idxZ = norm.findIndex((h) => h === 'nttnzend' || h === 'zend');
  const idxS = norm.findIndex((h) => h === 'scrid');
  const idxV = norm.findIndex((h) => h === 'vendor');
  const out: NttnCatalogRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.every((c) => !c.trim())) continue;
    const get = (i: number) => (i >= 0 ? (row[i] ?? '').trim() : '');
    const vendorCell = get(idxV);
    const vendor = (vendorCell || defaultVendor || 'Bahon') as NttnVendor;
    if (!['Bahon', 'F@H', 'BTCL', 'SCL'].includes(vendor)) continue;
    const aEnd = idxA >= 0 ? get(idxA) : (row[0] ?? '').trim();
    const zEnd = idxZ >= 0 ? get(idxZ) : (row[1] ?? '').trim();
    const scrId = idxS >= 0 ? get(idxS) : (row[2] ?? '').trim();
    if (!aEnd || !zEnd) continue;
    out.push({ vendor, aEnd, zEnd, scrId });
  }
  return out;
}

// ---- NTTN vendor list (4 providers) ----------------------------------
type NttnVendor = 'Bahon' | 'F@H' | 'BTCL' | 'SCL';

const NTTN_VENDORS: { id: NttnVendor; short: string; desc: string; to: string; cc: string }[] = [
  { id: 'Bahon', short: 'Bahon',  desc: 'LT-BW / SCL-BW', to: 'noc@bahon.com.bd', cc: 'nmc@link3.net' },
  { id: 'F@H',   short: 'F@H',    desc: 'Fiber@Home',     to: 'noc@fiberathome.net', cc: 'nmc@link3.net; noc@link3.net; infrastructure@link3.net; khayom.parvez@fiberathome.net' },
  { id: 'BTCL',  short: 'BTCL',   desc: 'VPN / MRT',      to: 'noc@btcl.gov.bd', cc: 'nmc@link3.net' },
  { id: 'SCL',   short: 'SCL',    desc: 'Summit',         to: 'noc.nttn@summitcommunications.net', cc: 'nmc@link3.net; noc@link3.net; infrastructure@link3.net; corenetwork@link3.net; ngnc@link3.net; bnoc@link3.net; abu.sayeed@summitcommunications.net' },
];

type NttnForm = {
  vendor: NttnVendor;
  aEnd: string;   // NTTN A END
  zEnd: string;   // NTTN Z END
  scrId: string;
  timeDate: string;
  timeHh: string;
  timeMm: string;
};

const EMPTY_NTTN: NttnForm = {
  vendor: 'Bahon',
  aEnd: '',
  zEnd: '',
  scrId: '',
  timeDate: '',
  timeHh: '00',
  timeMm: '00',
};

// ---- IIG vendor list (5 templates from Flies/Mail Format/IIG.txt) ----
type IigVendor =
  | 'Summit'
  | 'ETL - IIG'
  | 'ICONIX IX'
  | 'STT CDN Cloudflare'
  | 'BD HUB CDN';

const IIG_VENDORS: {
  id: IigVendor;
  short: string;
  to: string;
  cc: string;
  defaultSubject: string;
  defaultBody: string;
}[] = [
  {
    id: 'Summit',
    short: 'Summit',
    to: 'noc.iig@summitcommunications.net',
    cc:
      'nmc@link3.net;noc@link3.net;infrastructure@link3.net;helpdesk@link3.net;mtarek@link3.net;corenetwork@link3.net;ngnc@link3.net;bnoc@link3.net;tarek@link3.net;abu.sayeed@summitcommunications.net;noc.nttn@summitcommunications.net',
    defaultSubject: 'Regarding Dhaka to MUKTAGACHA Connectivity Down',
    defaultBody: [
      'Route Name: Dhaka to MUKTAGACHA',
      'SCR ID: lnk3_161221_028_nb',
      'Down Time: 20:30',
      '',
      'We are waiting for your response.',
    ].join('\n'),
  },
  {
    id: 'ETL - IIG',
    short: 'ETL',
    to: 'support@earth.net.bd; core@earth.net.bd',
    cc:
      'backoffice@earth.net.bd; bijan.kumar@earth.net.bd; infrastructure@link3.net; ngnc@link3.net; nmr@link3.net; ujjal.biswas@link3.net; subrata.sarker@link3.net; nmc@link3.net; bnoc@link3.net',
    defaultSubject: 'Regarding ETL-GGC and FNA link traffic fall',
    defaultBody:
      'We observed that Earth GGC and FNA link traffic fall from 11:50 AM Please check and share updates with us urgently.',
  },
  {
    id: 'ICONIX IX',
    short: 'ICONIX',
    to: 'soc@level3carrier.com',
    cc:
      'rakibul.hassan@link3.net;ujjal.biswas@link3.net;subrata.sarker@link3.net;sabuj.mistry@link3.net;kaiser.shuvo@link3.net;rahman.arifur@link3.net;ngnc@link3.net;nmc@link3.net;bnoc@link3.net',
    defaultSubject: 'Regarding ICONIX_IX traffic fall',
    defaultBody: [
      'Link Name: ICONIX_IX',
      'Issue: Traffic fall',
      'Time: 1:00',
      '',
      'We are waiting for your reply.',
    ].join('\n'),
  },
  {
    id: 'STT CDN Cloudflare',
    short: 'STT CDN',
    to:
      'support.mime@cg-bd.com; atiqul.hoque@cg-bd.com; asif.md@cg-bd.com',
    cc:
      'mahbubur.rahman@link3.net; emran.hossain@cg-bd.com; nmc@link3.net; ngnc@link3.net; ujjal.biswas@link3.net; subrata.sarker@link3.net; rahman.arifur@link3.net; sabuj.mistry@link3.net; kaiser.shuvo@link3.net; ena.haque@cg-bd.com; maha.rahman@cg-bd.com; humaira.ferdousy@cg-bd.com; shahed.fardous@cg-bd.com; zah.islam@cg-bd.com; shidul.alam@cg-bd.com; abdullah.al@cg-bd.com; aman.ullah@cg-bd.com; kazi.rashed@cg-bd.com; islam.hossain@cg-bd.com',
    defaultSubject: 'Regarding STT CDN Cloudflare Traffic Fall',
    defaultBody:
      'We observed traffic fall in STT CDN Cloudflare from 02:25 to 6:55. Please check and share your observation.',
  },
  {
    id: 'BD HUB CDN',
    short: 'BD HUB',
    to: 'noc@bdhub.com; hasibul.islam@bdhub.com; mmnadim@bdhub.com',
    cc:
      'rakibul.hassan@link3.net;ujjal.biswas@link3.net;subrata.sarker@link3.net;sabuj.mistry@link3.net;kaiser.shuvo@link3.net;rahman.arifur@link3.net;ngnc@link3.net;nmc@link3.net;bnoc@link3.net',
    defaultSubject: 'BDHub CDN Traffic Fall',
    defaultBody:
      'We observed that BDHUB-CDN traffic fell from 18:30 to 18:55. Please check and share updates with us urgently.',
  },
];

type IigForm = {
  vendor: IigVendor;
  to: string;
  cc: string;
  subject: string;
  body: string;
};

const EMPTY_IIG: IigForm = {
  vendor: 'Summit',
  to: '',
  cc: '',
  subject: '',
  body: '',
};

function iigBody(f: IigForm): string {
  return [
    `To: ${f.to || '—'}`,
    `CC: ${f.cc || '—'}`,
    `Subject: ${f.subject || ''}`,
    ``,
    `Dear Concern,`,
    ``,
    f.body,
    ``,
    `Regards,`,
    `NMC, Link3 Technologies Ltd.`,
  ].join('\n');
}

// ---- Telco POP list (BL / GP / STL) -----------------------------------
type TelcoVendor = 'BL' | 'GP' | 'STL';

const TELCO_VENDORS: {
  id: TelcoVendor;
  short: string;
  to: string;
  cc: string;
}[] = [
  {
    id: 'BL',
    short: 'BL',
    to: 'noc@banglalink.net',
    cc: 'bnoc@link3.net; nmc@link3.net',
  },
  {
    id: 'GP',
    short: 'GP',
    to: 'noc@grameenphone.com',
    cc: 'gnoc@link3.net; nmc@link3.net',
  },
  {
    id: 'STL',
    short: 'STL',
    to: 'noc@summitcommunications.net',
    cc: 'snoc@link3.net; nmc@link3.net',
  },
];

type TelcoForm = {
  vendor: TelcoVendor;
  to: string;
  cc: string;
  pop: string;
  issue: string;
};

const EMPTY_TELCO: TelcoForm = {
  vendor: 'BL',
  to: TELCO_VENDORS[0]!.to,
  cc: TELCO_VENDORS[0]!.cc,
  pop: '',
  issue: '',
};

function telcoBody(f: TelcoForm): string {
  const vendor = TELCO_VENDORS.find((v) => v.id === f.vendor);
  const vendorName = vendor?.short ?? f.vendor;
  const subject = `Subject: ${vendorName} POP issue – ${f.pop || ''}`.trim();
  return [
    `To: ${f.to || '—'}`,
    `CC: ${f.cc || '—'}`,
    subject,
    ``,
    `Dear ${vendorName} NOC,`,
    ``,
    `We are seeing an issue at ${f.pop || '—'}: ${f.issue || '—'}.`,
    ``,
    `Kindly check and respond with ETR.`,
    ``,
    `Regards,`,
    `NMC, Link3 Technologies Ltd.`,
  ].join('\n');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const HH_OPTS: string[] = Array.from({ length: 24 }, (_, i) => pad2(i));
const MM_OPTS: string[] = Array.from({ length: 60 }, (_, i) => pad2(i));

function buildCompiled24HString(
  date: string,
  hh: string,
  mm: string,
): string {
  if (!date) return '';
  const parts = date.split('-');
  const yyyy = parts[0] || '';
  const mo = parts[1] || '';
  const dd = parts[2] || '';
  const now = new Date();
  const isToday =
    now.getFullYear() === +yyyy &&
    now.getMonth() + 1 === +mo &&
    now.getDate() === +dd;
  return isToday
    ? `${hh}:${mm}`
    : `${hh}:${mm} (${dd}/${mo}/${yyyy.slice(-2)})`;
}

function nttnBody(f: NttnForm): string {
  const a = f.aEnd || 'A END';
  const z = f.zEnd || 'Z END';
  const subject = `Subject: Regarding ${a} to ${z} Connectivity Down`;
  const compiled = buildCompiled24HString(f.timeDate, f.timeHh, f.timeMm);
  const time = compiled || '—';
  return [
    subject,
    ``,
    `Dear Concern,`,
    ``,
    `We are getting down ${a} to ${z} link from ${time} to till now. Please check and let us know the update urgently.`,
    ``,
    `Route Name : ${a} - ${z}`,
    `SCR ID : ${f.scrId || ''}`,
    `Down time : ${time}`,
    ``,
    `We are waiting for your reply.`,
    ``,
    `Regards,`,
    `NMC, Link3 Technologies Ltd.`,
  ].join('\n');
}

export function MailPage() {
  const [active, setActive] = useState((TPLS[0] as Tpl).id);
  const [log, setLog] = useCollection<MailLogEntry>('mailLog');
  const tpl: Tpl = TPLS.find((t) => t.id === active) ?? (TPLS[0] as Tpl);
  const body = useMemo(() => tpl.build(), [tpl]);

  const [nttn, setNttn] = useState<NttnForm>(EMPTY_NTTN);
  const nttnRendered = useMemo(() => nttnBody(nttn), [nttn]);

  const [iig, setIig] = useState<IigForm>(EMPTY_IIG);
  const iigRendered = useMemo(() => iigBody(iig), [iig]);
  // When the user picks a vendor from the dropdown, populate To/CC/Subject/Body
  // with that vendor's default template (from IIG.txt). The fields stay
  // editable so the operator can tweak before sending.
  function pickIigVendor(id: IigVendor) {
    const v = IIG_VENDORS.find((x) => x.id === id);
    if (!v) return;
    setIig({
      vendor: v.id,
      to: v.to,
      cc: v.cc,
      subject: v.defaultSubject,
      body: v.defaultBody,
    });
  }

  const [telco, setTelco] = useState<TelcoForm>(EMPTY_TELCO);
  const telcoRendered = useMemo(() => telcoBody(telco), [telco]);
  // Switching Telco vendor re-applies the default To/CC for that NOC.
  function pickTelcoVendor(id: TelcoVendor) {
    const v = TELCO_VENDORS.find((x) => x.id === id);
    if (!v) return;
    setTelco((prev) => ({ ...prev, vendor: v.id, to: v.to, cc: v.cc }));
  }

  const api = useApi();
  const [sending, setSending] = useState(false);

  // Loaded CSV catalogs — separate bucket per vendor so each file only feeds
  // its own dropdowns / SCR IDs (Bahon.csv never bleeds into BTCL, etc.)
  const [catalogs, setCatalogs] = useState<NttnCatalogByVendor>(() => loadAllCatalogs());
  useEffect(() => {
    for (const v of NTTN_VENDORS) saveVendorCatalog(v.id, catalogs[v.id]);
  }, [catalogs]);

  // Distinct A / Z values for the selected vendor, for the dropdowns
  const vendorRows = useMemo(
    () => catalogs[nttn.vendor],
    [catalogs, nttn.vendor],
  );
  const aEndOptions = useMemo(
    () => Array.from(new Set(vendorRows.map((r) => r.aEnd))).sort(),
    [vendorRows],
  );
  const zEndOptions = useMemo(
    () => Array.from(
      new Set(
        vendorRows
          .filter((r) => !nttn.aEnd || r.aEnd === nttn.aEnd)
          .map((r) => r.zEnd),
      ),
    ).sort(),
    [vendorRows, nttn.aEnd],
  );

  // Auto-fill SCR ID when both ends match a catalog row (first hit wins)
  useEffect(() => {
    if (!nttn.aEnd || !nttn.zEnd) return;
    const hit = vendorRows.find(
      (r) => r.aEnd === nttn.aEnd && r.zEnd === nttn.zEnd,
    );
    if (hit && hit.scrId && hit.scrId !== nttn.scrId) {
      setNttn((prev) => ({ ...prev, scrId: hit.scrId }));
    }
  }, [nttn.vendor, nttn.aEnd, nttn.zEnd, vendorRows]);

  function handleCatalogFile(file: File, vendor: NttnVendor) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        // Tag every row with this vendor so a header-less CSV (just A END /
        // Z END / SCR ID) still gets filed under the right tab.
        const rows = parseCatalogCsv(String(reader.result ?? ''), vendor)
          .map((r) => ({ ...r, vendor }));
        if (!rows.length) {
          bus.emit('notify', {
            id: crypto.randomUUID(),
            text: `No valid rows for ${vendor} in CSV`,
            type: 'danger',
            createdAt: new Date().toISOString(),
          });
          return;
        }
        setCatalogs((prev) => ({ ...prev, [vendor]: rows }));
        bus.emit('notify', {
          id: crypto.randomUUID(),
          text: `${vendor}: loaded ${rows.length} catalog rows`,
          type: 'success',
          createdAt: new Date().toISOString(),
        });
      } catch {
        bus.emit('notify', {
          id: crypto.randomUUID(),
          text: `${vendor}: CSV parse failed`,
          type: 'danger',
          createdAt: new Date().toISOString(),
        });
      }
    };
    reader.readAsText(file);
  }

  function send(channel: 'whatsapp' | 'mailto' | 'copy') {
    const isNttn = active === 'nttn';
    const isIig = active === 'iig';
    const isPop = active === 'pop';
    const finalBody = isNttn ? nttnRendered : isIig ? iigRendered : isPop ? telcoRendered : body;
    const subject = isNttn
      ? `Regarding ${nttn.aEnd || 'A END'} to ${nttn.zEnd || 'Z END'} Connectivity Down`
      : isIig
        ? iig.subject || tpl.label
        : isPop
          ? `${TELCO_VENDORS.find((v) => v.id === telco.vendor)?.short ?? telco.vendor} POP issue – ${telco.pop || ''}`.trim()
          : tpl.label;
    const mailto = isNttn
      ? `mailto:${(NTTN_VENDORS.find((v) => v.id === nttn.vendor)?.to) ?? ''}?cc=${encodeURIComponent((NTTN_VENDORS.find((v) => v.id === nttn.vendor)?.cc) ?? '')}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(finalBody)}`
      : isIig
        ? `mailto:${iig.to}?cc=${encodeURIComponent(iig.cc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(finalBody)}`
        : isPop
          ? `mailto:${telco.to}?cc=${encodeURIComponent(telco.cc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(finalBody)}`
          : `mailto:?subject=${encodeURIComponent(tpl.label)}&body=${encodeURIComponent(finalBody)}`;

    setLog([...log, { id: crypto.randomUUID(), channel, template: tpl.id, createdAt: new Date().toISOString(), body: finalBody } as MailLogEntry]);
    if (channel === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(finalBody)}`, '_blank', 'noopener');
    } else if (channel === 'mailto') {
      window.location.href = mailto;
    } else {
      copyToClipboard(finalBody);
    }
    bus.emit('notify', { id: crypto.randomUUID(), text: `Mail sent via ${channel}`, type: 'success', createdAt: new Date().toISOString() });
  }

  // Server-side SMTP delivery — hits POST /api/mail/send so the operator
  // does not need an open Outlook / mail client. The server resolves the
  // SMTP credentials from its .env, splits the "to" list, and persists a
  // mail_messages row (status: sent | failed) so there is an audit trail.
  async function sendSmtp() {
    const isNttn = active === 'nttn';
    const isIig = active === 'iig';
    const isPop = active === 'pop';
    const nttnVendor = NTTN_VENDORS.find((v) => v.id === nttn.vendor);
    const finalBody = isNttn ? nttnRendered : isIig ? iigRendered : isPop ? telcoRendered : body;
    const subject = isNttn
      ? `Regarding ${nttn.aEnd || 'A END'} to ${nttn.zEnd || 'Z END'} Connectivity Down`
      : isIig
        ? iig.subject || tpl.label
        : isPop
          ? `${TELCO_VENDORS.find((v) => v.id === telco.vendor)?.short ?? telco.vendor} POP issue – ${telco.pop || ''}`.trim()
          : tpl.label;
    const to = isNttn ? (nttnVendor?.to ?? '') : isIig ? iig.to : isPop ? telco.to : '';
    const cc = isNttn ? (nttnVendor?.cc ?? '') : isIig ? iig.cc : isPop ? telco.cc : '';
    const zone = isNttn ? nttn.vendor : isIig ? iig.vendor : isPop ? telco.vendor : '';

    if (!to.trim()) {
      bus.emit('notify', {
        id: crypto.randomUUID(),
        text: isIig
          ? 'IIG template has no recipient — pick a vendor or fill the To field.'
          : isPop
            ? 'Telco POP template has no recipient — pick a vendor or fill the To field.'
            : 'No recipient address for this template — add one in NTTN_VENDORS first.',
        type: 'danger',
        createdAt: new Date().toISOString(),
      });
      return;
    }

    setSending(true);
    try {
      await api.sendMail({
        template: tpl.id,
        zone,
        to,
        cc,
        subject,
        body: finalBody,
        via: 'smtp',
      });
      setLog([
        ...log,
        {
          id: crypto.randomUUID(),
          channel: 'smtp',
          template: tpl.id,
          subject,
          body: finalBody,
          recipients: [to, cc].filter(Boolean),
          sentAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        } as unknown as MailLogEntry,
      ]);
      bus.emit('notify', {
        id: crypto.randomUUID(),
        text: `Mail delivered via SMTP to ${to}`,
        type: 'success',
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SMTP send failed';
      bus.emit('notify', {
        id: crypto.randomUUID(),
        text: `SMTP failed: ${message}`,
        type: 'danger',
        createdAt: new Date().toISOString(),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h2 style={{ margin: '4px 0 12px' }}>Mail Center</h2>
      <div className="tabs">
        {TPLS.map((t) => (
          <div key={t.id} className={`tab ${active === t.id ? 'active' : ''}`} onClick={() => setActive(t.id)}>{t.label}</div>
        ))}
      </div>

      {active === 'nttn' ? (
        <div className="card">
          <h3>NTTN Mail — pick a vendor</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {NTTN_VENDORS.map((v) => {
              const rows = catalogs[v.id];
              return (
                <div
                  key={v.id}
                  style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                >
                  <span
                    className="tag"
                    title={v.desc}
                    style={{ minWidth: 64, justifyContent: 'center' }}
                  >
                    {v.short}
                  </span>
                  <label className="btn ghost sm" style={{ cursor: 'pointer' }}>
                    <IconShare size={12} /> Upload {v.short} CSV
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleCatalogFile(f, v.id);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                  {rows.length > 0 ? (
                    <>
                      <span className="muted">
                        {rows.length} row{rows.length === 1 ? '' : 's'} loaded
                      </span>
                      <button
                        className="btn ghost sm"
                        onClick={() =>
                          setCatalogs((prev) => ({ ...prev, [v.id]: [] }))
                        }
                      >
                        Clear
                      </button>
                    </>
                  ) : (
                    <span className="muted">
                      no CSV — header <code>NTTN A END,NTTN Z END,SCR ID</code>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="tabs" style={{ marginBottom: 12 }}>
            {NTTN_VENDORS.map((v) => (
              <div
                key={v.id}
                title={`${v.short} (${v.desc})`}
                className={`tab ${nttn.vendor === v.id ? 'active' : ''}`}
                onClick={() =>
                  setNttn((prev) =>
                    prev.vendor === v.id
                      ? prev
                      : { ...prev, vendor: v.id, aEnd: '', zEnd: '', scrId: '' },
                  )
                }
              >{v.short}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <label className="field">
              <span>NTTN A END</span>
              <select
                value={nttn.aEnd}
                disabled={!vendorRows.length}
                onChange={(e) => setNttn({ ...nttn, aEnd: e.target.value, zEnd: '' })}
              >
                <option value="">— select A END —</option>
                {aEndOptions.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>NTTN Z END</span>
              <select
                value={nttn.zEnd}
                disabled={!vendorRows.length || !nttn.aEnd}
                onChange={(e) => setNttn({ ...nttn, zEnd: e.target.value })}
              >
                <option value="">— select Z END —</option>
                {zEndOptions.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </label>
            <label className="field" style={{ gridColumn: 'span 2' }}>
              <span>Down Time</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <input
                  type="date"
                  value={nttn.timeDate}
                  onChange={(e) => setNttn({ ...nttn, timeDate: e.target.value })}
                />
                <select
                  value={nttn.timeHh}
                  onChange={(e) => setNttn({ ...nttn, timeHh: e.target.value })}
                >
                  {HH_OPTS.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <span style={{ fontWeight: 'bold' }}>:</span>
                <select
                  value={nttn.timeMm}
                  onChange={(e) => setNttn({ ...nttn, timeMm: e.target.value })}
                >
                  {MM_OPTS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </label>
            <label className="field">
              <span>
                SCR ID <em className="muted">(unique)</em>
                {(() => {
                  const hit = vendorRows.find(
                    (r) => r.aEnd === nttn.aEnd && r.zEnd === nttn.zEnd,
                  );
                  return hit ? (
                    <span className="tag b" style={{ marginLeft: 6 }}>auto</span>
                  ) : null;
                })()}
              </span>
              <input
                type="text"
                value={nttn.scrId}
                placeholder="e.g. LT-BW003"
                onChange={(e) => setNttn({ ...nttn, scrId: e.target.value })}
              />
            </label>
          </div>

          <h3 style={{ marginTop: 16 }}>Preview</h3>
          <pre className="ticket-preview">{nttnRendered}</pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => send('copy')}><IconCopy size={14} /> Copy</button>
            <button className="btn ghost" onClick={() => send('whatsapp')}><IconShare size={14} /> WhatsApp</button>
            <button className="btn ghost" onClick={() => send('mailto')}><IconCheck size={14} /> Outlook</button>
            <button className="btn success" disabled={sending} onClick={sendSmtp}>
              <IconMail size={14} /> {sending ? 'Sending…' : 'Send via SMTP'}
            </button>
          </div>
        </div>
      ) : active === 'pop' ? (
        <div className="card">
          <h3>Telco POP Issue — pick a telco</h3>
          <div className="tabs" style={{ marginBottom: 12 }}>
            {TELCO_VENDORS.map((v) => (
              <div
                key={v.id}
                className={`tab ${telco.vendor === v.id ? 'active' : ''}`}
                onClick={() => pickTelcoVendor(v.id)}
              >{v.short}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <label className="field">
              <span>To</span>
              <input
                type="text"
                value={telco.to}
                onChange={(e) => setTelco({ ...telco, to: e.target.value })}
              />
            </label>
            <label className="field">
              <span>CC</span>
              <input
                type="text"
                value={telco.cc}
                onChange={(e) => setTelco({ ...telco, cc: e.target.value })}
              />
            </label>
            <label className="field">
              <span>POP / BTS</span>
              <input
                type="text"
                value={telco.pop}
                placeholder="e.g. BL-DHK-CORE-01"
                onChange={(e) => setTelco({ ...telco, pop: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Issue</span>
              <input
                type="text"
                value={telco.issue}
                placeholder="e.g. power down, link down"
                onChange={(e) => setTelco({ ...telco, issue: e.target.value })}
              />
            </label>
          </div>

          <h3 style={{ marginTop: 16 }}>Preview</h3>
          <pre className="ticket-preview">{telcoRendered}</pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => send('copy')}><IconCopy size={14} /> Copy</button>
            <button className="btn ghost" onClick={() => send('whatsapp')}><IconShare size={14} /> WhatsApp</button>
            <button className="btn ghost" onClick={() => send('mailto')}><IconCheck size={14} /> Outlook</button>
            <button className="btn success" disabled={sending} onClick={sendSmtp}>
              <IconMail size={14} /> {sending ? 'Sending…' : 'Send via SMTP'}
            </button>
          </div>
        </div>
      ) : active === 'iig' ? (
        <div className="card">
          <h3>IIG Mail — pick a vendor</h3>
          <div className="tabs" style={{ marginBottom: 12 }}>
            {IIG_VENDORS.map((v) => (
              <div
                key={v.id}
                className={`tab ${iig.vendor === v.id ? 'active' : ''}`}
                onClick={() => pickIigVendor(v.id)}
              >{v.short}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <label className="field">
              <span>To</span>
              <input
                type="text"
                value={iig.to}
                onChange={(e) => setIig({ ...iig, to: e.target.value })}
              />
            </label>
            <label className="field">
              <span>CC</span>
              <input
                type="text"
                value={iig.cc}
                onChange={(e) => setIig({ ...iig, cc: e.target.value })}
              />
            </label>
            <label className="field" style={{ gridColumn: 'span 2' }}>
              <span>Subject</span>
              <input
                type="text"
                value={iig.subject}
                onChange={(e) => setIig({ ...iig, subject: e.target.value })}
              />
            </label>
            <label className="field" style={{ gridColumn: 'span 2' }}>
              <span>Body</span>
              <textarea
                rows={6}
                value={iig.body}
                onChange={(e) => setIig({ ...iig, body: e.target.value })}
              />
            </label>
          </div>

          <h3 style={{ marginTop: 16 }}>Preview</h3>
          <pre className="ticket-preview">{iigRendered}</pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => send('copy')}><IconCopy size={14} /> Copy</button>
            <button className="btn ghost" onClick={() => send('whatsapp')}><IconShare size={14} /> WhatsApp</button>
            <button className="btn ghost" onClick={() => send('mailto')}><IconCheck size={14} /> Outlook</button>
            <button className="btn success" disabled={sending} onClick={sendSmtp}>
              <IconMail size={14} /> {sending ? 'Sending…' : 'Send via SMTP'}
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <h3>{tpl.label} template</h3>
          <pre className="ticket-preview">{body}</pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => send('copy')}><IconCopy size={14} /> Copy</button>
            <button className="btn ghost" onClick={() => send('whatsapp')}><IconShare size={14} /> WhatsApp</button>
            <button className="btn ghost" onClick={() => send('mailto')}><IconCheck size={14} /> Outlook</button>
            <button className="btn success" disabled={sending} onClick={sendSmtp}>
              <IconMail size={14} /> {sending ? 'Sending…' : 'Send via SMTP'}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Mail log</h3>
        {log.length === 0 && <div className="empty">No mails sent yet.</div>}
        {log.slice().reverse().slice(0, 30).map((m) => (
          <div key={m.id} className="reminder" style={{ borderLeftColor: 'var(--info)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="tag b">{m.channel}</span>
              <span style={{ flex: 1 }}>{m.template}</span>
              <span className="muted">{typeof m.createdAt === 'string' ? new Date(m.createdAt).toLocaleString() : ''}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function copyToClipboard(text: string) {
  try { await navigator.clipboard.writeText(text); bus.emit('notify', { id: crypto.randomUUID(), text: 'Copied to clipboard', type: 'success', createdAt: new Date().toISOString() }); } catch { /* ignore */ }
}
