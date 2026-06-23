import { describe, it, expect } from 'vitest';
import {
  classify,
  parseTicket,
  suggestContact,
  engineerAt,
  inferZone,
  buildTimeOptions,
  DROPDOWN_DEFAULTS,
  TEXT_ONLY_FIELDS,
  isTextOnly,
  parseTimeToISO,
  diffDuration,
  durationOverThreshold,
  CATEGORY_RULES,
} from '../src/index.js';

describe('classify', () => {
  it('returns the rule for an exact category match', () => {
    const r = classify('FO Link down', '');
    expect(r.dept).toBe('NCSS');
    expect(r.issue).toBe('Fiber / Physical');
  });

  it('returns the rule for a substring/tag match', () => {
    const r = classify('Unknown Category', 'fiber is burnt');
    expect(r.category).toBe('FO Link down');
    expect(r.dept).toBe('NCSS');
  });

  it('falls back to NCSS / General', () => {
    const r = classify('', 'completely unrelated text');
    expect(r.dept).toBe('NCSS');
    expect(r.issue).toBe('General');
  });

  it('respects a user-trained override', () => {
    const r = classify('FO Link down', '', { 'FO Link down': 'I&I' });
    expect(r.dept).toBe('I&I');
  });
});

describe('parseTicket', () => {
  it('extracts label fields, ping, and optical power', () => {
    const raw = [
      'Category: BRAS Down',
      'BTS/Area: DHK-01',
      'Impacted Customers (IC): 12',
      'Fault Time: 10:30',
      'ETR: 11:15',
      'Root Cause: fiber cut',
      'TT: TT-1234',
      '',
      '5 packet(s) transmitted, 5 packet(s) received, 0.0% packet loss',
      'Rx Optical Power: -23.5 dBm',
      'Tx Optical Power: 2.1 dBm',
    ].join('\n');
    const p = parseTicket(raw);
    expect(p.category).toBe('BRAS Down');
    expect(p.bts).toBe('DHK-01');
    expect(p.ic).toBe(12);
    expect(p.serviceImpacted).toBe('YES');
    expect(p.faultTime).toBe('10:30');
    expect(p.etr).toBe('11:15');
    expect(p.rootCause).toBe('fiber cut');
    expect(p.ticketId).toBe('TT-1234');
    expect(p.ping.transmitted).toBe('5');
    expect(p.ping.loss).toBe('0.0%');
    expect(p.laser.rx).toBe('-23.5 dBm');
  });

  it('treats "no" IC as 0', () => {
    const p = parseTicket('Impacted Customers (IC): no');
    expect(p.ic).toBe(0);
    expect(p.serviceImpacted).toBe('0');
  });
});

describe('suggestContact', () => {
  const contacts = [
    { id: 'a', name: 'Rahim Ahmed',  zone: 'Dhaka North', district: 'Mirpur', tags: ['fiber'] },
    { id: 'b', name: 'Karim Hossain',zone: 'CTG Zone',    district: 'Chattogram', tags: ['iig'] },
    { id: 'c', name: 'Jamal Uddin',  zone: 'Dhaka South', district: 'Motijheel', tags: [] },
  ];

  it('returns top N ranked by exact > zone > token', () => {
    const out = suggestContact('mirpur', contacts, 5);
    expect(out[0].id).toBe('a');
  });

  it('returns [] for empty query', () => {
    expect(suggestContact('', contacts)).toEqual([]);
  });

  it('boosts learned contacts', () => {
    const out = suggestContact('ctg', contacts, 5, { ctg: 'b' });
    expect(out[0].id).toBe('b');
  });
});

