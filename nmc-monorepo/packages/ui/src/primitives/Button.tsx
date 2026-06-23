/**
 * Button — Cross-platform button primitive.
 *
 * Variants are byte-for-byte equivalent to the legacy `.btn`, `.btn.ghost`,
 * `.btn.success`, `.btn.warn`, `.btn.danger` and `.btn.sm` classes in
 * `css/theme.css`. Sizes: `sm` (compact) and `md` (default). The optional
 * `leftIcon`/`rightIcon` slots accept a string (emoji/text) or a ReactNode
 * (for SVG icons) and render before/after the label.
 *
 * The component uses `Pressable` so we get correct press-in / press-out
 * states on both web (`hover` via onPressIn/Out + CSS `:active`) and
 * native (`pressed` prop). For full keyboard accessibility, we set
 * `accessibilityRole="button"` and a sensible `hitSlop`.
 */
import { forwardRef, type ReactNode, type Ref } from 'react';
import { Pressable, Text, StyleSheet, type ViewStyle, type TextStyle, type PressableProps, type GestureResponderEvent } from '../platform.js';
import { useTheme, makeStyles } from '../theme/ThemeContext.js';
import type { Tokens } from '../theme/tokens.js';

export type ButtonVariant = 'primary' | 'ghost' | 'success' | 'warn' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label?: string;
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /** Forwarded to both the pressable and the text — useful for `testID`. */
  testID?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  onPress?: (e: GestureResponderEvent) => void;
}

interface ButtonStyles {
  base: ViewStyle;
  sm: ViewStyle;
  primary: ViewStyle;
  ghost: ViewStyle;
  success: ViewStyle;
  warn: ViewStyle;
  danger: ViewStyle;
  disabled: ViewStyle;
  pressed: ViewStyle;
  text: TextStyle;
  textSm: TextStyle;
  textGhost: TextStyle;
}

const useStyles = makeStyles<ButtonStyles>((t: Tokens) => ({
  base: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: t.radiusSm,
    borderWidth: 0,
    backgroundColor: t.primary,
  },
  sm: { paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6 },
  primary: { backgroundColor: t.primary },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.border },
  success: { backgroundColor: t.success },
  warn: { backgroundColor: t.warning },
  danger: { backgroundColor: t.danger },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  text: { color: t.onPrimary, fontSize: 14, fontWeight: '500' as const },
  textSm: { fontSize: 12 },
  textGhost: { color: t.text },
}));

// Stable style handle so we can do `pointerEvents:'none'` on the inner label
// while the Pressable still receives taps. (We rely on react-native-web's
// pointer-events mapping for the web side.)
const staticStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { marginHorizontal: 2 },
});

function pickBg(variant: ButtonVariant, s: ButtonStyles): ViewStyle {
  switch (variant) {
    case 'ghost':   return s.ghost;
    case 'success': return s.success;
    case 'warn':    return s.warn;
    case 'danger':  return s.danger;
    case 'primary':
    default:        return s.primary;
  }
}

function pickFg(variant: ButtonVariant, t: Tokens): string {
  switch (variant) {
    case 'ghost':   return t.text;
    case 'success': return t.onSuccess;
    case 'warn':    return t.onWarning;
    case 'danger':  return t.onDanger;
    case 'primary':
    default:        return t.onPrimary;
  }
}

export const Button = forwardRef(function Button(
  props: ButtonProps,
  ref: Ref<typeof Pressable>,
): JSX.Element {
  const { tokens } = useTheme();
  const styles = useStyles();
  const {
    label,
    children,
    variant = 'primary',
    size = 'md',
    leftIcon,
    rightIcon,
    disabled = false,
    loading = false,
    style,
    textStyle,
    onPress,
    testID,
    ...rest
  } = props;

  const bg = { ...pickBg(variant, styles), ...(size === 'sm' ? styles.sm : {}) };
  const fg = { color: pickFg(variant, tokens) };
  const merged: ViewStyle = {
    ...bg,
    ...(disabled || loading ? styles.disabled : {}),
    ...(style || {}),
  };
  const mergedText: TextStyle = {
    ...styles.text,
    ...(size === 'sm' ? styles.textSm : {}),
    ...(variant === 'ghost' ? { color: tokens.text } : {}),
    ...fg,
    ...(textStyle || {}),
  };

  const content = children ?? (
    <Text style={mergedText} numberOfLines={1}>
      {label ?? ''}
    </Text>
  );

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      testID={testID}
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }: { pressed: boolean }) => [merged, pressed && styles.pressed]}
      {...rest}
    >
      {leftIcon ? <Text style={[staticStyles.icon, { color: mergedText.color as string }]}>{leftIcon as any}</Text> : null}
      {content}
      {rightIcon ? <Text style={[staticStyles.icon, { color: mergedText.color as string }]}>{rightIcon as any}</Text> : null}
    </Pressable>
  );
});
