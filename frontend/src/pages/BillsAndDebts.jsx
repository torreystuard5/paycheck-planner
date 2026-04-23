import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, ChevronDown, Receipt, CreditCard } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useBudget } from '../context/BudgetContext';
import LoadingSpinner from '../components/LoadingSpinner';
import CurrencyDisplay from '../components/CurrencyDisplay';
import { formatLabel } from '../utils/formatLabel';
import Bills from './Bills';
import Debts from './Debts';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'bills', label: 'Bills' },
  { key: 'debts', label: 'Debts' },
];

const fmtCurrency = (val) => {
  const n = Number(val);
  const v = isNaN(n) ? 0 : n;
  return `$${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

export default function BillsAndDebts() {
  const { user } = useAuth();
  const { activeBudget, budgetVersion } = useBudget();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = TABS.find(t => t.key === tabParam)?.key || 'all';

  const [bills, setBills] = useState([]);
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [addType, setAddType] = useState(null); // 'bill' or 'debt'

  const setTab = (key) => {
    if (key === 'all') {
      setSearchParams({});
    } else {
      setSearchParams({ tab: key });
    }
  };

  const fetchAll = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    const bq = activeBudget?.id ? `budget_id=${activeBudget.id}` : '';
    try {
      const [billsRes, debtsRes] = await Promise.all([
        api.get(bq ? `/api/v1/bills?${bq}` : '/api/v1/bills'),
        api.get(bq ? `/api/v1/debts?${bq}` : '/api/v1/debts'),
      ]);
      setBills(Array.isArray(billsRes.data) ? billsRes.data : []);
      setDebts(Array.isArray(debtsRes.data) ? debtsRes.data : []);
    } catch {
      setError('Failed to load data.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [activeBudget?.id]);

  useEffect(() => {
    if (activeTab === 'all') {
      fetchAll(true);
    } else {
      setLoading(false);
    }
  }, [activeTab, fetchAll, budgetVersion]);

  // Combined and sorted items for All tab
  const combinedItems = useMemo(() => {
    const billItems = bills.map(b => ({
      ...b,
      _type: 'bill',
      _sortDate: b.next_due_date || (b.due_day ? `2099-01-${String(b.due_day).padStart(2, '0')}` : '2099-12-31'),
    }));
    const debtItems = debts.map(d => ({
      ...d,
      _type: 'debt',
      _sortDate: d.next_due_date || (d.due_day ? `2099-01-${String(d.due_day).padStart(2, '0')}` : '2099-12-31'),
    }));
    return [...billItems, ...debtItems].sort((a, b) =>
      new Date(a._sortDate) - new Date(b._sortDate)
    );
  }, [bills, debts]);

  const totalBillsAmount = bills.filter(b => b.is_user_responsible !== false).reduce((sum, b) => sum + (Number(b.user_share ?? b.amount) || 0), 0);
  const activeDebts = debts.filter(d => Number(d.balance) > 0);
  const totalDebtAmount = activeDebts.reduce((sum, d) => sum + (Number(d.balance) || 0), 0);

  // Close add menu on outside click
  useEffect(() => {
    if (!showAddMenu) return;
    const handler = () => setShowAddMenu(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showAddMenu]);

  if (activeTab === 'all' && loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bills & Debts</h1>
            <p className="text-sm text-gray-600 mt-1">Manage your bills and debts in one place</p>
          </div>
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowAddMenu(!showAddMenu); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add
              <ChevronDown className="h-3 w-3" />
            </button>
            {showAddMenu && (
              <div className="absolute right-0 mt-2 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <button
                  onClick={() => { setShowAddMenu(false); setAddType('bill'); setTab('bills'); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
                >
                  <Receipt className="w-4 h-4 text-blue-500" />
                  Add Bill
                </button>
                <button
                  onClick={() => { setShowAddMenu(false); setAddType('debt'); setTab('debts'); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
                >
                  <CreditCard className="w-4 h-4 text-red-500" />
                  Add Debt
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
            className={`px-5 py-2 text-sm font-medium rounded-md transition-colors min-h-[44px] ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && activeTab === 'all' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      {/* All Tab */}
      {activeTab === 'all' && (
        <AllTabContent
          bills={bills}
          debts={debts}
          combinedItems={combinedItems}
          totalBillsAmount={totalBillsAmount}
          totalDebtAmount={totalDebtAmount}
          onRefresh={() => fetchAll(false)}
          user={user}
        />
      )}

      {/* Bills Tab */}
      {activeTab === 'bills' && <Bills autoOpenAdd={addType === 'bill'} onClearAutoOpen={() => setAddType(null)} />}

      {/* Debts Tab */}
      {activeTab === 'debts' && <Debts autoOpenAdd={addType === 'debt'} onClearAutoOpen={() => setAddType(null)} />}
    </div>
  );
}

