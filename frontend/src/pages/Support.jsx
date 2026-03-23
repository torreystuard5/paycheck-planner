import { useState, useEffect } from 'react';
import { Send, Loader2, ChevronDown, ChevronUp, HelpCircle, MessageSquare, AlertCircle, Clock, ArrowRightCircle, CheckCircle2 } from 'lucide-react';
import api from '../services/api';

const FAQ_ITEMS = [
  {
    question: 'How do I set up my paycheck plan?',
    answer: 'Go to the Dashboard and your paycheck plan will automatically be generated based on your income, bills, and pay schedule. Make sure you\'ve added your income sources and bills first.',
  },
  {
    question: 'How does the debt payoff strategy work?',
    answer: 'Navigate to the Debts page and click on the "Payoff Strategy" tab. You can compare snowball (smallest balance first) and avalanche (highest interest first) methods. You can also simulate extra monthly payments to see how much faster you can be debt-free.',
  },
  {
    question: 'How is the credit efficiency score calculated?',
    answer: 'The credit efficiency score is based on your credit utilization ratio, payment history, and debt-to-income ratio. Keep your credit utilization below 30% and make on-time payments to improve your score.',
  },
  {
    question: 'Can I track multiple income sources?',
    answer: 'Yes! Go to the Dashboard to see all your income sources. You can add multiple income entries with different pay frequencies to get an accurate picture of your total income.',
  },
  {
    question: 'How do savings goals work?',
    answer: 'Create savings goals on the Savings page with a target amount and optional target date. Track your progress by adding contributions. The progress bar shows how close you are to reaching each goal.',
  },
  {
    question: 'How do I record a payment?',
    answer: 'Go to the Payments page and click "Record Payment". Select the bill or debt you\'re paying, enter the amount and payment details. The payment will be tracked in your history and the related bill or debt will be updated.',
  },
];

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'bg-amber-100 text-amber-700', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700', icon: ArrowRightCircle },
  resolved: { label: 'Resolved', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
};

export default function Support() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);

  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState(null);
  const [expandedTicket, setExpandedTicket] = useState(null);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    setTicketsLoading(true);
    setTicketsError(null);
    try {
      const res = await api.get('/api/v1/support');
      setTickets(res.data);
    } catch {
      setTicketsError('Failed to load your tickets.');
    } finally {
      setTicketsLoading(false);
    }
  };

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setSent(false);
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSent(false);
    try {
      await api.post('/api/v1/support', {
        name: form.name,
        email: form.email,
        subject: form.subject,
        message: form.message,
      });
      setSent(true);
      setForm({ name: '', email: '', subject: '', message: '' });
      fetchTickets();
    } catch {
      setError('Failed to send message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFaq = (idx) => {
    setOpenFaq(openFaq === idx ? null : idx);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Support</h1>
        <p className="text-sm text-gray-600 mt-1">Get help and find answers to common questions</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-blue-500" />
              Frequently Asked Questions
            </h2>
            <div className="space-y-2">
              {FAQ_ITEMS.map((item, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleFaq(idx)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors"
                  >
                    <span>{item.question}</span>
                    {openFaq === idx ? (
                      <ChevronUp className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
                    )}
                  </button>
                  {openFaq === idx && (
                    <div className="px-4 pb-3 text-sm text-gray-600 border-t border-gray-100 pt-3">
                      {item.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-purple-500" />
            Contact Us
          </h2>

          {sent && (
            <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
              Message sent successfully! We&apos;ll get back to you soon.
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={form.name}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="Your name"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="you@example.com"
                />
              </div>
            </div>
            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input
                id="subject"
                name="subject"
                type="text"
                value={form.subject}
                onChange={handleChange}
                className={inputClass}
                placeholder="What can we help with?"
              />
            </div>
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea
                id="message"
                name="message"
                rows={6}
                value={form.message}
                onChange={handleChange}
                className={inputClass}
                placeholder="Describe your issue or question..."
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Message
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* My Tickets Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-500" />
          My Tickets
        </h2>

        {ticketsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : ticketsError ? (
          <div className="flex items-center gap-2 text-red-600 text-sm py-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {ticketsError}
          </div>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">You haven&apos;t submitted any tickets yet.</p>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => {
              const cfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
              const StatusIcon = cfg.icon;
              const isExpanded = expandedTicket === ticket.id;
              return (
                <div key={ticket.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedTicket(isExpanded ? null : ticket.id)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${cfg.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                      <span className="text-sm font-medium text-gray-900 truncate">{ticket.subject || 'No Subject'}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-xs text-gray-500">{formatDate(ticket.created_at)}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Your Message</p>
                        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap">
                          {ticket.message || 'No message.'}
                        </div>
                      </div>
                      {ticket.reply_count > 0 && (
                        <TicketReplies ticketId={ticket.id} />
                      )}
                      {ticket.reply_count === 0 && (
                        <p className="text-sm text-gray-400 italic">No Replies Yet.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TicketReplies({ ticketId }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/api/v1/support/${ticketId}`);
        if (!cancelled) setDetail(res.data);
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ticketId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-3">
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!detail?.replies?.length) {
    return <p className="text-sm text-gray-400 italic">No Replies Yet.</p>;
  }

  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
        Replies ({detail.replies.length})
      </p>
      <div className="space-y-2">
        {detail.replies.map((reply) => (
          <div key={reply.id} className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{reply.reply_message}</p>
            <p className="text-xs text-gray-500 mt-2">
              {new Date(reply.created_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
