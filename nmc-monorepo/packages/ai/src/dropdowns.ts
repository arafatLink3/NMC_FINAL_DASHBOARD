import type { DropdownKey, DropdownOptions } from './types.js';

/** 24h time list, every 15 minutes — for fault / restoration time. */
export function buildTimeOptions(): string[] {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      out.push(String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
    }
  }
  return out;
}

/**
 * Time picker helpers — return `{ hours, minutes }` so
 * pages can build two `<select>` dropdowns.
 */
export function buildTimePicker(): { hours: string[]; minutes: string[] } {
  const hours: string[] = [];
  const minutes: string[] = [];
  for (let h = 0; h < 24; h++) hours.push(String(h).padStart(2, '0'));
  for (let m = 0; m < 60; m += 15) minutes.push(String(m).padStart(2, '0'));
  return { hours, minutes };
}

/** Default option lists, byte-for-byte equivalent to `DROPDOWN_DEFAULTS`. */
export const DROPDOWN_DEFAULTS: Required<DropdownOptions> & {
  /** Alias for `incidentCategory` (UI page shorthand). */
  categories: string[];
  /** Alias for `zone` (UI page shorthand). */
  zones: string[];
  /** Alias for `forwardDepartment` (UI page shorthand). */
  departments: string[];
} = {
  session:             ['Morning', 'Evening', 'Night'],
  sessionEngineers:    [],
  name:                [],
  date:                [],
  faultTime:           buildTimeOptions(),
  restorationTime:     buildTimeOptions(),
  currentStatus:       ['Running', 'Solved', 'Non-ticket running', 'Non-Ticket solved', 'RCA Pending ticket'],
  ticketType:          ['None', 'Major', 'Minor', 'General', 'Backbone', 'Cretical'],
  forwardDepartment:   ['NGNC', 'BNOC', 'NCSS', 'Survey & Transmission', 'BTS & Power Infrastructure', 'IPTSB', 'I&I'],
  responsibleTeam:     ['NGNC', 'BNOC', 'NCSS', 'Survey & Transmission', 'BTS & Power Infrastructure', 'IPTSB', 'I&I'],
  issueType:           ['Device Faulty', 'Device Stuck', 'Dismantled', 'Fiber Burn', 'Fiber Cut', 'Fiber Stolen', 'IIG issue', 'Logical Issue', 'Others', 'Patch Cord', 'Power Issue', 'SFP Issue', 'Shifting', 'Telco End Power Issue', 'Telco-NTTN Transmission issue', 'UTP cable issue', 'Laser High', 'Maintenance', 'Power & Fiber issue', 'Adapter Faulty', 'Core Break', 'Port Issue', 'NTTN End Power Issue', 'Distributor End Power Issue', 'Inverter Faulty', 'Fiber Bend', 'NTTN End Issue', 'TJ Box Broken', 'Device Changed', 'Telco End Fiber Cut', 'Intentionally', 'NTTN Device Down', 'NTTN End Fiber Cut', 'Distributor End Fiber Cut', 'BTS Fluctuation', 'Unstable Voltage', 'Device Reset', 'Telco & NTTN end Power Issue', 'Interface Down', 'BL End Tx Path Problem', 'Interface Stuck', 'Cable Damaged', 'Radio Unstable', 'High Utilization', 'Cable Faulty', 'Fiber Cut & Fiber Core Band', 'Circuit Breaker Faulty', 'LAN Port Issue', 'PPPoE issue', 'Fiber Cut & Traffic Utilization Full', 'Fiber Core Break', 'RF Cable', 'Global issue', 'Website Rendering Issue', 'NTTN Traffic Congestion', 'Distributor End Issue', 'Other', 'UPS Malfunction', 'NTTN End Fiber Shifted', 'Attack', 'VLAN Removed', 'Port Stuck', 'CPU High', 'Packet Loss', 'Hardware Issue', 'Device Malfunction', 'Traffic Fall', 'Frequency Issue', 'Device Down', 'Device Burn', 'Power Cord Issue', 'Temperature High', 'Adapter Cable Cut by Rat', 'Adapter Pigtail Problem', 'Web Site Issue', 'TJ Box Core Shortage', 'Routing Protocol Stuck', 'Fog Issue', 'OS Upgradation', 'Adapter Faulty', 'Cable Stolen', 'Router Fluctuation', 'Service Interruption', 'NTTN shifting issue', 'TX Path Issue', 'Inverter Stuck', 'NTTN Device Faulty'],
  incidentCategory:    ['Capacity link', 'Distributor', 'Fiber', 'IIG Link', 'Maintenance', 'Network', 'NTTN', 'Peer Interface', 'Power', 'Telco', 'Wireless Link', 'Traffic Fall', 'Wireless Interface', 'CDN Link Issue', 'Other', 'Fiber Laser High', 'CPU Load High', 'Interface', 'Traffic High Utilization', 'NIX', 'IPTSP Server', 'Server', 'Aggregation Link', 'UPS', 'Service Interruption', 'VPN', 'Telco POP', 'Packet Loss', 'Traffic Fluctuation', 'BTS Down'],
  incidentSubCategory: ['Capacity link', 'Distributor', 'Fiber', 'IIG Link', 'Maintenance', 'Network', 'NTTN', 'Peer Interface', 'Power', 'Telco', 'Wireless Link', 'Traffic Fall', 'Wireless Interface', 'CDN Link Issue', 'Other', 'Fiber Laser High', 'CPU Load High', 'Interface', 'Traffic High Utilization', 'NIX', 'IPTSP Server', 'Server', 'Aggregation Link', 'UPS', 'Service Interruption', 'VPN', 'Telco POP', 'Packet Loss', 'Traffic Fluctuation', 'BTS Down'],
  queryMail:           ['SCL', 'F@H', 'BL', 'GP', 'Not Required', 'BL & NTTN', 'BTCL', 'SCL, F@H & GP', 'ETL', 'Both NTTN', 'BAHON', 'F@H & BL', 'SCL & BL', 'BSCCL', 'ISPAB', 'WCL', 'F@H & GP', 'F@H & STL', 'STL', 'BDIX', 'GP & SCL', 'Apple-STT', 'RADIANT', 'Level3', 'SCL & STL', 'SCL & F@H', 'ICONIX', 'VELOCITY', 'F@H & BL', 'NIX', 'BL, GP, SCL', 'SCL, F@H & BL', 'BDHUB', 'SCL & ETL', 'GFCL'],
  zone:                ['Dhaka North', 'Dhaka South', 'Rangpur Zone', 'Khulna Zone', 'Sylhet Zone', 'CTG Zone', 'Rajshahi Zone', 'Mymensingh Zone', 'Barishal Zone', 'ALL Zone'],
  serviceImpacted:     ['YES', 'NO', '0'],
  durationOver4h:      ['YES', 'NO'],
  whatsappNotified:    ['Notified'],
  mailGenerated:       ['Yes', 'No', 'N/A'],
  rcaDocumentStatus:   ['Pending', 'Received', 'Reviewed', 'Not Required'],
  categories: [
    'Capacity link', 'Distributor', 'Fiber', 'IIG Link',
    'Maintenance', 'Network', 'NTTN', 'Peer Interface',
    'Power', 'Telco', 'Wireless Link', 'Traffic Fall',
    'Wireless Interface', 'CDN Link Issue', 'Other',
    'Fiber Laser High', 'CPU Load High', 'Interface',
    'Traffic High Utilization', 'NIX', 'IPTSP Server',
    'Server', 'Aggregation Link', 'UPS',
    'Service Interruption', 'VPN', 'Telco POP',
    'Packet Loss', 'Traffic Fluctuation', 'BTS Down',
  ],
  zones: [
    'Dhaka North', 'Dhaka South', 'Rangpur Zone',
    'Khulna Zone', 'Sylhet Zone', 'CTG Zone',
    'Rajshahi Zone', 'Mymensingh Zone', 'Barishal Zone',
    'ALL Zone',
  ],
  departments: [
    'NGNC', 'BNOC', 'NCSS', 'Survey & Transmission',
    'BTS & Power Infrastructure', 'IPTSB', 'I&I',
  ],
};

