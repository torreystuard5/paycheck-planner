import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BudgetProvider } from './context/BudgetContext';
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
import BillsAndDebts from './pages/BillsAndDebts';
import Savings from './pages/Savings';
import Payments from './pages/Payments';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Support from './pages/Support';
// Supporter import removed (Phase 2 — nav hidden, page dormant)
import Household from './pages/Household';
import Income from './pages/Income';
import AdminTickets from './pages/AdminTickets';
import AdminStats from './pages/AdminStats';
import AdminUsers from './pages/AdminUsers';
import CommandCenter from './pages/CommandCenter';
// Refer import removed (Phase 2 — nav hidden, page dormant)
import Vault from './pages/Vault';
import Calendar from './pages/Calendar';
import TaxPrep from './pages/TaxPrep';
import Changelog from './pages/Changelog';
import Budgets from './pages/Budgets';
import Uploads from './pages/Uploads';
import NotFound from './pages/NotFound';
import TermsOfService from './pages/legal/TermsOfService';
import PrivacyPolicy from './pages/legal/PrivacyPolicy';
import CookiePolicy from './pages/legal/CookiePolicy';
import Disclaimer from './pages/legal/Disclaimer';

import BusinessModeRoute from './components/BusinessModeRoute';
import PersonalModeRoute from './components/PersonalModeRoute';
import BusinessDashboard from './pages/business/BusinessDashboard';
import SalesPage from './pages/business/SalesPage';
import CustomersPage from './pages/business/CustomersPage';
import DeductionsPage from './pages/business/DeductionsPage';
import StaffPayPage from './pages/business/StaffPayPage';
import FundPage from './pages/business/FundPage';
import NetProfitPage from './pages/business/NetProfitPage';

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
        <BudgetProvider>
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
            <Route element={<PersonalModeRoute />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="bills-debts" element={<BillsAndDebts />} />
              <Route path="bills" element={<Navigate to="/bills-debts?tab=bills" replace />} />
              <Route path="debts" element={<Navigate to="/bills-debts?tab=debts" replace />} />
              <Route path="savings" element={<Savings />} />
              <Route path="payments" element={<Payments />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<Settings />} />
              <Route path="support" element={<Support />} />
              {/* supporter route removed — Phase 2 cleanup */}
              <Route path="household" element={<Household />} />
              <Route path="income" element={<Income />} />
              {/* refer route removed — Phase 2 cleanup */}
              <Route path="vault" element={<Vault />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="tax-prep" element={<TaxPrep />} />
              <Route path="uploads" element={<Uploads />} />
              <Route path="budgets" element={<Budgets />} />
              <Route path="changelog" element={<Changelog />} />
              <Route path="admin/tickets" element={<AdminTickets />} />
              <Route path="admin/stats" element={<AdminStats />} />
              <Route path="admin/users" element={<AdminUsers />} />
              <Route path="admin/command-center" element={<CommandCenter />} />
            </Route>

            {/* Business Edition (requires app_mode=business) */}
            <Route element={<BusinessModeRoute />}>
              <Route path="business/dashboard" element={<BusinessDashboard />} />
              <Route path="business/sales" element={<SalesPage />} />
              <Route path="business/customers" element={<CustomersPage />} />
              <Route path="business/deductions" element={<DeductionsPage />} />
              <Route path="business/staff-pay" element={<StaffPayPage />} />
              <Route path="business/contingency-fund" element={<FundPage />} />
              <Route path="business/upgrade-fund" element={<FundPage />} />
              <Route path="business/net-profit" element={<NetProfitPage />} />
            </Route>

            <Route path="biz/sales" element={<Navigate to="/business/sales" replace />} />
            <Route path="biz/deductions" element={<Navigate to="/business/deductions" replace />} />
            <Route path="biz/staff-pay" element={<Navigate to="/business/staff-pay" replace />} />
            <Route path="biz/contingency" element={<Navigate to="/business/contingency-fund" replace />} />
            <Route path="biz/upgrade-fund" element={<Navigate to="/business/upgrade-fund" replace />} />
            <Route path="biz/net-profit" element={<Navigate to="/business/net-profit" replace />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </TosGate>
        </ToastProvider>
        </MaintenanceGate>
        </BudgetProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
