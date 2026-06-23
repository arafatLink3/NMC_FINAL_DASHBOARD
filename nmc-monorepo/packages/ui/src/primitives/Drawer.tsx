/**
 * Drawer — Right-side slide-in panel, used for the notification list
 * and the contact picker.
 *
 * Mirrors the legacy `.drawer-mask` + `.drawer` rules in `css/theme.css`:
 *   - mask: `position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:90`
 *   - panel: `position:fixed; top:0; right:-420px; width:400px; max-width:92vw;
 *             height:100vh; background:var(--surface); border-left:1px solid
 *             var(--border); z-index:100; transition:right .35s`
 *
 * On web we keep the fixed positioning and the right offset trick
 * (`right:0` when open). On native, we just translate the panel
 * horizontally; the RN Modal still handles the status-bar dim.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  type ReactNode,
  type Ref,
} from 'react';
import {
  View,
  Text,
  Pressable,
  type GestureResponderEvent,
  type ViewStyle,
  type TextStyle,
} from '../platform.js';
import { IS_WEB, IS_NATIVE } from '../platform.js';
import { useTheme, makeStyles } from '../theme/ThemeContext.js';
import type { Tokens } from '../theme/tokens.js';

export type DrawerSide = 'right' | 'left';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Header content — typically a title + close button. */
  title?: ReactNode;
  /** Right-aligned header accessory (e.g. "Mark all read"). */
  headerAction?: ReactNode;
  /** Body content. Scrollable when long. */
  children?: ReactNode;
  /** Footer content. */
  footer?: ReactNode;
  /** Which side to slide in from. Default: right. */
  side?: DrawerSide;
  /** Width in pixels. Default 400. */
  width?: number;
  /** Tapping the backdrop is ignored when true. */
  persistent?: boolean;
  style?: ViewStyle;
  maskStyle?: ViewStyle;
  testID?: string;
}

interface DrawerStyles {
  mask: ViewStyle;
  panel: ViewStyle;
  head: ViewStyle;
  titleRow: ViewStyle;
  title: TextStyle;
  body: ViewStyle;
  foot: ViewStyle;
  close: TextStyle;
  closeBtn: ViewStyle;
}

const useStyles = makeStyles<DrawerStyles>((t: Tokens) => ({
  mask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 90,
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 400,
    maxWidth: '92%',
    backgroundColor: t.surface,
    borderLeftWidth: 1,
    borderLeftColor: t.border,
    zIndex: 100,
    flexDirection: 'column',
    boxShadow: t.shadow,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: t.border,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: t.text },
  body: { flex: 1, padding: 8 },
  foot: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  close: { color: t.muted, fontSize: 18, lineHeight: 18 },
  closeBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
}));

export const Drawer = forwardRef(function Drawer(
  props: DrawerProps,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ref: Ref<any>,
): JSX.Element | null {
  const {
    open,
    onClose,
    title,
    headerAction,
    children,
    footer,
    side = 'right',
    width = 400,
    persistent = false,
    style,
    maskStyle,
    testID,
  } = props;
  const styles = useStyles();

  const handleBackdropPress = useCallback(
    (_e: GestureResponderEvent) => {
      if (persistent) return;
      onClose();
    },
    [onClose, persistent],
  );

  // ESC-to-close on web.
  useEffect(() => {
    if (!open || !IS_WEB) return;
    if (typeof document === 'undefined') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  // Side-specific positioning. Right: pinned to the right edge.
  // Left: pinned to the left edge with a right border.
  const sideStyle: ViewStyle =
    side === 'right'
      ? { right: 0, borderLeftWidth: 1, borderLeftColor: styles.panel.borderLeftColor as string }
      : { left: 0, borderRightWidth: 1, borderRightColor: styles.panel.borderLeftColor as string };

  const panel = (
    <View
      ref={ref}
      testID={testID}
      style={[styles.panel, sideStyle, { width }, style]}
      onStartShouldSetResponder={() => true}
    >
      {(title || headerAction) && (
        <View style={styles.head}>
          <View style={styles.titleRow}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
          </View>
          {headerAction}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close drawer"
            onPress={onClose}
            style={styles.closeBtn}
          >
            <Text style={styles.close}>×</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.body}>{children}</View>
      {footer ? <View style={styles.foot}>{footer}</View> : null}
    </View>
  );

  const mask = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close drawer"
      onPress={handleBackdropPress}
      style={[styles.mask, maskStyle]}
    >
      {panel}
    </Pressable>
  );

  if (IS_NATIVE) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RNModal = require('react-native').Modal;
    return (
      <RNModal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={persistent ? undefined : onClose}
      >
        <View style={[styles.mask, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
          {panel}
        </View>
      </RNModal>
    );
  }

  return mask;
});
