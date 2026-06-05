import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download } from 'lucide-react';
import api from '../../services/api';
import { formatApiError } from '../../utils/formatApiError';
import CurrencyDisplay from '../../components/CurrencyDisplay';
import BusinessPageShell from '../../components/business/BusinessPageShell';
import { useBusinessAccess } from '../../hooks/useBusinessAccess';
import { useToast } from '../../components/Toast';
import { Button, Card } from '../../components/ui';

export default function NetProfitPage() {
  const toast = useToast();
  const { teamRole } = useBusinessAccess();
  const [range, setRange] = useState('ytd');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ range: range });
      if (range === 'custom' && customStart && customEnd) {
        params.set('start_date', customStart);
        params.set('end_date', customEnd);
      }
      const { data: d } = await api.get(`/api/v1/business/net-profit?${params.toString()}`);
      setData(d);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (range !== 'custom') load();
  }, [range]);

  const exportCsv = () => {
    if (!data?.monthly?.length) {
      toast('No rows to export.', 'error');
      return;
    }
    const header = 'month,sales,deductions,staff_pay,net';
    const lines = data.monthly.map((m) => `${m.month},${m.sales},${m.deductions},${m.staff_pay},${m.net}`);
    const blob = new Blob([`${header}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `net-profit-${data.range_start}-${data.range_end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Download started.');
  };

  const chartData = (data?.monthly || []).map((m) => ({
    month: m.month,
    Sales: Number(m.sales) || 0,
    Expenses: Number(m.deductions) + Number(m.staff_pay) || 0,
  }));

  return (
    <BusinessPageShell
      title="Net Profit"
      description="Sales minus deductions and staff pay"
      loading={loading && !data}
      error={error}
      teamRole={teamRole}
      maxWidth="max-w-5xl"
      actions={(
        <Button type="button" variant="secondary" onClick={exportCsv}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      )}
    >
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-muted mb-1">Range</label>
          <select value={range} onChange={(e) => setRange(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm">
            <option value="month">Month to date</option>
            <option value="quarter">Quarter to date</option>
            <option value="ytd">Year to date</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        {range === 'custom' && (
          <>
            <div>
              <label className="block text-xs text-muted mb-1">Start</label>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">End</label>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm" />
            </div>
            <button type="button" onClick={load} className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Apply</button>
          </>
        )}
      </div>

      <div className="bg-surface rounded-lg border border-border p-8 shadow-sm text-center">
        <p className="text-xs text-muted uppercase tracking-wide mb-2">Net profit</p>
        <CurrencyDisplay amount={data?.net_profit} className="text-4xl sm:text-5xl font-bold text-purple-700" />
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-left max-w-2xl mx-auto text-sm">
          <div>
            <p className="text-muted">Sales</p>
            <CurrencyDisplay amount={data?.total_sales} className="font-semibold text-green-700" />
          </div>
          <div>
            <p className="text-muted">Deductions</p>
            <CurrencyDisplay amount={data?.total_deductions} className="font-semibold text-orange-700" />
          </div>
          <div>
            <p className="text-muted">Staff pay</p>
            <CurrencyDisplay amount={data?.total_staff_pay} className="font-semibold text-blue-700" />
          </div>
          <div>
            <p className="text-muted">Fund deposits</p>
            <CurrencyDisplay amount={data?.total_fund_contributions} className="font-semibold text-foreground" />
          </div>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="bg-surface rounded-lg border border-border p-4 shadow-sm h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => `$${Number(v).toFixed(2)}`} />
              <Legend />
              <Bar dataKey="Sales" fill="#16a34a" />
              <Bar dataKey="Expenses" fill="#ea580c" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-surface rounded-lg border border-border overflow-x-auto shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left text-muted">
            <tr>
              <th className="px-3 py-2">Month</th>
              <th className="px-3 py-2">Sales</th>
              <th className="px-3 py-2">Deductions</th>
              <th className="px-3 py-2">Staff pay</th>
              <th className="px-3 py-2">Net</th>
            </tr>
          </thead>
          <tbody>
            {(data?.monthly || []).map((m) => (
              <tr key={m.month} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{m.month}</td>
                <td className="px-3 py-2"><CurrencyDisplay amount={m.sales} /></td>
                <td className="px-3 py-2"><CurrencyDisplay amount={m.deductions} /></td>
                <td className="px-3 py-2"><CurrencyDisplay amount={m.staff_pay} /></td>
                <td className="px-3 py-2 font-semibold"><CurrencyDisplay amount={m.net} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BusinessPageShell>
  );
}
