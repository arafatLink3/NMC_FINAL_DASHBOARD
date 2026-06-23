/**
 * Combine a YYYY-MM-DD date with an HH:MM (or HH:MM:SS, optional am/pm) time
 * into a full ISO string. Pass an empty dateStr to fall back to today.
 * Returns '' if timeStr is empty/unparseable.
 */
export function parseTimeToISO(dateStr: string, timeStr: string): string {
  if (!timeStr) return '';
  const m = String(timeStr).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return '';
  let hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3] || 0);
  const ap = (m[4] || '').toLowerCase();
  if (ap === 'pm' && hh < 12) hh += 12;
  if (ap === 'am' && hh === 12) hh = 0;
  const base =
    dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
      ? new Date(dateStr + 'T00:00:00')
      : new Date();
  base.setHours(hh, mm, ss, 0);
  return base.toISOString();
}

/** Difference between two ISO strings as HH:MM:SS. Hours can exceed 24. */
export function diffDuration(a: string, b: string): string {
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

/** Parse HH:MM:SS and return 'YES' if strictly greater than `hrs` hours. */
export function durationOverThreshold(dur: string, hrs: number | string): 'YES' | 'NO' {
  const threshold = Number(hrs) || 0;
  if (!dur) return 'NO';
  const m = String(dur).match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
  if (!m) return 'NO';
  const total = Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600;
  return total > threshold ? 'YES' : 'NO';
}
