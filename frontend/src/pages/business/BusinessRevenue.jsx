import { useEffect, useState } from 'react';
import api from '../../services/api';
import CurrencyDisplay from '../../components/CurrencyDisplay';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useBusinessWrite } from '../../hooks/useBusinessWrite';

export default function BusinessRevenue() {
  const write = useBusinessWrite('manage_subscription');
  const [rows, setRows] = useState([]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get('/api/v1/business/revenue/payment-requests').then(({ data }) => setRows(data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    await api.post('/api/v1/business/revenue/payment-requests', {
      amount: Number(amount),
      description,
    });
    setAmount('');
    setDescription('');
    load();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Payment requests</h1>
      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
        Scaffold: invoice/payment link tracking is in place. Stripe Connect payment link generation is not wired yet.
      </p>

      {!write.allowed && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Payment requests are limited to the business owner.
        </p>
      )}
      <form onSubmit={create} className="space-y-2 bg-white border rounded-lg p-4">
        <input
          type="number"
          step="0.01"
          required
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={write.disabled}
          className="w-full border rounded-lg px-3 py-2 min-h-[44px] disabled:opacity-50"
        />
        <input
          type="text"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={write.disabled}
          className="w-full border rounded-lg px-3 py-2 min-h-[44px] disabled:opacity-50"
        />
        <button type="submit" {...write.props({ className: 'w-full py-2 bg-purple-600 text-white rounded-lg min-h-[44px]' })}>
          Create draft
        </button>
      </form>

      <ul className="divide-y border rounded-lg bg-white text-sm">
        {rows.map((r) => (
          <li key={r.id} className="p-3 flex justify-between gap-2">
            <span>{r.description || 'Payment request'}</span>
            <span className="flex items-center gap-2">
              <CurrencyDisplay amount={r.amount} />
              <span className="text-gray-500 capitalize">{r.status}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
