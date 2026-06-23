// ai.js — Rule-based AI: classify incidents, suggest contacts, parse tickets
(function (global) {
  const $ = global.NMCStore;

  // Category → Department / Issue Type / Forward Department / Responsible Team
  // Trained model is stored in nmc.aiTraining and overrides defaults.
  const CATEGORY_RULES = [
    { cat: 'FO Link down',          dept: 'NCSS',                    issue: 'Fiber / Physical',        tags: ['fiber','fo','cable'] },
    { cat: 'NTTN Last Mile',        dept: 'NCSS',                    issue: 'Fiber / Physical',        tags: ['lastmile','last mile','nttn'] },
    { cat: 'NTTN Capacity',         dept: 'Survey & Transmission',   issue: 'NTTN Capacity',           tags: ['nttn','capacity','scl','f@h','fah'] },
    { cat: 'NTTN End',              dept: 'Survey & Transmission',   issue: 'NTTN End',                tags: ['nttn end','pop down','base site'] },
    { cat: 'Backbone Link',         dept: 'NGNC',                    issue: 'Backbone',                tags: ['backbone'] },
    { cat: 'BL POP Down',           dept: 'Survey & Transmission',   issue: 'Telco POP',               tags: ['bl pop','banglalink'] },
    { cat: 'GP POP Down',           dept: 'Survey & Transmission',   issue: 'Telco POP',               tags: ['gp pop','grameenphone'] },
    { cat: 'STL POP Down',          dept: 'Survey & Transmission',   issue: 'Telco POP',               tags: ['stl','summit tower'] },
    { cat: 'Telco POP',             dept: 'Survey & Transmission',   issue: 'Telco POP',               tags: ['telco pop','pop'] },
    { cat: 'Router Down',           dept: 'NGNC',                    issue: 'Router',                  tags: ['router','router down','loopback'] },
    { cat: 'Switch Down',           dept: 'NGNC',                    issue: 'Switch',                  tags: ['switch','switch down'] },
    { cat: 'BGP Flap',              dept: 'NGNC',                    issue: 'Routing',                 tags: ['bgp','bgp flap','bgp down'] },
    { cat: 'OSPF Flap',             dept: 'NGNC',                    issue: 'Routing',                 tags: ['ospf','ospf flap'] },
    { cat: 'IIG Down',              dept: 'NGNC',                    issue: 'IIG',                     tags: ['iig','iig down'] },
    { cat: 'IIG Traffic Fall',      dept: 'NGNC',                    issue: 'IIG Traffic',             tags: ['iig','traffic fall'] },
    { cat: 'Traffic Fall',          dept: 'NGNC',                    issue: 'Traffic',                 tags: ['traffic fall'] },
    { cat: 'Traffic Congestion',    dept: 'NGNC',                    issue: 'Traffic',                 tags: ['congestion','full','bandwidth'] },
    { cat: 'NIX Logical',           dept: 'NGNC',                    issue: 'NIX',                     tags: ['nix'] },
    { cat: 'Upstream',              dept: 'NGNC',                    issue: 'Upstream / PNI',          tags: ['upstream','pni'] },
    { cat: 'DDoS Attack',           dept: 'NGNC',                    issue: 'Security',                tags: ['ddos','flood','syn','ack'] },
    { cat: 'BRAS Down',             dept: 'BNOC',                    issue: 'BRAS',                    tags: ['bras','bras down','own bras'] },
    { cat: 'Dist BRAS Down',        dept: 'BNOC',                    issue: 'Dist BRAS',               tags: ['dist bras','distributor','service agent'] },
    { cat: 'OLT Issue',             dept: 'BNOC',                    issue: 'OLT/ONU',                 tags: ['olt','onu','pon'] },
    { cat: 'BTS Down',              dept: 'BTS & Power Infrastructure', issue: 'BTS',                  tags: ['bts','bts down'] },
    { cat: 'Power / Surecom',       dept: 'BTS & Power Infrastructure', issue: 'Power',                 tags: ['power','surecom','electricity'] },
    { cat: 'IPTSB',                 dept: 'IPTSB',                   issue: 'IPTSB',                   tags: ['iptsb'] },
    { cat: 'I&I',                   dept: 'I&I',                     issue: 'I&I',                     tags: ['i&i'] }
  ];

  function classify(category, freeText) {
    const train = $.get('aiTraining', {});
    const cat = (category || '').toLowerCase();
    const text = (freeText || '').toLowerCase();

    // 1) Exact category match
    for (const r of CATEGORY_RULES) {
      if (r.cat.toLowerCase() === cat) return applyTrain(r, train);
    }
    // 2) Tag/substring match
    for (const r of CATEGORY_RULES) {
      if (r.tags && r.tags.some(t => cat.includes(t) || text.includes(t))) return applyTrain(r, train);
    }
    // 3) Fallback
    return { category: category || 'Other', dept: 'NCSS', issue: 'General' };
  }

  function applyTrain(rule, train) {
    const k = rule.cat;
    const dept = (train && train[k]) || rule.dept;
    return { category: rule.cat, dept, issue: rule.issue, forwardDepartment: dept, responsibleTeam: dept };
  }

  function learn(category, dept) {
    if (!category || !dept) return;
    const t = $.get('aiTraining', {}); t[category] = dept; $.set('aiTraining', t);
  }

  // ---------- Ticket text parser ----------
  // Accepts the standard NMC ticket format and returns structured fields.
  function parseTicket(raw) {
    const text = (raw || '').replace(/\r/g, '');
    const get = (label) => {
      const re = new RegExp(label + '\\s*:\\s*([^\\n\\r]+)', 'i');
      const m = text.match(re);
      return m ? m[1].trim() : '';
    };
    const category = get('Category');
    const bts      = get('BTS/Area');
    const icRaw    = get('Impacted Customers \\(IC\\)');
    const faultRaw = get('Fault Time');
    const etrRaw   = get('ETR');
    const root     = get('Root Cause');
    const tt       = get('TT');

    // Extract ping statistics
    const ping = {};
    const tx = text.match(/(\d+)\s*packet\(s\)\s*transmitted/i);
    const rx = text.match(/(\d+)\s*packet\(s\)\s*received/i);
    const loss = text.match(/([\d.]+)\s*%\s*packet\s*loss/i);
    if (tx)  ping.transmitted = tx[1];
    if (rx)  ping.received    = rx[1];
    if (loss) ping.loss       = loss[1] + '%';

    // Extract optical power
    const rxOp = text.match(/Rx Optical Power\s*:\s*([-\d.]+\s*dBm)/i);
    const txOp = text.match(/Tx Optical Power\s*:\s*([-\d.]+\s*dBm)/i);
    const laser = {};
    if (rxOp) laser.rx = rxOp[1];
    if (txOp) laser.tx = txOp[1];

    let ic = 0;
    if (icRaw && /^\d+$/.test(icRaw)) ic = parseInt(icRaw, 10);
    else if (icRaw && /no/i.test(icRaw)) ic = 0;

    return {
      raw, category, bts, ic, icRaw,
      serviceImpacted: ic > 0 ? 'YES' : '0',
      faultTime: faultRaw,
      etr: etrRaw,
      rootCause: root,
      ticketId: tt,
      ping, laser
    };
  }

  // ---------- Contact AI ----------
  // Search contacts by free text. Returns top N ranked.
  function suggestContact(query, contacts, n) {
    n = n || 8;
    const q = (query || '').toLowerCase().trim();
    if (!q) return [];
    const tokens = q.split(/[\s,_-]+/).filter(Boolean);

    const scores = contacts.map(c => {
      const hay = [c.name, c.role, c.dept, c.zone, c.district, c.bts, (c.tags || []).join(' '), c.phone]
        .filter(Boolean).join(' ').toLowerCase();
      let s = 0;
      // exact substring
      if (hay.includes(q)) s += 10;
      // token matches
      tokens.forEach(t => { if (hay.includes(t)) s += 3; });
      // zone match
      if (c.zone && q.includes(c.zone.toLowerCase())) s += 5;
      // district
      if (c.district && q.includes(c.district.toLowerCase())) s += 4;
      // AI learned boosts
      const learn = $.get('contactLearn', {});
      if (learn[q] && learn[q] === c.id) s += 8;
      return { c, s };
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, n);

    return scores.map(x => x.c);
  }

  function learnContact(query, contactId) {
    const learn = $.get('contactLearn', {});
    learn[(query || '').toLowerCase().trim()] = contactId;
    $.set('contactLearn', learn);
  }

  // ---------- Session / Engineer lookup ----------
  // Returns {shift:'Morning'|'Evening'|'Night', engineers:[{name,dept}], collision:bool}
  function engineerAt(date, rosters) {
    const d = (date instanceof Date) ? date : new Date(date);
    const dateStr = d.toISOString().slice(0, 10);
    const h = d.getHours() + d.getMinutes() / 60;
    let shift = 'Night';
    if (h >= 8 && h < 14) shift = 'Morning';
    else if (h >= 14 && h < 22) shift = 'Evening';
    else if (h >= 22 || h < 8) shift = 'Night';

    const list = rosters.filter(r => r.date === dateStr && r.dept === 'NMC');
    const inShift = list.filter(r => r.shift === shift);
    let collision = false;
    let picked = inShift;
    // Collision window: 14:00–16:00 → include both Morning + Evening
    if (h >= 14 && h < 16) {
      const morning = list.filter(r => r.shift === 'Morning');
      picked = inShift.concat(morning);
      collision = morning.length > 0;
    }
    return { shift, engineers: picked, collision };
  }

  // ---------- Zone inference ----------
  const ZONES = [
    { name: 'Dhaka North',    match: ['dhaka north','mirpur','uttara','agargaon','dhanmondi','gulshan'] },
    { name: 'Dhaka South',    match: ['dhaka south','motijheel','ramna','tejgaon','lalbagh'] },
    { name: 'CTG Zone',       match: ['ctg','chattogram','chittagong','sonagazi','hajiganj'] },
    { name: 'Sylhet Zone',    match: ['syl','sylhet'] },
    { name: 'Barishal Zone',  match: ['bar','barisal'] },
    { name: 'Khulna Zone',    match: ['khu','khulna'] },
    { name: 'Rajshahi Zone',  match: ['raj','rajshahi'] },
    { name: 'Rangpur Zone',   match: ['rang','rangpur'] },
    { name: 'Mymensingh Zone',match: ['mym','mymensingh'] },
    { name: 'ALL Zone',       match: ['all','nationwide','country'] }
  ];
  function inferZone(text) {
    const t = (text || '').toLowerCase();
    for (const z of ZONES) if (z.match.some(m => t.includes(m))) return z.name;
    return '';
  }

  // ---------- Dropdown configuration ----------
  // Per-field option lists admins can manage in Settings → Dropdown Manager.
  // Source of truth lives in localStorage as `nmc.dropdownOptions`, keyed by
  // the same `key` used by the incident-log COLS array. A key whose value is
  // an empty array (or null) means "no dropdown — keep free text input".
  // Build the 24-hour time list (every 15 minutes) used by Fault Time and
  // Restoration Time dropdowns. Exposed as a helper so the incident-log
  // page can reuse it for inline "+ new" custom values too.
  function buildTimeOptions() {
    const out = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        out.push(String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
      }
    }
    return out;
  }

  const DROPDOWN_DEFAULTS = {
    // Session / engineer / name — defaults are empty; these get filled at
    // render-time from the current roster so admins rarely need to edit them.
    session:              ['Morning', 'Evening', 'Night'],
    sessionEngineers:     [],
    name:                 [],
    date:                 [],
    faultTime:            buildTimeOptions(),
    restorationTime:      buildTimeOptions(),
    currentStatus:        ['Running', 'Solved', 'Non-ticket running', 'Non-Ticket solved', 'RCA Pending ticket'],
    ticketType:           ['None', 'Major', 'Minor', 'General', 'Backbone', 'Cretical'],
    forwardDepartment:    ['NGNC', 'BNOC', 'NCSS', 'Survey & Transmission', 'BTS & Power Infrastructure', 'IPTSB', 'I&I'],
    responsibleTeam:      ['NGNC', 'BNOC', 'NCSS', 'Survey & Transmission', 'BTS & Power Infrastructure', 'IPTSB', 'I&I'],
    issueType:            ['Device Faulty', 'Device Stuck', 'Dismantled', 'Fiber Burn', 'Fiber Cut', 'Fiber Stolen', 'IIG issue', 'Logical Issue', 'Others', 'Patch Cord', 'Power Issue', 'SFP Issue', 'Shifting', 'Telco End Power Issue', 'Telco-NTTN Transmission issue', 'UTP cable issue', 'Laser High', 'Maintenance', 'Power & Fiber issue', 'Adapter Faulty', 'Core Break', 'Port Issue', 'NTTN End Power Issue', 'Distributor End Power Issue', 'Inverter Faulty', 'Fiber Bend', 'NTTN End Issue', 'TJ Box Broken', 'Device Changed', 'Telco End Fiber Cut', 'Intentionally', 'NTTN Device Down', 'NTTN End Fiber Cut', 'Distributor End Fiber Cut', 'BTS Fluctuation', 'Unstable Voltage', 'Device Reset', 'Telco & NTTN end Power Issue', 'Interface Down', 'BL End Tx Path Problem', 'Interface Stuck', 'Cable Damaged', 'Radio Unstable', 'High Utilization', 'Cable Faulty', 'Fiber Cut & Fiber Core Band', 'Circuit Breaker Faulty', 'LAN Port Issue', 'PPPoE issue', 'Fiber Cut & Traffic Utilization Full', 'Fiber Core Break', 'RF Cable', 'Global issue', 'Website Rendering Issue', 'NTTN Traffic Congestion', 'Distributor End Issue', 'Other', 'UPS Malfunction', 'NTTN End Fiber Shifted', 'Attack', 'VLAN Removed', 'Port Stuck', 'CPU High', 'Packet Loss', 'Hardware Issue', 'Device Malfunction', 'Traffic Fall', 'Frequency Issue', 'Device Down', 'Device Burn', 'Power Cord Issue', 'Temperature High', 'Adapter Cable Cut by Rat', 'Adapter Pigtail Problem', 'Web Site Issue', 'TJ Box Core Shortage', 'Routing Protocol Stuck', 'Fog Issue', 'OS Upgradation', 'Adapter Faulty', 'Cable Stolen', 'Router Fluctuation', 'Service Interruption', 'NTTN shifting issue', 'TX Path Issue', 'Inverter Stuck', 'NTTN Device Faulty'],
    incidentCategory:     ['Capacity link', 'Distributor', 'Fiber', 'IIG Link', 'Maintenance', 'Network', 'NTTN', 'Peer Interface', 'Power', 'Telco', 'Wireless Link', 'Traffic Fall', 'Wireless Interface', 'CDN Link Issue', 'Other', 'Fiber Laser High', 'CPU Load High', 'Interface', 'Traffic High Utilization', 'NIX', 'IPTSP Server', 'Server', 'Aggregation Link', 'UPS', 'Service Interruption', 'VPN', 'Telco POP', 'Packet Loss', 'Traffic Fluctuation', 'BTS Down'],
    incidentSubCategory:  ['Capacity link', 'Distributor', 'Fiber', 'IIG Link', 'Maintenance', 'Network', 'NTTN', 'Peer Interface', 'Power', 'Telco', 'Wireless Link', 'Traffic Fall', 'Wireless Interface', 'CDN Link Issue', 'Other', 'Fiber Laser High', 'CPU Load High', 'Interface', 'Traffic High Utilization', 'NIX', 'IPTSP Server', 'Server', 'Aggregation Link', 'UPS', 'Service Interruption', 'VPN', 'Telco POP', 'Packet Loss', 'Traffic Fluctuation', 'BTS Down'],
    queryMail:            ['SCL', 'F@H', 'BL', 'GP', 'Not Required', 'BL & NTTN', 'BTCL', 'SCL, F@H & GP', 'ETL', 'Both NTTN', 'BAHON', 'F@H & BL', 'SCL & BL', 'BSCCL', 'ISPAB', 'WCL', 'F@H & GP', 'F@H & STL', 'STL', 'BDIX', 'GP & SCL', 'Apple-STT', 'RADIANT', 'Level3', 'SCL & STL', 'SCL & F@H', 'ICONIX', 'VELOCITY', 'F@H & BL', 'NIX', 'BL, GP, SCL', 'SCL, F@H & BL', 'BDHUB', 'SCL & ETL', 'GFCL'],
    zone:                 ['Dhaka North', 'Dhaka South', 'Rangpur Zone', 'Khulna Zone', 'Sylhet Zone', 'CTG Zone', 'Rajshahi Zone', 'Mymensingh Zone', 'Barishal Zone', 'ALL Zone'],
    serviceImpacted:      ['YES', 'NO', '0'],
    durationOver4h:       ['YES', 'NO'],
    whatsappNotified:     ['Notified'],
    mailGenerated:        ['Yes', 'No', 'N/A'],
    rcaDocumentStatus:    ['Pending', 'Received', 'Reviewed', 'Not Required']
  };

  // Free-text-only fields — keys here will never become a dropdown.
  // Admins can still configure them via Dropdown Manager if they want, but
  // these are excluded from the default suggestions to keep the UI clean.
  // `date` is rendered as a native <input type="date"> by the incident log
  // page rather than a select, but it stays here so the manager treats it
  // as a text-only field (with a date picker).
  const TEXT_ONLY_FIELDS = [
    'date', 'incidentName', 'impactedClient',
    'duration', 'ticketId', 'rootCause', 'rcaProvider',
    'rcaProviderContact', 'actionTaken', 'informedPerson', 'informedTimeMedia',
    'ticketUpdateBy', 'ttForMail'
  ];

  function getAllDropdowns() {
    return $.get('dropdownOptions', DROPDOWN_DEFAULTS);
  }
  function getDropdown(key) {
    const all = getAllDropdowns();
    const list = (all && Array.isArray(all[key])) ? all[key] : (DROPDOWN_DEFAULTS[key] || []);
    return list;
  }
  function setDropdown(key, list) {
    const all = getAllDropdowns();
    all[key] = (list || []).map(v => String(v)).filter(Boolean);
    $.set('dropdownOptions', all);
    return all[key];
  }
  function resetDropdowns() {
    $.set('dropdownOptions', JSON.parse(JSON.stringify(DROPDOWN_DEFAULTS)));
  }
  function isTextOnly(key) {
    return TEXT_ONLY_FIELDS.indexOf(key) >= 0;
  }

  // Time / duration helpers — lifted here from tickets.js so incidentLog.js
  // can reuse them and so the same logic powers both create + close flows.
  // parseTimeToISO(dateStr, timeStr): combine a YYYY-MM-DD date with an HH:MM
  // (or HH:MM:SS) time into a full ISO string. Pass an empty dateStr to fall
  // back to today. Returns '' if timeStr is empty/unparseable.
  function parseTimeToISO(dateStr, timeStr) {
    if (!timeStr) return '';
    const m = String(timeStr).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!m) return '';
    let hh = +m[1];
    const mm = +m[2];
    const ss = +(m[3] || 0);
    const ap = (m[4] || '').toLowerCase();
    if (ap === 'pm' && hh < 12) hh += 12;
    if (ap === 'am' && hh === 12) hh = 0;
    const base = (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr))
      ? new Date(dateStr + 'T00:00:00')
      : new Date();
    base.setHours(hh, mm, ss, 0);
    return base.toISOString();
  }
  // diffDuration(a, b): difference between two ISO strings, returned as
  // "HH:MM:SS". Hours can exceed 24 (e.g. 26:14:09). Returns '' if either
  // input is missing or invalid. Negative deltas are clamped to 0.
  function diffDuration(a, b) {
    if (!a || !b) return '';
    const da = new Date(a).getTime();
    const db = new Date(b).getTime();
    if (!isFinite(da) || !isFinite(db)) return '';
    const ms = Math.max(0, db - da);
    const s = Math.floor(ms / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  // durationOverThreshold(dur, hrs): parse an HH:MM:SS string and return
  // 'YES' if it's strictly greater than `hrs` hours, else 'NO'. Returns 'NO'
  // for unparseable input.
  function durationOverThreshold(dur, hrs) {
    hrs = +hrs || 0;
    if (!dur) return 'NO';
    const m = String(dur).match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
    if (!m) return 'NO';
    const total = (+m[1]) + (+m[2]) / 60 + (+m[3]) / 3600;
    return total > hrs ? 'YES' : 'NO';
  }

  const DropdownConfig = {
    get: getDropdown, getAll: getAllDropdowns, set: setDropdown,
    reset: resetDropdowns, isTextOnly, defaults: DROPDOWN_DEFAULTS,
    textOnlyFields: TEXT_ONLY_FIELDS, buildTimeOptions
  };

  global.NMCAI = {
    classify, learn, parseTicket, suggestContact, learnContact, engineerAt, inferZone,
    CATEGORY_RULES, DropdownConfig,
    parseTimeToISO, diffDuration, durationOverThreshold
  };
})(window);
