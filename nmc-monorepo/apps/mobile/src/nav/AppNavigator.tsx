/**
 * AppNavigator — Two-stack navigator: Auth vs App.
 *
 * `AuthStack`: LoginScreen only.
 * `AppStack`:   Bottom tabs — Dashboard / Mail / Tickets / Profile.
 *
 * Profile shows the signed-in user and a Sign-out button that calls
 * `useSession().signOut()` and bounces back to the AuthStack.
 */
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, View, StyleSheet } from 'react-native';
import { theme } from '@nmc/ui/theme';
import { useSession } from '../auth/session-store';
import { LoginScreen } from '../screens/LoginScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { MailInboxScreen } from '../screens/MailInboxScreen';
import { TicketsScreen } from '../screens/TicketsScreen';

const AuthStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function ProfileScreen(): JSX.Element {
  const { session, signOut } = useSession();
  return (
    <View style={styles.profile}>
      <Text style={styles.profileName}>{session?.user.name ?? '—'}</Text>
      <Text style={styles.profileEmail}>{session?.user.email}</Text>
      <Text style={styles.profileSignout} onPress={() => void signOut()}>
        Sign out
      </Text>
    </View>
  );
}

function AppTabs(): JSX.Element {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTitleStyle: { color: theme.colors.text },
        tabBarStyle: { backgroundColor: theme.colors.surface },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
      }}
    >
      <Tabs.Screen name="Dashboard" component={DashboardScreen} />
      <Tabs.Screen name="Mail" component={MailInboxScreen} />
      <Tabs.Screen name="Tickets" component={TicketsScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

export function AppNavigator(): JSX.Element {
  const { ready, session } = useSession();
  if (!ready) {
    return <View style={styles.boot} />;
  }
  return (
    <NavigationContainer>
      {session ? <AppTabs /> : <AuthStack.Screen name="Login" component={LoginScreen} />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, backgroundColor: theme.colors.bg },
  profile: { flex: 1, padding: 24, gap: 8, backgroundColor: theme.colors.bg },
  profileName: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  profileEmail: { fontSize: 14, color: theme.colors.muted },
  profileSignout: {
    marginTop: 24,
    fontSize: 16,
    color: theme.colors.primary,
    fontWeight: '600',
  },
});