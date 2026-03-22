import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';

export default function AdminUsers() {
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
    try {
      const { data } = await api.get(`/api/v1/admin/users/${userId}`);
      setDetailUser(data);
    } catch {
      setDetailUser(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedUser(null);
    setDetailUser(null);
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
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
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

  const detailFields = detailUser
    ? [
        { label: 'Email', value: detailUser.email },
        { label: 'First Name', value: detailUser.first_name },
        { label: 'Last Name', value: detailUser.last_name },
        { label: 'Currency', value: detailUser.currency },
        { label: 'Date Format', value: detailUser.date_format },
        { label: 'Pay Frequency', value: detailUser.pay_frequency || '—' },
        { label: 'Next Pay Date', value: formatDate(detailUser.next_pay_date) },
        { label: 'Net Pay Amount', value: detailUser.net_pay_amount != null ? `$${Number(detailUser.net_pay_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—' },
        { label: 'Active', value: detailUser.is_active ? 'Yes' : 'No' },
        { label: 'Admin', value: detailUser.is_admin ? 'Yes' : 'No' },
        { label: 'Supporter', value: detailUser.is_supporter ? 'Yes' : 'No' },
        { label: 'Subscription Tier', value: detailUser.subscription_tier },
        { label: 'Months Banked', value: detailUser.supporter_months_banked },
        { label: 'Referral Code', value: detailUser.referral_code || '—' },
        { label: 'Referred By', value: detailUser.referred_by_user_id || '—' },
        { label: 'Free Month Credits', value: detailUser.free_month_credits },
        { label: 'Next Billing Date', value: formatDateTime(detailUser.next_billing_date) },
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
                        {u.is_admin ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                            <ShieldCheck className="h-3 w-3" />
                            Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                            No
                          </span>
                        )}
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
          <div className="space-y-3">
            {detailFields.map(({ label, value }) => (
              <div key={label} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="text-sm font-medium text-gray-500">{label}</span>
                <span className="text-sm text-gray-900 text-right max-w-[60%] break-all">
                  {value}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-red-600 text-sm">Failed to load user details.</p>
        )}
      </Modal>
    </div>
  );
}
