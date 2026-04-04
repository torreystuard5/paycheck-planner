import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, AlertCircle, Send, Clock, CheckCircle2, ArrowRightCircle, ChevronLeft, ChevronRight, Loader2, Save, X } from 'lucide-react';
import api from '../services/api';
import { formatFriendlyDate } from '../utils/formatDate';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

const STATUS_TABS = [
  { key: null, label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
];

const STATUS_BADGE = {
  open: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
};

const STATUS_ICON = {
  open: Clock,
  in_progress: ArrowRightCircle,
  resolved: CheckCircle2,
};

export default function AdminTickets() {
  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [statusFilter, setStatusFilter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);

  // Detail modal state
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

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    fetchTickets();
  }, [page, statusFilter]);

  const fetchTickets = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, per_page: perPage };
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/api/v1/support/all', { params });
      setTickets(data.tickets);
      setTotal(data.total);
    } catch (err) {
      if (err.response?.status === 403) {
        setForbidden(true);
      } else {
        setError('Failed to load support tickets.');
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
    setReplyMessage('');
    document.body.style.overflow = 'hidden';
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
    document.body.style.overflow = '';
  };

  const handleSave = async () => {
    setSaving(true);
    setDetailError('');
    setDetailSuccess('');
    try {
      const { data } = await api.patch(`/api/v1/support/${detail.id}`, {
        status: editStatus,
        admin_notes: editNotes || null,
      });
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
      const { data } = await api.patch(`/api/v1/support/${detail.id}`, {
        status: 'resolved',
        admin_notes: editNotes || null,
      });
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
      await api.post(`/api/v1/support/${detail.id}/reply`, {
        message: replyMessage.trim(),
      });
      setReplyMessage('');
      setDetailSuccess('Reply sent successfully.');
      // Refresh detail to show new reply
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

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '\u2014';
    return formatFriendlyDate(dateStr);
  };

  const truncate = (str, len = 80) =>
    str && str.length > len ? str.slice(0, len) + '...' : str || '\u2014';

  if (loading && page === 1 && !tickets.length) return <LoadingSpinner />;

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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MessageSquare className="h-7 w-7 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Support Tickets</h1>
        <span className="text-sm text-gray-500 ml-1">({total})</span>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1">
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

      {tickets.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No support tickets"
          message={statusFilter ? `No ${statusFilter.replace('_', ' ')} tickets found.` : 'No support tickets yet.'}
        />
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
                    const Icon = STATUS_ICON[ticket.status] || Clock;
                    return (
                      <tr
                        key={ticket.id}
                        onClick={() => openDetail(ticket.id)}
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[ticket.status] || 'bg-gray-100 text-gray-600'}`}>
                            <Icon className="w-3 h-3" />
                            {ticket.status?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-gray-900">{ticket.name || 'Anonymous'}</div>
                          <div className="text-xs text-gray-500">{ticket.email || '\u2014'}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-700 max-w-xs truncate">
                          {ticket.subject || 'No Subject'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {formatDateTime(ticket.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Page {page} of {totalPages} ({total} tickets)
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
      {selectedId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={closeDetail} />
          <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 w-[calc(100%-2rem)] sm:w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto z-[100]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Ticket Detail</h2>
              <button
                onClick={closeDetail}
                className="p-1 text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-4">
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Name</p>
                      <p className="text-sm text-gray-900 mt-0.5">{detail.name || 'Anonymous'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Email</p>
                      <p className="text-sm text-gray-900 mt-0.5">{detail.email || '\u2014'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Subject</p>
                      <p className="text-sm text-gray-900 mt-0.5">{detail.subject || 'No Subject'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Created</p>
                      <p className="text-sm text-gray-900 mt-0.5">{formatDateTime(detail.created_at)}</p>
                    </div>
                    {detail.cant_access_email && (
                      <div className="sm:col-span-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          <AlertCircle className="w-3 h-3" />
                          Can&apos;t access email
                        </span>
                      </div>
                    )}
                    {detail.resolved_at && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Resolved</p>
                        <p className="text-sm text-gray-900 mt-0.5">{formatDateTime(detail.resolved_at)}</p>
                      </div>
                    )}
                  </div>

                  {/* Full message */}
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Message</p>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap min-h-[60px]">
                      {detail.message || 'No message provided.'}
                    </div>
                  </div>

                  {/* Replies */}
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                      Replies ({detail.replies?.length || 0})
                    </p>
                    {detail.replies?.length > 0 ? (
                      <div className="space-y-3">
                        {detail.replies.map((reply) => (
                          <div
                            key={reply.id}
                            className="bg-blue-50 border border-blue-100 rounded-lg p-3"
                          >
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">
                              {reply.reply_message}
                            </p>
                            <p className="text-xs text-gray-500 mt-2">
                              {formatDateTime(reply.created_at)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No replies yet.</p>
                    )}
                  </div>

                  {/* Reply textarea */}
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">
                      Reply
                    </label>
                    <textarea
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder="Type your reply..."
                      rows={3}
                      className={inputClass + ' resize-none'}
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={handleSendReply}
                        disabled={!replyMessage.trim() || sending}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {sending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            Send Reply
                          </>
                        )}
                      </button>
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
                <div className="flex items-center gap-2 text-red-600 text-sm py-4">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Failed to load ticket details.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