describe('engineerAt', () => {
  const rosters = [
    { date: '2026-06-22', dept: 'NMC', shift: 'Morning', engineers: [{ name: 'A' }] },
    { date: '2026-06-22', dept: 'NMC', shift: 'Evening', engineers: [{ name: 'B' }] },
    { date: '2026-06-22', dept: 'NMC', shift: 'Night',   engineers: [{ name: 'C' }] },
  ];

  it('picks Morning at 10:00', () => {
    const r = engineerAt('2026-06-22T10:00:00', rosters);
    expect(r.shift).toBe('Morning');
    expect(r.collision).toBe(false);
  });

  it('picks Evening at 18:00', () => {
    const r = engineerAt('2026-06-22T18:00:00', rosters);
    expect(r.shift).toBe('Evening');
  });

  it('flags collision 14:00–16:00', () => {
    const r = engineerAt('2026-06-22T15:00:00', rosters);
    expect(r.shift).toBe('Evening');
    expect(r.collision).toBe(true);
    expect(r.engineers.length).toBe(2);
  });

  it('picks Night at 02:00', () => {
    const r = engineerAt('2026-06-22T02:00:00', rosters);
    expect(r.shift).toBe('Night');
  });
});

describe('inferZone', () => {
  it('detects Dhaka North from "mirpur"', () => {
    expect(inferZone('Site at Mirpur-10 is down')).toBe('Dhaka North');
  });
  it('detects CTG Zone from "chattogram"', () => {
    expect(inferZone('Chattogram POP')).toBe('CTG Zone');
  });
  it('returns empty for unknown', () => {
    expect(inferZone('xyz')).toBe('');
  });
});

describe('dropdowns', () => {
  it('buildTimeOptions has 96 entries (24*4)', () => {
    expect(buildTimeOptions().length).toBe(96);
    expect(buildTimeOptions()[0]).toBe('00:00');
    expect(buildTimeOptions()[95]).toBe('23:45');
  });

  it('DROPDOWN_DEFAULTS includes all expected keys', () => {
    expect(DROPDOWN_DEFAULTS.session).toEqual(['Morning', 'Evening', 'Night']);
    expect(DROPDOWN_DEFAULTS.zone).toContain('CTG Zone');
  });

  it('isTextOnly returns true for date / ticketId', () => {
    expect(isTextOnly('date')).toBe(true);
    expect(isTextOnly('ticketId')).toBe(true);
    expect(isTextOnly('zone')).toBe(false);
  });

  it('TEXT_ONLY_FIELDS is non-empty and includes date', () => {
    expect(TEXT_ONLY_FIELDS.length).toBeGreaterThan(0);
    expect(TEXT_ONLY_FIELDS).toContain('date');
  });
});

describe('time helpers', () => {
  it('parseTimeToISO handles 24h and 12h times', () => {
    expect(parseTimeToISO('2026-06-22', '10:30')).toMatch(/T10:30:00/);
    expect(parseTimeToISO('2026-06-22', '10:30:45')).toMatch(/T10:30:45/);
    expect(parseTimeToISO('2026-06-22', '2pm')).toMatch(/T14:00:00/);
    expect(parseTimeToISO('2026-06-22', '12am')).toMatch(/T00:00:00/);
    expect(parseTimeToISO('2026-06-22', '')).toBe('');
  });

  it('diffDuration returns HH:MM:SS and clamps negatives', () => {
    expect(diffDuration('2026-06-22T00:00:00Z', '2026-06-22T01:30:00Z')).toBe('01:30:00');
    expect(diffDuration('2026-06-22T01:00:00Z', '2026-06-22T00:00:00Z')).toBe('00:00:00');
    expect(diffDuration('', '')).toBe('');
  });

  it('durationOverThreshold respects 4h rule', () => {
    expect(durationOverThreshold('04:00:00', 4)).toBe('NO');
    expect(durationOverThreshold('04:00:01', 4)).toBe('YES');
    expect(durationOverThreshold('not a duration', 4)).toBe('NO');
  });
});

describe('CATEGORY_RULES', () => {
  it('has 27 entries', () => {
    expect(CATEGORY_RULES.length).toBe(27);
  });
});
