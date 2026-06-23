/**
 * tokens.ts — Visual design tokens for the NMC UI.
 *
 * Mirrors the CSS custom properties in `css/theme.css` (the legacy SPA's
 * dark + light themes). Kept byte-for-byte equivalent so the modernised
 * apps don't drift from the original look-and-feel. New apps that adopt
 * this package should treat the dark tokens as the canonical values and
 * the light overrides as the optional [data-theme="light"] swap.
 *
 * Why not CSS variables only?
 *   - React Native's `StyleSheet.create` works in pure JS, so we need
 *     the same values accessible to TypeScript.
 *   - Several components (DataTable status tints, Tag backgrounds, etc.)
 *     need to read tokens programmatically (e.g. for severity → color).
 */

export const DARK_TOKENS = {
  bg: '#0b1220',
  card: '#121a2b',
  header: '#16223a',
  border: '#1f2a44',
  text: '#e6edf7',
  muted: '#9bb1d6',
  primary: '#4f8cff',
  primary2: '#6aa8ff',
  success: '#6ad29c',
  warning: '#ffb454',
  danger: '#ff6b6b',
  info: '#7ad7f0',
  shadow: '0 6px 24px rgba(0,0,0,.25)',
  radius: 12,
  radiusSm: 8,
  surface: '#0e1626',
  surface2: '#0a0f1c',
  headerText: '#ffffff',
  pillText: '#9bb1d6',
  onPrimary: '#ffffff',
  onWarning: '#0b1220',
  onSuccess: '#0b1220',
  onDanger: '#ffffff',
  onBadge: '#ffffff',
  logoText: '#0b1220',
  // Decorative text tints used by status tags
  tagBlue: '#9bb1d6',
  tagGreen: '#6ad29c',
  tagYellow: '#ffb454',
  tagRed: '#ff6b6b',
  tagCyan: '#7ad7f0',
  tagMuted: '#9bb1d6',
  // Status palette (full-row tints for the incident log)
  stYellow: { fill: 'rgba(245,180,0,.22)', text: '#ffd966', line: 'rgba(245,180,0,.55)' },
  stOrange: { fill: 'rgba(255,122,26,.24)', text: '#ffb37a', line: 'rgba(255,122,26,.6)' },
  stAsh:    { fill: 'rgba(180,180,190,.20)', text: '#d6d8de', line: 'rgba(180,180,190,.55)' },
  stSky:    { fill: 'rgba(30,144,255,.24)', text: '#7fc4ff', line: 'rgba(30,144,255,.6)' },
  stSolved: { fill: 'rgba(106,210,156,.22)', text: '#8de2b8', line: 'rgba(106,210,156,.6)' },
  // Mono "log" block
  ticketMonoBg: '#0e1320',
  ticketMonoText: '#9aa4b2',
  ticketMonoBorder: '#222e40',
  // Soft tints for filled status pills (`Badge` variant="status",
  // legacy `.status.running/.solved/.pending/.expired`).
  primarySoft: 'rgba(79,140,255,.18)',
  successSoft: 'rgba(106,210,156,.18)',
  warningSoft: 'rgba(255,180,84,.18)',
  dangerSoft: 'rgba(255,107,107,.18)',
  infoSoft: 'rgba(122,215,240,.18)',
} as const;

export const LIGHT_TOKENS: Tokens = {
  ...DARK_TOKENS,
  bg: '#f4f6fb',
  card: '#ffffff',
  header: '#ffffff',
  border: '#dfe5ef',
  text: '#0e1726',
  muted: '#5a6a86',
  primary: '#2563eb',
  primary2: '#1d4ed8',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
  info: '#0891b2',
  shadow: '0 4px 18px rgba(15,23,42,.08)',
  surface: '#eef2f8',
  surface2: '#f8fafc',
  headerText: '#0e1726',
  pillText: '#475569',
  // Slightly darker variants for light-mode tag tints so they read on white
  tagBlue: '#1d4ed8',
  tagGreen: '#15803d',
  tagYellow: '#b45309',
  tagRed: '#b91c1c',
  tagCyan: '#0e7490',
  tagMuted: '#475569',
  stYellow: { fill: '#fff3d6', text: '#7a5400', line: '#d8a800' },
  stOrange: { fill: '#ffe2cf', text: '#8a3a00', line: '#d9621a' },
  stAsh:    { fill: '#e3e4e8', text: '#4a4d55', line: '#9aa0a8' },
  stSky:    { fill: '#dceeff', text: '#0b3d70', line: '#6aa9e6' },
  stSolved: { fill: '#d6f1e3', text: '#0f5a39', line: '#3da67a' },
  ticketMonoBg: '#f1f5f9',
  ticketMonoText: '#475569',
  ticketMonoBorder: '#cbd5e1',
  primarySoft: 'rgba(37,99,235,.12)',
  successSoft: 'rgba(22,163,74,.14)',
  warningSoft: 'rgba(217,119,6,.16)',
  dangerSoft: 'rgba(220,38,38,.14)',
  infoSoft: 'rgba(8,145,178,.14)',
} as const;

export type ThemeMode = 'dark' | 'light';

/** Widen the literal types from `as const` so consumers can override
 *  individual values (light theme, brand themes, etc.) without losing
 *  the structural shape. */
export interface Tokens {
  readonly bg: string;
  readonly card: string;
  readonly header: string;
  readonly border: string;
  readonly text: string;
  readonly muted: string;
  readonly primary: string;
  readonly primary2: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly info: string;
  readonly shadow: string;
  readonly radius: number;
  readonly radiusSm: number;
  readonly surface: string;
  readonly surface2: string;
  readonly headerText: string;
  readonly pillText: string;
  readonly onPrimary: string;
  readonly onWarning: string;
  readonly onSuccess: string;
  readonly onDanger: string;
  readonly onBadge: string;
  readonly logoText: string;
  readonly tagBlue: string;
  readonly tagGreen: string;
  readonly tagYellow: string;
  readonly tagRed: string;
  readonly tagCyan: string;
  readonly tagMuted: string;
  readonly stYellow: { readonly fill: string; readonly text: string; readonly line: string };
  readonly stOrange: { readonly fill: string; readonly text: string; readonly line: string };
  readonly stAsh:    { readonly fill: string; readonly text: string; readonly line: string };
  readonly stSky:    { readonly fill: string; readonly text: string; readonly line: string };
  readonly stSolved: { readonly fill: string; readonly text: string; readonly line: string };
  readonly ticketMonoBg: string;
  readonly ticketMonoText: string;
  readonly ticketMonoBorder: string;
  readonly primarySoft: string;
  readonly successSoft: string;
  readonly warningSoft: string;
  readonly dangerSoft: string;
  readonly infoSoft: string;
}

export function tokensFor(mode: ThemeMode): Tokens {
  return mode === 'light' ? LIGHT_TOKENS : DARK_TOKENS;
}
