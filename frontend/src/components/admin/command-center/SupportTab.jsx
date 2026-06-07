import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Save,
  AlertCircle,
  Clock,
  ArrowRightCircle,
  CheckCircle2,
  Send,
  X,
  Search,
  User,
  UserCheck,
  StickyNote,
  ExternalLink,
  Flag,
} from 'lucide-react';
import api from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import LoadingSpinner from '../../LoadingSpinner';
import EmptyState from '../../EmptyState';
import SortDropdown from '../../SortDropdown';
import CommandCenterPanel, { CommandCenterSectionHeader, CommandCenterTabContent } from './CommandCenterPanel';

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

const PRIORITY_BADGE = {
  low: 'bg-gray-100 text-gray-600',
  normal: 'bg-slate-100 text-slate-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

const TICKET_STATUS_TABS = [
  { key: null, label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All priorities' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function SupportTab({ onViewUser, onRegisterRefresh }) {
  const { user: currentUser } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState({});
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [statusFilter, setStatusFilter] = useState(null);
  const [priorityFilter, setPriorityFilter] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [debouncedUserSearch, setDebouncedUserSearch] = useState('');
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const [selectedId, setSelectedId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [editStatus, setEditStatus] = useState('open');
  const [editPriority, setEditPriority] = useState('normal');
  const [editNotes, setEditNotes] = useState('');
  const [replyMessage, setReplyMessage] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailSuccess, setDetailSuccess] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedUserSearch(userSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [userSearch]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, priorityFilter, debouncedUserSearch, assignedToMe]);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        per_page: perPage,
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (debouncedUserSearch) params.user = debouncedUserSearch;
      if (assignedToMe) params.assigned_to_me = true;
      const { data } = await api.get('/api/v1/support/all', { params });
      setTickets(data.tickets);
      setTotal(data.total);
      setStatusCounts(data.status_counts || {});
    } catch {
      setError('Failed to load support tickets.');
    } finally {
      setLoading(false);
    }
  }, [page, perPage, statusFilter, priorityFilter, debouncedUserSearch, assignedToMe, sortBy, sortOrder]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    if (!onRegisterRefresh) return undefined;
    return onRegisterRefresh('support', fetchTickets);
  }, [onRegisterRefresh, fetchTickets]);

  const loadDetail = async (id) => {
    const { data } = await api.get(`/api/v1/support/${id}`);
    setDetail(data);
    setEditStatus(data.status);
    setEditPriority(data.priority || 'normal');
    setEditNotes(data.admin_notes || '');
    return data;
  };

  const openDetail = async (id) => {
    setSelectedId(id);
    setDetailLoading(true);
    setDetail(null);
    setDetailError('');
    setDetailSuccess('');
    setReplyMessage('');
    setInternalNote('');
    try {
      await loadDetail(id);
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
    setInternalNote('');
  };

  const flashSuccess = (msg) => {
    setDetailSuccess(msg);
    setTimeout(() => setDetailSuccess(''), 3000);
  };

  const handleSave = async () => {
    if (!detail) return;
    setSaving(true);
    setDetailError('');
    setDetailSuccess('');
    try {
      const { data } = await api.patch(`/api/v1/support/${detail.id}`, {
        status: editStatus,
        priority: editPriority,
        admin_notes: editNotes || null,
      });
      setDetail(data);
      flashSuccess('Ticket updated.');
      fetchTickets();
    } catch (err) {
      setDetailError(err.response?.data?.detail || 'Failed to update.');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStatus = async (newStatus) => {
    if (!detail) return;
    setSaving(true);
    setDetailError('');
    try {
      const { data } = await api.patch(`/api/v1/support/${detail.id}`, { status: newStatus });
      setDetail(data);
      setEditStatus(data.status);
      flashSuccess(`Marked as ${newStatus.replace('_', ' ')}.`);
      fetchTickets();
    } catch (err) {
      setDetailError(err.response?.data?.detail || 'Failed to update status.');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignToMe = async () => {
    if (!detail) return;
    setAssigning(true);
    setDetailError('');
    try {
      const { data } = await api.post(`/api/v1/support/${detail.id}/assign-me`);
      setDetail(data);
      setEditStatus(data.status);
      flashSuccess('Assigned to you.');
      fetchTickets();
    } catch (err) {
      setDetailError(err.response?.data?.detail || 'Failed to assign ticket.');
    } finally {
      setAssigning(false);
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
      await loadDetail(detail.id);
      flashSuccess('Reply sent to user.');
      fetchTickets();
    } catch {
      setDetailError('Failed to send reply.');
    } finally {
      setSending(false);
    }
  };

  const handleAddInternalNote = async () => {
    if (!internalNote.trim() || !detail) return;
    setAddingNote(true);
    setDetailError('');
    try {
      await api.post(`/api/v1/support/${detail.id}/internal-note`, {
        message: internalNote.trim(),
      });
      setInternalNote('');
      await loadDetail(detail.id);
      flashSuccess('Internal note added.');
    } catch {
      setDetailError('Failed to add internal note.');
    } finally {
      setAddingNote(false);
    }
  };

  const totalPages = Math.ceil(total / perPage);
  const isAssignedToMe = detail?.assigned_to === currentUser?.id;

  return (
    <CommandCenterTabContent>
      <CommandCenterPanel padding={false} className="overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-4 sm:px-5">
          <CommandCenterSectionHeader
            title="Support Tickets"
            description="Triage, reply, and resolve user issues without leaving Command Center."
            icon={MessageSquare}
          />

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-1">
                {TICKET_STATUS_TABS.map((tab) => (
                  <button
                    key={tab.key ?? 'all'}
                    type="button"
                    onClick={() => setStatusFilter(tab.key)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      statusFilter === tab.key
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {tab.label}
                    {tab.key && (statusCounts[tab.key] ?? 0) > 0 && (
                      <span className="ml-1.5 tabular-nums opacity-80">
                        ({statusCounts[tab.key]})
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <SortDropdown
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortChange={(sb, so) => {
                  setSortBy(sb);
                  setSortOrder(so);
                }}
                options={[
                  { value: 'created_at', label: 'Date' },
                  { value: 'status', label: 'Status' },
                  { value: 'priority', label: 'Priority' },
                ]}
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search name, email, or subject…"
                  className={`${inputClass} pl-9`}
                />
              </div>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className={`${inputClass} sm:w-40`}
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value || 'all'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setAssignedToMe((v) => !v)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  assignedToMe
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <UserCheck className="h-4 w-4" />
                Assigned to me
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg sm:mx-5">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-12">
            <LoadingSpinner />
          </div>
        ) : tickets.length === 0 ? (
          <div className="py-8">
            <EmptyState
              icon={MessageSquare}
              title="No Support Tickets"
              message={
                statusFilter || priorityFilter || debouncedUserSearch || assignedToMe
                  ? 'No tickets match your filters.'
                  : 'No support tickets yet.'
              }
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Priority</th>
                    <th className="px-4 py-3 font-medium text-gray-600">User</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Subject</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Assigned</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-center">Replies</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => {
                    const StatusIcon = TICKET_STATUS_ICON[ticket.status] || Clock;
                    const isSelected = selectedId === ticket.id;
                    return (
                      <tr
                        key={ticket.id}
                        onClick={() => openDetail(ticket.id)}
                        className={`border-b border-gray-100 cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50/70' : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              TICKET_STATUS_BADGE[ticket.status] || 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {ticket.status?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                              PRIORITY_BADGE[ticket.priority] || PRIORITY_BADGE.normal
                            }`}
                          >
                            <Flag className="w-3 h-3" />
                            {ticket.priority || 'normal'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-gray-900">{ticket.name || 'Anonymous'}</div>
                          <div className="text-xs text-gray-500">{ticket.email || '—'}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-700 max-w-[12rem] truncate">
                          {ticket.subject || 'No Subject'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {ticket.assigned_to_name || '—'}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-gray-600">
                          {ticket.reply_count ?? 0}
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                          {formatDateTime(ticket.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 sm:px-5">
                <p className="text-sm text-gray-500">
                  Page {page} of {totalPages} ({total} tickets)
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </CommandCenterPanel>

      {selectedId && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="fixed inset-0 bg-black/40" onClick={closeDetail} aria-hidden="true" />
          <div className="relative bg-white rounded-t-xl sm:rounded-xl shadow-xl border border-gray-200 w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto z-[100]">
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 truncate">
                  {detail?.subject || 'Ticket Detail'}
                </h2>
                {detail && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {detail.name || 'Anonymous'} · {detail.email || 'no email'}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="p-1 text-gray-400 hover:text-gray-600 shrink-0"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 py-4">
              {detailLoading ? (
                <LoadingSpinner />
              ) : detail ? (
                <div className="space-y-5">
                  {detailError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                      {detailError}
                    </div>
                  )}
                  {detailSuccess && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
                      {detailSuccess}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleAssignToMe}
                      disabled={assigning || isAssignedToMe}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                    >
                      {assigning ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserCheck className="h-3.5 w-3.5" />
                      )}
                      {isAssignedToMe ? 'Assigned to you' : 'Assign to me'}
                    </button>
                    {detail.status !== 'in_progress' && detail.status !== 'resolved' && (
                      <button
                        type="button"
                        onClick={() => handleQuickStatus('in_progress')}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <ArrowRightCircle className="h-3.5 w-3.5" />
                        In progress
                      </button>
                    )}
                    {detail.status !== 'resolved' && (
                      <button
                        type="button"
                        onClick={() => handleQuickStatus('resolved')}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Resolve
                      </button>
                    )}
                    {detail.user_id && onViewUser && (
                      <button
                        type="button"
                        onClick={() => {
                          onViewUser(detail.user_id);
                          closeDetail();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View user
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Status</p>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                        className={`${inputClass} mt-1`}
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Priority</p>
                      <select
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value)}
                        className={`${inputClass} mt-1`}
                      >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Assigned</p>
                      <p className="mt-2 text-gray-900">{detail.assigned_to_name || 'Unassigned'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Created</p>
                      <p className="mt-2 text-gray-900 text-xs">{formatDateTime(detail.created_at)}</p>
                    </div>
                  </div>

                  {detail.cant_access_email && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                      <AlertCircle className="w-3 h-3" />
                      Can&apos;t access email
                    </span>
                  )}

                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Message</p>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap">
                      {detail.message || 'No message provided.'}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <Send className="h-3.5 w-3.5" />
                      Replies to user ({detail.replies?.length || 0})
                    </p>
                    {detail.replies?.length > 0 ? (
                      <div className="space-y-2 mb-3">
                        {detail.replies.map((reply) => (
                          <div
                            key={reply.id}
                            className="bg-blue-50 border border-blue-100 rounded-lg p-3"
                          >
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">
                              {reply.reply_message}
                            </p>
                            <p className="text-xs text-gray-500 mt-2">
                              {reply.replied_by_name || 'Admin'} · {formatDateTime(reply.created_at)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic mb-3">No replies sent yet.</p>
                    )}
                    <textarea
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder="Write a reply — emailed to the user…"
                      rows={3}
                      className={`${inputClass} resize-none`}
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        type="button"
                        onClick={handleSendReply}
                        disabled={!replyMessage.trim() || sending}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {sending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Sending…
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            Send reply
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                    <p className="text-xs text-amber-800 uppercase tracking-wide mb-2 flex items-center gap-1 font-medium">
                      <StickyNote className="h-3.5 w-3.5" />
                      Internal notes ({detail.internal_notes?.length || 0})
                    </p>
                    {detail.internal_notes?.length > 0 ? (
                      <div className="space-y-2 mb-3">
                        {detail.internal_notes.map((note) => (
                          <div
                            key={note.id}
                            className="bg-white border border-amber-100 rounded-lg p-3"
                          >
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">
                              {note.reply_message}
                            </p>
                            <p className="text-xs text-gray-500 mt-2">
                              {note.replied_by_name || 'Admin'} · {formatDateTime(note.created_at)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-amber-700/70 italic mb-3">
                        No internal notes — visible to admins only.
                      </p>
                    )}
                    <textarea
                      value={internalNote}
                      onChange={(e) => setInternalNote(e.target.value)}
                      placeholder="Add an internal note (not emailed)…"
                      rows={2}
                      className={`${inputClass} resize-none bg-white`}
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        type="button"
                        onClick={handleAddInternalNote}
                        disabled={!internalNote.trim() || addingNote}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
                      >
                        {addingNote ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <StickyNote className="h-4 w-4" />
                        )}
                        Add note
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Summary notes
                    </label>
                    <textarea
                      rows={2}
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      className={inputClass}
                      placeholder="Persistent internal summary for this ticket…"
                    />
                  </div>

                  <div className="flex gap-2 pt-1 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save changes
                    </button>
                    {detail.user_id && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500 self-center">
                        <User className="h-3.5 w-3.5" />
                        Linked account
                      </span>
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
    </CommandCenterTabContent>
  );
}
