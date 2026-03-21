import { useState, useEffect } from 'react';
import { Gift, Users, Award, Clock, Copy, Check, AlertCircle } from 'lucide-react';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

export default function Refer() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchReferralInfo = async () => {
      try {
        const { data } = await api.get('/api/v1/referrals/me');
        setInfo(data);
      } catch (err) {
        setError('Failed to load referral information.');
      } finally {
        setLoading(false);
      }
    };
    fetchReferralInfo();
  }, []);

  const handleCopy = async () => {
    if (!info?.referral_link) return;
    try {
      await navigator.clipboard.writeText(info.referral_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the input text
    }
  };

  if (loading) return <LoadingSpinner />;

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Refer a Friend</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Refer a Friend</h1>
        <EmptyState
          icon={Gift}
          title="Referral program unavailable"
          message="Could not load your referral information."
        />
      </div>
    );
  }

  const promoActive = !!info.promo_end_date;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Refer a Friend</h1>
        <p className="text-gray-600 mt-1">Share PayDrift and earn free months</p>
      </div>

      {/* Promo status */}
      {promoActive ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800 text-sm">
            For a limited time (until <span className="font-semibold">{info.promo_end_date}</span>),
            each friend who joins and becomes a paying user gives you 1 free month.
            They also get their first month free!
          </p>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-amber-800 text-sm">
            Referral program is not currently active.
          </p>
        </div>
      )}

      {/* Referral Link */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Gift className="w-5 h-5 text-blue-500" />
          Your Referral Link
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={info.referral_link}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-700 focus:outline-none"
          />
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Share this link with friends. When they sign up and subscribe, you both earn rewards.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Friends Referred</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{info.total_referred_count}</p>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg">
              <Users className="w-6 h-6 text-blue-500" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Free Months Earned</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{info.total_rewards_earned}</p>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <Award className="w-6 h-6 text-green-500" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending Rewards</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{info.pending_rewards}</p>
            </div>
            <div className="bg-amber-50 p-3 rounded-lg">
              <Clock className="w-6 h-6 text-amber-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <p className="text-gray-700">
          You&apos;ve referred <span className="font-semibold">{info.total_referred_count}</span> friend{info.total_referred_count !== 1 ? 's' : ''} and
          earned <span className="font-semibold">{info.total_rewards_earned}</span> free month{info.total_rewards_earned !== 1 ? 's' : ''}.
          {info.pending_rewards > 0 && (
            <span> You have <span className="font-semibold">{info.pending_rewards}</span> pending reward{info.pending_rewards !== 1 ? 's' : ''} waiting to be applied.</span>
          )}
        </p>
      </div>
    </div>
  );
}
