import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, TrendingUp, Receipt, Banknote, PieChart, Plus } from 'lucide-react';
import api from '../../services/api';
import { formatApiError } from '../../utils/formatApiError';
import { formatFriendlyDate } from '../../utils/formatDate';
import CurrencyDisplay from '../../components/CurrencyDisplay';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useBusinessWrite } from '../../hooks/useBusinessWrite';

export default function BusinessDashboard() {
  const salesWrite = useBusinessWrite('manage_sales');
  const dedWrite = useBusinessWrite('manage_deductions');
  const payWrite = useBusinessWrite('manage_staff_pay');
  const fundWrite = useBusinessWrite('manage_funds');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setError(null);
    try {
      const { data: d } = await api.get('/api/v1/business/dashboard');
      setData(d);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <LoadingSpinner />;

  const pct = (fund) => {
    if (!fund?.target_amount || Number(fund.target_amount) <= 0) return null;
    return Math.min(100, Math.round((Number(fund.current_balance) / Number(fund.target_amount)) * 100));
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Briefcase className="w-7 h-7 text-purple-600" />
          Business Dashboard
        </h1>
        <p className="text-sm text-gray-600 mt-1">Sales, profit, and funds at a glance</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Today / week / MTD sales</p>
          <CurrencyDisplay amount={data?.today_sales} className="text-lg font-semibold text-green-700 mt-1 block" />
          <CurrencyDisplay amount={data?.week_sales} className="text-sm text-green-600 block" />
          <CurrencyDisplay amount={data?.mtd_sales} className="text-2xl font-bold text-green-700 mt-1 block" />
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">MTD Deductions</p>
          <CurrencyDisplay amount={data?.mtd_deductions} className="text-2xl font-bold text-orange-700 mt-1 block" />
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">MTD Staff Pay</p>
          <CurrencyDisplay amount={data?.mtd_staff_pay} className="text-2xl font-bold text-blue-700 mt-1 block" />
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">MTD Net Profit</p>
          <CurrencyDisplay amount={data?.mtd_net_profit} className="text-2xl font-bold text-purple-700 mt-1 block" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['contingency_fund', 'upgrade_fund'].map((key) => {
          const fund = data?.[key];
          const label = key === 'contingency_fund' ? 'Contingency Fund' : 'Upgrade Fund';
          const to = key === 'contingency_fund' ? '/business/contingency-fund' : '/business/upgrade-fund';
          const p = pct(fund);
          return (
            <div key={key} className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="font-semibold text-gray-900">{label}</h2>
                <Link to={to} className="text-xs font-medium text-blue-600 hover:text-blue-800">Manage</Link>
              </div>
              {fund ? (
                <>
                  <CurrencyDisplay amount={fund.current_balance} className="text-xl font-bold text-gray-900" />
                  {fund.target_amount != null && (
                    <p className="text-xs text-gray-500 mt-1">Target <CurrencyDisplay amount={fund.target_amount} className="inline font-medium" /></p>
                  )}
                  {p != null && (
                    <div className="mt-3">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${p}%` }} />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{p}% of target</p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500">No fund yet</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {salesWrite.allowed ? (
          <Link to="/business/sales" className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
            <Plus className="w-4 h-4" /> Add Sale
          </Link>
        ) : (
          <span {...salesWrite.props({ className: 'inline-flex items-center gap-1.5 px-3 py-2 bg-green-600/50 text-white rounded-lg text-sm font-medium cursor-not-allowed' })} title={salesWrite.title}>
            <Plus className="w-4 h-4" /> Add Sale
          </span>
        )}
        {dedWrite.allowed ? (
          <Link to="/business/deductions" className="inline-flex items-center gap-1.5 px-3 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700">
            <Plus className="w-4 h-4" /> Add Deduction
          </Link>
        ) : (
          <span {...dedWrite.props({ className: 'inline-flex items-center gap-1.5 px-3 py-2 bg-orange-600/50 text-white rounded-lg text-sm font-medium cursor-not-allowed' })} title={dedWrite.title}>
            <Plus className="w-4 h-4" /> Add Deduction
          </span>
        )}
        {payWrite.allowed ? (
          <Link to="/business/staff-pay" className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Pay Run
          </Link>
        ) : (
          <span {...payWrite.props({ className: 'inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600/50 text-white rounded-lg text-sm font-medium cursor-not-allowed' })} title={payWrite.title}>
            <Plus className="w-4 h-4" /> Pay Run
          </span>
        )}
        {fundWrite.allowed ? (
          <Link to="/business/contingency-fund" className="inline-flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
            <Plus className="w-4 h-4" /> Fund Tx
          </Link>
        ) : (
          <span {...fundWrite.props({ className: 'inline-flex items-center gap-1.5 px-3 py-2 bg-purple-600/50 text-white rounded-lg text-sm font-medium cursor-not-allowed' })} title={fundWrite.title}>
            <Plus className="w-4 h-4" /> Fund Tx
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-green-600" /> Recent sales
          </h3>
          <ul className="space-y-2 text-sm">
            {(data?.recent_sales || []).map((s) => (
              <li key={s.id} className="flex justify-between gap-2 border-b border-gray-50 pb-2">
                <span className="text-gray-700 truncate">{s.source || s.category || 'Sale'}</span>
                <span className="shrink-0 flex flex-col items-end text-xs">
                  <CurrencyDisplay amount={s.amount} className="font-semibold text-gray-900" />
                  <span className="text-gray-500">{formatFriendlyDate(s.date)}</span>
                </span>
              </li>
            ))}
            {(!data?.recent_sales || data.recent_sales.length === 0) && (
              <li className="text-gray-500 text-sm">No sales yet</li>
            )}
          </ul>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Receipt className="w-4 h-4 text-orange-600" /> Recent deductions
          </h3>
          <ul className="space-y-2 text-sm">
            {(data?.recent_deductions || []).map((d) => (
              <li key={d.id} className="flex justify-between gap-2 border-b border-gray-50 pb-2">
                <span className="text-gray-700 truncate">{d.category}</span>
                <span className="shrink-0 text-gray-500">{formatFriendlyDate(d.date)}</span>
              </li>
            ))}
            {(!data?.recent_deductions || data.recent_deductions.length === 0) && (
              <li className="text-gray-500 text-sm">No deductions yet</li>
            )}
          </ul>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Banknote className="w-4 h-4 text-blue-600" /> Recent pay runs
          </h3>
          <ul className="space-y-2 text-sm">
            {(data?.recent_pay_runs || []).map((p) => (
              <li key={p.id} className="flex justify-between gap-2 border-b border-gray-50 pb-2">
                <span className="text-gray-700">Net pay</span>
                <CurrencyDisplay amount={p.net_pay} className="shrink-0 font-medium text-gray-900" />
              </li>
            ))}
            {(!data?.recent_pay_runs || data.recent_pay_runs.length === 0) && (
              <li className="text-gray-500 text-sm">No pay runs yet</li>
            )}
          </ul>
        </div>
      </div>

      <Link to="/business/net-profit" className="inline-flex items-center gap-2 text-sm font-medium text-purple-700 hover:text-purple-900">
        <PieChart className="w-4 h-4" /> View net profit report
      </Link>
    </div>
  );
}
