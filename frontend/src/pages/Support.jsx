import { useState, useEffect } from 'react';
import { Send, Loader2, ChevronDown, ChevronUp, HelpCircle, MessageSquare, AlertCircle, Clock, ArrowRightCircle, CheckCircle2 } from 'lucide-react';
import api from '../services/api';
import { formatFriendlyDate } from '../utils/formatDate';
import { Badge, Button, Card, PageHeader, SettingsSection } from '../components/ui';

const FAQ_ITEMS = [
  {
    question: 'How do I set up my paycheck plan?',
    answer: 'Go to the Dashboard and your paycheck plan will automatically be generated based on your logged paychecks, bills, and pay schedule. Make sure you\'ve logged your paychecks and added your bills first.',
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
    question: 'Can I track multiple paychecks?',
    answer: 'Yes! Go to the Income page to log paychecks from different jobs or sources. Each paycheck records the source name, pay date, and net amount for an accurate picture of your total income.',
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
  open: { label: 'Open', variant: 'warning', icon: Clock },
  in_progress: { label: 'In Progress', variant: 'info', icon: ArrowRightCircle },
  resolved: { label: 'Resolved', variant: 'success', icon: CheckCircle2 },
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

  const formatDate = (dateStr) => formatFriendlyDate(dateStr);

  return (
    <div className="page-container min-w-0">
      <PageHeader
        title="Support"
        description="Get help and find answers to common questions"
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
        <SettingsSection title="Frequently Asked Questions" icon={HelpCircle} iconTone="accent">
          <div className="space-y-2">
            {FAQ_ITEMS.map((item, idx) => (
              <Card key={idx} variant="inset" className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleFaq(idx)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-surface-subtle"
                >
                  <span>{item.question}</span>
                  {openFaq === idx ? (
                    <ChevronUp className="ml-2 h-4 w-4 shrink-0 text-muted" />
                  ) : (
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted" />
                  )}
                </button>
                {openFaq === idx && (
                  <div className="border-t border-border px-4 pb-3 pt-3 text-sm text-body">
                    {item.answer}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </SettingsSection>

        <SettingsSection title="Contact Us" icon={MessageSquare} iconTone="purple">
          {sent && (
            <Card className="mb-4 border-brand-200 bg-brand-50 p-3 text-sm text-brand-700">
              Message sent successfully! We&apos;ll get back to you soon.
            </Card>
          )}

          {error && (
            <Card className="mb-4 flex items-center gap-2 border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </Card>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="form-label">Name</label>
                <input id="name" name="name" type="text" value={form.name} onChange={handleChange} className="form-input" placeholder="Your name" />
              </div>
              <div>
                <label htmlFor="email" className="form-label">Email</label>
                <input id="email" name="email" type="email" value={form.email} onChange={handleChange} className="form-input" placeholder="you@example.com" />
              </div>
            </div>
            <div>
              <label htmlFor="subject" className="form-label">Subject</label>
              <input id="subject" name="subject" type="text" value={form.subject} onChange={handleChange} className="form-input" placeholder="What can we help with?" />
            </div>
            <div>
              <label htmlFor="message" className="form-label">Message</label>
              <textarea id="message" name="message" rows={6} value={form.message} onChange={handleChange} className="form-input" placeholder="Describe your issue or question..." />
            </div>
            <Button type="submit" variant="accent" disabled={submitting}>
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
            </Button>
          </form>
        </SettingsSection>
      </div>

      <SettingsSection title="My Tickets" icon={MessageSquare} iconTone="accent">

        {ticketsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted" />
          </div>
        ) : ticketsError ? (
          <div className="flex items-center gap-2 py-4 text-sm text-danger-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {ticketsError}
          </div>
        ) : tickets.length === 0 ? (
          <p className="py-4 text-body">You haven&apos;t submitted any tickets yet.</p>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => {
              const cfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
              const StatusIcon = cfg.icon;
              const isExpanded = expandedTicket === ticket.id;
              return (
                <Card key={ticket.id} className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedTicket(isExpanded ? null : ticket.id)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface-subtle"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Badge variant={cfg.variant} className="shrink-0 normal-case gap-1">
                        <StatusIcon className="h-3 w-3" />
                        {cfg.label}
                      </Badge>
                      <span className="truncate text-sm font-medium">{ticket.subject || 'No Subject'}</span>
                    </div>
                    <div className="ml-2 flex shrink-0 items-center gap-2">
                      <span className="text-caption">{formatDate(ticket.created_at)}</span>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="space-y-3 border-t border-border px-4 pb-4 pt-3">
                      <div>
                        <p className="text-caption mb-1 font-semibold uppercase tracking-wide">Your message</p>
                        <div className="whitespace-pre-wrap rounded-lg bg-surface-subtle p-3 text-sm">
                          {ticket.message || 'No message.'}
                        </div>
                      </div>
                      {ticket.reply_count > 0 ? (
                        <TicketReplies ticketId={ticket.id} />
                      ) : (
                        <p className="text-sm italic text-muted">No replies yet.</p>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </SettingsSection>
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
        <Loader2 className="h-4 w-4 animate-spin text-muted" aria-hidden />
      </div>
    );
  }

  if (!detail?.replies?.length) {
    return <p className="text-sm text-muted italic">No replies yet.</p>;
  }

  return (
    <div>
      <p className="text-caption mb-2 font-medium uppercase tracking-wide">
        Replies ({detail.replies.length})
      </p>
      <div className="space-y-2">
        {detail.replies.map((reply) => (
          <div key={reply.id} className="rounded-lg border border-accent-100 bg-accent-50 p-3">
            <p className="text-sm whitespace-pre-wrap text-foreground">{reply.reply_message}</p>
            <p className="text-caption mt-2">
              {formatFriendlyDate(reply.created_at)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
