import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
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
  Search,
  Settings,
  ScrollText,
  LayoutDashboard,
  Megaphone,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Power,
  RefreshCw,
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
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import SortDropdown from '../components/SortDropdown';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'support', label: 'Support', icon: MessageSquare },
  { key: 'settings', label: 'Settings', icon: Settings },
  { key: 'audit', label: 'Audit Log', icon: ScrollText },
];

// ─── Status helpers ──────────────────────────────────────────────────
const TICKET_STATUS_BADGE = {
  open: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
};
const TICKET_STATUS_ICON = {
  open: Clock,
  in_progress: ArrowRightCircle,
  resolved: CheckCircle2,
};
const TICKET_STATUS_TABS = [
  { key: null, label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
];

const AUDIT_ACTION_COLORS = {
  disable: 'bg-red-100 text-red-700',
  delete: 'bg-red-100 text-red-700',
  enable: 'bg-green-100 text-green-700',
  create: 'bg-blue-100 text-blue-700',
  update: 'bg-amber-100 text-amber-700',
  login: 'bg-purple-100 text-purple-700',
};

const ANNOUNCEMENT_TYPES = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'success', label: 'Success' },
  { value: 'error', label: 'Error' },
  { value: 'coming_soon', label: 'Coming Soon' },
];

// ─── Helpers ─────────────────────────────────────────────────────────
const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return formatFriendlyDate(dateStr);
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

// ─── Main Component ──────────────────────────────────────────────────
export default function CommandCenter() {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [forbidden, setForbidden] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    // Quick admin check
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Command Center</h1>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'dashboard' && <DashboardTab />}
      {activeTab === 'users' && <UsersTab currentUser={currentUser} />}
      {activeTab === 'support' && <SupportTab />}
      {activeTab === 'settings' && <SettingsTab />}
      {activeTab === 'audit' && <AuditLogTab />}
    </div>
  );
}

