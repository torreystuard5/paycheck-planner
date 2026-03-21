import { useState, useEffect } from 'react';
import { MessageSquare, AlertCircle, Send, Clock, CheckCircle2, X } from 'lucide-react';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

export default function AdminTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketDetail, setTicketDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [replySuccess, setReplySuccess] = useState(false);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/v1/support');
      setTickets(res.data);
    } catch {
      setError('Failed to load support tickets.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTicketDetail = async (ticketId) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/api/v1/support/${ticketId}`);
      setTicketDetail(res.data);
    } catch {
      setTicketDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const openTicket = (ticket) => {
    setSelectedTicket(ticket);
    setReplyMessage('');
    setReplySuccess(false);
    fetchTicketDetail(ticket.id);
    document.body.style.overflow = 'hidden';
  };

  const closeTicket = () => {
    setSelectedTicket(null);
    setTicketDetail(null);
    setReplyMessage('');
    setReplySuccess(false);
    document.body.style.overflow = '';
  };

  const handleSendReply = async () => {
    if (!replyMessage.trim() || !selectedTicket) return;
    setSending(true);
    setReplySuccess(false);
    try {
      await api.post(`/api/v1/support/${selectedTicket.id}/reply`, {
        message: replyMessage.trim(),
      });
      setReplyMessage('');
      setReplySuccess(true);
      await fetchTicketDetail(selectedTicket.id);
      await fetchTickets();
      setTimeout(() => setReplySuccess(false), 3000);
    } catch {
      setError('Failed to send reply.');
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const truncate = (str, len = 80) =>
    str.length > len ? str.slice(0, len) + '...' : str;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Support Tickets</h1>
        <p className="text-sm text-gray-600 mt-1">View and reply to support requests</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {loading ? (
          <LoadingSpinner />
        ) : error && !selectedTicket ? (
          <div className="flex items-center gap-2 text-red-600 text-sm py-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No support tickets"
            message="No support tickets have been submitted yet."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="pb-3 font-medium text-gray-500">Status</th>
                  <th className="pb-3 font-medium text-gray-500">Date</th>
                  <th className="pb-3 font-medium text-gray-500">Subject</th>
                  <th className="pb-3 font-medium text-gray-500">Name</th>
                  <th className="pb-3 font-medium text-gray-500">Email</th>
                  <th className="pb-3 font-medium text-gray-500">Message</th>
                  <th className="pb-3 font-medium text-gray-500"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => openTicket(ticket)}
                  >
                    <td className="py-3 pr-4">
                      {ticket.reply_count > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <CheckCircle2 className="w-3 h-3" />
                          Replied
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          <Clock className="w-3 h-3" />
                          Open
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-gray-600">
                      {formatDate(ticket.created_at)}
                    </td>
                    <td className="py-3 pr-4 font-medium text-gray-900">
                      {ticket.subject}
                    </td>
                    <td className="py-3 pr-4 text-gray-700">{ticket.name}</td>
                    <td className="py-3 pr-4 text-gray-700">{ticket.email}</td>
                    <td className="py-3 pr-4 text-gray-600">
                      {truncate(ticket.message)}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        onClick={(e) => {
                          e.stopPropagation();
                          openTicket(ticket);
                        }}
                      >
                        View / Reply
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={closeTicket} />
          <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 w-[calc(100%-2rem)] sm:w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto z-10">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Ticket Detail</h2>
              <button
                onClick={closeTicket}
                className="p-1 text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-4">
              {detailLoading ? (
                <LoadingSpinner />
              ) : ticketDetail ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Name</p>
                      <p className="text-sm text-gray-900 mt-0.5">{ticketDetail.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Email</p>
                      <p className="text-sm text-gray-900 mt-0.5">{ticketDetail.email}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Subject</p>
                      <p className="text-sm text-gray-900 mt-0.5">{ticketDetail.subject}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Date</p>
                      <p className="text-sm text-gray-900 mt-0.5">{formatDate(ticketDetail.created_at)}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Message</p>
                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap">
                      {ticketDetail.message}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                      Replies ({ticketDetail.replies?.length || 0})
                    </p>
                    {ticketDetail.replies?.length > 0 ? (
                      <div className="space-y-3">
                        {ticketDetail.replies.map((reply) => (
                          <div
                            key={reply.id}
                            className="bg-blue-50 border border-blue-100 rounded-lg p-3"
                          >
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">
                              {reply.reply_message}
                            </p>
                            <p className="text-xs text-gray-500 mt-2">
                              {formatDate(reply.created_at)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No replies yet.</p>
                    )}
                  </div>

                  {replySuccess && (
                    <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      Reply sent successfully.
                    </div>
                  )}

                  {error && (
                    <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">
                      Reply
                    </label>
                    <textarea
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder="Type your reply..."
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm resize-none"
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={handleSendReply}
                        disabled={!replyMessage.trim() || sending}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sending ? (
                          <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
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
