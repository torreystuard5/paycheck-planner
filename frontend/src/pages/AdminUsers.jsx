import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, ChevronLeft, ChevronRight, ShieldCheck, Loader2, Save, AlertTriangle } from 'lucide-react';
import api from '../services/api';
import { formatFriendlyDate } from '../utils/formatDate';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';

export default function AdminUsers() {
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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-center gap-3 mb-6">
        <Users className="h-7 w-7 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <span className="text-sm text-gray-500 ml-1">({total})</span>
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
                    <th className="px-4 py-3 font-medium text-gray-600">ID</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Email</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Name</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Signup Date</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      onClick={() => openDetail(u.id)}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {u.id.slice(0, 8)}...
                      </td>
                      <td className="px-4 py-3 text-gray-900">{u.email}</td>
                      <td className="px-4 py-3 text-gray-900">
                        {u.first_name} {u.last_name}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(u.created_at)}
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
                          data-testid={`admin-toggle-${u.id}`}
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
                    </tr>
                  ))}
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
    </div>
  );
}
