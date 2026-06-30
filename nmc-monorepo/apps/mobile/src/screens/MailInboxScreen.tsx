/**
 * MailInboxScreen — Cached mail list with mark-as-read action.
 *
 * Hits `api.listMail()` (returns `FetchedMail` rows from the server's
 * `fetched_mail` table — gap #1). Tapping a row marks it read via
 * `api.markMailRead(uid)`.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme } from '@nmc/ui/theme';
import type { FetchedMail } from '@nmc/api-client';
import { api } from '../auth/api';

function fromLabel(m: FetchedMail): string {
  const first = m.from[0];
  if (!first) return '(unknown sender)';
  return first.name ? `${first.name} <${first.address ?? ''}>` : (first.address ?? '');
}

export function MailInboxScreen(): JSX.Element {
  const [items, setItems] = useState<FetchedMail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setError(null);
    try {
      const res = await api.listMail({ limit: 50 });
      setItems(res.rows);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetch();
  }, [fetch]);

  const onTap = useCallback(async (uid: number) => {
    try {
      const updated = await api.markMailRead({ uid });
      setItems((prev) =>
        prev.map((m) => (m.uid === uid ? { ...m, seen: updated.seen } : m)),
      );
    } catch (err) {
      setError((err as Error).message ?? 'Failed to mark read');
    }
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      data={items}
      keyExtractor={(item) => String(item.uid)}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.primary}
        />
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.muted}>No mail</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onTap(item.uid)}
          style={[styles.row, !item.seen && styles.rowUnread]}
          accessibilityRole="button"
        >
          <Text style={[styles.subject, !item.seen && styles.subjectUnread]}>
            {item.subject || '(no subject)'}
          </Text>
          <Text style={styles.from}>{fromLabel(item)}</Text>
          <Text style={styles.preview} numberOfLines={2}>
            {item.text}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: theme.colors.muted },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  rowUnread: { backgroundColor: theme.colors.surfaceHighlight },
  subject: { fontSize: 15, color: theme.colors.text },
  subjectUnread: { fontWeight: '700' },
  from: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  preview: { fontSize: 13, color: theme.colors.muted, marginTop: 4 },
});