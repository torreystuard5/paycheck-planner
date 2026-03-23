import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/Layout/ProtectedRoute';
import MainLayout from './components/Layout/MainLayout';
import TosOverlay from './components/TosOverlay';
import { ToastProvider } from './components/Toast';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Dashboard from './pages/Dashboard';
import Bills from './pages/Bills';
import Debts from './pages/Debts';
import Savings from './pages/Savings';
import Payments from './pages/Payments';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Support from './pages/Support';
import Supporter from './pages/Supporter';
import Household from './pages/Household';
import Income from './pages/Income';
import AdminTickets from './pages/AdminTickets';
import AdminStats from './pages/AdminStats';
import AdminUsers from './pages/AdminUsers';
import CommandCenter from './pages/CommandCenter';
import Refer from './pages/Refer';
import Vault from './pages/Vault';
import NotFound from './pages/NotFound';
import TermsOfService from './pages/legal/TermsOfService';
import PrivacyPolicy from './pages/legal/PrivacyPolicy';
import CookiePolicy from './pages/legal/CookiePolicy';
import Disclaimer from './pages/legal/Disclaimer';

function TosGate({ children }) {
  const { tosRequired, clearTosRequired } = useAuth();
  if (tosRequired) {
    return <TosOverlay version={tosRequired} onAccepted={clearTosRequired} />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
        <TosGate>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/cookies" element={<CookiePolicy />} />
          <Route path="/disclaimer" element={<Disclaimer />} />

          {/* Protected routes */}
          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="bills" element={<Bills />} />
            <Route path="debts" element={<Debts />} />
            <Route path="savings" element={<Savings />} />
            <Route path="payments" element={<Payments />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="support" element={<Support />} />
            <Route path="supporter" element={<Supporter />} />
            <Route path="household" element={<Household />} />
            <Route path="income" element={<Income />} />
            <Route path="refer" element={<Refer />} />
            <Route path="vault" element={<Vault />} />
            <Route path="admin/tickets" element={<AdminTickets />} />
            <Route path="admin/stats" element={<AdminStats />} />
            <Route path="admin/users" element={<AdminUsers />} />
            <Route path="admin/command-center" element={<CommandCenter />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </TosGate>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
