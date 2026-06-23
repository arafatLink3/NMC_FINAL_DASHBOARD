import type { ParsedTicket } from './types.js';

/**
 * Accepts the standard NMC ticket text and returns structured fields.
 * Mirrors `parseTicket` in `NMC Dashboard/js/ai.js` (case-insensitive
 * label regex, ping / optical-power extraction, IC normalisation).
 */
export function parseTicket(raw: string): ParsedTicket {
  const text = (raw || '').replace(/\r/g, '');
  const get = (label: string): string => {
    const re = new RegExp(label + '\\s*:\\s*([^\\n\\r]+)', 'i');
    const m = text.match(re);
    return m && m[1] ? m[1].trim() : '';
  };

  const category = get('Category');
  const bts = get('BTS/Area');
  const icRaw = get('Impacted Customers \\(IC\\)');
  const faultRaw = get('Fault Time');
  const etrRaw = get('ETR');
  const root = get('Root Cause');
  const tt = get('TT');

  // Ping statistics
  const ping: ParsedTicket['ping'] = {};
  const tx = text.match(/(\d+)\s*packet\(s\)\s*transmitted/i);
  const rx = text.match(/(\d+)\s*packet\(s\)\s*received/i);
  const loss = text.match(/([\d.]+)\s*%\s*packet\s*loss/i);
  if (tx && tx[1]) ping.transmitted = tx[1];
  if (rx && rx[1]) ping.received = rx[1];
  if (loss && loss[1]) ping.loss = loss[1] + '%';

  // Optical power
  const laser: ParsedTicket['laser'] = {};
  const rxOp = text.match(/Rx Optical Power\s*:\s*([-\d.]+\s*dBm)/i);
  const txOp = text.match(/Tx Optical Power\s*:\s*([-\d.]+\s*dBm)/i);
  if (rxOp && rxOp[1]) laser.rx = rxOp[1];
  if (txOp && txOp[1]) laser.tx = txOp[1];

  let ic = 0;
  if (icRaw && /^\d+$/.test(icRaw)) ic = parseInt(icRaw, 10);
  else if (icRaw && /no/i.test(icRaw)) ic = 0;

  return {
    raw,
    category,
    subCategory: '',
    bts,
    incidentName: '',
    ic,
    icRaw,
    serviceImpacted: ic > 0 ? 'YES' : '0',
    faultTime: faultRaw,
    etr: etrRaw,
    rootCause: root,
    ticketId: tt,
    ping,
    laser,
  };
}
