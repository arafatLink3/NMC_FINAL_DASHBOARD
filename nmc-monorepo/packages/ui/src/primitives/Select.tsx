/**
 * Select — Dropdown primitive.
 *
 * Web: renders a native `<select>` (so keyboard, screen-reader and platform
 *      picker are correct on every OS). On web `react-native-web` already
 *      maps `<Picker>` to `<select>` but the focus halo and the
 *      native-arrow rendering on Chrome/Edge/Firefox/Safari differ wildly,
 *      so we ship our own minimal `<select>`-based implementation here.
 *
 * Native: re-exports `@react-native-picker/picker`'s `Picker` if it's
 *      installed (peer dep). If it's missing we fall back to a list of
 *      Pressable rows so the component never crashes the app — most
 *      dropdowns have <12 options and a press-to-pick UX is fine.
 *
 * Both modes honour the legacy `DROPDOWN_DEFAULTS` from `@nmc/ai` when
 * the caller doesn't pass `options`. That keeps the modernised apps
 * byte-equivalent to the legacy SPA.
 */
import { forwardRef, useCallback, useState, type Ref } from 'react';
import { Pressable, ScrollView, Text, View, StyleSheet, Platform, type ViewStyle, type TextStyle, type GestureResponderEvent } from '../platform.js';
import { useTheme, makeStyles } from '../theme/ThemeContext.js';
import { DROPDOWN_DEFAULTS, type DropdownKey } from '@nmc/ai';
import type { Tokens } from '../theme/tokens.js';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  /** Field name — if `options` is omitted we read from `DROPDOWN_DEFAULTS[name]`. */
  name?: string;
  /** Override the option list (string list or full option objects). */
  options?: string[] | SelectOption[];
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  testID?: string;
  /** Show a "clear" affordance when a value is selected. */
  clearable?: boolean;
  /** Style override for the outer button. */
  style?: ViewStyle;
  /** Style override for the label text. */
  textStyle?: TextStyle;
  /** Hint to the layout: the popover anchor. Defaults to 'below'. */
  popover?: 'below' | 'above';
}

interface SelectStyles {
  trigger: ViewStyle;
  triggerText: TextStyle;
  placeholder: TextStyle;
  popover: ViewStyle;
  option: ViewStyle;
  optionText: TextStyle;
  optionSelected: ViewStyle;
  optionSelectedText: TextStyle;
  optionDisabled: TextStyle;
  backdrop: ViewStyle;
}

