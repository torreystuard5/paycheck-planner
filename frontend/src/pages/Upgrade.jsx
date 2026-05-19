import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, Sparkles } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

const PRO_FEATURES = [
  'Household Financial Overview',
  'Tax Prep & Deduction Tracking',
  'Receipt / bill OCR upload',
];

const PERIODS = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'six_month', label: '6 months (save 15%)' },
  { key: 'annual', label: 'Annual (save 25%)' },
];

function fmtMoney(cents) {
  const n = Number(cents) || 0;
  return `$${(n / 100).toFixed(2)}`;
}

export default function Upgrade() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('monthly');
  const [plans, setPlans] = useState(null);
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.allSettled([
        api.get('/api/v1/billing/plans'),
        api.get('/api/v1/billing/subscription'),
      ]);
      if (pRes.status === 'fulfilled') setPlans(pRes.value.data);
      if (sRes.status === 'fulfilled') setSub(sRes.value.data);
    } catch {
      setPlans(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const checkout = async () => {
    setCheckoutBusy(true);
    try {
      const { data } = await api.post('/api/v1/billing/checkout', { tier: 'pro', billing_period: period });
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.message === 'Stripe not configured' || !data.stripe_configured) {
        window.alert('Billing is not connected yet. Add Stripe keys on the server to enable checkout.');
      } else {
        window.alert(data.message || 'Checkout is not available for this plan yet.');
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      window.alert(typeof detail === 'string' ? detail : 'Checkout failed.');
    } finally {
      setCheckoutBusy(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const proPlans = plans?.pro || {};

  return (
    <div className="space-y-8 max-w-4xl mx-auto px-1">
      <header>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Sparkles className="w-7 h-7 text-amber-500" />
          Upgrade to Home Pro
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Early access members keep full access at no charge until billing is enabled for your account.
        </p>
        {user && (
          <p className="text-xs text-gray-500 mt-2">
            Current tier: <span className="font-semibold text-gray-800">{user.subscription_tier || 'early_access'}</span>
            {sub?.subscription_status && sub.subscription_status !== 'none' && (
              <> · Status: <span className="font-medium">{sub.subscription_status}</span></>
            )}
          </p>
        )}
      </header>

      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Free vs Home Pro</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium text-gray-700 mb-2">Home (Free)</p>
            <ul className="space-y-1 text-gray-600">
              <li>Dashboard, bills, debts, paycheck plan</li>
              <li>Household sharing (basic)</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-blue-700 mb-2">Home Pro</p>
            <ul className="space-y-1 text-gray-600">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="w-4 h-4 text-green-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2 justify-center">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
              period === p.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-md mx-auto">
        <h2 className="text-lg font-semibold text-gray-900">Home Pro</h2>
        <p className="text-sm text-gray-500 mt-1">Pro budgeting tools for your household.</p>
        <div className="mt-4">
          <p className="text-3xl font-bold text-gray-900">{fmtMoney(proPlans[period]?.price_cents ?? 999)}</p>
          <p className="text-xs text-gray-500 mt-1">per {period.replace('_', ' ')}</p>
        </div>
        <button
          type="button"
          disabled={checkoutBusy}
          onClick={checkout}
          className="mt-6 w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {checkoutBusy && <Loader2 className="w-4 h-4 animate-spin" />}
          Subscribe with Stripe
        </button>
      </section>

      <p className="text-center text-sm text-gray-500">
        Prefer Ko-fi? Contact support — $5 = 1 month Pro, $20 = 5 months (applied manually).
        <br />
        <Link to="/settings" className="text-blue-600 hover:text-blue-700 font-medium mt-2 inline-block">
          Back to settings
        </Link>
      </p>
    </div>
  );
}




