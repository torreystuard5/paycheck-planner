import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';

export default function Support() {
  const [form, setForm] = useState({ subject: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setSent(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    // Will connect to /api/v1/support in a future task
    await new Promise((r) => setTimeout(r, 800));
    setSent(true);
    setForm({ subject: '', message: '' });
    setSubmitting(false);
  };

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Need Help?</h1>
        <p className="text-sm text-gray-500 mt-1">
          Send us a message and we&apos;ll get back to you
        </p>
      </div>

      <div className="max-w-xl">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {sent && (
            <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
              Message sent. We&apos;ll respond to the email address on your account.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
                Subject
              </label>
              <input
                id="subject"
                name="subject"
                type="text"
                required
                value={form.subject}
                onChange={handleChange}
                className={inputClass}
                placeholder="What can we help with?"
              />
            </div>

            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
                Message
              </label>
              <textarea
                id="message"
                name="message"
                required
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
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send Message
            </button>
          </form>

          <p className="mt-4 text-xs text-gray-400">
            We&apos;ll respond to your email at the address on your account.
          </p>
        </div>
      </div>
    </div>
  );
}
