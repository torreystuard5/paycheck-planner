import { Link } from 'react-router-dom';
import { Sparkles, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { hasProFeatureAccess } from '../utils/tierAccess';

const FEATURE_LABELS = {
  household_overview: 'Household Financial Overview',
  tax_prep: 'Tax Prep & Deduction Tracking',
  receipt_ocr: 'Receipt & Bill Photo Upload',
};

export default function ProFeatureGate({ featureKey, children }) {
  const { user, subscription } = useAuth();

  if (hasProFeatureAccess(user, subscription, featureKey)) {
    return children;
  }

  const label = FEATURE_LABELS[featureKey] || 'This feature';

  return (
    <div className="max-w-lg mx-auto mt-12 p-8 bg-white rounded-xl border border-gray-200 shadow-sm text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-50 mb-4">
        <Lock className="w-7 h-7 text-amber-600" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900">{label}</h2>
      <p className="text-sm text-gray-600 mt-2">
        Upgrade to Home Pro to unlock {label.toLowerCase()} and more premium tools for your household budget.
      </p>
      <Link
        to="/upgrade"
        className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
      >
        <Sparkles className="w-4 h-4" />
        View Home Pro plans
      </Link>
    </div>
  );
}
