/**
 * global.css.ts — Default styles applied at the root of every app.
 *
 * Mirrors the body-level reset in `css/theme.css` and a few utility classes
 * (`.card`, `.btn`, `.row`, `.col-6`, `.muted`) that the legacy SPA used
 * heavily. Apps that prefer plain CSS can ignore this file and load the
 * `css/theme.css` they already ship; the tokens are equivalent either way.
 */
import { StyleSheet } from '../platform.js';
import { DARK_TOKENS, LIGHT_TOKENS } from './tokens.js';

export const globalStyles = StyleSheet.create({
  // The root view fills the viewport on both web and native.
  root: { flex: 1, backgroundColor: DARK_TOKENS.bg },
  rootLight: { backgroundColor: LIGHT_TOKENS.bg },
  // Body text default
  body: { color: DARK_TOKENS.text, fontSize: 14, lineHeight: 20 },
  bodyLight: { color: LIGHT_TOKENS.text },
  muted: { color: DARK_TOKENS.muted, fontSize: 12 },
  mutedLight: { color: LIGHT_TOKENS.muted },
  // The 12px rounded card surface used by every page
  card: {
    backgroundColor: DARK_TOKENS.card,
    borderRadius: DARK_TOKENS.radius,
    borderWidth: 1,
    borderColor: DARK_TOKENS.border,
    padding: 14,
  },
  cardLight: {
    backgroundColor: LIGHT_TOKENS.card,
    borderColor: LIGHT_TOKENS.border,
  },
  // 12-col grid row (used by the contact page legacy markup)
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  col6: { width: '50%' as unknown as number, padding: 6 },
});

export default globalStyles;
