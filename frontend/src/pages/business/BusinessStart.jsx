import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Briefcase, Loader2, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { businessEdition } from '../../services/businessApi';
import { Button, Card, IconStat, PageHeader } from '../../components/ui';

const FEATURES = [
  'Sales & customer tracking',
  'Expense deductions & receipts',
  'Staff pay runs',
  'Reserve funds & net profit',
  'Tax prep & document vault',
  'Team access with roles',
];

export default function BusinessStart() {
  const { updateUser, fetchSubscription } = useAuth();
  const navigate = useNavigate();
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    businessEdition.getAccess().then(({ data }) => setAccess(data));
    fetchSubscription?.();
  }, [fetchSubscription]);

  const startTrial = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await businessEdition.activate(true);
      updateUser(data);
      await fetchSubscription?.();
      navigate('/business/dashboard');
    } catch (e) {
      const detail = e.response?.data?.detail;
      setError(typeof detail === 'object' ? detail?.message : detail || 'Could not start Business trial');
    } finally {
      setLoading(false);
    }
  };

  const expired = access?.access_state === 'trial_expired';

  return (
    <div className="page-container mx-auto max-w-lg space-y-8 py-6">
      <div className="h-1 w-full rounded-full bg-gradient-to-r from-purple-600 via-purple-500 to-purple-400/50" aria-hidden />

      <PageHeader
        title={expired ? 'Business trial ended' : 'Business Edition'}
        description={
          expired
            ? 'Your records are saved. Subscribe to edit and add new entries.'
            : 'Track sales, expenses, payroll, and tax prep — separate from Home budgeting.'
        }
      />

      <Card className="p-6 text-center">
        <IconStat icon={Briefcase} tone="purple" className="mx-auto mb-4 rounded-xl p-3" iconClassName="h-8 w-8" />

        <ul className="space-y-2 text-left text-sm">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-2 text-foreground">
              <CheckCircle className="h-4 w-4 shrink-0 text-purple-600" />
              {f}
            </li>
          ))}
        </ul>
      </Card>

      {access?.can_start_trial && !expired && (
        <Button
          type="button"
          onClick={startTrial}
          disabled={loading}
          className="w-full bg-purple-600 py-3 text-white hover:bg-purple-700"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Start 7-day free trial'}
        </Button>
      )}

      {access?.has_business_access && !expired && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigate('/edition')}
          className="w-full"
        >
          Open Business dashboard
        </Button>
      )}

      <div className="flex flex-col gap-2 text-center text-sm">
        <Link to="/upgrade" className="font-medium text-purple-600 hover:text-purple-700">
          View Business &amp; Bundle plans
        </Link>
        <Link to="/edition" className="text-muted hover:text-foreground">
          Back to edition chooser
        </Link>
      </div>

      {error && (
        <Card className="border-danger-200 bg-danger-50 p-4">
          <p className="text-sm text-danger-700">{error}</p>
        </Card>
      )}

      {access?.business_trial_consumed && !access?.can_start_trial && !access?.has_business_access && (
        <p className="text-caption text-center">
          Your one-time Business trial has already been used.
        </p>
      )}
    </div>
  );
}
