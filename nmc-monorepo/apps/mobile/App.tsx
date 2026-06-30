/**
 * App.tsx — Root component for the NMC Dashboard mobile client.
 *
 * Wires up:
 *   - `SafeAreaProvider` for notched devices.
 *   - `SessionProvider` (reads persisted session from expo-secure-store).
 *   - `AppNavigator` (Auth vs App stacks).
 *   - Deep-link listener that completes the Azure AD SSO callback:
 *       nmc://auth?code=...&state=...
 */
import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from './src/auth/session-store';
import { completeAzureLoginFromUrl } from './src/auth/azure';
import { AppNavigator } from './src/nav/AppNavigator';

function DeepLinkBridge(): null {
  const { signIn } = useSession();
  const [handled, setHandled] = useState<string | null>(null);

  useEffect(() => {
    const handler = async (event: { url: string }) => {
      // Guard against double-processing during React re-renders.
      if (handled === event.url) return;
      setHandled(event.url);

      try {
        const session = await completeAzureLoginFromUrl(event.url);
        await signIn(session);
      } catch (err) {
        console.warn('Azure SSO callback failed', err);
      }
    };

    const sub = Linking.addEventListener('url', handler);
    void Linking.getInitialURL().then((initial) => {
      if (initial) void handler({ url: initial });
    });
    return () => sub.remove();
  }, [handled, signIn]);

  return null;
}

export default function App(): JSX.Element {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <DeepLinkBridge />
        <AppNavigator />
      </SessionProvider>
    </SafeAreaProvider>
  );
}