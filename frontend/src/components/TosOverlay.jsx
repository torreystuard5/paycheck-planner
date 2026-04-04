import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import api from '../services/api';

export default function TosOverlay({ version, onAccepted }) {
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleAccept = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.post('/api/v1/auth/accept-tos', { version });
      onAccepted();
    } catch {
      setError('Failed to accept Terms of Service. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900/70 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-white rounded-lg shadow-xl border border-gray-200">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck className="h-7 w-7 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">Terms of Service Update</h2>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            We&apos;ve updated our Terms of Service. Please review and accept the new terms to continue using PayDrift.
          </p>

          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-4 max-h-48 overflow-y-auto">
            <p className="text-sm text-gray-700 mb-3">
              By continuing to use PayDrift, you agree to abide by the following:
            </p>
            <ul className="text-sm text-gray-600 space-y-2 list-disc pl-4">
              <li>You will use PayDrift only for lawful personal financial planning purposes.</li>
              <li>PayDrift is not a financial advisor and does not provide financial, investment, or tax advice.</li>
              <li>Your data is stored securely and will not be sold to third parties.</li>
              <li>You are responsible for the accuracy of the financial information you enter.</li>
              <li>SP Software Solutions LLC reserves the right to modify or discontinue the service.</li>
            </ul>
            <p className="text-sm text-gray-600 mt-3">
              Read the full{' '}
              <Link to="/terms" target="_blank" className="text-blue-600 hover:text-blue-500 font-medium">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" target="_blank" className="text-blue-600 hover:text-blue-500 font-medium">
                Privacy Policy
              </Link>.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-start gap-2 mb-4">
            <input
              id="tos_overlay_accept"
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="tos_overlay_accept" className="text-sm text-gray-700">
              I agree to the{' '}
              <Link to="/terms" target="_blank" className="text-blue-600 hover:text-blue-500 font-medium">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" target="_blank" className="text-blue-600 hover:text-blue-500 font-medium">
                Privacy Policy
              </Link>
            </label>
          </div>

          <button
            onClick={handleAccept}
            disabled={!accepted || submitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
