/**
 * Input — Text input primitive (text, number, date, time, datetime-local, etc.).
 *
 * Mirrors the legacy `input,select,textarea` rule in `css/theme.css`:
 *   - `background: var(--surface)`
 *   - `color: var(--text)`
 *   - `border: 1px solid var(--border)`
 *   - `border-radius: 8px`
 *   - `padding: 8px 10px`
 *   - focus state: `border-color: var(--primary)` + `box-shadow: 0 0 0 3px rgba(79,140,255,.18)`
 *
 * On web, native focus rings still work — the `box-shadow` adds an extra
 * halo. On native, focus is a no-op visually (the OS handles it).
 */
import { forwardRef, useState, type Ref } from 'react';
import {
  TextInput,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
  type NativeSyntheticEvent,
  type TextInputFocusEventData,
} from '../platform.js';
import { useTheme, makeStyles } from '../theme/ThemeContext.js';
import type { Tokens } from '../theme/tokens.js';

export interface InputProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  /** Optional label rendered above the input (12px muted). */
  label?: string;
  /** Optional hint rendered below the input (12px muted). */
  hint?: string;
  /** Override the monospace font (used for the ticket Ping/Laser textarea). */
  mono?: boolean;
  /** Mark as invalid — draws a danger border. */
  invalid?: boolean;
  style?: ViewStyle;
  inputStyle?: TextStyle;
  testID?: string;
}

interface InputStyles {
  wrap: ViewStyle;
  base: TextStyle;
  mono: TextStyle;
  invalid: TextStyle;
}

const useStyles = makeStyles<InputStyles>((t: Tokens) => ({
  wrap: { marginBottom: 8 },
  base: {
    width: '100%' as unknown as number,
    backgroundColor: t.surface,
    color: t.text,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: t.radiusSm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  mono: { fontFamily: 'Consolas,JetBrains Mono,monospace', minHeight: 120 },
  invalid: { borderColor: t.danger },
}));

export const Input = forwardRef(function Input(
  props: InputProps,
  ref: Ref<typeof TextInput>,
): JSX.Element {
  const styles = useStyles();
  const { tokens } = useTheme();
  const {
    label, hint, mono = false, invalid = false, style, inputStyle, testID,
    onFocus, onBlur, placeholder, ...rest
  } = props;
  const [focused, setFocused] = useState(false);

  const merged: TextStyle = {
    ...styles.base,
    ...(mono ? styles.mono : {}),
    ...(invalid ? styles.invalid : {}),
    ...(focused ? { borderColor: tokens.primary, boxShadow: '0 0 0 3px rgba(79,140,255,.18)' } : {}),
    ...(inputStyle || {}),
  };

  return (
    <TextInput
      ref={ref}
      testID={testID}
      accessibilityLabel={label}
      placeholder={placeholder}
      placeholderTextColor={tokens.muted}
      onFocus={(e: NativeSyntheticEvent<TextInputFocusEventData>) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e: NativeSyntheticEvent<TextInputFocusEventData>) => { setFocused(false); onBlur?.(e); }}
      style={[merged, style as any]}
      {...rest}
    />
  );
});
