import { useState, useEffect, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BudgetProvider } from './context/BudgetContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/Layout/ProtectedRoute';
import MainLayout from './components/Layout/MainLayout';
import TosOverlay from './components/TosOverlay';
import MaintenanceOverlay from './components/MaintenanceOverlay';
import { ToastProvider } from './components/Toast';
import LazyRoute from './components/LazyRoute';
import { onMaintenanceMode } from './services/api';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import SetNewPassword from './pages/auth/SetNewPassword';
import TermsOfService from './pages/legal/TermsOfService';
import PrivacyPolicy from './pages/legal/PrivacyPolicy';
import CookiePolicy from './pages/legal/CookiePolicy';
import Disclaimer from './pages/legal/Disclaimer';
import NotFound from './pages/NotFound';

import BusinessModeRoute from './components/BusinessModeRoute';
import PersonalModeRoute from './components/PersonalModeRoute';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const BillsAndDebts = lazy(() => import('./pages/BillsAndDebts'));
const Savings = lazy(() => import('./pages/Savings'));
const Payments = lazy(() => import('./pages/Payments'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const Support = lazy(() => import('./pages/Support'));
const Household = lazy(() => import('./pages/Household'));
const Income = lazy(() => import('./pages/Income'));
const Vault = lazy(() => import('./pages/Vault'));
const Calendar = lazy(() => import('./pages/Calendar'));
const TaxPrep = lazy(() => import('./pages/TaxPrep'));
const Changelog = lazy(() => import('./pages/Changelog'));
const Budgets = lazy(() => import('./pages/Budgets'));
const Uploads = lazy(() => import('./pages/Uploads'));
const Upgrade = lazy(() => import('./pages/Upgrade'));
const AdminTickets = lazy(() => import('./pages/AdminTickets'));
const AdminStats = lazy(() => import('./pages/AdminStats'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const CommandCenter = lazy(() => import('./pages/CommandCenter'));
const EditionChooser = lazy(() => import('./pages/business/EditionChooser'));
const BusinessStart = lazy(() => import('./pages/business/BusinessStart'));
const BusinessDashboard = lazy(() => import('./pages/business/BusinessDashboard'));
const SalesPage = lazy(() => import('./pages/business/SalesPage'));
const CustomersPage = lazy(() => import('./pages/business/CustomersPage'));
const DeductionsPage = lazy(() => import('./pages/business/DeductionsPage'));
const StaffPayPage = lazy(() => import('./pages/business/StaffPayPage'));
const FundPage = lazy(() => import('./pages/business/FundPage'));
const NetProfitPage = lazy(() => import('./pages/business/NetProfitPage'));
const BusinessTaxPrep = lazy(() => import('./pages/business/BusinessTaxPrep'));
const BusinessReports = lazy(() => import('./pages/business/BusinessReports'));
const BusinessTeam = lazy(() => import('./pages/business/BusinessTeam'));
const BusinessDocuments = lazy(() => import('./pages/business/BusinessDocuments'));
const BusinessRevenue = lazy(() => import('./pages/business/BusinessRevenue'));
const BusinessSettings = lazy(() => import('./pages/business/BusinessSettings'));

function TosGate({ children }) {
  const { tosRequired, clearTosRequired } = useAuth();
  if (tosRequired) {
    return <TosOverlay version={tosRequired} onAccepted={clearTosRequired} />;
  }
  return children;
}

function MaintenanceGate({ children }) {
  const { user, loading } = useAuth();
  const [maintenance, setMaintenance] = useState(false);
  useEffect(() => {
    onMaintenanceMode(setMaintenance);
    return () => onMaintenanceMode(null);
  }, []);
  if (maintenance && !loading && !user?.is_admin) {
    return <MaintenanceOverlay />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
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
              <Route path="dashboard" element={<LazyRoute label="Loading dashboard"><Dashboard /></LazyRoute>} />
              <Route path="bills-debts" element={<LazyRoute label="Loading bills and debts"><BillsAndDebts /></LazyRoute>} />
              <Route path="bills" element={<Navigate to="/bills-debts?tab=bills" replace />} />
              <Route path="debts" element={<Navigate to="/bills-debts?tab=debts" replace />} />
              <Route path="savings" element={<LazyRoute label="Loading savings"><Savings /></LazyRoute>} />
              <Route path="payments" element={<LazyRoute label="Loading payments"><Payments /></LazyRoute>} />
              <Route path="reports" element={<LazyRoute label="Loading reports"><Reports /></LazyRoute>} />
              <Route path="settings" element={<LazyRoute label="Loading settings"><Settings /></LazyRoute>} />
              <Route path="upgrade" element={<LazyRoute label="Loading upgrade"><Upgrade /></LazyRoute>} />
              <Route path="support" element={<LazyRoute label="Loading support"><Support /></LazyRoute>} />
              <Route path="household" element={<LazyRoute label="Loading household"><Household /></LazyRoute>} />
              <Route path="income" element={<LazyRoute label="Loading income"><Income /></LazyRoute>} />
              <Route path="vault" element={<LazyRoute label="Loading vault"><Vault /></LazyRoute>} />
              <Route path="calendar" element={<LazyRoute label="Loading calendar"><Calendar /></LazyRoute>} />
              <Route path="tax-prep" element={<LazyRoute label="Loading tax prep"><TaxPrep /></LazyRoute>} />
              <Route path="uploads" element={<LazyRoute label="Loading uploads"><Uploads /></LazyRoute>} />
              <Route path="budgets" element={<LazyRoute label="Loading budgets"><Budgets /></LazyRoute>} />
              <Route path="changelog" element={<LazyRoute label="Loading changelog"><Changelog /></LazyRoute>} />
              <Route path="admin/tickets" element={<LazyRoute label="Loading admin tickets"><AdminTickets /></LazyRoute>} />
              <Route path="admin/stats" element={<LazyRoute label="Loading admin stats"><AdminStats /></LazyRoute>} />
              <Route path="admin/users" element={<LazyRoute label="Loading admin users"><AdminUsers /></LazyRoute>} />
              <Route path="admin/command-center" element={<LazyRoute label="Loading command center"><CommandCenter /></LazyRoute>} />
            </Route>

            {/* Edition onboarding — all subscription tiers */}
            <Route path="edition" element={<LazyRoute label="Loading edition"><EditionChooser /></LazyRoute>} />
            <Route path="business/start" element={<LazyRoute label="Loading business setup"><BusinessStart /></LazyRoute>} />
            <Route path="business" element={<Navigate to="/business/dashboard" replace />} />

            <Route element={<BusinessModeRoute />}>
              <Route path="business/dashboard" element={<LazyRoute label="Loading business dashboard"><BusinessDashboard /></LazyRoute>} />
              <Route path="business/sales" element={<LazyRoute label="Loading sales"><SalesPage /></LazyRoute>} />
              <Route path="business/customers" element={<LazyRoute label="Loading customers"><CustomersPage /></LazyRoute>} />
              <Route path="business/deductions" element={<LazyRoute label="Loading deductions"><DeductionsPage /></LazyRoute>} />
              <Route path="business/staff-pay" element={<LazyRoute label="Loading staff pay"><StaffPayPage /></LazyRoute>} />
              <Route path="business/contingency-fund" element={<LazyRoute label="Loading fund"><FundPage /></LazyRoute>} />
              <Route path="business/upgrade-fund" element={<LazyRoute label="Loading fund"><FundPage /></LazyRoute>} />
              <Route path="business/net-profit" element={<LazyRoute label="Loading net profit"><NetProfitPage /></LazyRoute>} />
              <Route path="business/tax-prep" element={<LazyRoute label="Loading business tax prep"><BusinessTaxPrep /></LazyRoute>} />
              <Route path="business/reports" element={<LazyRoute label="Loading business reports"><BusinessReports /></LazyRoute>} />
              <Route path="business/team" element={<LazyRoute label="Loading team"><BusinessTeam /></LazyRoute>} />
              <Route path="business/documents" element={<LazyRoute label="Loading documents"><BusinessDocuments /></LazyRoute>} />
              <Route path="business/revenue" element={<LazyRoute label="Loading revenue"><BusinessRevenue /></LazyRoute>} />
              <Route path="business/settings" element={<LazyRoute label="Loading business settings"><BusinessSettings /></LazyRoute>} />
            </Route>

            <Route path="biz/sales" element={<Navigate to="/business/sales" replace />} />
            <Route path="biz/deductions" element={<Navigate to="/business/deductions" replace />} />
            <Route path="biz/staff-pay" element={<Navigate to="/business/staff-pay" replace />} />
            <Route path="biz/contingency" element={<Navigate to="/business/contingency-fund" replace />} />
            <Route path="biz/upgrade-fund" element={<Navigate to="/business/upgrade-fund" replace />} />
            <Route path="biz/net-profit" element={<Navigate to="/business/net-profit" replace />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
        </TosGate>
        </ToastProvider>
        </MaintenanceGate>
        </BudgetProvider>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
