/**
 * Toast — Stacked, auto-dismissing notifications anchored to the
 * bottom-center of the viewport.
 *
 * Mirrors the legacy `.toast-wrap` + `.toast` rules in `css/theme.css`:
 *   - wrap: `position:fixed; bottom:18px; left:50%;
 *             transform:translateX(-50%); z-index:200; flex column gap 8`
 *   - toast: `background:var(--header); border-left:4px solid var(--primary);
 *              padding:8px 14px; border-radius:8px; min-width:260px;
 *              color:var(--header-text)`
 *   - `.toast.success/warn/danger` swaps the left border colour.
 *
 * Usage:
 *   const { push } = useToast();
 *   push({ kind: 'success', title: 'Saved' });
 *
 * The ToastHost component is what the app actually mounts once near
 * the root. `useToast()` is the public API and dispatches to it via
 * a small event emitter stored on a module-level singleton.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { View, Text, Pressable, type ViewStyle, type TextStyle } from '../platform.js';
import { useTheme, makeStyles } from '../theme/ThemeContext.js';
import type { Tokens } from '../theme/tokens.js';

export type ToastKind = 'info' | 'success' | 'warn' | 'danger';

export interface ToastOptions {
  /** Visual variant. Default: 'info'. */
  kind?: ToastKind;
  /** Short headline. */
  title: string;
  /** Optional secondary line. */
  message?: string;
  /** Auto-dismiss after N ms. Default 4000. Pass 0 to disable. */
  duration?: number;
  /** Optional click handler. Clicking the toast dismisses it either way. */
  onPress?: () => void;
}

interface ToastItem extends Required<Pick<ToastOptions, 'kind' | 'title'>> {
  id: number;
  message?: string;
  duration: number;
  onPress?: () => void;
}

interface ToastStyles {
  wrap: ViewStyle;
  toast: ViewStyle;
  title: TextStyle;
  message: TextStyle;
  close: TextStyle;
  success: ViewStyle;
  warn: ViewStyle;
  danger: ViewStyle;
  info: ViewStyle;
}

const useStyles = makeStyles<ToastStyles>((t: Tokens) => ({
  wrap: {
    position: 'absolute',
    bottom: 18,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 200,
  },
  toast: {
    backgroundColor: t.header,
    borderWidth: 1,
    borderColor: t.border,
    borderLeftWidth: 4,
    borderLeftColor: t.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 260,
    maxWidth: 480,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    boxShadow: t.shadow,
  },
  title: { color: t.headerText, fontWeight: '600', fontSize: 13 },
  message: { color: t.muted, fontSize: 12, marginTop: 2 },
  close: { color: t.muted, fontSize: 16, lineHeight: 16, paddingHorizontal: 4 },
  success: { borderLeftColor: t.success },
  warn: { borderLeftColor: t.warning },
  danger: { borderLeftColor: t.danger },
  info: { borderLeftColor: t.primary },
}));

// --- Module-level bus. The host registers a listener; useToast() calls
// push() which dispatches into the bus. This avoids needing a React
// context wrapper at the cost of a tiny singleton — acceptable because
// the toast surface is a singleton anyway. -----------------------------
type Listener = (item: ToastItem) => void;
const listeners = new Set<Listener>();
let nextId = 1;
export const toastBus = {
  push(opts: ToastOptions): number {
    const item: ToastItem = {
      id: nextId++,
      kind: opts.kind ?? 'info',
      title: opts.title,
      message: opts.message,
      duration: opts.duration ?? 4000,
      onPress: opts.onPress,
    };
    for (const l of listeners) l(item);
    return item.id;
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

// --- Hook --------------------------------------------------------------
export interface UseToast {
  (opts: ToastOptions): number;
  success(title: string, message?: string): number;
  warn(title: string, message?: string): number;
  danger(title: string, message?: string): number;
  info(title: string, message?: string): number;
}

export function useToast(): UseToast {
  return useMemo<UseToast>(() => {
    const fn = (opts: ToastOptions) => toastBus.push(opts);
    fn.success = (title: string, message?: string) => toastBus.push({ kind: 'success', title, message });
    fn.warn = (title: string, message?: string) => toastBus.push({ kind: 'warn', title, message });
    fn.danger = (title: string, message?: string) => toastBus.push({ kind: 'danger', title, message });
    fn.info = (title: string, message?: string) => toastBus.push({ kind: 'info', title, message });
    return fn;
  }, []);
}

// --- Host component ----------------------------------------------------
export interface ToastHostProps {
  /** Optional top offset to clear the app header. */
  topOffset?: number;
  testID?: string;
}

export function ToastHost(props: ToastHostProps): JSX.Element {
  const { topOffset = 0, testID } = props;
  const styles = useStyles();
  const [items, setItems] = useState<ToastItem[]>([]);
  const timeouts = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const off = toastBus.subscribe((item) => {
      setItems((prev) => [...prev, item]);
      if (item.duration > 0) {
        const handle = setTimeout(() => {
          setItems((prev) => prev.filter((t) => t.id !== item.id));
          timeouts.current.delete(item.id);
        }, item.duration);
        timeouts.current.set(item.id, handle);
      }
    });
    return () => {
      off();
      for (const h of timeouts.current.values()) clearTimeout(h);
      timeouts.current.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const h = timeouts.current.get(id);
    if (h) {
      clearTimeout(h);
      timeouts.current.delete(id);
    }
  }, []);

  return (
    <View
      testID={testID}
      pointerEvents="box-none"
      style={[styles.wrap, topOffset ? { top: topOffset } : null]}
    >
      {items.map((t) => {
        const kindStyle =
          t.kind === 'success'
            ? styles.success
            : t.kind === 'warn'
              ? styles.warn
              : t.kind === 'danger'
                ? styles.danger
                : styles.info;
        return (
          <Pressable
            key={t.id}
            onPress={() => {
              t.onPress?.();
              dismiss(t.id);
            }}
            style={[styles.toast, kindStyle]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t.title}</Text>
              {t.message ? <Text style={styles.message}>{t.message}</Text> : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              onPress={() => dismiss(t.id)}
            >
              <Text style={styles.close}>×</Text>
            </Pressable>
          </Pressable>
        );
      })}
    </View>
  );
}

// Keep `useTheme` import live so consumers can pull the same context
// from here. (No-op at runtime; just a re-export to keep the import
// surface small when sharing the import block.)
useTheme;
