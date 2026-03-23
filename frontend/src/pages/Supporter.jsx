import { useState, useEffect } from 'react';
import { Heart, DollarSign, Gift, Coffee, Loader2, CheckCircle, AlertCircle, Star } from 'lucide-react';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Supporter() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [promoCode, setPromoCode] = useState('');
  const [applying, setApplying] = useState(false);
  const [promoSuccess, setPromoSuccess] = useState(null);
  const [promoError, setPromoError] = useState(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await api.get('/api/v1/supporter/status');
      setStatus(res.data);
    } catch {
      // User may not have status yet, that's ok
      setStatus({
        is_supporter: false,
        total_donated: 0,
        months_banked: 0,
        subscription_tier: 'early_access',
        promo_applied: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPromo = async (e) => {
    e.preventDefault();
    if (!promoCode.trim()) return;
    setApplying(true);
    setPromoSuccess(null);
    setPromoError(null);
    try {
      const res = await api.post('/api/v1/supporter/apply-promo', { code: promoCode.trim() });
      setStatus(res.data);
      setPromoSuccess('Code applied! You have lifetime access to upcoming paid features.');
      setPromoCode('');
    } catch (err) {
      setPromoError(err.response?.data?.detail || 'Invalid or expired code.');
    } finally {
      setApplying(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-rose-50 rounded-full mb-4">
          <Heart className="h-8 w-8 text-rose-500" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Support PayDrift</h1>
        <p className="text-gray-600 max-w-xl mx-auto mb-6">
          Everything is free during early access. Donate to bank free months toward upcoming paid features.
        </p>
        <a
          href="https://ko-fi.com/spsoftwaresolutions"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-semibold text-lg hover:from-amber-600 hover:to-orange-600 transition-all shadow-md"
        >
          <Coffee className="h-5 w-5" />
          Support On Ko-fi
        </a>
      </div>

      {/* How It Works */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">How It Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-green-50 rounded-full mb-3">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">$5 = 1 Month Free</h3>
            <p className="text-sm text-gray-600">Every $5 you donate banks one free month of upcoming paid features.</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-50 rounded-full mb-3">
              <Gift className="h-6 w-6 text-amber-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">$20 = 5 Months Free</h3>
            <p className="text-sm text-gray-600">Donate $20 and get a bonus month — 5 months of upcoming paid features instead of 4.</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-rose-50 rounded-full mb-3">
              <Heart className="h-6 w-6 text-rose-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Early Supporters Matter</h3>
            <p className="text-sm text-gray-600">Your support helps us build more features and keep the lights on.</p>
          </div>
        </div>
      </div>

      {/* Supporter Status */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Heart className="w-5 h-5 text-rose-500" />
          Your Supporter Status
        </h2>
        {status?.subscription_tier === 'lifetime' ? (
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <Star className="h-6 w-6 text-amber-500" />
            <div>
              <p className="font-semibold text-gray-900">Lifetime Access</p>
              <p className="text-sm text-gray-600">You have permanent free access — thank you!</p>
            </div>
          </div>
        ) : status?.is_supporter ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <div>
                <p className="font-semibold text-gray-900">You're a Supporter!</p>
                <p className="text-sm text-gray-600">Thank you for supporting PayDrift.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-gray-900">${(Number(status.total_donated) || 0).toFixed(2)}</p>
                <p className="text-sm text-gray-500">Total Donated</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-gray-900">{status.months_banked}</p>
                <p className="text-sm text-gray-500">Months Banked</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">You haven't donated yet — every bit helps!</p>
        )}
      </div>

      {/* Promo Code Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Have A Promo Code?</h2>
        <p className="text-sm text-gray-600 mb-4">Enter your promo code below to unlock access to upcoming paid features.</p>

        {promoSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 mb-4 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 shrink-0" />
            {promoSuccess}
          </div>
        )}
        {promoError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {promoError}
          </div>
        )}

        <form onSubmit={handleApplyPromo} className="flex gap-3">
          <input
            type="text"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            placeholder="Enter promo code"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={applying || !promoCode.trim()}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Apply
          </button>
        </form>
      </div>
    </div>
  );
}
