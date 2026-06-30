/**
 * LoginScreen — Email/password login plus Azure AD SSO button.
 *
 * Submits credentials to `api.login()`. On success the resulting session
 * is handed to `signIn()` which persists tokens via `expo-secure-store`
 * and flips the navigator to `AppStack`.
 *
 * The Azure button calls `startAzureLogin()`, which opens the system
 * browser. The deep-link handler in `App.tsx` listens for the
 * `nmc://auth?code&state` callback URL and calls
 * `completeAzureLoginFromUrl()`.
 */
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform as RNPlatform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { theme } from '@nmc/ui/theme';
import { api } from '../auth/api';
import { startAzureLogin } from '../auth/azure';
import { useSession } from '../auth/session-store';

export function LoginScreen(): JSX.Element {
  const { signIn } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(): Promise<void> {
    if (!username || !password) {
      Alert.alert('Login', 'Username and password are required.');
      return;
    }
    setBusy(true);
    try {
      const session = await api.login({ username, password });
      await signIn({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        user: {
          id: session.user.id,
          email: session.user.email ?? session.user.username,
          name: session.user.name ?? session.user.fullName ?? session.user.username,
          role: session.user.role,
        },
      });
    } catch (err) {
      Alert.alert('Login failed', (err as Error).message ?? 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function onAzure(): Promise<void> {
    setBusy(true);
    try {
      await startAzureLogin();
      // The deep-link handler will complete the flow.
    } catch (err) {
      Alert.alert('Azure SSO failed', (err as Error).message ?? 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={RNPlatform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>NMC Dashboard</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          placeholder="username"
          placeholderTextColor={theme.colors.muted}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          placeholder="••••••••"
          placeholderTextColor={theme.colors.muted}
        />

        <Pressable
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          style={[styles.button, styles.azureButton, busy && styles.buttonDisabled]}
          onPress={onAzure}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Sign in with Microsoft</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', backgroundColor: theme.colors.bg },
  card: {
    margin: 24,
    padding: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    gap: 8,
  },
  title: { fontSize: 24, fontWeight: '700', color: theme.colors.text },
  subtitle: { fontSize: 14, color: theme.colors.muted, marginBottom: 16 },
  label: { fontSize: 13, color: theme.colors.muted, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text,
    backgroundColor: theme.colors.bg,
  },
  button: {
    marginTop: 16,
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  azureButton: { backgroundColor: '#2f2f2f' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  dividerText: { color: theme.colors.muted, marginHorizontal: 8 },
});