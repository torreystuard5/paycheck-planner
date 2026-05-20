import { useState, useEffect, useCallback } from 'react';
import { DollarSign, Users, Loader2, ChevronDown } from 'lucide-react';
import api from '../services/api';
import { useBudget } from '../context/BudgetContext';
import { formatFriendlyDate } from '../utils/formatDate';

const fmt = (val) => {
  const n = Number(val);
  const v = Number.isNaN(n) ? 0 : n;
  return `$${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

const typeLabel = (item) => (item.item_type === 'debt' ? 'Debt' : 'Bill');

export default function HouseholdFinancialOverview() {
  const { activeBudget, budgetVersion } = useBudget();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('combined');
  const [error, setError] = useState(null);
  const [collapsedPersons, setCollapsedPersons] = useState([]);

  const load = useCallback(async () => {
    if (!activeBudget?.id) {
      setLoading(false);
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(
        `/api/v1/households/financial-overview?budget_id=${activeBudget.id}`,
      );
      setData(res.data);
    } catch (err) {
      setData(null);
      const detail = err.response?.data?.detail;
      const message =
        typeof detail === 'string'
          ? detail
          : detail?.message
            || (detail?.code === 'upgrade_required'
              ? 'Household Financial Overview requires Home Pro.'
              : null)
            || (err.response?.status === 403
              ? 'You do not have access to the household financial overview.'
              : 'Could not load household overview.');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [activeBudget?.id]);

  useEffect(() => {
    load();
  }, [load, budgetVersion]);

  const togglePerson = (memberId) => {
    setCollapsedPersons((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600 py-4">{error}</p>;
  }

  if (!data) return null;

  const tabs = [
    { key: 'my', label: 'My bills & debts' },
    { key: 'by_person', label: 'By person' },
    { key: 'combined', label: 'Combined' },
  ];

  return (
    <div className="space-y-4 border-t border-gray-200 pt-6 mt-6">
      <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-green-600" />
        Financial overview
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-green-50 border border-green-100 rounded-lg p-4">
          <p className="text-xs text-green-700 font-medium">Combined income</p>
          <p className="text-xl font-bold text-green-900 mt-1">{fmt(data.combined_income)}</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
          <p className="text-xs text-blue-700 font-medium">Combined bills & debts</p>
          <p className="text-xl font-bold text-blue-900 mt-1">{fmt(data.combined_bills_total)}</p>
        </div>
        <div
          className={`rounded-lg p-4 border ${Number(data.combined_remaining) >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}
        >
          <p className="text-xs font-medium text-gray-700">After obligations</p>
          <p className="text-xl font-bold mt-1">{fmt(data.combined_remaining)}</p>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
          <Users className="w-3.5 h-3.5" /> Income by person
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          {data.member_income?.map((m) => (
            <span key={m.member_id} className="bg-white px-2 py-1 rounded border border-gray-200">
              {m.member_name}: <strong>{fmt(m.monthly_income)}</strong>
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setView(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              view === t.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === 'my' && (
        <ObligationTable
          items={data.my_bills || []}
          empty="No bills or debts assigned to you in this budget."
        />
      )}
      {view === 'by_person' && (
        <div className="space-y-3">
          {(data.by_person || []).map((g) => {
            const isCollapsed = collapsedPersons.includes(g.member_id);
            return (
              <div
                key={g.member_id}
                className="rounded-lg border border-gray-200 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => togglePerson(g.member_id)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
                >
                  <span className="text-sm font-semibold text-gray-800">
                    {g.member_name} — {fmt(g.total)} ({fmt(g.paid_total)} paid)
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-gray-400 shrink-0 transition-transform duration-200 ${
                      isCollapsed ? '-rotate-90' : ''
                    }`}
                  />
                </button>
                <div
                  className="overflow-hidden transition-all duration-200 ease-in-out"
                  style={{ maxHeight: isCollapsed ? '0px' : '4000px', opacity: isCollapsed ? 0 : 1 }}
                >
                  <div className="p-3 pt-0">
                    <ObligationTable items={g.bills || []} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {view === 'combined' && (
        <ObligationTable
          items={data.combined_bills_list || []}
          empty="No household bills or debts in this budget."
        />
      )}
    </div>
  );
}

function ObligationTable({ items, empty = 'No items.' }) {
  if (!items.length) {
    return <p className="text-sm text-gray-500">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-600">
          <tr>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Responsible</th>
            <th className="px-3 py-2">Due</th>
            <th className="px-3 py-2 text-right">Share</th>
          </tr>
        </thead>
        <tbody>
          {items.map((b) => {
            const isDebt = b.item_type === 'debt';
            return (
            <tr
              key={`${b.item_type || 'bill'}-${b.id}`}
              className={`border-t border-gray-100 ${isDebt ? 'bg-purple-50/50' : ''}`}
            >
              <td className={`px-3 py-2 ${isDebt ? 'text-purple-700 font-medium' : 'text-gray-500'}`}>
                {typeLabel(b)}
              </td>
              <td className="px-3 py-2">{b.name}</td>
              <td className="px-3 py-2 text-gray-600">{b.assigned_member_name || '—'}</td>
              <td className="px-3 py-2 text-gray-600">
                {b.due_date ? formatFriendlyDate(b.due_date) : '—'}
              </td>
              <td className="px-3 py-2 text-right font-medium">{fmt(b.user_share)}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
