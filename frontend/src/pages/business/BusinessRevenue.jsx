import { useEffect, useState } from 'react';
import api from '../../services/api';
import { formatApiError } from '../../utils/formatApiError';
import CurrencyDisplay from '../../components/CurrencyDisplay';
import BusinessPageShell from '../../components/business/BusinessPageShell';
import { useBusinessWrite } from '../../hooks/useBusinessWrite';
import { useBusinessAccess } from '../../hooks/useBusinessAccess';
import { useToast } from '../../components/Toast';
import { Badge, Button, Card } from '../../components/ui';

const STATUS_VARIANT = {
  draft: 'neutral',
  sent: 'info',
  paid: 'success',
  cancelled: 'warning',
};

export default function BusinessRevenue() {
  const write = useBusinessWrite('manage_subscription');
  const { teamRole } = useBusinessAccess();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setError(null);
    api.get('/api/v1/business/revenue/payment-requests')
      .then(({ data }) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load payment requests.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!write.allowed) return;
    setCreating(true);
    try {
      await api.post('/api/v1/business/revenue/payment-requests', {
        amount: Number(amount),
        description,
      });
      setAmount('');
      setDescription('');
      toast('Payment request created.', 'success');
      load();
    } catch (err) {
      toast(formatApiError(err), 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <BusinessPageShell
      title="Payment Requests"
      description="Track invoices and payment links for clients"
      loading={loading}
      error={error}
      teamRole={teamRole}
      maxWidth="max-w-2xl"
    >
      <Card className="border-warning-200 bg-warning-50 p-4">
        <p className="text-sm text-warning-800">
          Payment request tracking is live. Stripe Connect payment link generation is coming in a future update.
        </p>
      </Card>

      {!write.allowed && (
        <Card className="border-warning-200 bg-warning-50 p-4">
          <p className="text-sm text-warning-800">
            Payment requests are limited to the business owner.
          </p>
        </Card>
      )}

      <Card className="p-4 sm:p-5">
        <form onSubmit={create} className="space-y-3">
          <div>
            <label htmlFor="pay-amount" className="form-label">Amount</label>
            <input
              id="pay-amount"
              type="number"
              step="0.01"
              required
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={write.disabled || creating}
              className="form-input"
            />
          </div>
          <div>
            <label htmlFor="pay-desc" className="form-label">Description</label>
            <input
              id="pay-desc"
              type="text"
              placeholder="Invoice for consulting — March"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={write.disabled || creating}
              className="form-input"
            />
          </div>
          <Button
            type="submit"
            disabled={write.disabled || creating}
            className="w-full bg-purple-600 text-white hover:bg-purple-700"
          >
            {creating ? 'Creating…' : 'Create draft'}
          </Button>
        </form>
      </Card>

      <Card className="divide-y divide-border p-0">
        {rows.length === 0 && (
          <p className="p-4 text-body">No payment requests yet.</p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <span className="text-foreground">{r.description || 'Payment request'}</span>
            <span className="flex items-center gap-2">
              <CurrencyDisplay amount={r.amount} className="font-medium text-foreground" />
              <Badge variant={STATUS_VARIANT[r.status] || 'neutral'} className="normal-case capitalize">
                {r.status}
              </Badge>
            </span>
          </div>
        ))}
      </Card>
    </BusinessPageShell>
  );
}
