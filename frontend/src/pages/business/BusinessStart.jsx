import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Briefcase, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

export default function BusinessStart() {
  const { updateUser, fetchSubscription } = useAuth();
  const navigate = useNavigate();
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/v1/business/edition/access').then(({ data }) => setAccess(data));
    fetchSubscription?.();
  }, [fetchSubscription]);

  const startTrial = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/api/v1/business/edition/activate', { accept_trial: true });
      updateUser(data);
      await fetchSubscription?.();
      navigate('/business/dashboard');
    } catch (e) {
      setError(e.response?.data?.detail?.message || e.response?.data?.detail || 'Could not start Business trial');
    } finally {
      setLoading(false);
    }
  };

  const expired = access?.access_state === 'trial_expired';

  return (
    <div className="max-w-lg mx-auto py-12 px-4 text-center space-y-6">
      <Briefcase className="w-14 h-14 text-purple-600 mx-auto" />
      <h1 className="text-2xl font-bold text-gray-900">
        {expired ? 'Business trial ended' : 'Business Edition'}
      </h1>
      <p className="text-sm text-gray-600">
        {expired
          ? 'Your records are saved. Subscribe to edit and add new entries.'
          : 'Track sales, deductions, staff pay, reserve funds, and tax prep — separate from Home budgeting.'}
      </p>

      {access?.can_start_trial && !expired && (
        <button
          type="button"
          onClick={startTrial}
          disabled={loading}
          className="w-full py-3 px-4 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:opacity-60 min-h-[44px]"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Start 7-day free trial'}
        </button>
      )}

      {access?.has_business_access && !expired && (
        <button
          type="button"
          onClick={() => navigate('/edition')}
          className="w-full py-3 px-4 border border-purple-300 text-purple-700 font-medium rounded-lg min-h-[44px]"
        >
          Open Business dashboard
        </button>
      )}

      <Link to="/upgrade" className="block text-sm text-purple-600 hover:underline">
        View Business & Bundle plans
      </Link>
      <Link to="/edition" className="block text-sm text-gray-500 hover:underline">
        Back to edition chooser
      </Link>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {access?.business_trial_consumed && !access?.can_start_trial && !access?.has_business_access && (
        <p className="text-xs text-gray-500">Your one-time Business trial has already been used.</p>
      )}
    </div>
  );
}
