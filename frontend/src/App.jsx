import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/Layout/ProtectedRoute';
import MainLayout from './components/Layout/MainLayout';
import TosOverlay from './components/TosOverlay';
import MaintenanceOverlay from './components/MaintenanceOverlay';
import { ToastProvider } from './components/Toast';
import { onMaintenanceMode } from './services/api';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import SetNewPassword from './pages/auth/SetNewPassword';
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
import Calendar from './pages/Calendar';
import TaxPrep from './pages/TaxPrep';
import NotFound from './pages/NotFound';
import TermsOfService from './pages/legal/TermsOfService';
import PrivacyPolicy from './pages/legal/PrivacyPolicy';
import CookiePolicy from './pages/legal/CookiePolicy';
import Disclaimer from './pages/legal/Disclaimer';

// Business placeholder pages
import BizSales from './pages/biz/Sales';
import BizDeductions from './pages/biz/Deductions';
import BizStaffPay from './pages/biz/StaffPay';
import BizContingency from './pages/biz/Contingency';
import BizUpgradeFund from './pages/biz/UpgradeFund';
import BizNetProfit from './pages/biz/NetProfit';

function TosGate({ children }) {
  const { tosRequired, clearTosRequired } = useAuth();
  if (tosRequired) {
    return <TosOverlay version={tosRequired} onAccepted={clearTosRequired} />;
  }
  return children;
}

function MaintenanceGate({ children }) {
  const [maintenance, setMaintenance] = useState(false);
  useEffect(() => {
    onMaintenanceMode(setMaintenance);
    return () => onMaintenanceMode(null);
  }, []);
  if (maintenance) return <MaintenanceOverlay />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <MaintenanceGate>
        <ToastProvider>
        <TosGate>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/set-new-password" element={<SetNewPassword />} />
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
            <Route path="calendar" element={<Calendar />} />
            <Route path="tax-prep" element={<TaxPrep />} />
            <Route path="admin/tickets" element={<AdminTickets />} />
            <Route path="admin/stats" element={<AdminStats />} />
            <Route path="admin/users" element={<AdminUsers />} />
            <Route path="admin/command-center" element={<CommandCenter />} />

            {/* Business mode placeholder pages */}
            <Route path="biz/sales" element={<BizSales />} />
            <Route path="biz/deductions" element={<BizDeductions />} />
            <Route path="biz/staff-pay" element={<BizStaffPay />} />
            <Route path="biz/contingency" element={<BizContingency />} />
            <Route path="biz/upgrade-fund" element={<BizUpgradeFund />} />
            <Route path="biz/net-profit" element={<BizNetProfit />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </TosGate>
        </ToastProvider>
        </MaintenanceGate>
      </AuthProvider>
    </BrowserRouter>
  );
}
