/**
 * AppShell — top bar + sidebar + main content area.
 *
 * Cross-platform: on web it lays out as a classic 3-zone page; on native
 * (react-native) the sidebar collapses to a Drawer and the top bar shrinks
 * to a safe-area-aware header. The same component tree is used in both
 * apps (`apps/web`, `apps/mobile`) so visual design stays in sync.
 */
import { forwardRef, useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from '../platform.js';
import { useTheme, makeStyles } from '../theme/ThemeContext.js';
import { IS_NATIVE } from '../platform.js';
import type { Tokens } from '../theme/tokens.js';
import { useDisclosure } from '../hooks/useDisclosure.js';
import { Drawer } from '../primitives/Drawer.js';

export interface AppShellNavItem {
  readonly key: string;
  readonly label: string;
  readonly icon?: string;
  readonly badge?: string;
  readonly active?: boolean;
  readonly onPress?: () => void;
}

export interface AppShellProps {
  readonly brand: React.ReactNode;
  readonly nav: ReadonlyArray<AppShellNavItem>;
  readonly navHeader?: React.ReactNode;
  readonly topActions?: React.ReactNode;
  readonly children: React.ReactNode;
  /** Sidebar width (web default 240). */
  readonly sidebarWidth?: number;
  /** Top bar height (default 56). */
  readonly topbarHeight?: number;
  /** Outer container style. */
  readonly style?: StyleProp<ViewStyle>;
  /** Main area style. */
  readonly contentStyle?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

interface AppShellStyles {
  root: ViewStyle;
  topbar: ViewStyle;
  topbarWeb: ViewStyle;
  brandWrap: ViewStyle;
  brandText: TextStyle;
  topActions: ViewStyle;
  hamburger: ViewStyle;
  hamburgerText: TextStyle;
  body: ViewStyle;
  sidebar: ViewStyle;
  navHeaderWrap: ViewStyle;
  navItem: ViewStyle;
  navItemActive: ViewStyle;
  navItemText: TextStyle;
  navItemTextActive: TextStyle;
  navBadge: ViewStyle;
  navBadgeText: TextStyle;
  main: ViewStyle;
}

function AppShellInner(
  props: AppShellProps,
  ref: React.Ref<React.ElementRef<typeof View>>,
): React.ReactElement {
  const {
    brand,
    nav,
    navHeader,
    topActions,
    children,
    sidebarWidth = 240,
    topbarHeight = 56,
    style,
    contentStyle,
    testID,
  } = props;

  const { tokens: theme } = useTheme();
  const drawer = useDisclosure(false);
  const useStyles = useMemo(
    () =>
      makeStyles<AppShellStyles>((t: Tokens) => ({
        root: { flex: 1, backgroundColor: t.bg },
        topbar: {
          height: topbarHeight,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          backgroundColor: t.header,
          borderBottomWidth: 1,
          borderBottomColor: t.border,
        },
        topbarWeb: { paddingLeft: 20 },
        brandWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
        brandText: {
          color: t.headerText,
          fontWeight: '700',
          fontSize: 16,
          marginLeft: 8,
        },
        topActions: { flexDirection: 'row', alignItems: 'center' },
        hamburger: {
          paddingVertical: 6,
          paddingHorizontal: 10,
          marginRight: 8,
        },
        hamburgerText: {
          color: t.headerText,
          fontSize: 18,
          fontWeight: '700',
        },
        body: { flex: 1, flexDirection: 'row' },
        sidebar: {
          width: sidebarWidth,
          backgroundColor: t.card,
          borderRightWidth: 1,
          borderRightColor: t.border,
          paddingVertical: 12,
        },
        navHeaderWrap: { paddingHorizontal: 16, paddingBottom: 12 },
        navItem: {
          paddingVertical: 10,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
        },
        navItemActive: { backgroundColor: t.surface },
        navItemText: { color: t.muted, fontSize: 14, flex: 1 },
        navItemTextActive: { color: t.text, fontWeight: '600' },
        navBadge: {
          paddingVertical: 2,
          paddingHorizontal: 6,
          backgroundColor: t.primarySoft,
          borderRadius: 999,
        },
        navBadgeText: { color: t.primary, fontSize: 11, fontWeight: '600' },
        main: { flex: 1, backgroundColor: t.bg },
      })),
    [sidebarWidth, topbarHeight],
  );
  const styles = useStyles();

  const renderNavItems = (): React.ReactNode => (
    <ScrollView>
      {navHeader ? <View style={styles.navHeaderWrap}>{navHeader}</View> : null}
      {nav.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => {
            item.onPress?.();
            if (IS_NATIVE) drawer.onClose();
          }}
          style={[styles.navItem, item.active ? styles.navItemActive : null]}
        >
          {item.icon ? (
            <Text
              style={[styles.navItemText, item.active ? styles.navItemTextActive : null]}
            >
              {item.icon}{'  '}
            </Text>
          ) : null}
          <Text
            style={[
              styles.navItemText,
              item.active ? styles.navItemTextActive : null,
            ]}
            numberOfLines={1}
          >
            {item.label}
          </Text>
          {item.badge ? (
            <View style={styles.navBadge}>
              <Text style={styles.navBadgeText}>{item.badge}</Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </ScrollView>
  );

  const Sidebar = IS_NATIVE ? (
    <Drawer
      open={drawer.open}
      onClose={drawer.onClose}
      side="left"
      width={sidebarWidth}
      title={null}
    >
      {renderNavItems()}
    </Drawer>
  ) : (
    <View style={styles.sidebar}>{renderNavItems()}</View>
  );

  return (
    <View ref={ref} testID={testID} style={[styles.root, style]}>
      <View style={[styles.topbar, IS_NATIVE ? null : styles.topbarWeb]}>
        {IS_NATIVE ? (
          <Pressable onPress={drawer.onOpen} style={styles.hamburger} hitSlop={8}>
            <Text style={styles.hamburgerText}>☰</Text>
          </Pressable>
        ) : null}
        <View style={styles.brandWrap}>
          {typeof brand === 'string' ? (
            <Text style={styles.brandText} numberOfLines={1}>
              {brand}
            </Text>
          ) : (
            brand
          )}
        </View>
        <View style={styles.topActions}>{topActions}</View>
      </View>
      <View style={styles.body}>
        {Sidebar}
        <View style={[styles.main, contentStyle]}>{children}</View>
      </View>
    </View>
  );
}

export const AppShell = forwardRef(AppShellInner);
