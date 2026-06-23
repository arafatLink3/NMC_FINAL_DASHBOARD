/**
 * Modal — Centered dialog with backdrop, ESC-to-close on web, and a
 * portal-style mount on native.
 *
 * Mirrors the legacy `.modal-mask` + `.modal` rules in `css/theme.css`:
 *   - mask: `position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:150`
 *   - card: `background:var(--surface); border:1px solid var(--border);
 *            border-radius:var(--radius); width:680px; max-width:94vw;
 *            max-height:90vh; overflow:auto; padding:16px`
 *
 * On web, the mask + card render absolutely-positioned inside the parent
 * `View` (typically the app shell root). On native, we delegate to the
 * RN `Modal` component so it gets the proper native overlay behaviour
 * (back-button handling, status-bar dim).
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
  Platform as RNPlatform,
  type GestureResponderEvent,
  type ViewStyle,
  type TextStyle,
} from '../platform.js';
import { IS_WEB, IS_NATIVE } from '../platform.js';
import { useTheme, makeStyles } from '../theme/ThemeContext.js';
import type { Tokens } from '../theme/tokens.js';

export interface ModalProps {
  /** Whether the modal is visible. The component is a controlled dialog. */
  open: boolean;
  /** Called when the user dismisses the modal — backdrop tap, ESC, or
   *  the close button. Always set this; without it the modal can't close. */
  onClose: () => void;
  /** Optional title rendered in the header. */
  title?: ReactNode;
  /** Body content. */
  children?: ReactNode;
  /** Footer content (typically Cancel + Confirm buttons). */
  footer?: ReactNode;
  /** When true, tapping the backdrop does not close the modal. */
  persistent?: boolean;
  /** Hide the × close button in the header. */
  hideCloseButton?: boolean;
  /** Style override applied to the card. */
  style?: ViewStyle;
  /** Style override applied to the backdrop. */
  maskStyle?: ViewStyle;
  testID?: string;
}

interface ModalStyles {
  mask: ViewStyle;
  card: ViewStyle;
  head: ViewStyle;
  title: TextStyle;
  close: TextStyle;
  body: ViewStyle;
  foot: ViewStyle;
  closeBtn: ViewStyle;
}

const useStyles = makeStyles<ModalStyles>((t: Tokens) => ({
  mask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    // On web only — native has its own z-index strategy via RN Modal.
    zIndex: 150,
  },
  card: {
    backgroundColor: t.surface,
    borderRadius: t.radius,
    borderWidth: 1,
    borderColor: t.border,
    width: 680,
    maxWidth: '94%',
    maxHeight: '90%',
    padding: 16,
    boxShadow: t.shadow,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: t.text,
    flex: 1,
  },
  close: {
    color: t.muted,
    fontSize: 18,
    lineHeight: 18,
  },
  body: {
    // Let body scroll independently if the content is long.
  },
  foot: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  closeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
}));

export const Modal = forwardRef(function Modal(
  props: ModalProps,
  // We accept any ref shape — consumers usually want the card View, but
  // forwarding through the native Modal shim gets messy, so we just type
  // it loosely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ref: Ref<any>,
): JSX.Element | null {
  const {
    open,
    onClose,
    title,
    children,
    footer,
    persistent = false,
    hideCloseButton = false,
    style,
    maskStyle,
    testID,
  } = props;
  const styles = useStyles();
  const { tokens } = useTheme();

  const handleBackdropPress = useCallback(
    (e: GestureResponderEvent) => {
      // On web, the press event bubbles from descendants. Make sure
      // we're handling the mask, not something inside the card.
      if (persistent) return;
      onClose();
    },
    [onClose, persistent],
  );

  // ESC-to-close on web only.
  useEffect(() => {
    if (!open || !IS_WEB) return;
    if (typeof document === 'undefined') return;
    const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !persistent) onClose();
      };
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }, [open, onClose, persistent]);

  const card = (
    <View
      ref={ref}
      testID={testID}
      style={[styles.card, style]}
      // Prevent touches inside the card from bubbling to the mask.
      onStartShouldSetResponder={() => true}
    >
      {(title || !hideCloseButton) && (
        <View style={styles.head}>
          {title ? (
            <Text style={styles.title}>{title}</Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {!hideCloseButton && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={styles.closeBtn}
            >
              <Text style={styles.close}>×</Text>
            </Pressable>
          )}
        </View>
      )}
      <View style={styles.body}>{children}</View>
      {footer ? <View style={styles.foot}>{footer}</View> : null}
    </View>
  );

  const mask = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close modal"
      onPress={handleBackdropPress}
      style={[styles.mask, maskStyle]}
    >
      {card}
    </Pressable>
  );

  // When closed, render nothing — the controlled-dialog contract.
  if (!open) return null;

  // On native, defer to the platform Modal so the OS handles the
  // status-bar dim, hardware back button, etc.
  if (IS_NATIVE) {
    // Lazy-require to keep native-only code out of the web bundle.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RNModal = require('react-native').Modal;
    return (
      <RNModal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={persistent ? undefined : onClose}
        // Native Modal mounts at the root, so we don't need our own
        // absolute-positioned wrapper.
      >
        <View style={[styles.mask, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          {card}
        </View>
      </RNModal>
    );
  }

  // Web / SSR: in a real app you'd portal this to document.body to
  // escape ancestor overflow. For the SPA / Next.js apps we render
  // inline; the absolute positioning + z-index 150 keeps it above
  // the rest of the page. Consumers needing true portal behaviour
  // can wrap with their own portal in apps/web.
  // Touch the tokens reference so the theme is observable in dev
  // tools — also keeps tokens in scope for the future.
  void tokens;
  void RNPlatform;
  return mask;
});
