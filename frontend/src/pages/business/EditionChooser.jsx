import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Home, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import {
  canSwitchAppMode,
  hasBusinessAccess,
  hasPersonalHomeAccess,
  normalizePlanTier,
} from '../../utils/tierAccess';

export default function EditionChooser() {
  const { user, subscription, updateUser, fetchSubscription } = useAuth();
  const navigate = useNavigate();
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/api/v1/business/edition/access').then(({ data }) => setAccess(data)).catch(() => {});
    fetchSubscription?.();
  }, [fetchSubscription]);

  const tier = normalizePlanTier(user?.subscription_tier);
  const personalOk = hasPersonalHomeAccess(tier);
  const businessOk = hasBusinessAccess(user, subscription) || access?.has_business_access;

  const enterPersonal = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/api/v1/business/edition/enter-personal');
      updateUser(data);
      navigate('/dashboard');
    } catch {
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const enterBusiness = async () => {
    if (!businessOk && !access?.can_start_trial) {
      navigate('/business/start');
      return;
    }
    if (access?.can_start_trial && !access?.has_business_access) {
      navigate('/business/start');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/api/v1/business/edition/activate', { accept_trial: false });
      updateUser(data);
      navigate('/business/dashboard');
    } catch {
      navigate('/business/start');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Choose your edition</h1>
        <p className="text-sm text-gray-600 mt-1">
          PayDrift Home and Business are separate experiences. Bundle includes both.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <button
          type="button"
          disabled={!personalOk || loading}
          onClick={enterPersonal}
          className="text-left rounded-xl border-2 border-gray-200 p-6 hover:border-blue-500 hover:bg-blue-50/50 transition disabled:opacity-50 min-h-[160px]"
        >
          <Home className="w-8 h-8 text-blue-600 mb-3" />
          <h2 className="font-semibold text-lg text-gray-900">Personal / Home</h2>
          <p className="text-sm text-gray-600 mt-2">Budgets, bills, debts, paycheck planning, household.</p>
        </button>

        <button
          type="button"
          disabled={loading}
          onClick={enterBusiness}
          className="text-left rounded-xl border-2 border-purple-200 p-6 hover:border-purple-500 hover:bg-purple-50/50 transition min-h-[160px] relative"
        >
          <Briefcase className="w-8 h-8 text-purple-600 mb-3" />
          <h2 className="font-semibold text-lg text-gray-900">Business</h2>
          <p className="text-sm text-gray-600 mt-2">
            Sales, deductions, staff pay, funds, tax prep, paystub OCR.
          </p>
          {!businessOk && (
            <span className="absolute top-3 right-3 text-xs font-medium bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
              Try free
            </span>
          )}
        </button>
      </div>

      {canSwitchAppMode(tier) && (
        <p className="text-xs text-center text-gray-500">
          Bundle plan — switch editions anytime from the sidebar.
        </p>
      )}

      {loading && (
        <p className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Switching…
        </p>
      )}
    </div>
  );
}