/* ---------- All Tab Content ---------- */

function AllTabContent({ bills, debts, combinedItems, totalBillsAmount, totalDebtAmount, onRefresh, user }) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <Receipt className="w-4 h-4 text-blue-500" />
            <p className="text-sm text-gray-600">Total Bills</p>
          </div>
          <CurrencyDisplay amount={totalBillsAmount} className="text-2xl font-bold text-gray-900 block" />
          <p className="text-xs text-gray-500 mt-1">{bills.length} bill{bills.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="w-4 h-4 text-red-500" />
            <p className="text-sm text-gray-600">Total Debt</p>
          </div>
          <CurrencyDisplay amount={totalDebtAmount} className="text-2xl font-bold text-gray-900 block" />
          <p className="text-xs text-gray-500 mt-1">{debts.length} debt{debts.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Combined list */}
      {combinedItems.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-sm">No bills or debts found. Add one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {combinedItems.map((item) => (
            <CombinedCard key={`${item._type}-${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Combined Card for All Tab ---------- */

import { Edit, Trash2, ChevronUp, CheckCircle, Circle, Users, DollarSign } from 'lucide-react';
import { formatFriendlyDate } from '../utils/formatDate';
import { getCategoryColor } from '../utils/categoryColors';

function CombinedCard({ item }) {
  const isBill = item._type === 'bill';
  const isPaid = isBill ? item.is_paid : item.is_paid_this_period;

  const displayAmount = isBill
    ? (item.payment_mode === 'split' && item.is_household_bill ? (item.user_share ?? item.amount) : item.amount)
    : item.balance;

  const catColor = isBill
    ? getCategoryColor(item.category)
    : getCategoryColor(item.type === 'credit_card' ? 'debt' : item.type);

  const typeLabel = isBill ? item.category : formatLabel(item.type || 'debt');

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${isPaid ? 'opacity-60 bg-gray-50' : ''}`}>
      <div className="p-4">
        {/* Name + type badge */}
        <div className="flex items-center justify-between gap-2">
          <h3 className={`text-base font-semibold truncate ${isPaid ? 'text-gray-500' : 'text-gray-900'}`}>
            {item.name || 'Untitled'}
          </h3>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
            isBill ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'
          }`}>
            {isBill ? 'Bill' : 'Debt'}
          </span>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {isPaid && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
              <CheckCircle className="w-3 h-3" /> Paid
            </span>
          )}
          {(item.is_household_bill) && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
              <Users className="w-3 h-3" /> Shared
            </span>
          )}
          {(isBill ? item.payment_mode === 'split' : item.is_split) && (
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-600">
              Split
            </span>
          )}
          {typeLabel && (
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${catColor}`}>
              {isBill ? typeLabel : formatLabel(typeLabel)}
            </span>
          )}
          {item.auto_pay && (
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
              Auto-pay
            </span>
          )}
        </div>

        {/* Amount */}
        <div className="mt-2">
          <CurrencyDisplay amount={displayAmount} className={`text-lg font-bold ${isPaid ? 'text-gray-400' : 'text-gray-900'}`} />
          {isBill && item.payment_mode === 'split' && item.is_household_bill && (
            <span className="block text-sm text-blue-600 mt-0.5">Your Share: {fmtCurrency(item.user_share ?? item.amount)}</span>
          )}
        </div>

        {/* Debt-specific: progress bar */}
        {!isBill && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${Math.min(item.percent_paid ?? 0, 100)}%` }}
              />
            </div>
            <span className="text-xs font-medium text-gray-500 shrink-0">
              {(item.percent_paid ?? 0) >= 100 ? 'Paid off!' : `${item.percent_paid ?? 0}% paid`}
            </span>
          </div>
        )}

        {/* Due info */}
        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm text-gray-500">
          <span>
            Due {item.next_due_date ? formatFriendlyDate(item.next_due_date) : (item.due_day ? `day ${item.due_day}` : '--')}
          </span>
          {!isBill && item.apr && (
            <>
              <span className="text-gray-300">·</span>
              <span>{item.apr}% APR</span>
            </>
          )}
          {!isBill && item.minimum_payment && (
            <>
              <span className="text-gray-300">·</span>
              <span>Min: {fmtCurrency(item.minimum_payment)}</span>
            </>
          )}
          {isBill && item.frequency && (
            <>
              <span className="text-gray-300">·</span>
              <span className="capitalize">{formatLabel(item.frequency)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
