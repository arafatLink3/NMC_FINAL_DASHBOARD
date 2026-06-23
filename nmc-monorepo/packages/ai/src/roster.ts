import type { EngineerAtResult, RosterShiftEntry } from './types.js';

/**
 * Returns the on-duty shift / engineers for a given moment.
 * Collision window: 14:00–16:00 → both Morning and Evening are on duty.
 */
export function engineerAt(date: Date | string, rosters: RosterShiftEntry[]): EngineerAtResult {
  const d = typeof date === 'string' || date instanceof Date ? new Date(date) : new Date();
  const dateStr = d.toISOString().slice(0, 10);
  const h = d.getHours() + d.getMinutes() / 60;

  let shift: EngineerAtResult['shift'] = 'Night';
  if (h >= 8 && h < 14) shift = 'Morning';
  else if (h >= 14 && h < 22) shift = 'Evening';
  else if (h >= 22 || h < 8) shift = 'Night';

  const nmc = rosters.filter((r) => r.date === dateStr && r.dept === 'NMC');
  const inShift = nmc.filter((r) => r.shift === shift);
  let collision = false;
  let picked = inShift;
  if (h >= 14 && h < 16) {
    const morning = nmc.filter((r) => r.shift === 'Morning');
    picked = inShift.concat(morning);
    collision = morning.length > 0;
  }
  const engineers = picked.flatMap((r) => r.engineers ?? []);
  return { shift, engineers, collision };
}
