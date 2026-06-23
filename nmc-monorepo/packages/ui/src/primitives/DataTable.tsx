/**
 * DataTable — typed, cross-platform table primitive.
 *
 * Mirrors the legacy `.table-wrap` / `.table` styling: sticky header, subtle
 * row separators, optional row press, optional zebra striping. Generic in
 * the row type so columns can pluck typed fields.
 */
import { forwardRef, useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from '../platform.js';
import { useTheme, makeStyles } from '../theme/ThemeContext.js';
import type { Tokens } from '../theme/tokens.js';

export interface DataTableColumn<T> {
  /** Stable id (also used as the React key) */
  readonly key: string;
  /** Header label */
  readonly header: string;
  /**
   * Cell renderer. Return any renderable React node. If omitted, the row is
   * stringified via `String(row[key as keyof T])`.
   */
  readonly render?: (row: T, index: number) => React.ReactNode;
  /** Fixed width (e.g. `'40%'`, `120`) */
  readonly width?: number | string;
  /** Right-align numeric columns */
  readonly align?: 'left' | 'right' | 'center';
  /** Hide this column on narrow viewports (caller can read window width) */
  readonly hideOnNarrow?: boolean;
}

export interface DataTableProps<T> {
  readonly columns: ReadonlyArray<DataTableColumn<T>>;
  readonly rows: ReadonlyArray<T>;
  /** Used for React keys; defaults to a few common id fields, then index. */
  readonly keyOf?: (row: T, index: number) => string;
  /** Optional row tap handler. When present, rows become pressable. */
  readonly onRowPress?: (row: T, index: number) => void;
  /** Empty-state slot. */
  readonly empty?: React.ReactNode;
  /** Compact mode (smaller padding, used in dense dashboards). */
  readonly dense?: boolean;
  /** Zebra striping. */
  readonly striped?: boolean;
  /** Highlight the first column with a subtle background (sticky look). */
  readonly stickyFirstColumn?: boolean;
  /** Outer container style override. */
  readonly style?: StyleProp<ViewStyle>;
  /** Horizontal scroll props forwarded to the inner ScrollView. */
  readonly scrollProps?: Omit<ScrollViewProps, 'children' | 'horizontal'>;
  /** testID forwarded to the wrapper. */
  readonly testID?: string;
}

interface DataTableStyles {
  wrap: ViewStyle;
  headerRow: ViewStyle;
  headerCell: TextStyle;
  bodyRow: ViewStyle;
  bodyRowStriped: ViewStyle;
  bodyRowPressed: ViewStyle;
  bodyCell: TextStyle;
  emptyWrap: ViewStyle;
  emptyText: TextStyle;
}

function defaultKey<T>(
  row: T,
  idx: number,
  keyOf?: (r: T, i: number) => string,
): string {
  if (keyOf) return keyOf(row, idx);
  if (typeof row === 'object' && row !== null) {
    const r = row as Record<string, unknown>;
    for (const k of ['id', 'key', 'uuid']) {
      const v = r[k];
      if (typeof v === 'string' || typeof v === 'number') return String(v);
    }
  }
  return String(idx);
}

function alignText(align: 'left' | 'right' | 'center' | undefined): TextStyle {
  if (align === 'right') return { textAlign: 'right' };
  if (align === 'center') return { textAlign: 'center' };
  return { textAlign: 'left' };
}

function DataTableInner<T>(
  props: DataTableProps<T>,
  ref: React.Ref<React.ElementRef<typeof View>>,
): React.ReactElement {
  const {
    columns,
    rows,
    keyOf,
    onRowPress,
    empty,
    dense,
    striped,
    stickyFirstColumn,
    style,
    scrollProps,
    testID,
  } = props;

  const { tokens: theme } = useTheme();
  const useStyles = useMemo(
    () =>
      makeStyles<DataTableStyles>((t: Tokens) => ({
        wrap: {
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: t.radius,
          backgroundColor: t.card,
          overflow: 'hidden',
        },
        headerRow: {
          flexDirection: 'row',
          backgroundColor: t.header,
          borderBottomWidth: 1,
          borderBottomColor: t.border,
        },
        headerCell: {
          flex: 1,
          color: t.headerText,
          fontWeight: '600',
          fontSize: dense ? 12 : 13,
          paddingVertical: dense ? 8 : 10,
          paddingHorizontal: dense ? 8 : 12,
        },
        bodyRow: {
          flexDirection: 'row',
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: t.border,
        },
        bodyRowStriped: { backgroundColor: t.surface },
        bodyRowPressed: { opacity: 0.6 },
        bodyCell: {
          flex: 1,
          color: t.text,
          fontSize: dense ? 12 : 13,
          paddingVertical: dense ? 8 : 10,
          paddingHorizontal: dense ? 8 : 12,
        },
        emptyWrap: {
          paddingVertical: 24,
          alignItems: 'center',
        },
        emptyText: {
          color: t.muted,
          fontSize: 13,
        },
      })),
    [dense],
  );
  const styles = useStyles();

  if (rows.length === 0) {
    return (
      <View ref={ref} testID={testID} style={[styles.wrap, style]}>
        <View style={styles.emptyWrap}>
          {empty ?? <Text style={styles.emptyText}>No data</Text>}
        </View>
      </View>
    );
  }

  return (
    <View ref={ref} testID={testID} style={[styles.wrap, style]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} {...scrollProps}>
        <View>
          <View style={styles.headerRow}>
            {columns.map((c) => (
              <Text
                key={c.key}
                style={[
                  styles.headerCell,
                  c.width != null ? { flex: 0, width: c.width as number } : null,
                  alignText(c.align),
                ]}
                numberOfLines={1}
              >
                {c.header}
              </Text>
            ))}
          </View>
          {rows.map((row, idx) => {
            const firstCol = stickyFirstColumn ? columns[0] : undefined;
            const firstStyle: ViewStyle | undefined = firstCol
              ? {
                  width: (firstCol.width as number) ?? undefined,
                  backgroundColor: striped && idx % 2 === 1 ? theme.surface : theme.card,
                }
              : undefined;

            const cellNodes = columns.map((c, ci) => {
              let node: React.ReactNode;
              if (c.render) {
                node = c.render(row, idx);
              } else {
                const v = (row as Record<string, unknown>)[c.key];
                node = v == null ? '' : String(v);
              }
              const isFirst = ci === 0;
              return (
                <View
                  key={c.key}
                  style={[
                    c.width != null ? { width: c.width as number } : { flex: 1 },
                    isFirst ? firstStyle : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.bodyCell,
                      c.width != null ? { flex: 0, width: c.width as number } : null,
                      alignText(c.align),
                    ]}
                    numberOfLines={1}
                  >
                    {node}
                  </Text>
                </View>
              );
            });

            const isStriped = striped && idx % 2 === 1;

            if (onRowPress) {
              return (
                <Pressable
                  key={defaultKey(row, idx, keyOf)}
                  onPress={() => onRowPress(row, idx)}
                  style={({ pressed }: { pressed: boolean }) => [
                    styles.bodyRow,
                    isStriped ? styles.bodyRowStriped : null,
                    pressed ? styles.bodyRowPressed : null,
                  ]}
                >
                  {cellNodes}
                </Pressable>
              );
            }
            return (
              <View
                key={defaultKey(row, idx, keyOf)}
                style={[styles.bodyRow, isStriped ? styles.bodyRowStriped : null]}
              >
                {cellNodes}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * `DataTable` is a generic component. The forwardRef wrapping loses the
 * generic signature, so the named function form is the most ergonomic:
 *
 *     const TicketTable = DataTable<Ticket>;
 *     <TicketTable columns={...} rows={...} />
 *
 * But the inline `<DataTable<Ticket> .../>` form also type-checks.
 */
export const DataTable = forwardRef(DataTableInner) as <T>(
  p: DataTableProps<T> & { ref?: React.Ref<React.ElementRef<typeof View>> },
) => React.ReactElement;
