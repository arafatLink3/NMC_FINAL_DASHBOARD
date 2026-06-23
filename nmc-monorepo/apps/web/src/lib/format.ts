// Formatters ported from the legacy ai.js + per-page helpers.

import { diffDuration } from '@nmc/ai';

/** Format a Date as DD/MM/YY HH:MM (24h) */
export function fmtDMYHM(d: Date | string | number | null | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

/** "2 days 4 hrs 15 mins" or "4 hrs 15 mins" or "15 mins" */
export function fmtLongDuration(dur: string | null | undefined): string {
  if (!dur) return '';
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(dur);
  if (!m) return dur;
  const days = Number(m[1]);
  const hrs = Number(m[2]);
  const mins = Number(m[3]);
  const parts: string[] = [];
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hrs)  parts.push(`${hrs} hr${hrs === 1 ? '' : 's'}`);
  if (mins || parts.length === 0) parts.push(`${mins} min${mins === 1 ? '' : 's'}`);
  return parts.join(' ');
}

/** "4h 15m" — compact form. */
export function fmtCompactDuration(dur: string | null | undefined): string {
  if (!dur) return '';
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(dur);
  if (!m) return dur;
  const hrs = Number(m[1]) * 24 + Number(m[2]);
  const mins = Number(m[3]);
  if (hrs && mins) return `${hrs}h ${mins}m`;
  if (hrs) return `${hrs}h`;
  return `${mins}m`;
}

/** Compute HH:MM:SS between two dates / ISO strings, using the ai helper. */
export function durationBetween(a: string | Date | null | undefined, b: string | Date | null | undefined): string {
  if (!a || !b) return '';
  const aa = a instanceof Date ? a.toISOString() : a;
  const bb = b instanceof Date ? b.toISOString() : b;
  return diffDuration(aa, bb);
}

/** Format a value or "—" fallback. */
export function fmtOrDash(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

/** Format a number with thousands separators. */
export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '0';
  return n.toLocaleString();
}

/** Convert "HH:MM" + date to ISO. */
export function toISOFromDateTime(dateStr: string, hhmm: string): string {
  if (!dateStr || !hhmm) return '';
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return '';
  const [hh, mi] = [Number(m[1]), Number(m[2])];
  const [dd, mm, yyyy] = dateStr.split('-').map(Number);
  const d = new Date(yyyy ?? 1970, (mm ?? 1) - 1, dd ?? 1, hh, mi, 0, 0);
  return d.toISOString();
}

/** Truncate to N chars with ellipsis. */
export function truncate(s: string, n = 80): string {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
