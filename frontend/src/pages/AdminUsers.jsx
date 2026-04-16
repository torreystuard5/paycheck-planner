import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, ChevronLeft, ChevronRight, ShieldCheck, Loader2, Save, AlertTriangle, Crown, Settings2, ToggleLeft, ToggleRight } from 'lucide-react';
import api from '../services/api';
import { formatFriendlyDate } from '../utils/formatDate';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';

const TIER_COLORS = {
  free: 'bg-gray-100 text-gray-700',
  pro: 'bg-blue-100 text-blue-700',
  business: 'bg-purple-100 text-purple-700',
  bundle: 'bg-amber-100 text-amber-700',
  early_access: 'bg-green-100 text-green-700',
};

export default function AdminUsers({ embedded = false }) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailUser, setDetailUser] = useState(null);
  const [togglingAdmin, setTogglingAdmin] = useState(null);
  const [togglingActive, setTogglingActive] = useState(null);
  const [toggleError, setToggleError] = useState(null);

  // Editable fields state
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

  // Override modal state
  const [overrideUser, setOverrideUser] = useState(null);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideData, setOverrideData] = useState(null);
  const [overrideTier, setOverrideTier] = useState('');
  const [overrideFeatures, setOverrideFeatures] = useState([]);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideExpires, setOverrideExpires] = useState('');
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideError, setOverrideError] = useState('');

  // Global features panel
  const [showGlobalFeatures, setShowGlobalFeatures] = useState(false);
  const [globalFeatures, setGlobalFeatures] = useState([]);
  const [globalFeaturesLoading, setGlobalFeaturesLoading] = useState(false);
  const [togglingFeature, setTogglingFeature] = useState(null);

  // User overrides map for badges
  const [userOverrides, setUserOverrides] = useState({});

  useEffect(() => {
    fetchUsers();
  }, [page]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/v1/admin/users', {
        params: { page, per_page: perPage },
      });
      setUsers(data.users);
      setTotal(data.total);
      // Fetch overrides for listed users
      fetchUserOverrides(data.users.map(u => u.id));
    } catch (err) {
      if (err.response?.status === 403) {
        setForbidden(true);
      } else {
        setError('Failed to load users.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchUserOverrides = async (userIds) => {
    const overrides = {};
    await Promise.allSettled(
      userIds.map(async (id) => {
        try {
          const { data } = await api.get(`/api/v1/admin/users/${id}/override`);
          if (data) overrides[id] = data;
        } catch { /* skip */ }
      })
    );
    setUserOverrides(overrides);
  };

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
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, is_admin: newVal } : u))
    );
    setTogglingAdmin(userId);

    try {
      await api.patch(`/api/v1/admin/users/${userId}/admin`, { is_admin: newVal });
      fetchUsers();
    } catch (err) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_admin: currentIsAdmin } : u))
      );
      setToggleError(err.response?.data?.detail || 'Failed to update admin status.');
      setTimeout(() => setToggleError(null), 3000);
    } finally {
      setTogglingAdmin(null);
    }
  };

  // Feature A: Toggle active/deactivated
  const toggleActive = async (e, userId, currentIsActive) => {
    e.stopPropagation();
    if (userId === currentUser?.id) return;

    setTogglingActive(userId);
    setToggleError(null);

    const newVal = !currentIsActive;
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, is_active: newVal } : u))
    );

    try {
      await api.patch(`/api/v1/admin/users/${userId}/toggle-active`);
      fetchUsers();
    } catch (err) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_active: currentIsActive } : u))
      );
      setToggleError(err.response?.data?.detail || 'Failed to toggle active status.');
      setTimeout(() => setToggleError(null), 3000);
    } finally {
      setTogglingActive(null);
    }
  };

  // Feature B: Override modal
  const openOverride = async (e, userId) => {
    e.stopPropagation();
    setOverrideUser(userId);
    setOverrideLoading(true);
    setOverrideError('');
    setOverrideData(null);

    // Also fetch global features for checkbox list
    try {
      const [overrideRes, featuresRes] = await Promise.all([
        api.get(`/api/v1/admin/users/${userId}/override`),
        api.get('/api/v1/admin/global-features'),
      ]);
      setGlobalFeatures(featuresRes.data || []);
      const ov = overrideRes.data;
      if (ov) {
        setOverrideData(ov);
        setOverrideTier(ov.override_tier || '');
        setOverrideFeatures(ov.granted_features || []);
        setOverrideReason(ov.reason || '');
        setOverrideExpires(ov.expires_at ? ov.expires_at.slice(0, 10) : '');
      } else {
        setOverrideTier('');
        setOverrideFeatures([]);
        setOverrideReason('');
        setOverrideExpires('');
      }
    } catch {
      setOverrideError('Failed to load override data.');
    } finally {
      setOverrideLoading(false);
    }
  };

  const closeOverride = () => {
    setOverrideUser(null);
    setOverrideData(null);
  };

  const saveOverride = async () => {
    setOverrideSaving(true);
    setOverrideError('');
    try {
      await api.put(`/api/v1/admin/users/${overrideUser}/override`, {
        override_tier: overrideTier || null,
        granted_features: overrideFeatures,
        reason: overrideReason || null,
        expires_at: overrideExpires ? `${overrideExpires}T23:59:59` : null,
      });
      closeOverride();
      fetchUsers();
    } catch (err) {
      setOverrideError(err.response?.data?.detail || 'Failed to save override.');
    } finally {
      setOverrideSaving(false);
    }
  };

  const removeOverride = async () => {
    setOverrideSaving(true);
    setOverrideError('');
    try {
      await api.delete(`/api/v1/admin/users/${overrideUser}/override`);
      closeOverride();
      fetchUsers();
    } catch (err) {
      setOverrideError(err.response?.data?.detail || 'Failed to remove override.');
    } finally {
      setOverrideSaving(false);
    }
  };

  const toggleFeatureCheckbox = (key) => {
    setOverrideFeatures((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]
    );
  };

  // Feature C: Global features panel
  const openGlobalFeatures = async () => {
    setShowGlobalFeatures(true);
    setGlobalFeaturesLoading(true);
    try {
      const { data } = await api.get('/api/v1/admin/global-features');
      setGlobalFeatures(data || []);
    } catch { /* ignore */ } finally {
      setGlobalFeaturesLoading(false);
    }
  };

  const toggleGlobalFeature = async (featureKey, currentValue) => {
    setTogglingFeature(featureKey);
    try {
      await api.put(`/api/v1/admin/global-features/${featureKey}`, {
        is_free_for_all: !currentValue,
      });
      const { data } = await api.get('/api/v1/admin/global-features');
      setGlobalFeatures(data || []);
    } catch { /* ignore */ } finally {
      setTogglingFeature(null);
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
      fetchUsers();
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
      fetchUsers();
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

  if (loading && page === 1) return <LoadingSpinner />;

  if (forbidden) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <p className="text-lg font-medium text-gray-700 mb-4">
          You don't have permission to view this page.
        </p>
        <Link
          to="/dashboard"
          className="text-blue-600 hover:text-blue-700 font-medium"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  const totalPages = Math.ceil(total / perPage);

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return formatFriendlyDate(dateStr);
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

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

  const getEffectiveTier = (u) => {
    const ov = userOverrides[u.id];
    if (ov?.override_tier) return ov.override_tier;
    return u.subscription_tier || 'free';
  };

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
        { label: 'Months Banked', value: detailUser.supporter_months_banked },
        { label: 'Referral Code', value: detailUser.referral_code || '—' },
        { label: 'Referred By', value: detailUser.referred_by_user_id || '—' },
        { label: 'Free Month Credits', value: detailUser.free_month_credits },
        { label: 'Next Billing Date', value: formatDateTime(detailUser.next_billing_date) },
        { label: 'TOS Version', value: detailUser.tos_version || '—' },
        { label: 'TOS Accepted At', value: formatDateTime(detailUser.tos_accepted_at) },
        { label: 'Created At', value: formatDateTime(detailUser.created_at) },
        { label: 'Updated At', value: formatDateTime(detailUser.updated_at) },
      ]
    : [];

  const proFeatures = globalFeatures.filter(f => f.tier === 'pro');
  const bizFeatures = globalFeatures.filter(f => f.tier === 'business');

  return (
    <div className={embedded ? 'space-y-4' : 'min-h-screen bg-gray-50 p-6'}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="h-7 w-7 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <span className="text-sm text-gray-500 ml-1">({total})</span>
        </div>
        <button
          onClick={openGlobalFeatures}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Settings2 className="w-4 h-4" />
          Global Features
        </button>
      </div>

      {toggleError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {toggleError}
        </div>
      )}

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users found"
          message="There are no registered users yet."
        />
      ) : (
        <>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 font-medium text-gray-600">Email</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Name</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Tier</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Active</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Admin</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Override</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const tier = getEffectiveTier(u);
                    const hasOverride = !!userOverrides[u.id];
                    const isSelf = u.id === currentUser?.id;
                    return (
                      <tr
                        key={u.id}
                        onClick={() => openDetail(u.id)}
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 text-gray-900">{u.email}</td>
                        <td className="px-4 py-3 text-gray-900">
                          {u.first_name} {u.last_name}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TIER_COLORS[tier] || TIER_COLORS.free}`}>
                              {tier.toUpperCase()}
                            </span>
                            {hasOverride && (
                              <Crown className="w-3.5 h-3.5 text-amber-500" title={`Override: ${userOverrides[u.id]?.reason || 'Admin override'}`} />
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={(e) => toggleActive(e, u.id, u.is_active)}
                            disabled={togglingActive === u.id || isSelf}
                            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-40"
                            style={{ backgroundColor: u.is_active ? '#22c55e' : '#d1d5db' }}
                            role="switch"
                            aria-checked={u.is_active}
                            aria-label={`Toggle active for ${u.email}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                u.is_active ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                            {togglingActive === u.id && (
                              <Loader2 className="absolute -right-6 h-4 w-4 animate-spin text-green-600" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={(e) => toggleAdmin(e, u.id, u.is_admin)}
                            disabled={togglingAdmin === u.id}
                            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            style={{ backgroundColor: u.is_admin ? '#2563eb' : '#d1d5db' }}
                            role="switch"
                            aria-checked={u.is_admin}
                            aria-label={`Toggle admin for ${u.email}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                u.is_admin ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                            {togglingAdmin === u.id && (
                              <Loader2 className="absolute -right-6 h-4 w-4 animate-spin text-blue-600" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={(e) => openOverride(e, u.id)}
                            className="px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                          >
                            Override
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                Page {page} of {totalPages} ({total} users)
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* User detail modal */}
      <Modal
        isOpen={!!selectedUser}
        onClose={closeDetail}
        title="User Details"
      >
        {detailLoading ? (
          <LoadingSpinner />
        ) : detailUser ? (
          <div className="space-y-6">
            {detailError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{detailError}</div>
            )}
            {detailSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">{detailSuccess}</div>
            )}

            {/* Email (editable) */}
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Email</h3>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className={inputClass}
              />
              {editEmail !== detailUser.email && !showEmailConfirm && (
                <button
                  onClick={() => setShowEmailConfirm(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  Change Email
                </button>
              )}
              {showEmailConfirm && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm text-amber-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Are you sure you want to change this user's email to <strong>{editEmail}</strong>?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEmail}
                      disabled={savingEmail}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {savingEmail && <Loader2 className="w-3 h-3 animate-spin" />}
                      Confirm
                    </button>
                    <button
                      onClick={() => { setShowEmailConfirm(false); setEditEmail(detailUser.email); }}
                      className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
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
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className={inputClass}
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="closed">Closed</option>
              </select>
              {(editStatus === 'suspended' || editStatus === 'closed') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                  <input
                    type="text"
                    value={editStatusReason}
                    onChange={(e) => setEditStatusReason(e.target.value)}
                    className={inputClass}
                    placeholder="Reason for status change..."
                  />
                </div>
              )}
              <button
                onClick={handleSaveStatus}
                disabled={savingStatus}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {savingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Status
              </button>
            </div>

            {/* Admin Notes */}
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Admin Notes</h3>
              <textarea
                rows={3}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className={inputClass}
                placeholder="Internal notes about this user..."
              />
              <button
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {savingNotes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Notes
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
              {detailUser.account_status_reason && (
                <div className="flex justify-between py-1.5">
                  <span className="text-sm text-gray-500">Status Reason</span>
                  <span className="text-sm text-gray-900 text-right max-w-[60%]">{detailUser.account_status_reason}</span>
                </div>
              )}
            </div>

            {/* Read-only fields */}
            <div className="space-y-3">
              {readOnlyFields.map(({ label, value }) => (
                <div key={label} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm font-medium text-gray-500">{label}</span>
                  <span className="text-sm text-gray-900 text-right max-w-[60%] break-all">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-red-600 text-sm">Failed to load user details.</p>
        )}
      </Modal>

      {/* Override modal */}
      <Modal
        isOpen={!!overrideUser}
        onClose={closeOverride}
        title="Tier Override"
      >
        {overrideLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="space-y-4">
            {overrideError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{overrideError}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Override Tier</label>
              <select value={overrideTier} onChange={(e) => setOverrideTier(e.target.value)} className={inputClass}>
                <option value="">None (use default)</option>
                <option value="pro">Pro</option>
                <option value="business">Business</option>
                <option value="bundle">Bundle</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Granted Features</label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {globalFeatures.map((f) => (
                  <label key={f.feature_key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overrideFeatures.includes(f.feature_key)}
                      onChange={() => toggleFeatureCheckbox(f.feature_key)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">{f.feature_label}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${f.tier === 'pro' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                      {f.tier}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <input
                type="text"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className={inputClass}
                placeholder="e.g. Beta tester, VIP customer..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expires (optional)</label>
              <input
                type="date"
                value={overrideExpires}
                onChange={(e) => setOverrideExpires(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              {overrideData && (
                <button
                  onClick={removeOverride}
                  disabled={overrideSaving}
                  className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                >
                  Remove Override
                </button>
              )}
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={closeOverride}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveOverride}
                  disabled={overrideSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {overrideSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                  Save Override
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Global Features Panel */}
      <Modal
        isOpen={showGlobalFeatures}
        onClose={() => setShowGlobalFeatures(false)}
        title="Global Feature Access"
      >
        {globalFeaturesLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="space-y-6">
            {/* Pro Features */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Pro</span>
                Pro Features
              </h3>
              <div className="space-y-3">
                {proFeatures.map((f) => (
                  <div key={f.feature_key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{f.feature_label}</p>
                      <p className="text-xs text-gray-500">
                        {f.is_free_for_all ? 'Free for all users' : 'Requires Pro subscription'}
                      </p>
                      {f.updated_at && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Last changed on {new Date(f.updated_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => toggleGlobalFeature(f.feature_key, f.is_free_for_all)}
                      disabled={togglingFeature === f.feature_key}
                      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      style={{ backgroundColor: f.is_free_for_all ? '#22c55e' : '#d1d5db' }}
                      role="switch"
                      aria-checked={f.is_free_for_all}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          f.is_free_for_all ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                      {togglingFeature === f.feature_key && (
                        <Loader2 className="absolute -right-6 h-4 w-4 animate-spin text-green-600" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Business Features */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">Business</span>
                Business Features
              </h3>
              <div className="space-y-3">
                {bizFeatures.map((f) => (
                  <div key={f.feature_key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{f.feature_label}</p>
                      <p className="text-xs text-gray-500">
                        {f.is_free_for_all ? 'Free for all users' : 'Requires Business subscription'}
                      </p>
                      {f.updated_at && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Last changed on {new Date(f.updated_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => toggleGlobalFeature(f.feature_key, f.is_free_for_all)}
                      disabled={togglingFeature === f.feature_key}
                      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                      style={{ backgroundColor: f.is_free_for_all ? '#22c55e' : '#d1d5db' }}
                      role="switch"
                      aria-checked={f.is_free_for_all}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          f.is_free_for_all ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                      {togglingFeature === f.feature_key && (
                        <Loader2 className="absolute -right-6 h-4 w-4 animate-spin text-purple-600" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
