/**
 * Badge — Small status pill.
 *
 * Mirrors the legacy `.status` and `.tag` rules in `css/theme.css`:
 *   - `.status`  : `font-size:11px; padding:2px 8px; border-radius:999px;
 *                   display:inline-block` with kind-coloured fills
 *   - `.tag`     : same shape but with a thin border and `var(--surface)`
 *                   background; kind tints come from `--tag-{colour}`
 *
 * `variant="status"` is for filled status pills (running/solved/etc.);
 * `variant="tag"` is for outlined category tags.
 */
import { forwardRef, type ReactNode, type Ref } from 'react';
import { View, Text, type TextStyle, type ViewStyle } from '../platform.js';
import { useTheme, makeStyles } from '../theme/ThemeContext.js';
import type { Tokens } from '../theme/tokens.js';

export type BadgeKind = 'primary' | 'success' | 'warn' | 'danger' | 'info' | 'muted';
export type BadgeVariant = 'status' | 'tag';

export interface BadgeProps {
  children: ReactNode;
  kind?: BadgeKind;
  variant?: BadgeVariant;
  style?: ViewStyle;
  testID?: string;
}

interface BadgeStyles {
  base: ViewStyle;
  text: TextStyle;

  // Filled (status) — soft tinted bg + matching text.
  statusPrimary: ViewStyle;
  statusSuccess: ViewStyle;
  statusWarn: ViewStyle;
  statusDanger: ViewStyle;
  statusInfo: ViewStyle;
  statusMuted: ViewStyle;
  textPrimary: TextStyle;
  textSuccess: TextStyle;
  textWarn: TextStyle;
  textDanger: TextStyle;
  textInfo: TextStyle;
  textMuted: TextStyle;

  // Outlined (tag) — transparent bg, coloured text + border.
  tagPrimary: ViewStyle;
  tagSuccess: ViewStyle;
  tagWarn: ViewStyle;
  tagDanger: ViewStyle;
  tagInfo: ViewStyle;
  tagMuted: ViewStyle;
}

const useStyles = makeStyles<BadgeStyles>((t: Tokens) => ({
  base: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '500' },

  statusPrimary: { backgroundColor: t.primarySoft },
  statusSuccess: { backgroundColor: t.successSoft },
  statusWarn: { backgroundColor: t.warningSoft },
  statusDanger: { backgroundColor: t.dangerSoft },
  statusInfo: { backgroundColor: t.infoSoft },
  statusMuted: { backgroundColor: t.surface },
  textPrimary: { color: t.primary },
  textSuccess: { color: t.success },
  textWarn: { color: t.warning },
  textDanger: { color: t.danger },
  textInfo: { color: t.info },
  textMuted: { color: t.muted },

  tagPrimary: { borderWidth: 1, borderColor: t.primary, backgroundColor: t.surface },
  tagSuccess: { borderWidth: 1, borderColor: t.success, backgroundColor: t.surface },
  tagWarn: { borderWidth: 1, borderColor: t.warning, backgroundColor: t.surface },
  tagDanger: { borderWidth: 1, borderColor: t.danger, backgroundColor: t.surface },
  tagInfo: { borderWidth: 1, borderColor: t.info, backgroundColor: t.surface },
  tagMuted: { borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
}));

function statusBgFor(kind: BadgeKind, styles: BadgeStyles): ViewStyle {
  switch (kind) {
    case 'primary': return styles.statusPrimary;
    case 'success': return styles.statusSuccess;
    case 'warn':    return styles.statusWarn;
    case 'danger':  return styles.statusDanger;
    case 'info':    return styles.statusInfo;
    case 'muted':   return styles.statusMuted;
  }
}

function statusTextFor(kind: BadgeKind, styles: BadgeStyles): TextStyle {
  switch (kind) {
    case 'primary': return styles.textPrimary;
    case 'success': return styles.textSuccess;
    case 'warn':    return styles.textWarn;
    case 'danger':  return styles.textDanger;
    case 'info':    return styles.textInfo;
    case 'muted':   return styles.textMuted;
  }
}

function tagBgFor(kind: BadgeKind, styles: BadgeStyles): ViewStyle {
  switch (kind) {
    case 'primary': return styles.tagPrimary;
    case 'success': return styles.tagSuccess;
    case 'warn':    return styles.tagWarn;
    case 'danger':  return styles.tagDanger;
    case 'info':    return styles.tagInfo;
    case 'muted':   return styles.tagMuted;
  }
}

export const Badge = forwardRef(function Badge(
  props: BadgeProps,
  ref: Ref<typeof View>,
): JSX.Element {
  const { children, kind = 'primary', variant = 'status', style, testID } = props;
  const styles = useStyles();
  // Touch the theme to keep it observable in dev tools; not used directly.
  useTheme();

  if (variant === 'tag') {
    return (
      <View ref={ref} testID={testID} style={[styles.base, tagBgFor(kind, styles), style]}>
        <Text style={[styles.text, statusTextFor(kind, styles)]}>{children}</Text>
      </View>
    );
  }

  return (
    <View ref={ref} testID={testID} style={[styles.base, statusBgFor(kind, styles), style]}>
      <Text style={[styles.text, statusTextFor(kind, styles)]}>{children}</Text>
    </View>
  );
});