/** Fields that should never become a dropdown. */
export const TEXT_ONLY_FIELDS: ReadonlyArray<string> = [
  'date', 'incidentName', 'impactedClient',
  'duration', 'ticketId', 'rootCause', 'rcaProvider',
  'rcaProviderContact', 'actionTaken', 'informedPerson', 'informedTimeMedia',
  'ticketUpdateBy', 'ttForMail',
];

export function isTextOnly(key: string): boolean {
  return TEXT_ONLY_FIELDS.indexOf(key) >= 0;
}

export function getAllDropdowns(stored?: DropdownOptions): Required<DropdownOptions> {
  return { ...DROPDOWN_DEFAULTS, ...(stored || {}) };
}

export function getDropdown(stored: DropdownOptions | undefined, key: DropdownKey): string[] {
  const all = getAllDropdowns(stored);
  return all[key] || [];
}

export function setDropdown(
  stored: DropdownOptions | undefined,
  key: DropdownKey,
  list: string[],
): DropdownOptions {
  const next: DropdownOptions = { ...(stored || {}) };
  next[key] = (list || []).map((v) => String(v)).filter(Boolean);
  return next;
}

export function resetDropdowns(): DropdownOptions {
  return JSON.parse(JSON.stringify(DROPDOWN_DEFAULTS));
}

export const DropdownConfig = {
  get: getDropdown,
  getAll: getAllDropdowns,
  set: setDropdown,
  reset: resetDropdowns,
  isTextOnly,
  defaults: DROPDOWN_DEFAULTS,
  textOnlyFields: TEXT_ONLY_FIELDS,
  buildTimeOptions,
};
