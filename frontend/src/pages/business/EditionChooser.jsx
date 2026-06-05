import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Home, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { businessEdition } from '../../services/businessApi';
import { useEditionSwitch } from '../../hooks/useEditionSwitch';
import {
  canSwitchAppMode,
  hasBusinessAccess,
  hasPersonalHomeAccess,
  normalizePlanTier,
} from '../../utils/tierAccess';
import { Badge, Card, IconStat, PageHeader, cn } from '../../components/ui';

export default function EditionChooser() {
  const { user, subscription, fetchSubscription } = useAuth();
  const navigate = useNavigate();
  const { switching, switchToBusiness, switchToPersonal } = useEditionSwitch();
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    businessEdition.getAccess().then(({ data }) => setAccess(data)).catch(() => {});
    fetchSubscription?.();
  }, [fetchSubscription]);

  const tier = normalizePlanTier(user?.subscription_tier);
  const personalOk = hasPersonalHomeAccess(tier);
  const businessOk = hasBusinessAccess(user, subscription) || access?.has_business_access;

  const enterPersonal = async () => {
    setLoading(true);
    await switchToPersonal();
    setLoading(false);
  };

  const enterBusiness = async () => {
    setLoading(true);
    const result = await switchToBusiness();
    if (!result?.ok && result?.code === 'business_upgrade_required') {
      navigate('/business/start');
    }
    setLoading(false);
  };

  const busy = loading || switching;

  return (
    <div className="page-container mx-auto max-w-3xl space-y-8 py-4">
      <div className="h-1 w-full rounded-full bg-gradient-to-r from-purple-600 via-accent-500 to-brand-500/50" aria-hidden />

      <PageHeader
        title="Choose your edition"
        description="PayDrift Home and Business are separate experiences. Bundle includes both."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          disabled={!personalOk || busy}
          onClick={enterPersonal}
          className={cn(
            'text-left transition disabled:opacity-50',
            'rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30',
          )}
        >
          <Card
            variant="interactive"
            className={cn(
              'min-h-[160px] p-6',
              personalOk && 'hover:border-accent-400',
            )}
          >
            <IconStat icon={Home} tone="accent" className="mb-3 rounded-lg p-2.5" iconClassName="h-6 w-6" />
            <h2 className="text-title">Personal / Home</h2>
            <p className="text-body mt-2">Budgets, bills, debts, paycheck planning, household.</p>
          </Card>
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={enterBusiness}
          className={cn(
            'relative text-left transition',
            'rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/30',
          )}
        >
          <Card variant="interactive" className="min-h-[160px] border-purple-200/60 p-6 hover:border-purple-400">
            {!businessOk && (
              <Badge variant="purple" className="absolute right-3 top-3 normal-case">
                Try free
              </Badge>
            )}
            <IconStat icon={Briefcase} tone="purple" className="mb-3 rounded-lg p-2.5" iconClassName="h-6 w-6" />
            <h2 className="text-title">Business</h2>
            <p className="text-body mt-2">
              Sales, deductions, staff pay, funds, tax prep, paystub OCR.
            </p>
          </Card>
        </button>
      </div>

      {canSwitchAppMode(tier) && (
        <p className="text-caption text-center">
          Bundle plan — switch editions anytime from the sidebar or Settings.
        </p>
      )}

      {busy && (
        <p className="flex items-center justify-center gap-2 text-body">
          <Loader2 className="h-4 w-4 animate-spin" />
          Switching…
        </p>
      )}
    </div>
  );
}
