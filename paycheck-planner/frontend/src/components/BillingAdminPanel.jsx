import { useState, useEffect, useCallback } from 'react';
import { Loader2, Save, Trash2, DollarSign } from 'lucide-react';
import api from '../services/api';

const PERIODS = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'six_month', label: '6-Month' },
  { key: 'annual', label: 'Annual' },
];

export default function BillingAdminPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [discounts, setDiscounts] = useState([]);
  const [discUser, setDiscUser] = useState('');
  const [discPct, setDiscPct] = useState('10');
  const [discReason, setDiscReason] = useState('');
  const [discExp, setDiscExp] = useState('');
  const [discSaving, setDiscSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pRes, dRes] = await Promise.all([
        api.get('/api/v1/admin/billing/pricing'),
        api.get('/api/v1/admin/billing/discounts'),
      ]);
      setRows(Array.isArray(pRes.data) ? pRes.data : []);
      setDiscounts(Array.isArray(dRes.data) ? dRes.data : []);
    } catch {
      setError('Could not load billing admin data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateDraft = (id, field, value) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const saveRow = async (r) => {
    setSavingId(r.id);
    setError('');
    try {
      await api.patch(`/api/v1/admin/billing/pricing/${r.id}`, {
        base_price_cents: parseInt(r.base_price_cents, 10) || 0,
        discount_pct: parseFloat(r.discount_pct) || 0,
        stripe_price_id: r.stripe_price_id || null,
        is_active: r.is_active !== false,
      });
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Save failed');
    } finally {
      setSavingId(null);
    }
  };

  const addDiscount = async (e) => {
    e.preventDefault();
    setDiscSaving(true);
    setError('');
    try {
      await api.post('/api/v1/admin/billing/discounts', {
        user_id: discUser.trim(),
        discount_pct: parseFloat(discPct) || 0,
        reason: discReason.trim() || null,
        expires_at: discExp ? `${discExp}T23:59:59Z` : null,
      });
      setDiscUser('');
      setDiscReason('');
      setDiscExp('');
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not create discount');
    } finally {
      setDiscSaving(false);
    }
  };

  const removeDiscount = async (id) => {
    try {
      await api.delete(`/api/v1/admin/billing/discounts/${id}`);
      await load();
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-emerald-600" />
          Pricing (Stripe Price IDs)
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Set base prices and paste Stripe Price IDs from the Stripe dashboard. Public pricing on the Upgrade page uses these values.
        </p>
        {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
        <div className="overflow-x-auto -mx-2">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">Tier</th>
                <th className="py-2 pr-3">Period</th>
                <th className="py-2 pr-3">Price (¢)</th>
                <th className="py-2 pr-3">Discount %</th>
                <th className="py-2 pr-3">Stripe price ID</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3 font-medium capitalize">{r.tier}</td>
                  <td className="py-2 pr-3">{PERIODS.find((p) => p.key === r.billing_period)?.label || r.billing_period}</td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      className="w-24 border border-gray-300 rounded px-2 py-1"
                      value={r.base_price_cents}
                      onChange={(e) => updateDraft(r.id, 'base_price_cents', e.target.value)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      step="0.1"
                      className="w-20 border border-gray-300 rounded px-2 py-1"
                      value={r.discount_pct}
                      onChange={(e) => updateDraft(r.id, 'discount_pct', e.target.value)}
                    />
                  </td>
                  <td className="py-2 pr-3 min-w-[10rem]">
                    <input
                      type="text"
                      className="w-full min-w-[8rem] border border-gray-300 rounded px-2 py-1 font-mono text-xs"
                      value={r.stripe_price_id || ''}
                      onChange={(e) => updateDraft(r.id, 'stripe_price_id', e.target.value)}
                      placeholder="price_..."
                    />
                  </td>
                  <td className="py-2 pr-0">
                    <button
                      type="button"
                      onClick={() => saveRow(r)}
                      disabled={savingId === r.id}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {savingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Per-user discounts</h2>
        <p className="text-sm text-gray-500 mb-4">Extra % off calculated prices (stacks with period discounts).</p>
        <form onSubmit={addDiscount} className="flex flex-col lg:flex-row flex-wrap gap-2 mb-4">
          <input
            className="flex-1 min-w-[8rem] border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="User UUID"
            value={discUser}
            onChange={(e) => setDiscUser(e.target.value)}
          />
          <input
            type="number"
            className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="% off"
            value={discPct}
            onChange={(e) => setDiscPct(e.target.value)}
          />
          <input
            className="flex-1 min-w-[8rem] border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Reason"
            value={discReason}
            onChange={(e) => setDiscReason(e.target.value)}
          />
          <input
            type="date"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={discExp}
            onChange={(e) => setDiscExp(e.target.value)}
          />
          <button
            type="submit"
            disabled={discSaving}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {discSaving ? 'Saving…' : 'Add discount'}
          </button>
        </form>
        {discounts.length === 0 ? (
          <p className="text-sm text-gray-500">No custom discounts.</p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {discounts.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="text-gray-700 truncate">
                  User <span className="font-mono text-xs">{d.user_id}</span>
                  {' · '}{d.discount_pct}% {d.reason ? `— ${d.reason}` : ''}
                </span>
                <button type="button" onClick={() => removeDiscount(d.id)} className="p-1 text-gray-400 hover:text-red-600" title="Remove">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
