import type { ContactLearnMap, ContactRecord } from './types.js';

/**
 * Free-text contact search. Returns top N ranked results.
 * Scoring (matches legacy):
 *   exact substring in any field  → +10
 *   per-token substring match      → +3
 *   zone match                     → +5
 *   district match                 → +4
 *   AI learned boost               → +8
 */
export function suggestContact(
  query: string,
  contacts: ContactRecord[],
  n = 8,
  learn?: ContactLearnMap,
): ContactRecord[] {
  const q = (query || '').toLowerCase().trim();
  if (!q) return [];
  const tokens = q.split(/[\s,_-]+/).filter(Boolean);

  const scored = contacts
    .map((c) => {
      const hay = [
        c.name,
        c.role,
        c.dept,
        c.zone,
        c.district,
        c.bts,
        ...(c.tags || []),
        c.phone,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      let s = 0;
      if (hay.includes(q)) s += 10;
      for (const t of tokens) if (hay.includes(t)) s += 3;
      if (c.zone && q.includes(c.zone.toLowerCase())) s += 5;
      if (c.district && q.includes(c.district.toLowerCase())) s += 4;
      if (learn && learn[q] && learn[q] === c.id) s += 8;
      return { c, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, n);

  return scored.map((x) => x.c);
}

export function learnContact(
  current: ContactLearnMap | undefined,
  query: string,
  contactId: string,
): ContactLearnMap {
  const next: ContactLearnMap = { ...(current || {}) };
  next[(query || '').toLowerCase().trim()] = contactId;
  return next;
}