// ─── Dashboard Tab ───────────────────────────────────────────────────
function DashboardTab() {
  const [stats, setStats] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const [statsRes, announcementsRes, activityRes] = await Promise.allSettled([
        api.get('/api/v1/admin/stats'),
        api.get('/api/v1/admin/announcements'),
        api.get('/api/v1/admin/audit-log', { params: { page: 1, per_page: 5 } }),
      ]);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (announcementsRes.status === 'fulfilled') {
        const d = announcementsRes.value.data;
        setAnnouncements(Array.isArray(d) ? d.filter((a) => a.is_active) : []);
      }
      if (activityRes.status === 'fulfilled') {
        const d = activityRes.value.data;
        setRecentActivity(Array.isArray(d) ? d : d.entries || d.items || []);
      }
    } catch {
      setError('Failed to load dashboard data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => fetchAll({ silent: true }), 60_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  if (loading) return <LoadingSpinner />;
  if (error) return <p className="text-red-600 text-center py-8">{error}</p>;
  if (!stats) return <p className="text-gray-500 text-center py-8">No data available.</p>;

  const cards = [
    { label: 'Total Signups', value: stats.total_users, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Pro Subscribers', value: stats.total_pro_subscribers, icon: Crown, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Free Users', value: stats.total_free_users, icon: User, color: 'text-gray-600', bg: 'bg-gray-100' },
    { label: 'Active Last 30 Days', value: stats.total_active_users_30d, icon: Activity, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Households', value: stats.total_households, icon: Home, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Support Tickets', value: stats.total_support_tickets, icon: MessageSquare, color: 'text-rose-600', bg: 'bg-rose-50' },
  ];

  const chartData = (stats.signups_last_7_days || []).map((d) => ({
    date: formatFriendlyDate(d.date),
    signups: d.count,
  }));

  return (
    <div className="space-y-6">
      {/* Refresh bar */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => fetchAll({ silent: true })}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex items-center gap-4">
            <div className={`${bg} p-3 rounded-lg`}>
              <Icon className={`h-6 w-6 ${color}`} />
            </div>
            <div>
              <p className="text-sm text-gray-500">{label}</p>
              <p className="text-2xl font-bold text-gray-900">{(value ?? 0).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Signups chart */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Signups — Last 7 Days</h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="signups" stroke="#2563eb" strokeWidth={2} dot={{ fill: '#2563eb' }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 text-center py-8">No signup data available.</p>
        )}
      </div>

      {/* Active Announcements */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-blue-600" />
          Active Announcements
        </h2>
        {announcements.length === 0 ? (
          <p className="text-gray-500 text-sm">No active announcements.</p>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <div key={a.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5 text-green-600" />
          Recent Activity
        </h2>
        {recentActivity.length === 0 ? (
          <p className="text-gray-500 text-sm">No recent activity.</p>
        ) : (
          <div className="space-y-3">
            {recentActivity.map((entry, i) => {
              const action = (entry.action || '').toLowerCase();
              const badgeColor = AUDIT_ACTION_COLORS[action] || 'bg-gray-100 text-gray-700';
              return (
                <div key={entry.id || i} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badgeColor}`}>
                    {entry.action}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{entry.details || entry.target || '—'}</p>
                    <p className="text-xs text-gray-500">{entry.admin_email || '—'}</p>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap" title={formatDateTime(entry.created_at)}>
                    {entry.created_at ? formatDistanceToNow(new Date(entry.created_at), { addSuffix: true }) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Users Tab ───────────────────────────────────────────────────────
function UsersTab({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [togglingAdmin, setTogglingAdmin] = useState(null);
  const [toggleError, setToggleError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailUser, setDetailUser] = useState(null);
  const [confirmDisable, setConfirmDisable] = useState(null);

  // Editable fields
  const [editStatus, setEditStatus] = useState('active');
  const [editStatusReason, setEditStatusReason] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailSuccess, setDetailSuccess] = useState('');
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [page, sortBy, sortOrder]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/v1/admin/users', {
        params: { page, per_page: perPage, sort_by: sortBy, sort_order: sortOrder },
      });
      setUsers(data.users);
      setTotal(data.total);
    } catch {
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = searchQuery
    ? users.filter((u) => (u.email || '').toLowerCase().includes(searchQuery.toLowerCase()))
    : users;

  const openDetail = async (userId) => {
    setSelectedUser(userId);
    setDetailLoading(true);
    setDetailUser(null);
    setDetailError('');
    setDetailSuccess('');
    setShowEmailConfirm(false);
    try {
      const { data } = await api.get(`/api/v1/admin/users/${userId}`);
      setDetailUser(data);
      setEditStatus(data.account_status || 'active');
      setEditStatusReason(data.account_status_reason || '');
      setEditNotes(data.admin_notes || '');
      setEditEmail(data.email || '');
    } catch {
      setDetailUser(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedUser(null);
    setDetailUser(null);
    setShowEmailConfirm(false);
  };

  const toggleAdmin = async (e, userId, currentIsAdmin) => {
    e.stopPropagation();
    setToggleError(null);
    if (currentIsAdmin) {
      const adminCount = users.filter((u) => u.is_admin).length;
      if (adminCount <= 1 && userId === currentUser?.id) {
        setToggleError('Cannot remove the only admin');
        setTimeout(() => setToggleError(null), 3000);
        return;
      }
    }
    const newVal = !currentIsAdmin;
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_admin: newVal } : u)));
    setTogglingAdmin(userId);
    try {
      await api.patch(`/api/v1/admin/users/${userId}/admin`, { is_admin: newVal });
    } catch (err) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_admin: currentIsAdmin } : u)));
      setToggleError(err.response?.data?.detail || 'Failed to update admin status.');
      setTimeout(() => setToggleError(null), 3000);
    } finally {
      setTogglingAdmin(null);
    }
  };

  const handleToggleActive = async (userId, currentIsActive) => {
    if (!currentIsActive) {
      // Re-enable directly
      try {
        await api.put(`/api/v1/admin/users/${userId}`, { is_active: true });
        fetchUsers();
      } catch {
        setError('Failed to enable user.');
      }
      return;
    }
    // Disable — show confirmation
    setConfirmDisable(userId);
  };

  const confirmDisableUser = async () => {
    if (!confirmDisable) return;
    try {
      await api.put(`/api/v1/admin/users/${confirmDisable}`, { is_active: false });
      setConfirmDisable(null);
      fetchUsers();
    } catch {
      setError('Failed to disable user.');
    }
  };

  const handleSaveStatus = async () => {
    setSavingStatus(true);
    setDetailError('');
    setDetailSuccess('');
    try {
      const { data } = await api.patch(`/api/v1/admin/users/${detailUser.id}/status`, {
        account_status: editStatus,
        reason: editStatusReason || null,
      });
      setDetailUser(data);
      setDetailSuccess('Account status updated.');
      setTimeout(() => setDetailSuccess(''), 3000);
    } catch (err) {
      setDetailError(err.response?.data?.detail || 'Failed to update status.');
    } finally {
      setSavingStatus(false);
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    setDetailError('');
    setDetailSuccess('');
    try {
      const { data } = await api.patch(`/api/v1/admin/users/${detailUser.id}/notes`, {
        admin_notes: editNotes || null,
      });
      setDetailUser(data);
      setDetailSuccess('Admin notes updated.');
      setTimeout(() => setDetailSuccess(''), 3000);
    } catch (err) {
      setDetailError(err.response?.data?.detail || 'Failed to update notes.');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleSaveEmail = async () => {
    setSavingEmail(true);
    setDetailError('');
    setDetailSuccess('');
    try {
      const { data } = await api.patch(`/api/v1/admin/users/${detailUser.id}/email`, {
        email: editEmail,
      });
      setDetailUser(data);
      setEditEmail(data.email);
      setShowEmailConfirm(false);
      setDetailSuccess('Email updated.');
      setTimeout(() => setDetailSuccess(''), 3000);
      fetchUsers();
    } catch (err) {
      setDetailError(err.response?.data?.detail || 'Failed to update email.');
    } finally {
      setSavingEmail(false);
    }
  };

  const statusBadge = (status) => {
    const colors = {
      active: 'bg-green-100 text-green-700',
      suspended: 'bg-amber-100 text-amber-700',
      closed: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-700'}`}>
        {status}
      </span>
    );
  };

  const totalPages = Math.ceil(total / perPage);

  const readOnlyFields = detailUser
    ? [
        { label: 'First Name', value: detailUser.first_name },
        { label: 'Last Name', value: detailUser.last_name },
        { label: 'Currency', value: detailUser.currency },
        { label: 'Date Format', value: detailUser.date_format },
        { label: 'Active', value: detailUser.is_active ? 'Yes' : 'No' },
        { label: 'Admin', value: detailUser.is_admin ? 'Yes' : 'No' },
        { label: 'Supporter', value: detailUser.is_supporter ? 'Yes' : 'No' },
        { label: 'Subscription Tier', value: detailUser.subscription_tier },
        { label: 'Referral Code', value: detailUser.referral_code || '—' },
        { label: 'Created At', value: formatDateTime(detailUser.created_at) },
      ]
    : [];

  return (
    <div className="space-y-4">
      {/* Search + Sort */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by email..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
          />
        </div>
        <SortDropdown
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(sb, so) => { setSortBy(sb); setSortOrder(so); }}
          options={[
            { value: 'email', label: 'Email' },
            { value: 'created_at', label: 'Join Date' },
            { value: 'last_login_at', label: 'Last Login' },
            { value: 'is_admin', label: 'Role' },
          ]}
        />
      </div>

      {toggleError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{toggleError}</div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : filteredUsers.length === 0 ? (
        <EmptyState icon={Users} title="No Users Found" message="No users match your search." />
      ) : (
        <>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 font-medium text-gray-600">Email</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Name</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Join Date</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Last Login</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Admin</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr
                      key={u.id}
                      onClick={() => openDetail(u.id)}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-900">{u.email}</td>
                      <td className="px-4 py-3 text-gray-900">{u.first_name} {u.last_name}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(u.created_at)}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(u.last_login_at)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => toggleAdmin(e, u.id, u.is_admin)}
                          disabled={togglingAdmin === u.id || u.admin_locked}
                          className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                          style={{
                            backgroundColor: u.is_admin ? '#2563eb' : '#d1d5db',
                            ...(u.admin_locked ? { opacity: 0.4, pointerEvents: 'none' } : {})
                          }}
                          role="switch"
                          aria-checked={u.is_admin}
                          aria-label={`Toggle admin for ${u.email}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${u.is_admin ? 'translate-x-6' : 'translate-x-1'}`} />
                          {togglingAdmin === u.id && <Loader2 className="absolute -right-6 h-4 w-4 animate-spin text-blue-600" />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '4px 12px',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#fff',
                            whiteSpace: 'nowrap',
                            backgroundColor: u.status === 'Active' ? '#22c55e'
                              : u.status === 'Inactive' ? '#f59e0b'
                              : '#ef4444'
                          }}
                        >
                          {u.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Page {page} of {totalPages} ({total} users)</p>
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

      {/* Disable confirmation */}
      <ConfirmDialog
        isOpen={!!confirmDisable}
        onClose={() => setConfirmDisable(null)}
        onConfirm={confirmDisableUser}
        title="Disable User"
        message="Are you sure you want to disable this user? They will be unable to access the app."
        confirmText="Disable"
        danger
      />

      {/* User detail modal */}
      <Modal isOpen={!!selectedUser} onClose={closeDetail} title="User Details">
        {detailLoading ? (
          <LoadingSpinner />
        ) : detailUser ? (
          <div className="space-y-6">
            {detailError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{detailError}</div>}
            {detailSuccess && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">{detailSuccess}</div>}

            {/* Email */}
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Email</h3>
              <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className={inputClass} />
              {editEmail !== detailUser.email && !showEmailConfirm && (
                <button onClick={() => setShowEmailConfirm(true)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                  <Save className="w-3.5 h-3.5" />Change Email
                </button>
              )}
              {showEmailConfirm && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm text-amber-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Change email to <strong>{editEmail}</strong>?
                  </p>
                  <div className="flex gap-2">
                    <button onClick={handleSaveEmail} disabled={savingEmail} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      {savingEmail && <Loader2 className="w-3 h-3 animate-spin" />}Confirm
                    </button>
                    <button onClick={() => { setShowEmailConfirm(false); setEditEmail(detailUser.email); }} className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
              )}
            </div>

            {/* Account Status */}
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Account Status</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Current:</span>
                {statusBadge(detailUser.account_status || 'active')}
              </div>
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className={inputClass}>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="closed">Closed</option>
              </select>
              {(editStatus === 'suspended' || editStatus === 'closed') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                  <input type="text" value={editStatusReason} onChange={(e) => setEditStatusReason(e.target.value)} className={inputClass} placeholder="Reason for status change..." />
                </div>
              )}
              <button onClick={handleSaveStatus} disabled={savingStatus} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {savingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Save Status
              </button>
            </div>

            {/* Admin Notes */}
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Admin Notes</h3>
              <textarea rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className={inputClass} placeholder="Internal notes about this user..." />
              <button onClick={handleSaveNotes} disabled={savingNotes} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {savingNotes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Save Notes
              </button>
            </div>

            {/* Login Info */}
            <div className="border border-gray-200 rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-semibold text-gray-900">Login Info</h3>
              <div className="flex justify-between py-1.5">
                <span className="text-sm text-gray-500">Last Login</span>
                <span className="text-sm text-gray-900">{formatDateTime(detailUser.last_login_at)}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-sm text-gray-500">Failed Login Count</span>
                <span className="text-sm text-gray-900">{detailUser.failed_login_count ?? 0}</span>
              </div>
            </div>

            {/* Read-only fields */}
            <div className="space-y-3">
              {readOnlyFields.map(({ label, value }) => (
                <div key={label} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm font-medium text-gray-500">{label}</span>
                  <span className="text-sm text-gray-900 text-right max-w-[60%] break-all">{value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-red-600 text-sm">Failed to load user details.</p>
        )}
      </Modal>
    </div>
  );
}

// ─── Support Tab ─────────────────────────────────────────────────────
function SupportTab() {
  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [statusFilter, setStatusFilter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // Detail modal
  const [selectedId, setSelectedId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [editStatus, setEditStatus] = useState('open');
  const [editNotes, setEditNotes] = useState('');
  const [replyMessage, setReplyMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailSuccess, setDetailSuccess] = useState('');

  useEffect(() => { setPage(1); }, [statusFilter]);

  useEffect(() => {
    fetchTickets();
  }, [page, statusFilter, sortBy, sortOrder]);

  const fetchTickets = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, per_page: perPage, sort_by: sortBy, sort_order: sortOrder };
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/api/v1/support/all', { params });
      setTickets(data.tickets);
      setTotal(data.total);
    } catch {
      setError('Failed to load support tickets.');
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (id) => {
    setSelectedId(id);
    setDetailLoading(true);
    setDetail(null);
    setDetailError('');
    setDetailSuccess('');
    setReplyMessage('');
    try {
      const { data } = await api.get(`/api/v1/support/${id}`);
      setDetail(data);
      setEditStatus(data.status);
      setEditNotes(data.admin_notes || '');
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedId(null);
    setDetail(null);
    setReplyMessage('');
  };

  const handleSave = async () => {
    setSaving(true);
    setDetailError('');
    setDetailSuccess('');
    try {
      const { data } = await api.patch(`/api/v1/support/${detail.id}`, { status: editStatus, admin_notes: editNotes || null });
      setDetail(data);
      setDetailSuccess('Updated successfully.');
      setTimeout(() => setDetailSuccess(''), 3000);
      fetchTickets();
    } catch (err) {
      setDetailError(err.response?.data?.detail || 'Failed to update.');
    } finally {
      setSaving(false);
    }
  };

  const handleResolve = async () => {
    setSaving(true);
    setDetailError('');
    setDetailSuccess('');
    try {
      const { data } = await api.patch(`/api/v1/support/${detail.id}`, { status: 'resolved', admin_notes: editNotes || null });
      setDetail(data);
      setEditStatus('resolved');
      setDetailSuccess('Marked as resolved.');
      setTimeout(() => setDetailSuccess(''), 3000);
      fetchTickets();
    } catch (err) {
      setDetailError(err.response?.data?.detail || 'Failed to resolve.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyMessage.trim() || !detail) return;
    setSending(true);
    setDetailError('');
    setDetailSuccess('');
    try {
      await api.post(`/api/v1/support/${detail.id}/reply`, { message: replyMessage.trim() });
      setReplyMessage('');
      setDetailSuccess('Reply sent successfully.');
      const { data } = await api.get(`/api/v1/support/${detail.id}`);
      setDetail(data);
      setTimeout(() => setDetailSuccess(''), 3000);
      fetchTickets();
    } catch {
      setDetailError('Failed to send reply.');
    } finally {
      setSending(false);
    }
  };

  // Status badge counts
  const badgeCounts = {
    open: tickets.filter((t) => t.status === 'open').length,
    in_progress: tickets.filter((t) => t.status === 'in_progress').length,
    resolved: tickets.filter((t) => t.status === 'resolved').length,
  };

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="space-y-4">
      {/* Filter + Sort */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-1 flex-wrap">
          {TICKET_STATUS_TABS.map((tab) => (
            <button
              key={tab.key ?? 'all'}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab.label}
              {tab.key && badgeCounts[tab.key] > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-white/20">{badgeCounts[tab.key]}</span>
              )}
            </button>
          ))}
        </div>
        <SortDropdown
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(sb, so) => { setSortBy(sb); setSortOrder(so); }}
          options={[
            { value: 'created_at', label: 'Date' },
            { value: 'status', label: 'Status' },
            { value: 'priority', label: 'Priority' },
          ]}
        />
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}

      {loading ? (
        <LoadingSpinner />
      ) : tickets.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No Support Tickets" message={statusFilter ? `No ${statusFilter.replace('_', ' ')} tickets found.` : 'No support tickets yet.'} />
      ) : (
        <>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Name / Email</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Subject</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => {
                    const Icon = TICKET_STATUS_ICON[ticket.status] || Clock;
                    return (
                      <tr key={ticket.id} onClick={() => openDetail(ticket.id)} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors">
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${TICKET_STATUS_BADGE[ticket.status] || 'bg-gray-100 text-gray-600'}`}>
                            <Icon className="w-3 h-3" />
                            {ticket.status?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-gray-900">{ticket.name || 'Anonymous'}</div>
                          <div className="text-xs text-gray-500">{ticket.email || '—'}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{ticket.subject || 'No Subject'}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDateTime(ticket.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Page {page} of {totalPages} ({total} tickets)</p>
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

      {/* Detail Modal */}
      {selectedId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={closeDetail} />
          <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 w-[calc(100%-2rem)] sm:w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto z-[100]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Ticket Detail</h2>
              <button onClick={closeDetail} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-4">
              {detailLoading ? (
                <LoadingSpinner />
              ) : detail ? (
                <div className="space-y-5">
                  {detailError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{detailError}</div>}
                  {detailSuccess && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">{detailSuccess}</div>}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><p className="text-xs text-gray-500 uppercase tracking-wide">Name</p><p className="text-sm text-gray-900 mt-0.5">{detail.name || 'Anonymous'}</p></div>
                    <div><p className="text-xs text-gray-500 uppercase tracking-wide">Email</p><p className="text-sm text-gray-900 mt-0.5">{detail.email || '—'}</p></div>
                    <div><p className="text-xs text-gray-500 uppercase tracking-wide">Subject</p><p className="text-sm text-gray-900 mt-0.5">{detail.subject || 'No Subject'}</p></div>
                    <div><p className="text-xs text-gray-500 uppercase tracking-wide">Created</p><p className="text-sm text-gray-900 mt-0.5">{formatDateTime(detail.created_at)}</p></div>
                    {detail.cant_access_email && (
                      <div className="sm:col-span-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          <AlertCircle className="w-3 h-3" />Can&apos;t access email
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Message */}
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Message</p>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap min-h-[60px]">{detail.message || 'No message provided.'}</div>
                  </div>

                  {/* Replies */}
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Replies ({detail.replies?.length || 0})</p>
                    {detail.replies?.length > 0 ? (
                      <div className="space-y-3">
                        {detail.replies.map((reply) => (
                          <div key={reply.id} className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{reply.reply_message}</p>
                            <p className="text-xs text-gray-500 mt-2">{formatDateTime(reply.created_at)}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No replies yet.</p>
                    )}
                  </div>

                  {/* Reply textarea */}
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">Reply</label>
                    <textarea value={replyMessage} onChange={(e) => setReplyMessage(e.target.value)} placeholder="Type your reply..." rows={3} className={inputClass + ' resize-none'} />
                    <div className="flex justify-end mt-2">
                      <button onClick={handleSendReply} disabled={!replyMessage.trim() || sending} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        {sending ? <><Loader2 className="h-4 w-4 animate-spin" />Sending...</> : <><Send className="w-4 h-4" />Send Reply</>}
                      </button>
                    </div>
                  </div>

                  {/* Admin Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Admin Notes</label>
                    <textarea rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className={inputClass} placeholder="Internal notes..." />
                  </div>

                  {/* Status */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className={inputClass}>
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save
                    </button>
                    {detail.status !== 'resolved' && (
                      <button onClick={handleResolve} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">Resolve</button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-600 text-sm py-4"><AlertCircle className="w-4 h-4 shrink-0" />Failed to load ticket details.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Settings Tab ────────────────────────────────────────────────────
const UPDATE_TYPES = [
  { value: 'update', label: 'Update', color: 'bg-blue-100 text-blue-700' },
  { value: 'fix', label: 'Fix', color: 'bg-amber-100 text-amber-700' },
  { value: 'new_feature', label: 'New Feature', color: 'bg-green-100 text-green-700' },
];

function SettingsTab() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [confirmMaintenance, setConfirmMaintenance] = useState(false);

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

  useEffect(() => {
    fetchSettings();
    fetchAnnouncements();
    fetchAppUpdates();
    fetchComingSoon();
  }, []);

  const fetchSettings = async () => {
    setSettingsLoading(true);
    try {
      const { data } = await api.get('/api/v1/admin/settings');
      const settings = Array.isArray(data) ? data : [];
      const mm = settings.find((s) => s.key === 'maintenance_mode');
      setMaintenanceMode(mm ? mm.value === 'true' : false);
    } catch {
      // silent
    } finally {
      setSettingsLoading(false);
    }
  };

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

  const handleToggleMaintenance = () => {
    if (!maintenanceMode) {
      setConfirmMaintenance(true);
    } else {
      doToggleMaintenance();
    }
  };

  const doToggleMaintenance = async () => {
    setToggling(true);
    setConfirmMaintenance(false);
    try {
      await api.put('/api/v1/admin/settings/maintenance_mode', { value: String(!maintenanceMode) });
      setMaintenanceMode(!maintenanceMode);
    } catch {
      setError('Failed to update maintenance mode.');
    } finally {
      setToggling(false);
    }
  };

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
    <div className="space-y-6">
      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}

      {/* Maintenance Mode */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Power className="h-5 w-5 text-gray-600" />
          Maintenance Mode
        </h2>
        {settingsLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${maintenanceMode ? 'bg-red-500' : 'bg-green-500'}`} />
              <span className="text-sm font-medium text-gray-700">
                {maintenanceMode ? 'Maintenance mode is ON' : 'Maintenance mode is OFF'}
              </span>
            </div>
            <button
              onClick={handleToggleMaintenance}
              disabled={toggling}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                maintenanceMode
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-red-600 text-white hover:bg-red-700'
              } disabled:opacity-50`}
            >
              {toggling ? <Loader2 className="h-4 w-4 animate-spin" /> : maintenanceMode ? <ToggleLeft className="h-4 w-4" /> : <ToggleRight className="h-4 w-4" />}
              {maintenanceMode ? 'Disable' : 'Enable'}
            </button>
          </div>
        )}
      </div>

      {/* Announcements */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-blue-600" />
            Announcements
          </h2>
          <button
            onClick={() => setShowAnnouncementForm(true)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New
          </button>
        </div>

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
      </div>

      {/* Recent Updates Manager */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            Recent Updates
          </h2>
          <button
            onClick={() => { setEditingUpdate(null); setUpdateForm({ date: new Date().toISOString().split('T')[0], description: '', type: 'update' }); setShowUpdateForm(true); }}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New
          </button>
        </div>

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
      </div>

      {/* Coming Soon Manager */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <ArrowRightCircle className="h-5 w-5 text-green-600" />
            Coming Soon
          </h2>
          <button
            onClick={() => { setEditingComingSoon(null); setComingSoonForm({ feature_name: '', description: '', eta: '' }); setShowComingSoonForm(true); }}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New
          </button>
        </div>

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
      </div>

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

      {/* Confirm maintenance */}
      <ConfirmDialog
        isOpen={confirmMaintenance}
        onClose={() => setConfirmMaintenance(false)}
        onConfirm={doToggleMaintenance}
        title="Enable Maintenance Mode"
        message="This will prevent all non-admin users from accessing the app. Are you sure?"
        confirmText="Enable"
        danger
      />

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
    </div>
  );
}

// ─── Audit Log Tab ───────────────────────────────────────────────────
function AuditLogTab() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionFilter, setActionFilter] = useState('');
  const [actionOptions, setActionOptions] = useState([]);

  useEffect(() => {
    fetchAuditLog();
  }, [page, actionFilter]);

  const fetchAuditLog = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, per_page: perPage };
      if (actionFilter) params.action = actionFilter;
      const { data } = await api.get('/api/v1/admin/audit-log', { params });
      const items = Array.isArray(data) ? data : data.entries || data.items || [];
      setEntries(items);
      setTotal(data.total || items.length);
      // Build action options from data
      if (actionOptions.length === 0 && items.length > 0) {
        const unique = [...new Set(items.map((e) => e.action).filter(Boolean))];
        setActionOptions(unique);
      }
    } catch {
      setError('Failed to load audit log.');
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / perPage) || 1;

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-3">
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">All Actions</option>
          {actionOptions.map((action) => (
            <option key={action} value={action}>{action}</option>
          ))}
        </select>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}

      {loading ? (
        <LoadingSpinner />
      ) : entries.length === 0 ? (
        <EmptyState icon={ScrollText} title="No Audit Entries" message="No audit log entries found." />
      ) : (
        <>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 font-medium text-gray-600">Date/Time</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Admin</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Action</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Target</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, i) => {
                    const action = (entry.action || '').toLowerCase();
                    const badgeColor = AUDIT_ACTION_COLORS[action] || 'bg-gray-100 text-gray-700';
                    return (
                      <tr key={entry.id || i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap" title={formatDateTime(entry.created_at)}>
                          {entry.created_at ? formatDistanceToNow(new Date(entry.created_at), { addSuffix: true }) : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-900">{entry.admin_email || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badgeColor}`}>
                            {entry.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{entry.target || '—'}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{entry.details || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

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
    </div>
  );
}
