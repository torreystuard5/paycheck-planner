import { useEffect, useState } from 'react';
import api from '../../services/api';
import CurrencyDisplay from '../../components/CurrencyDisplay';
import LoadingSpinner from '../../components/LoadingSpinner';

const YEAR = new Date().getFullYear();

export default function BusinessTaxPrep() {
  const [year, setYear] = useState(YEAR);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get('/api/v1/business/tax-prep/summary', { params: { year } })
      .then(({ data: d }) => setData(d))
      .finally(() => setLoading(false));
  }, [year]);

  const exportCsv = () => {
    window.open(`/api/v1/business/tax-prep/export.csv?year=${year}`, '_blank');
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Business Tax Prep</h1>
        <div className="flex gap-2 items-center">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[44px]"
          >
            {[YEAR, YEAR - 1, YEAR - 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportCsv}
            className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg min-h-[44px]"
          >
            Export CSV
          </button>
        </div>
      </div>

      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
        {data?.disclaimer}
      </p>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-600">Category</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data?.categories?.map((c) => (
              <tr key={c.key} className="border-t border-gray-100">
                <td className="px-4 py-3">{c.label}</td>
                <td className="px-4 py-3 text-right">
                  <CurrencyDisplay amount={c.total} />
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-200 font-semibold">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3 text-right">
                <CurrencyDisplay amount={data?.total_deductions} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {data?.contractors_1099?.length > 0 && (
        <section>
          <h2 className="font-semibold text-gray-900 mb-2">1099 contractors</h2>
          <ul className="text-sm space-y-1">
            {data.contractors_1099.map((c) => (
              <li key={c.vendor} className="flex justify-between gap-2">
                <span>{c.vendor}</span>
                <span>
                  <CurrencyDisplay amount={c.total} />
                  {c.requires_1099 && (
                    <span className="ml-2 text-xs text-purple-700">1099</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
