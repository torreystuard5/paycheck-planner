import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Crown,
  User,
  Activity,
  Home,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Save,
  AlertTriangle,
  ShieldCheck,
  Clock,
  ArrowRightCircle,
  CheckCircle2,
  AlertCircle,
  Send,
  X,
  Settings,
  ScrollText,
  Megaphone,
  Plus,
  Trash2,
  RefreshCw,
  Radio,
  MailIcon,
  UserMinus,
  UserPlus,
  Search,
  Command,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import api from '../services/api';
import { formatFriendlyDate } from '../utils/formatDate';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import AdminDrillDown from '../components/AdminDrillDown';
import AdminUsers from './AdminUsers';
import SupportTab from '../components/admin/command-center/SupportTab';
import CommandCenterLayout from '../components/admin/command-center/CommandCenterLayout';
import CommandCenterPanel, {
  CommandCenterSectionHeader,
  CommandCenterStatCard,
  CommandCenterTabContent,
} from '../components/admin/command-center/CommandCenterPanel';
import GlobalControlsPanel from '../components/admin/command-center/GlobalControlsPanel';
import DashboardQuickActions from '../components/admin/command-center/DashboardQuickActions';
import { useCommandPalette } from '../components/admin/command-center/CommandPalette';
import { AUDIT_ACTION_CATEGORIES } from '../components/admin/command-center/constants';
import RecentActivityList from '../components/admin/command-center/RecentActivityList';
import {
  AUDIT_ACTION_LABELS,
  formatAuditActionLabel,
  formatAuditActivityMessage,
  formatAuditDetailsFull,
  getAuditLegacyBadgeClass,
} from '../components/admin/command-center/auditLogFormat';

// ── Status helpers ───────────────────────────────────────────────────────────

const ANNOUNCEMENT_TYPES = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'success', label: 'Success' },
  { value: 'error', label: 'Error' },
  { value: 'coming_soon', label: 'Coming Soon' },
];

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const formatDate = (dateStr) => {
  if (!dateStr) return 'â€”';
  return formatFriendlyDate(dateStr);
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return 'â€”';
  return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function CommandCenter() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [usersFocusId, setUsersFocusId] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settingsFocusAnnouncement, setSettingsFocusAnnouncement] = useState(false);
  const refreshHandlers = useRef({});

  const registerRefresh = useCallback((tab, fn) => {
    refreshHandlers.current[tab] = fn;
    return () => {
      if (refreshHandlers.current[tab] === fn) delete refreshHandlers.current[tab];
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    const fn = refreshHandlers.current[activeTab];
    if (!fn) return;
    setRefreshing(true);
    try {
      await fn();
    } finally {
      setRefreshing(false);
    }
  }, [activeTab]);

  const handleNavigate = useCallback((tab) => setActiveTab(tab), []);

  const handlePaletteAction = useCallback((actionKey) => {
    if (actionKey === 'new-announcement') setSettingsFocusAnnouncement(true);
  }, []);

  const { palette, setPaletteOpen } = useCommandPalette(handleNavigate, handlePaletteAction);

  useEffect(() => {
    // Quick admin check + log access
    const checkAdmin = async () => {
      try {
        await api.get('/api/v1/admin/stats');
      } catch (err) {
        if (err.response?.status === 403) setForbidden(true);
      } finally {
        setInitialLoading(false);
      }
    };
    checkAdmin();
  }, []);

  if (initialLoading) return <LoadingSpinner />;

  if (forbidden) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <p className="text-lg font-medium text-gray-700 mb-4">
          You don&apos;t have permission to view this page.
        </p>
        <Link to="/dashboard" className="text-blue-600 hover:text-blue-700 font-medium">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <>
      <CommandCenterLayout
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        topBarActions={(
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-blue-600"
            title="Quick jump (Ctrl+K)"
          >
            <Command className="h-4 w-4" />
            <span className="hidden sm:inline">Quick jump</span>
          </button>
        )}
      >
        {activeTab === 'dashboard' && (
          <DashboardTab onNavigate={handleNavigate} onRegisterRefresh={registerRefresh} />
        )}
        {activeTab === 'users' && (
          <AdminUsers
            embedded
            initialUserId={usersFocusId}
            onInitialUserOpened={() => setUsersFocusId(null)}
          />
        )}
        {activeTab === 'support' && (
          <SupportTab
            onRegisterRefresh={registerRefresh}
            onViewUser={(userId) => {
              setUsersFocusId(userId);
              setActiveTab('users');
            }}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsTab
            onRegisterRefresh={registerRefresh}
            openAnnouncementForm={settingsFocusAnnouncement}
            onAnnouncementFormOpened={() => setSettingsFocusAnnouncement(false)}
          />
        )}
        {activeTab === 'audit' && <AuditLogTab onRegisterRefresh={registerRefresh} />}
        {activeTab === 'broadcast' && <BroadcastTab onRegisterRefresh={registerRefresh} />}
      </CommandCenterLayout>
      {palette}
    </>
  );
}

