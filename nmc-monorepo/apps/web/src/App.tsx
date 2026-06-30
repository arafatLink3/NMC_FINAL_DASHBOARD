import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { TicketsPage } from './pages/TicketsPage';
import { IncidentLogPage } from './pages/IncidentLogPage';
import { MailPage } from './pages/MailPage';
import { MailInboxPage } from './pages/MailInboxPage';
import { ContactsPage } from './pages/ContactsPage';
import { ContactPage } from './pages/ContactPage';
import { BrasPage } from './pages/BrasPage';
import { RosterPage } from './pages/RosterPage';
import { NmsPage } from './pages/NmsPage';
import { ScrPage } from './pages/ScrPage';
import { CcbPage } from './pages/CcbPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AboutPage } from './pages/AboutPage';
import { LoginPage } from './pages/LoginPage';
import { useAuth } from './lib/auth';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="incidentLog" element={<IncidentLogPage />} />
        <Route path="mail" element={<MailPage />} />
        <Route path="mail/inbox" element={<MailInboxPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="contact/:id" element={<ContactPage />} />
        <Route path="bras" element={<BrasPage />} />
        <Route path="roster" element={<RosterPage />} />
        <Route path="nms" element={<NmsPage />} />
        <Route path="scr" element={<ScrPage />} />
        <Route path="ccb" element={<CcbPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}