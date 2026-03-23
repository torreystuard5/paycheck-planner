import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, ChevronLeft, ChevronRight, Loader2, Save } from 'lucide-react';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';

const STATUS_TABS = [
  { key: null, label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
];

const STATUS_BADGE = {
  open: 'bg-green-100 text-green-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved: 'bg-gray-100 text-gray-600',
};

export default function AdminSupportRequests() {
  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [statusFilter, setStatusFilter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);

  // Detail modal
  const [selectedId, setSelectedId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [editStatus, setEditStatus] = useState('open');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailSuccess, setDetailSuccess] = useState('');

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [page, statusFilter]);

  const fetchRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, per_page: perPage };
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/api/v1/admin/support-requests', { params });
      setRequests(data.requests);
      setTotal(data.total);
    } catch (err) {
      if (err.response?.status === 403) {
        setForbidden(true);
      } else {
        setError('Failed to load support requests.');
      }
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
    try {
      const { data } = await api.get(`/api/v1/admin/support-requests/${id}`);
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
  };

  const handleSave = async () => {
    setSaving(true);
    setDetailError('');
    setDetailSuccess('');
    try {
      const { data } = await api.patch(`/api/v1/admin/support-requests/${detail.id}`, {
        status: editStatus,
        admin_notes: editNotes || null,
      });
      setDetail(data);
      setDetailSuccess('Updated successfully.');
      setTimeout(() => setDetailSuccess(''), 3000);
      fetchRequests();
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
      const { data } = await api.patch(`/api/v1/admin/support-requests/${detail.id}`, {
        status: 'resolved',
        admin_notes: editNotes || null,
      });
      setDetail(data);
      setEditStatus('resolved');
      setDetailSuccess('Marked as resolved.');
      setTimeout(() => setDetailSuccess(''), 3000);
      fetchRequests();
    } catch (err) {
      setDetailError(err.response?.data?.detail || 'Failed to resolve.');
    } finally {
      setSaving(false);
    }
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

  if (loading && page === 1 && !requests.length) return <LoadingSpinner />;

  if (forbidden) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <p className="text-lg font-medium text-gray-700 mb-4">
          You don't have permission to view this page.
        </p>
        <Link to="/dashboard" className="text-blue-600 hover:text-blue-700 font-medium">
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
  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-center gap-3 mb-6">
        <Inbox className="h-7 w-7 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Support Requests</h1>
        <span className="text-sm text-gray-500 ml-1">({total})</span>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-4">
        {STATUS_TABS.map((tab) => (
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
          </button>
        ))}
      </div>

      {requests.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No support requests"
          message={statusFilter ? `No ${statusFilter.replace('_', ' ')} requests found.` : 'No support requests yet.'}
        />
      ) : (
        <>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 font-medium text-gray-600">Email</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Message</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => openDetail(r.id)}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-900">{r.email}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                        {r.message ? (r.message.length > 80 ? r.message.slice(0, 80) + '...' : r.message) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}>
                          {r.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {formatDateTime(r.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                Page {page} of {totalPages} ({total} requests)
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

      {/* Detail Modal */}
      <Modal
        isOpen={!!selectedId}
        onClose={closeDetail}
        title="Support Request Details"
      >
        {detailLoading ? (
          <LoadingSpinner />
        ) : detail ? (
          <div className="space-y-5">
            {detailError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{detailError}</div>
            )}
            {detailSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">{detailSuccess}</div>
            )}

            <div className="space-y-2">
              <div className="flex justify-between py-1.5">
                <span className="text-sm font-medium text-gray-500">Email</span>
                <span className="text-sm text-gray-900">{detail.email}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-sm font-medium text-gray-500">Can't Access Email</span>
                <span className="text-sm text-gray-900">{detail.cant_access_email ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-sm font-medium text-gray-500">Created</span>
                <span className="text-sm text-gray-900">{formatDateTime(detail.created_at)}</span>
              </div>
              {detail.resolved_at && (
                <div className="flex justify-between py-1.5">
                  <span className="text-sm font-medium text-gray-500">Resolved</span>
                  <span className="text-sm text-gray-900">{formatDateTime(detail.resolved_at)}</span>
                </div>
              )}
            </div>

            {/* Full message */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap min-h-[60px]">
                {detail.message || 'No message provided.'}
              </div>
            </div>

            {/* Admin Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Notes</label>
              <textarea
                rows={3}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className={inputClass}
                placeholder="Internal notes..."
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className={inputClass}
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
              {detail.status !== 'resolved' && (
                <button
                  onClick={handleResolve}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  Resolve
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-red-600 text-sm">Failed to load request details.</p>
        )}
      </Modal>
    </div>
  );
}