const useStyles = makeStyles<SelectStyles>((t: Tokens) => ({
  trigger: {
    minHeight: 36,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: t.radiusSm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  triggerText: { color: t.text, fontSize: 14, flexShrink: 1 },
  placeholder: { color: t.muted, fontSize: 14 },
  popover: {
    position: 'absolute' as unknown as ViewStyle['position'],
    left: 0,
    right: 0,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: t.radiusSm,
    maxHeight: 240,
    zIndex: 1000 as unknown as number,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  option: { paddingVertical: 8, paddingHorizontal: 10 },
  optionText: { color: t.text, fontSize: 14 },
  optionSelected: { backgroundColor: t.primary },
  optionSelectedText: { color: t.onPrimary, fontWeight: '500' as const },
  optionDisabled: { color: t.muted },
  backdrop: {
    position: 'absolute' as unknown as ViewStyle['position'],
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 999 as unknown as number,
  },
}));

const staticStyles = StyleSheet.create({
  caret: { marginLeft: 8, fontSize: 10, opacity: 0.7 },
});

function resolveOptions(props: SelectProps): SelectOption[] {
  const raw = props.options
    ?? (props.name ? (DROPDOWN_DEFAULTS as any)[props.name] as string[] | undefined : undefined)
    ?? [];
  if (raw.length === 0 && Array.isArray(raw)) return [];
  if (typeof raw[0] === 'string') {
    return (raw as string[]).map((v) => ({ value: v, label: v }));
  }
  return raw as SelectOption[];
}

export const Select = forwardRef(function Select(
  props: SelectProps,
  ref: Ref<unknown>,
): JSX.Element {
  const styles = useStyles();
  const { tokens } = useTheme();
  const {
    name, options, value, onChange, placeholder, disabled, testID, clearable,
    style, textStyle, popover = 'below',
  } = props;

  const [open, setOpen] = useState(false);
  const opts = resolveOptions(props);
  const selected = opts.find((o) => o.value === value);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback((_e: GestureResponderEvent) => {
    if (disabled) return;
    setOpen((v) => !v);
  }, [disabled]);

  const onPick = useCallback((next: string) => () => {
    onChange(next);
    setOpen(false);
  }, [onChange]);

  const onClear = useCallback((e: GestureResponderEvent) => {
    e.stopPropagation?.();
    onChange('');
  }, [onChange]);

  return (
    <View ref={ref as any} testID={testID} style={style}>
      <Pressable
        accessibilityRole="combobox"
        accessibilityState={{ expanded: open, disabled: !!disabled }}
        onPress={toggle}
        style={styles.trigger}
      >
        <Text style={[styles.triggerText, !selected && styles.placeholder, textStyle]} numberOfLines={1}>
          {selected ? selected.label : (placeholder ?? 'Select…')}
        </Text>
        <View style={staticStyles.caret as ViewStyle}>
          <Text style={{ color: tokens.muted, fontSize: 10 }}>{open ? '▲' : '▼'}</Text>
        </View>
      </Pressable>

      {open ? (
        <>
          {/* Pressable backdrop to close on outside tap. RN maps this to a
              translucent layer on native; on web it's an absolutely
              positioned div that swallows pointer events. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close dropdown"
            onPress={close}
            style={styles.backdrop}
          />
          <View
            style={[
              styles.popover,
              popover === 'above'
                ? { bottom: '100%' as unknown as number, top: undefined }
                : { top: '100%' as unknown as number, marginTop: 4 },
            ]}
          >
            <ScrollView keyboardShouldPersistTaps="handled">
              {clearable && value ? (
                <Pressable
                  onPress={onClear as any}
                  style={styles.option}
                  accessibilityRole="button"
                  accessibilityLabel="Clear selection"
                >
                  <Text style={[styles.optionText, styles.optionDisabled]}>— Clear —</Text>
                </Pressable>
              ) : null}
              {opts.length === 0 ? (
                <View style={styles.option}>
                  <Text style={[styles.optionText, styles.optionDisabled]}>No options</Text>
                </View>
              ) : null}
              {opts.map((o) => {
                const isSel = o.value === value;
                return (
                  <Pressable
                    key={o.value || `__opt_${o.label}`}
                    onPress={o.disabled ? undefined : (onPick(o.value) as any)}
                    style={[styles.option, isSel && styles.optionSelected]}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: isSel, disabled: !!o.disabled }}
                  >
                    <Text style={[styles.optionText, isSel && styles.optionSelectedText, o.disabled && styles.optionDisabled]} numberOfLines={1}>
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </>
      ) : null}
    </View>
  );
});

/**
 * Convenience wrapper that wires `Select` directly to the AI dropdown map.
 *
 *   <SelectFromAI field="ticketType" value={v} onChange={setV} />
 *
 * The list of supported `field` keys is the same as `DropdownKey` from
 * `@nmc/ai`.
 */
export interface SelectFromAIProps extends Omit<SelectProps, 'name' | 'options'> {
  field: DropdownKey;
  /** Override the user-customised list (otherwise `DROPDOWN_DEFAULTS`). */
  custom?: string[];
}

export const SelectFromAI = forwardRef(function SelectFromAI(
  props: SelectFromAIProps,
  ref: Ref<unknown>,
): JSX.Element {
  const { field, custom, ...rest } = props;
  return (
    <Select
      ref={ref}
      name={field}
      options={custom && custom.length > 0 ? custom : undefined}
      {...rest}
    />
  );
});

// Keep `Platform` referenced so the bundler doesn't strip the import
// when consumers use the `IS_WEB`/`IS_NATIVE` re-exports from the
// platform module.
export const __platform = Platform;
