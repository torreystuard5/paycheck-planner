import { useEffect, useState } from 'react';
import api from '../../services/api';
import CurrencyDisplay from '../../components/CurrencyDisplay';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function BusinessReports() {
  const [range, setRange] = useState('month');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get('/api/v1/business/reports/overview', { params: { range } })
      .then(({ data: d }) => setData(d))
      .finally(() => setLoading(false));
  }, [range]);

  if (loading) return <LoadingSpinner />;

  const profit = data?.profit || {};

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Business Reports</h1>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[44px]"
        >
          <option value="week">This week</option>
          <option value="month">This month</option>
          <option value="year">This year</option>
        </select>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase">Net profit</p>
          <CurrencyDisplay amount={profit.net_profit} className="text-xl font-bold text-purple-700 block mt-1" />
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase">Sales</p>
          <CurrencyDisplay amount={profit.total_sales} className="text-xl font-bold text-green-700 block mt-1" />
        </div>
      </div>

      <section className="bg-white border rounded-lg p-4">
        <h2 className="font-semibold mb-3">Deductions by category</h2>
        <ul className="text-sm space-y-2">
          {(data?.deductions_by_category || []).map((row) => (
            <li key={row.category} className="flex justify-between">
              <span>{row.category}</span>
              <CurrencyDisplay amount={row.amount} />
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white border rounded-lg p-4">
        <h2 className="font-semibold mb-3">Fund balances</h2>
        <ul className="text-sm space-y-2">
          {(data?.fund_balances || []).map((f) => (
            <li key={f.fund_type} className="flex justify-between capitalize">
              <span>{f.fund_type.replace('_', ' ')}</span>
              <CurrencyDisplay amount={f.balance} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
