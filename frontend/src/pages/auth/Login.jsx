import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader2, HelpCircle, CheckCircle, X } from 'lucide-react';
import api from '../../services/api';
import AuthInfoPanel from '../../components/AuthInfoPanel';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Contact Support state
  const [showSupport, setShowSupport] = useState(false);
  const [supportForm, setSupportForm] = useState({ email: '', message: '', cant_access_email: false });
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [supportSuccess, setSupportSuccess] = useState(false);
  const [supportError, setSupportError] = useState('');

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await login(form.email, form.password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg =
        err.response?.data?.detail || 'Invalid email or password. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSupportSubmit = async (e) => {
    e.preventDefault();
    setSupportSubmitting(true);
    setSupportError('');
    try {
      await api.post('/api/v1/support/auth-issue', supportForm);
      setSupportSuccess(true);
    } catch (err) {
      setSupportError(err.response?.data?.detail || 'Failed to submit request. Please try again.');
    } finally {
      setSupportSubmitting(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50">
      {/* Left — value proposition */}
      <div className="lg:w-1/2 flex items-center justify-center bg-blue-50">
        <AuthInfoPanel />
      </div>

      {/* Right — login form */}
      <div className="lg:w-1/2 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Sign In</h2>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={form.email}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={form.password}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                  placeholder="Enter your password"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign In
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500">
              Don&apos;t have an account?{' '}
              <Link to="/register" className="font-medium text-blue-600 hover:text-blue-500">
                Create one
              </Link>
            </p>

            <p className="mt-3 text-center">
              <button
                type="button"
                onClick={() => { setShowSupport(true); setSupportSuccess(false); setSupportError(''); }}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors"
              >
                <HelpCircle className="h-3 w-3" />
                Locked out? Contact Support
              </button>
            </p>

            <p className="mt-4 text-center text-xs text-gray-500">
              By signing in, you agree to our{' '}
              <Link to="/terms" className="text-blue-600 hover:text-blue-500">Terms of Service</Link>
              {' '}and{' '}
              <Link to="/privacy" className="text-blue-600 hover:text-blue-500">Privacy Policy</Link>.
            </p>
          </div>

          {/* Contact Support Inline Form */}
          {showSupport && (
            <div className="mt-4 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-blue-500" />
                  Contact Support
                </h2>
                <button
                  onClick={() => setShowSupport(false)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {supportSuccess ? (
                <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg p-4">
                  <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-800">Request Submitted</p>
                    <p className="text-sm text-green-700 mt-1">Your request has been submitted. We'll get back to you.</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSupportSubmit} className="space-y-4">
                  {supportError && (
                    <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                      {supportError}
                    </div>
                  )}

                  <div>
                    <label htmlFor="support-email" className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      id="support-email"
                      type="email"
                      required
                      value={supportForm.email}
                      onChange={(e) => setSupportForm({ ...supportForm, email: e.target.value })}
                      className={inputClass}
                      placeholder="Your account email"
                    />
                  </div>

                  <div>
                    <label htmlFor="support-message" className="block text-sm font-medium text-gray-700 mb-1">
                      Message <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                      id="support-message"
                      rows={3}
                      value={supportForm.message}
                      onChange={(e) => setSupportForm({ ...supportForm, message: e.target.value })}
                      className={inputClass}
                      placeholder="Describe your issue..."
                    />
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={supportForm.cant_access_email}
                      onChange={(e) => setSupportForm({ ...supportForm, cant_access_email: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">I can't access this email</span>
                  </label>

                  <button
                    type="submit"
                    disabled={supportSubmitting}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {supportSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Submit Request
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
