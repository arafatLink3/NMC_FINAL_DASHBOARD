// Composes all React providers in the correct nesting order.

import type { ReactNode } from 'react';
import { ApiProvider } from './api';
import { AuthProvider } from './auth';
import { NotifProvider } from './notif';
import { ThemeProvider } from './theme';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ApiProvider>
        <AuthProvider>
          <NotifProvider>{children}</NotifProvider>
        </AuthProvider>
      </ApiProvider>
    </ThemeProvider>
  );
}
