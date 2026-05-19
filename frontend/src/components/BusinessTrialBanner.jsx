import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useBusinessAccess } from '../hooks/useBusinessAccess';

export default function BusinessTrialBanner() {
  const { trialExpired, canWrite, access, loading } = useBusinessAccess();

  if (loading || canWrite) return null;

  return (
    <div
      className={`mx-4 mt-4 mb-0 rounded-lg border p-4 flex flex-wrap items-start gap-3 ${
        trialExpired
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : 'bg-purple-50 border-purple-200 text-purple-900'
      }`}
    >
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-[200px]">
        <p className="font-medium text-sm">
          {trialExpired ? 'Business trial ended' : 'Business access required'}
        </p>
        <p className="text-xs mt-1 opacity-90">
          {trialExpired
            ? 'You can view your business records, but edits are locked until you subscribe.'
            : 'Upgrade or start your trial to edit business data.'}
        </p>
        {access?.trial_ends_at && !trialExpired && (
          <p className="text-xs mt-1 opacity-75">Trial ends: {new Date(access.trial_ends_at).toLocaleString()}</p>
        )}
      </div>
      <Link
        to={trialExpired ? '/upgrade' : '/business/start'}
        className="text-sm font-medium px-3 py-2 rounded-lg bg-white border border-current hover:bg-white/80 min-h-[44px] flex items-center"
      >
        {trialExpired ? 'Subscribe' : 'Get Business'}
      </Link>
    </div>
  );
}
