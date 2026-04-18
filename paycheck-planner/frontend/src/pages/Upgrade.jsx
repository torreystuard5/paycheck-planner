import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, Sparkles } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

const TIERS = [
  { key: 'pro', name: 'Home Pro', desc: 'Pro budgeting tools for your household.' },
  { key: 'business', name: 'Business', desc: 'Business Edition — 7-day free trial when you subscribe.' },
  { key: 'bundle', name: 'Bundle', desc: 'Personal + Business in one plan.' },
];

const PERIODS = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'six_month', label: '6 months' },
  { key: 'annual', label: 'Annual' },
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
  const [checkoutTier, setCheckoutTier] = useState(null);

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

  const checkout = async (tier) => {
    setCheckoutTier(tier);
    try {
      const { data } = await api.post('/api/v1/billing/checkout', { tier, billing_period: period });
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.message === 'Stripe not configured' || !data.stripe_configured) {
        window.alert('Billing is not connected yet. Stripe keys will be added by the team soon.');
      } else {
        window.alert(data.message || 'Checkout is not available for this plan yet.');
      }
    } catch (err) {
      window.alert(err.response?.data?.detail || 'Checkout failed.');
    } finally {
      setCheckoutTier(null);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-8 max-w-5xl mx-auto px-1">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Sparkles className="w-7 h-7 text-amber-500" />
          Upgrade
        </h1>
        <p className="text-sm text-gray-600 mt-1">Choose a plan and billing period. Early access users keep full app access today.</p>
        {user && (
          <p className="text-xs text-gray-500 mt-2">
            Current tier: <span className="font-semibold text-gray-800">{user.subscription_tier || 'early_access'}</span>
            {sub?.subscription_status && sub.subscription_status !== 'none' && (
              <> · Status: <span className="font-medium">{sub.subscription_status}</span></>
            )}
          </p>
        )}
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TIERS.map((t) => {
          const tierPlans = plans?.[t.key] || {};
          const cell = tierPlans[period];
          const priceCents = cell?.price_cents ?? 0;
          const disc = cell?.discount_pct ?? 0;
          const userDisc = cell?.user_discount_pct ?? 0;
          const isBusiness = t.key === 'business';
          return (
            <div key={t.key} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex flex-col">
              <h2 className="text-lg font-semibold text-gray-900">{t.name}</h2>
              <p className="text-sm text-gray-500 mt-1 flex-1">{t.desc}</p>
              <div className="mt-4">
                <p className="text-3xl font-bold text-gray-900">{fmtMoney(priceCents)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {disc > 0 && <span>Includes {disc}% period savings </span>}
                  {userDisc > 0 && <span>· {userDisc}% personal discount</span>}
                  {!disc && !userDisc && <span>per {period.replace('_', ' ')}</span>}
                </p>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-gray-600">
                <li className="flex gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> Secure checkout via Stripe</li>
                <li className="flex gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> Manage billing anytime</li>
              </ul>
              <button
                type="button"
                disabled={!!checkoutTier}
                onClick={() => checkout(t.key)}
                className="mt-6 w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {checkoutTier === t.key && <Loader2 className="w-4 h-4 animate-spin" />}
                {isBusiness ? 'Start free trial / Subscribe' : 'Subscribe'}
              </button>
              {isBusiness && (
                <p className="text-[11px] text-center text-gray-400 mt-2">7-day trial applies when Stripe checkout is live.</p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-sm text-gray-500">
        <Link to="/settings" className="text-blue-600 hover:text-blue-700 font-medium">Back to settings</Link>
      </p>
    </div>
  );
}
