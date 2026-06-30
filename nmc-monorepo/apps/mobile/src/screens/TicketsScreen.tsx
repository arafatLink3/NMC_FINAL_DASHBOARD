/**
 * TicketsScreen — Operational tickets (open status).
 *
 * Mirrors the web's TicketsPage: shows ticket id, title, category and
 * status. Tapping a row opens the system browser at the linked NMS
 * page when present (matches web behaviour).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme } from '@nmc/ui/theme';
import type { TicketRecord } from '@nmc/api-client';
import { api } from '../auth/api';

export function TicketsScreen(): JSX.Element {
  const [items, setItems] = useState<TicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setError(null);
    try {
      const res = await api.listTickets({ status: 'open', pageSize: 100 });
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
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.primary}
        />
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.muted}>No open tickets</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => item.ticketId && Linking.openURL(`https://nms.example.com/tickets/${item.ticketId}`)}
          style={styles.row}
          accessibilityRole="button"
        >
          <View style={styles.rowHead}>
            <Text style={styles.type}>{item.ticketId ?? item.id}</Text>
            <Text style={[styles.status, statusStyle(item.currentStatus)]}>
              {item.currentStatus}
            </Text>
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {item.category} · {item.subCategory ?? item.zone ?? ''}
          </Text>
          <Text style={styles.meta}>
            {item.team ?? item.department ?? '—'} · updated {formatDate(item.updatedAt)}
          </Text>
        </Pressable>
      )}
    />
  );
}

function statusStyle(status: string): { color: string } {
  if (status === 'closed') return { color: theme.colors.muted };
  if (status === 'pending') return { color: theme.colors.warning };
  return { color: theme.colors.primary };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
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
  rowHead: { flexDirection: 'row', justifyContent: 'space-between' },
  type: { fontSize: 12, fontWeight: '700', color: theme.colors.text },
  status: { fontSize: 12, fontWeight: '600' },
  title: { fontSize: 15, color: theme.colors.text, marginTop: 4 },
  meta: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
});