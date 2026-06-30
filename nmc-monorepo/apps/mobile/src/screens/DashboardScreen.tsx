/**
 * DashboardScreen — Top-level summary for the signed-in operator.
 *
 * Pulls three lightweight stats from the api-client and renders them in
 * a vertical stack. Pull-to-refresh re-fetches all three in parallel.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme } from '@nmc/ui/theme';
import { api } from '../auth/api';
import { useSession } from '../auth/session-store';

interface DashboardStats {
  unreadMail: number;
  openTickets: number;
}

export function DashboardScreen(): JSX.Element {
  const { session } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setError(null);
    try {
      const [mailCount, ticketsPage] = await Promise.all([
        api.mailCount(),
        api.listTickets({ status: 'open', pageSize: 1 }),
      ]);
      setStats({
        unreadMail: mailCount.total,
        openTickets: ticketsPage.total,
      });
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.primary}
        />
      }
    >
      <Text style={styles.hello}>
        Hi, {session?.user.name ?? session?.user.email}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Stat label="Cached mail messages" value={stats?.unreadMail ?? 0} />
      <Stat label="Open tickets" value={stats?.openTickets ?? 0} />
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hello: { fontSize: 18, color: theme.colors.text, marginBottom: 8 },
  error: { color: theme.colors.danger, marginBottom: 8 },
  stat: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
  },
  statValue: { fontSize: 28, fontWeight: '700', color: theme.colors.text },
  statLabel: { fontSize: 13, color: theme.colors.muted, marginTop: 4 },
});