// â”€â”€â”€ Dashboard Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function DashboardTab({ onNavigate, onRegisterRefresh }) {
  const [stats, setStats] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drillDown, setDrillDown] = useState(null);

  const fetchAll = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [statsRes, announcementsRes, activityRes, settingsRes] = await Promise.allSettled([
        api.get('/api/v1/admin/stats'),
        api.get('/api/v1/admin/announcements'),
        api.get('/api/v1/admin/audit-log', { params: { page: 1, per_page: 5 } }),
        api.get('/api/v1/admin/settings'),
      ]);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (announcementsRes.status === 'fulfilled') {
        const d = announcementsRes.value.data;
        setAnnouncements(Array.isArray(d) ? d.filter((a) => a.is_active) : []);
      }
      if (activityRes.status === 'fulfilled') {
        const d = activityRes.value.data;
        setRecentActivity(Array.isArray(d) ? d : d.items || d.entries || []);
      }
      if (settingsRes.status === 'fulfilled') {
        const settings = Array.isArray(settingsRes.value.data) ? settingsRes.value.data : [];
        const mm = settings.find((s) => s.key === 'maintenance_mode');
        setMaintenanceMode(mm ? mm.value === 'true' : false);
      }
    } catch {
      setError('Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => fetchAll({ silent: true }), 60_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  useEffect(() => {
    if (!onRegisterRefresh) return undefined;
    return onRegisterRefresh('dashboard', () => fetchAll({ silent: true }));
  }, [onRegisterRefresh, fetchAll]);

  if (loading) return <LoadingSpinner />;
  if (error) return <p className="text-red-600 text-center py-8">{error}</p>;
  if (!stats) return <p className="text-gray-500 text-center py-8">No data available.</p>;

  const cards = [
    { label: 'Total Signups', value: stats.total_users, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', drillKey: 'total_signups' },
    { label: 'Pro Subscribers', value: stats.total_pro_subscribers, icon: Crown, color: 'text-amber-600', bg: 'bg-amber-50', drillKey: 'pro_subscribers', sublabel: 'Paid plans' },
    { label: 'Free Users', value: stats.total_free_users, icon: User, color: 'text-gray-600', bg: 'bg-gray-100', drillKey: 'free_users' },
    { label: 'Active (30d)', value: stats.total_active_users_30d, icon: Activity, color: 'text-green-600', bg: 'bg-green-50', drillKey: 'active_30d', sublabel: 'Logged in recently' },
    { label: 'Households', value: stats.total_households, icon: Home, color: 'text-purple-600', bg: 'bg-purple-50', drillKey: 'households' },
    { label: 'Support Tickets', value: stats.total_support_tickets, icon: MessageSquare, color: 'text-rose-600', bg: 'bg-rose-50', drillKey: 'support_tickets' },
  ];

  const chartData = (stats.signups_last_7_days || []).map((d) => ({
    date: formatFriendlyDate(d.date),
    signups: d.count,
  }));

  if (drillDown) {
    return <AdminDrillDown drillKey={drillDown} onBack={() => setDrillDown(null)} />;
  }

  return (
    <CommandCenterTabContent>
      <DashboardQuickActions
        onNavigate={onNavigate}
        maintenanceMode={maintenanceMode}
        openTicketCount={stats.open_support_tickets ?? 0}
      />

      {/* Stat cards */}
      <div>
        <CommandCenterSectionHeader
          title="Platform overview"
          description="Click a metric to drill down into details"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ label, value, icon, color, bg, drillKey, sublabel }) => (
            <CommandCenterStatCard
              key={label}
              label={label}
              value={value}
              icon={icon}
              color={color}
              bg={bg}
              sublabel={sublabel}
              onClick={() => setDrillDown(drillKey)}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
        {/* Signups chart */}
        <CommandCenterPanel>
          <CommandCenterSectionHeader title="Signups â€” last 7 days" />
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="signups" stroke="#2563eb" strokeWidth={2} dot={{ fill: '#2563eb', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-gray-500">No signup data available.</p>
          )}
        </CommandCenterPanel>

        {/* Recent Activity */}
        <CommandCenterPanel>
          <CommandCenterSectionHeader
            title="Recent activity"
            icon={Activity}
            iconClassName="text-green-600"
            action={
              onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('audit')}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800"
                >
                  View all
                </button>
              )
            }
          />
          {recentActivity.length === 0 ? (
            <p className="text-sm text-gray-500">No recent activity.</p>
          ) : (
            <RecentActivityList
              entries={recentActivity}
              onViewAll={onNavigate ? () => onNavigate('audit') : undefined}
            />
          )}
        </CommandCenterPanel>
      </div>

      {/* Active Announcements */}
      <CommandCenterPanel>
        <CommandCenterSectionHeader
          title="Active announcements"
          icon={Megaphone}
          action={
            onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('settings')}
                className="text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                Manage
              </button>
            )
          }
        />
        {announcements.length === 0 ? (
          <p className="text-sm text-gray-500">No active announcements.</p>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <div key={a.id} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                <span className={`inline-flex shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                  a.type === 'warning' ? 'bg-amber-100 text-amber-700'
                  : a.type === 'error' ? 'bg-red-100 text-red-700'
                  : a.type === 'success' ? 'bg-green-100 text-green-700'
                  : 'bg-blue-100 text-blue-700'
                }`}>
                  {a.type}
                </span>
                <div className="min-w-0 flex-1">
                  {a.title && <p className="text-sm font-medium text-gray-900">{a.title}</p>}
                  <p className="text-sm text-gray-600">{a.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CommandCenterPanel>
    </CommandCenterTabContent>
  );
}

// ─── Settings Tab ────────────────────────────────────────────────────
const UPDATE_TYPES = [
  { value: 'update', label: 'Update', color: 'bg-blue-100 text-blue-700' },
  { value: 'fix', label: 'Fix', color: 'bg-amber-100 text-amber-700' },
  { value: 'new_feature', label: 'New Feature', color: 'bg-green-100 text-green-700' },
];

function SettingsTab({ onRegisterRefresh, openAnnouncementForm, onAnnouncementFormOpened }) {
  // Announcements
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({ title: '', message: '', type: 'info', expires_at: '' });
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [deleteAnnouncementTarget, setDeleteAnnouncementTarget] = useState(null);
  const [error, setError] = useState(null);

  // App Updates
  const [appUpdates, setAppUpdates] = useState([]);
  const [appUpdatesLoading, setAppUpdatesLoading] = useState(true);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [editingUpdate, setEditingUpdate] = useState(null);
  const [updateForm, setUpdateForm] = useState({ date: '', description: '', type: 'update' });
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [deleteUpdateTarget, setDeleteUpdateTarget] = useState(null);

  // Coming Soon
  const [comingSoon, setComingSoon] = useState([]);
  const [comingSoonLoading, setComingSoonLoading] = useState(true);
  const [showComingSoonForm, setShowComingSoonForm] = useState(false);
  const [editingComingSoon, setEditingComingSoon] = useState(null);
  const [comingSoonForm, setComingSoonForm] = useState({ feature_name: '', description: '', eta: '' });
  const [savingComingSoon, setSavingComingSoon] = useState(false);
  const [deleteComingSoonTarget, setDeleteComingSoonTarget] = useState(null);

  const fetchAnnouncements = async () => {
    setAnnouncementsLoading(true);
    try {
      const { data } = await api.get('/api/v1/admin/announcements');
      setAnnouncements(Array.isArray(data) ? data : []);
    } catch {
      // silent
    } finally {
      setAnnouncementsLoading(false);
    }
  };

  const fetchAppUpdates = async () => {
    setAppUpdatesLoading(true);
    try {
      const { data } = await api.get('/api/v1/admin/app-updates');
      setAppUpdates(Array.isArray(data) ? data : []);
    } catch {
      // silent
    } finally {
      setAppUpdatesLoading(false);
    }
  };

  const fetchComingSoon = async () => {
    setComingSoonLoading(true);
    try {
      const { data } = await api.get('/api/v1/admin/coming-soon');
      setComingSoon(Array.isArray(data) ? data : []);
    } catch {
      // silent
    } finally {
      setComingSoonLoading(false);
    }
  };

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchAnnouncements(), fetchAppUpdates(), fetchComingSoon()]);
  }, []);

  useEffect(() => {
    fetchAnnouncements();
    fetchAppUpdates();
    fetchComingSoon();
  }, []);

  useEffect(() => {
    if (openAnnouncementForm) {
      setShowAnnouncementForm(true);
      onAnnouncementFormOpened?.();
    }
  }, [openAnnouncementForm, onAnnouncementFormOpened]);

  useEffect(() => {
    if (!onRegisterRefresh) return undefined;
    return onRegisterRefresh('settings', refreshAll);
  }, [onRegisterRefresh, refreshAll]);

  const handleCreateAnnouncement = async (e) => {
    e.preventDefault();
    setSavingAnnouncement(true);
    setError(null);
    try {
      await api.post('/api/v1/admin/announcements', {
        title: announcementForm.title || null,
        message: announcementForm.message,
        type: announcementForm.type,
        expires_at: announcementForm.expires_at || null,
      });
      setShowAnnouncementForm(false);
      setAnnouncementForm({ title: '', message: '', type: 'info', expires_at: '' });
      fetchAnnouncements();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create announcement.');
    } finally {
      setSavingAnnouncement(false);
    }
  };

  const toggleAnnouncementActive = async (announcement) => {
    try {
      await api.put(`/api/v1/admin/announcements/${announcement.id}`, {
        ...announcement,
        is_active: !announcement.is_active,
      });
      fetchAnnouncements();
    } catch {
      setError('Failed to toggle announcement.');
    }
  };

  const deleteAnnouncement = async () => {
    if (!deleteAnnouncementTarget) return;
    try {
      await api.delete(`/api/v1/admin/announcements/${deleteAnnouncementTarget.id}`);
      setDeleteAnnouncementTarget(null);
      fetchAnnouncements();
    } catch {
      setError('Failed to delete announcement.');
    }
  };

  // App Updates CRUD
  const openEditUpdate = (item) => {
    setEditingUpdate(item);
    setUpdateForm({ date: item.date || '', description: item.description || '', type: item.type || 'update' });
    setShowUpdateForm(true);
  };

  const handleSaveUpdate = async (e) => {
    e.preventDefault();
    setSavingUpdate(true);
    setError(null);
    try {
      const payload = { date: updateForm.date, description: updateForm.description, type: updateForm.type };
      if (editingUpdate) {
        await api.put(`/api/v1/admin/app-updates/${editingUpdate.id}`, payload);
      } else {
        await api.post('/api/v1/admin/app-updates', payload);
      }
      setShowUpdateForm(false);
      setEditingUpdate(null);
      setUpdateForm({ date: '', description: '', type: 'update' });
      fetchAppUpdates();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save update.');
    } finally {
      setSavingUpdate(false);
    }
  };

  const deleteAppUpdate = async () => {
    if (!deleteUpdateTarget) return;
    try {
      await api.delete(`/api/v1/admin/app-updates/${deleteUpdateTarget.id}`);
      setDeleteUpdateTarget(null);
      fetchAppUpdates();
    } catch {
      setError('Failed to delete update.');
    }
  };

  // Coming Soon CRUD
  const openEditComingSoon = (item) => {
    setEditingComingSoon(item);
    setComingSoonForm({ feature_name: item.feature_name || '', description: item.description || '', eta: item.eta || '' });
    setShowComingSoonForm(true);
  };

  const handleSaveComingSoon = async (e) => {
    e.preventDefault();
    setSavingComingSoon(true);
    setError(null);
    try {
      const payload = { feature_name: comingSoonForm.feature_name, description: comingSoonForm.description, eta: comingSoonForm.eta || null };
      if (editingComingSoon) {
        await api.put(`/api/v1/admin/coming-soon/${editingComingSoon.id}`, payload);
      } else {
        await api.post('/api/v1/admin/coming-soon', payload);
      }
      setShowComingSoonForm(false);
      setEditingComingSoon(null);
      setComingSoonForm({ feature_name: '', description: '', eta: '' });
      fetchComingSoon();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save coming soon item.');
    } finally {
      setSavingComingSoon(false);
    }
  };

  const deleteComingSoonItem = async () => {
    if (!deleteComingSoonTarget) return;
    try {
      await api.delete(`/api/v1/admin/coming-soon/${deleteComingSoonTarget.id}`);
      setDeleteComingSoonTarget(null);
      fetchComingSoon();
    } catch {
      setError('Failed to delete coming soon item.');
    }
  };

  const getUpdateTypeBadge = (type) => {
    const t = UPDATE_TYPES.find((u) => u.value === type);
    return t ? t.color : 'bg-gray-100 text-gray-700';
  };

  return (
    <CommandCenterTabContent>
      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}

      <GlobalControlsPanel onError={setError} />

      {/* Announcements */}
      <CommandCenterPanel>
        <CommandCenterSectionHeader
          title="Announcements"
          icon={Megaphone}
          action={
            <button
              onClick={() => setShowAnnouncementForm(true)}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New
            </button>
          }
        />

        {announcementsLoading ? (
          <LoadingSpinner />
        ) : announcements.length === 0 ? (
          <p className="text-gray-500 text-sm">No announcements yet.</p>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <div key={a.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                  a.type === 'warning' ? 'bg-amber-100 text-amber-700'
                  : a.type === 'error' ? 'bg-red-100 text-red-700'
                  : a.type === 'success' ? 'bg-green-100 text-green-700'
                  : 'bg-blue-100 text-blue-700'
                }`}>
                  {a.type}
                </span>
                <div className="flex-1 min-w-0">
                  {a.title && <p className="text-sm font-medium text-gray-900">{a.title}</p>}
                  <p className="text-sm text-gray-600">{a.message}</p>
                  {a.expires_at && <p className="text-xs text-gray-400 mt-1">Expires: {formatDate(a.expires_at)}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleAnnouncementActive(a)}
                    className={`px-2 py-1 rounded text-xs font-medium ${a.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}
                  >
                    {a.is_active ? 'Active' : 'Inactive'}
                  </button>
                  <button onClick={() => setDeleteAnnouncementTarget(a)} className="p-1 text-gray-400 hover:text-red-600 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CommandCenterPanel>

      {/* Recent Updates Manager */}
      <CommandCenterPanel>
        <CommandCenterSectionHeader
          title="Recent updates"
          icon={Clock}
          action={
            <button
              onClick={() => { setEditingUpdate(null); setUpdateForm({ date: new Date().toISOString().split('T')[0], description: '', type: 'update' }); setShowUpdateForm(true); }}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New
            </button>
          }
        />

        {appUpdatesLoading ? (
          <LoadingSpinner />
        ) : appUpdates.length === 0 ? (
          <p className="text-gray-500 text-sm">No updates yet.</p>
        ) : (
          <div className="space-y-3">
            {appUpdates.map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${getUpdateTypeBadge(item.type)}`}>
                  {UPDATE_TYPES.find((u) => u.value === item.type)?.label || item.type}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">{item.description}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatDate(item.date)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEditUpdate(item)} className="p-1 text-gray-400 hover:text-blue-600 transition-colors">
                    <Save className="h-4 w-4" />
                  </button>
                  <button onClick={() => setDeleteUpdateTarget(item)} className="p-1 text-gray-400 hover:text-red-600 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CommandCenterPanel>

      {/* Coming Soon Manager */}
      <CommandCenterPanel>
        <CommandCenterSectionHeader
          title="Coming soon"
          icon={ArrowRightCircle}
          iconClassName="text-green-600"
          action={
            <button
              onClick={() => { setEditingComingSoon(null); setComingSoonForm({ feature_name: '', description: '', eta: '' }); setShowComingSoonForm(true); }}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New
            </button>
          }
        />

        {comingSoonLoading ? (
          <LoadingSpinner />
        ) : comingSoon.length === 0 ? (
          <p className="text-gray-500 text-sm">No upcoming features yet.</p>
        ) : (
          <div className="space-y-3">
            {comingSoon.map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{item.feature_name}</p>
                  <p className="text-sm text-gray-600">{item.description}</p>
                  {item.eta && <p className="text-xs text-gray-400 mt-1">ETA: {item.eta}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEditComingSoon(item)} className="p-1 text-gray-400 hover:text-blue-600 transition-colors">
                    <Save className="h-4 w-4" />
                  </button>
                  <button onClick={() => setDeleteComingSoonTarget(item)} className="p-1 text-gray-400 hover:text-red-600 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CommandCenterPanel>

      {/* Create/Edit Update Modal */}
      <Modal isOpen={showUpdateForm} onClose={() => { setShowUpdateForm(false); setEditingUpdate(null); }} title={editingUpdate ? 'Edit Update' : 'New Update'}>
        <form onSubmit={handleSaveUpdate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input type="date" value={updateForm.date} onChange={(e) => setUpdateForm({ ...updateForm, date: e.target.value })} className={inputClass} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea rows={5} value={updateForm.description} onChange={(e) => setUpdateForm({ ...updateForm, description: e.target.value })} className={inputClass} placeholder="What changed..." style={{ minHeight: '120px', resize: 'vertical' }} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select value={updateForm.type} onChange={(e) => setUpdateForm({ ...updateForm, type: e.target.value })} className={inputClass}>
              {UPDATE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowUpdateForm(false); setEditingUpdate(null); }} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={savingUpdate} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {savingUpdate ? 'Saving...' : editingUpdate ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Create/Edit Coming Soon Modal */}
      <Modal isOpen={showComingSoonForm} onClose={() => { setShowComingSoonForm(false); setEditingComingSoon(null); }} title={editingComingSoon ? 'Edit Feature' : 'New Feature'}>
        <form onSubmit={handleSaveComingSoon} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Feature Name</label>
            <input type="text" value={comingSoonForm.feature_name} onChange={(e) => setComingSoonForm({ ...comingSoonForm, feature_name: e.target.value })} className={inputClass} placeholder="Feature name..." required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea rows={5} value={comingSoonForm.description} onChange={(e) => setComingSoonForm({ ...comingSoonForm, description: e.target.value })} className={inputClass} placeholder="Feature description..." style={{ minHeight: '120px', resize: 'vertical' }} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ETA (Optional)</label>
            <input type="text" value={comingSoonForm.eta} onChange={(e) => setComingSoonForm({ ...comingSoonForm, eta: e.target.value })} className={inputClass} placeholder="e.g., Q2 2026" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowComingSoonForm(false); setEditingComingSoon(null); }} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={savingComingSoon} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {savingComingSoon ? 'Saving...' : editingComingSoon ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Create Announcement Modal */}
      <Modal isOpen={showAnnouncementForm} onClose={() => setShowAnnouncementForm(false)} title="Create Announcement">
        <form onSubmit={handleCreateAnnouncement} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title (Optional)</label>
            <input type="text" value={announcementForm.title} onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })} className={inputClass} placeholder="Announcement title" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea rows={5} value={announcementForm.message} onChange={(e) => setAnnouncementForm({ ...announcementForm, message: e.target.value })} className={inputClass} placeholder="Announcement message..." style={{ minHeight: '120px', resize: 'vertical' }} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={announcementForm.type} onChange={(e) => setAnnouncementForm({ ...announcementForm, type: e.target.value })} className={inputClass}>
                {ANNOUNCEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date (Optional)</label>
              <input type="date" value={announcementForm.expires_at} onChange={(e) => setAnnouncementForm({ ...announcementForm, expires_at: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAnnouncementForm(false)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={savingAnnouncement} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {savingAnnouncement ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete announcement confirm */}
      <ConfirmDialog
        isOpen={!!deleteAnnouncementTarget}
        onClose={() => setDeleteAnnouncementTarget(null)}
        onConfirm={deleteAnnouncement}
        title="Delete Announcement"
        message={`Delete "${deleteAnnouncementTarget?.title || 'this announcement'}"? This cannot be undone.`}
        confirmText="Delete"
        danger
      />

      {/* Delete update confirm */}
      <ConfirmDialog
        isOpen={!!deleteUpdateTarget}
        onClose={() => setDeleteUpdateTarget(null)}
        onConfirm={deleteAppUpdate}
        title="Delete Update"
        message={`Delete this update entry? This cannot be undone.`}
        confirmText="Delete"
        danger
      />

      {/* Delete coming soon confirm */}
      <ConfirmDialog
        isOpen={!!deleteComingSoonTarget}
        onClose={() => setDeleteComingSoonTarget(null)}
        onConfirm={deleteComingSoonItem}
        title="Delete Feature"
        message={`Delete "${deleteComingSoonTarget?.feature_name || 'this feature'}"? This cannot be undone.`}
        confirmText="Delete"
        danger
      />
    </CommandCenterTabContent>
  );
}

// â”€â”€â”€ Audit Log Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AuditLogTab({ onRegisterRefresh }) {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionFilter, setActionFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detailEntry, setDetailEntry] = useState(null);

  const actionFilterKeys = Object.keys(AUDIT_ACTION_LABELS).sort();

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [actionFilter, categoryFilter, searchQuery, dateFrom, dateTo]);

  const fetchAuditLog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, per_page: perPage };
      if (actionFilter) {
        params.action = actionFilter;
      } else if (categoryFilter) {
        const cat = AUDIT_ACTION_CATEGORIES.find((c) => c.key === categoryFilter);
        if (cat?.actions?.length) params.actions = cat.actions.join(',');
      }
      if (searchQuery) params.search = searchQuery;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const { data } = await api.get('/api/v1/admin/audit-log', { params });
      const items = Array.isArray(data) ? data : data.entries || data.items || [];
      setEntries(items);
      setTotal(data.total ?? items.length);
    } catch {
      setError('Failed to load audit log.');
    } finally {
      setLoading(false);
    }
  }, [page, perPage, actionFilter, categoryFilter, searchQuery, dateFrom, dateTo]);

  useEffect(() => {
    fetchAuditLog();
  }, [fetchAuditLog]);

  useEffect(() => {
    if (!onRegisterRefresh) return undefined;
    return onRegisterRefresh('audit', fetchAuditLog);
  }, [onRegisterRefresh, fetchAuditLog]);

  const clearFilters = () => {
    setActionFilter('');
    setCategoryFilter('');
    setSearchInput('');
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
  };

  const hasFilters = actionFilter || categoryFilter || searchQuery || dateFrom || dateTo;
  const totalPages = Math.ceil(total / perPage) || 1;

  return (
    <CommandCenterTabContent>
      <CommandCenterPanel padding className="!p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search admin email, action, target, or detailsâ€¦"
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {AUDIT_ACTION_CATEGORIES.map((cat) => (
            <button
              key={cat.key || 'all'}
              type="button"
              onClick={() => {
                setCategoryFilter(cat.key);
                setActionFilter('');
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                categoryFilter === cat.key && !actionFilter
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-[10rem] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-500">Specific action</label>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                if (e.target.value) setCategoryFilter('');
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All actions</option>
              {actionFilterKeys.map((key) => (
                <option key={key} value={key}>{AUDIT_ACTION_LABELS[key]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Clear filters
            </button>
          )}
        </div>
      </CommandCenterPanel>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}

      {loading ? (
        <LoadingSpinner />
      ) : entries.length === 0 ? (
        <CommandCenterPanel>
          <EmptyState icon={ScrollText} title="No Audit Entries" message="No audit log entries found." />
        </CommandCenterPanel>
      ) : (
        <>
          <CommandCenterPanel padding={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 font-medium text-gray-600">Date/Time</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Admin</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Action</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Target</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, i) => {
                    const actionKey = entry.action || '';
                    const badgeColor = getAuditLegacyBadgeClass(actionKey);
                    const summary = formatAuditActivityMessage(entry);
                    return (
                      <tr key={entry.id || i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap" title={formatDateTime(entry.created_at)}>
                          {entry.created_at ? formatDistanceToNow(new Date(entry.created_at), { addSuffix: true }) : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-900">{entry.admin_email || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badgeColor}`}>
                            {formatAuditActionLabel(actionKey)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700 max-w-[14rem]">
                          <span className="line-clamp-2">{entry.target || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-md">
                          <div className="flex items-center gap-2">
                            <span className="line-clamp-2 flex-1 min-w-0 text-sm">{summary}</span>
                            {entry.details && (
                              <button
                                type="button"
                                onClick={() => setDetailEntry(entry)}
                                className="shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium"
                              >
                                Expand
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CommandCenterPanel>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Page {page} of {totalPages} ({total} entries)</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={!!detailEntry}
        onClose={() => setDetailEntry(null)}
        title={detailEntry ? formatAuditActionLabel(detailEntry.action) : 'Details'}
      >
        {detailEntry && (
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Summary</p>
              <p className="mt-1 text-gray-900">{formatAuditActivityMessage(detailEntry)}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Admin</p>
                <p className="mt-1 text-gray-900">{detailEntry.admin_email || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">When</p>
                <p className="mt-1 text-gray-900">{formatDateTime(detailEntry.created_at)}</p>
              </div>
              {detailEntry.target && (
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Target</p>
                  <p className="mt-1 text-gray-900">{detailEntry.target}</p>
                </div>
              )}
            </div>
            {detailEntry.details && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Raw details</p>
                <pre className="mt-1 max-h-[50vh] overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 whitespace-pre-wrap break-words">
                  {formatAuditDetailsFull(detailEntry.details)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </CommandCenterTabContent>
  );
}

// â”€â”€â”€ Broadcast Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'All Users' },
  { value: 'free', label: 'Free Tier Only' },
  { value: 'pro', label: 'Pro Tier Only' },
  { value: 'active_30d', label: 'Active in Last 30 Days' },
];

function BroadcastTab({ onRegisterRefresh }) {
  const [view, setView] = useState('compose'); // compose | history | unsubscribed
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('all');
  const [sending, setSending] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  // Confirmation modal
  const [showConfirm, setShowConfirm] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // History
  const [broadcasts, setBroadcasts] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Unsubscribed users
  const [unsubscribed, setUnsubscribed] = useState([]);
  const [loadingUnsub, setLoadingUnsub] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const { data } = await api.get('/api/v1/admin/broadcasts');
      setBroadcasts(data);
    } catch {} finally {
      setLoadingHistory(false);
    }
  }, []);

  const fetchUnsubscribed = useCallback(async () => {
    setLoadingUnsub(true);
    try {
      const { data } = await api.get('/api/v1/admin/unsubscribed');
      setUnsubscribed(data);
    } catch {} finally {
      setLoadingUnsub(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'history') fetchHistory();
    if (view === 'unsubscribed') fetchUnsubscribed();
  }, [view, fetchHistory, fetchUnsubscribed]);

  const refreshView = useCallback(async () => {
    if (view === 'history') await fetchHistory();
    else if (view === 'unsubscribed') await fetchUnsubscribed();
  }, [view, fetchHistory, fetchUnsubscribed]);

  useEffect(() => {
    if (!onRegisterRefresh) return undefined;
    return onRegisterRefresh('broadcast', refreshView);
  }, [onRegisterRefresh, refreshView]);

  const handleSendClick = async () => {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and body are required.');
      return;
    }
    setError('');
    setLoadingPreview(true);
    try {
      const { data } = await api.get('/api/v1/admin/broadcast/preview', { params: { audience_filter: audience } });
      setPreview(data);
      setShowConfirm(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load preview.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirmSend = async () => {
    setShowConfirm(false);
    setSending(true);
    setError('');
    setSuccessMsg('');
    try {
      const { data } = await api.post('/api/v1/admin/broadcast', { subject, body, audience_filter: audience });
      setSuccessMsg(data.message);
      setSubject('');
      setBody('');
      setAudience('all');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send broadcast.');
    } finally {
      setSending(false);
    }
  };

  const handleResubscribe = async (userId) => {
    try {
      await api.post(`/api/v1/admin/resubscribe/${userId}`);
      fetchUnsubscribed();
    } catch {}
  };

  return (
    <CommandCenterTabContent>
      {/* Sub-nav */}
      <div className="flex flex-wrap gap-2">
        {[{ key: 'compose', label: 'Compose', icon: MailIcon }, { key: 'history', label: 'History', icon: ScrollText }, { key: 'unsubscribed', label: 'Unsubscribed', icon: UserMinus }].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              view === key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* â”€â”€â”€ Compose view â”€â”€â”€ */}
      {view === 'compose' && (
        <CommandCenterPanel>
          <CommandCenterSectionHeader
            title="Compose broadcast"
            icon={Radio}
          />

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {successMsg}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject line"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your email content here..."
                rows={8}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Audience</label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className={inputClass}
              >
                {AUDIENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSendClick}
              disabled={sending || loadingPreview || !subject.trim() || !body.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'Sending...' : 'Send Broadcast'}
            </button>
          </div>
        </CommandCenterPanel>
      )}

      {/* â”€â”€â”€ History view â”€â”€â”€ */}
      {view === 'history' && (
        <CommandCenterPanel>
          <CommandCenterSectionHeader
            title="Broadcast history"
            action={
              <button onClick={fetchHistory} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
                <RefreshCw className={`h-4 w-4 text-gray-500 ${loadingHistory ? 'animate-spin' : ''}`} />
              </button>
            }
          />

          {loadingHistory ? (
            <LoadingSpinner />
          ) : broadcasts.length === 0 ? (
            <EmptyState icon={Radio} title="No broadcasts yet" subtitle="Compose your first broadcast to get started." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Audience</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Recipients</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {broadcasts.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-3 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDateTime(b.sent_at)}</td>
                      <td className="px-3 py-3 text-sm text-gray-900 font-medium max-w-xs truncate">{b.subject}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">
                        <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
                          {AUDIENCE_OPTIONS.find((o) => o.value === b.audience_filter)?.label || b.audience_filter}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-600">{b.recipient_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CommandCenterPanel>
      )}

      {/* â”€â”€â”€ Unsubscribed view â”€â”€â”€ */}
      {view === 'unsubscribed' && (
        <CommandCenterPanel>
          <CommandCenterSectionHeader
            title="Unsubscribed users"
            action={
              <button onClick={fetchUnsubscribed} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
                <RefreshCw className={`h-4 w-4 text-gray-500 ${loadingUnsub ? 'animate-spin' : ''}`} />
              </button>
            }
          />

          {loadingUnsub ? (
            <LoadingSpinner />
          ) : unsubscribed.length === 0 ? (
            <EmptyState icon={UserMinus} title="No unsubscribed users" subtitle="All users are currently subscribed to emails." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unsubscribed</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {unsubscribed.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-3 py-3 text-sm text-gray-900">{u.email}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">{u.first_name} {u.last_name}</td>
                      <td className="px-3 py-3 text-sm text-gray-500 whitespace-nowrap">{formatDateTime(u.unsubscribed_at)}</td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => handleResubscribe(u.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          Re-subscribe
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CommandCenterPanel>
      )}

      {/* â”€â”€â”€ Confirmation modal â”€â”€â”€ */}
      {showConfirm && preview && (
        <Modal isOpen={showConfirm && !!preview} onClose={() => setShowConfirm(false)} title="Confirm Broadcast">
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              You're about to email <span className="font-semibold text-gray-900">{preview.recipient_count} users</span>
              {preview.excluded_count > 0 && (
                <span> ({preview.excluded_count} unsubscribed users excluded)</span>
              )}
            </p>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-sm"><span className="font-medium text-gray-700">Subject:</span> {subject}</p>
              <p className="text-sm"><span className="font-medium text-gray-700">Audience:</span> {AUDIENCE_OPTIONS.find((o) => o.value === audience)?.label}</p>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleConfirmSend} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                <Send className="h-4 w-4" />
                Send Now
              </button>
            </div>
          </div>
        </Modal>
      )}
    </CommandCenterTabContent>
  );
}
