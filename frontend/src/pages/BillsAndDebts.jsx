import { useState, useEffect, useCallback, useMemo, lazy, Suspense, memo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, ChevronDown, CreditCard, FileText, TrendingDown, CheckCircle, Users } from 'lucide-react';
import api from '../services/api';
import { useBudget } from '../context/BudgetContext';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import CurrencyDisplay from '../components/CurrencyDisplay';
import DebtInterestPanel from '../components/DebtInterestPanel';
import { formatLabel } from '../utils/formatLabel';
import { formatFriendlyDate } from '../utils/formatDate';
import { getCategoryColor } from '../utils/categoryColors';
const Bills = lazy(() => import('./Bills'));
const Debts = lazy(() => import('./Debts'));
import {
  Badge,
  Button,
  Card,
  FilterChips,
  IconStat,
  PageHeader,
  cn,
} from '../components/ui';

const BASE_TABS = [
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
  const { activeBudget, budgetVersion } = useBudget();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = BASE_TABS.find((t) => t.key === tabParam)?.key || 'all';

  const [bills, setBills] = useState([]);
  const [debts, setDebts] = useState([]);

  const tabsWithCounts = useMemo(
    () => BASE_TABS.map((tab) => ({
      ...tab,
      count: tab.key === 'all'
        ? bills.length + debts.length
        : tab.key === 'bills'
          ? bills.length
          : debts.length,
    })),
    [bills.length, debts.length],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [addType, setAddType] = useState(null);

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

  const combinedItems = useMemo(() => {
    const billItems = bills.map((b) => ({
      ...b,
      _type: 'bill',
      _sortDate: b.next_due_date || (b.due_day ? `2099-01-${String(b.due_day).padStart(2, '0')}` : '2099-12-31'),
    }));
    const debtItems = debts.map((d) => ({
      ...d,
      _type: 'debt',
      _sortDate: d.next_due_date || (d.due_day ? `2099-01-${String(d.due_day).padStart(2, '0')}` : '2099-12-31'),
    }));
    return [...billItems, ...debtItems].sort(
      (a, b) => new Date(a._sortDate) - new Date(b._sortDate),
    );
  }, [bills, debts]);

  const totalBillsAmount = bills
    .filter((b) => b.is_user_responsible !== false)
    .reduce((sum, b) => sum + (Number(b.user_share ?? b.amount) || 0), 0);
  const activeDebts = debts.filter((d) => Number(d.balance) > 0);
  const totalDebtAmount = activeDebts.reduce((sum, d) => sum + (Number(d.balance) || 0), 0);

  useEffect(() => {
    if (!showAddMenu) return;
    const handler = () => setShowAddMenu(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showAddMenu]);

  if (activeTab === 'all' && loading) return <LoadingSpinner />;

  return (
    <div className="page-container min-w-0 space-y-6">
      <PageHeader
        title="Bills & Debts"
        description="Manage your bills and debts in one place"
        actions={
          <div className="relative w-full sm:w-auto">
            <Button
              variant="accent"
              onClick={(e) => {
                e.stopPropagation();
                setShowAddMenu(!showAddMenu);
              }}
              className="w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              Add
              <ChevronDown className="h-3 w-3" />
            </Button>
            {showAddMenu && (
              <Card className="absolute left-0 right-0 z-50 mt-2 overflow-hidden py-1 sm:left-auto sm:w-44">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMenu(false);
                    setAddType('bill');
                    setTab('bills');
                  }}
                  className="flex min-h-[44px] w-full items-center gap-2 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-surface-subtle"
                >
                  <FileText className="h-4 w-4 text-accent-600" />
                  Add Bill
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMenu(false);
                    setAddType('debt');
                    setTab('debts');
                  }}
                  className="flex min-h-[44px] w-full items-center gap-2 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-surface-subtle"
                >
                  <CreditCard className="h-4 w-4 text-debt-600" />
                  Add Debt
                </button>
              </Card>
            )}
          </div>
        }
      />

      <FilterChips
        options={tabsWithCounts}
        value={activeTab}
        onChange={setTab}
        aria-label="Bills and debts views"
      />

      {error && activeTab === 'all' && (
        <Card className="border-danger-200 bg-danger-50 p-3 text-sm text-danger-700" role="alert">
          {error}
        </Card>
      )}

      {activeTab === 'all' && (
        <AllTabContent
          bills={bills}
          debts={debts}
          combinedItems={combinedItems}
          totalBillsAmount={totalBillsAmount}
          totalDebtAmount={totalDebtAmount}
        />
      )}

      {activeTab === 'bills' && (
        <Suspense fallback={<LoadingSpinner label="Loading bills" />}>
          <Bills autoOpenAdd={addType === 'bill'} onClearAutoOpen={() => setAddType(null)} embedded />
        </Suspense>
      )}

      {activeTab === 'debts' && (
        <Suspense fallback={<LoadingSpinner label="Loading debts" />}>
          <Debts autoOpenAdd={addType === 'debt'} onClearAutoOpen={() => setAddType(null)} embedded />
        </Suspense>
      )}
    </div>
  );
}

function AllTabContent({ bills, debts, combinedItems, totalBillsAmount, totalDebtAmount }) {
  return (
    <div className="min-w-0 space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-3">
            <IconStat icon={FileText} tone="accent" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
            <p className="text-caption font-semibold uppercase tracking-wide text-muted">Total bills</p>
          </div>
          <CurrencyDisplay amount={totalBillsAmount} className="text-money block" />
          <p className="text-caption mt-2">
            {bills.length} bill{bills.length !== 1 ? 's' : ''} this budget
          </p>
        </Card>
        <Card className="p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-3">
            <IconStat icon={CreditCard} tone="debt" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
            <p className="text-caption font-semibold uppercase tracking-wide text-muted">Total debt</p>
          </div>
          <CurrencyDisplay amount={totalDebtAmount} className="text-money block" />
          <p className="text-caption mt-2">
            {debts.length} active debt{debts.length !== 1 ? 's' : ''}
          </p>
        </Card>
      </div>

      {combinedItems.length === 0 ? (
        <Card>
          <EmptyState
            title="No bills or debts yet"
            message="Add a bill or debt to see everything in one place."
          />
        </Card>
      ) : (
        <div>
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-title">All items</h2>
            <span className="text-caption">{combinedItems.length} total</span>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 [content-visibility:auto]">
            {combinedItems.map((item) => (
              <CombinedCard key={`${item._type}-${item.id}`} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const CombinedCard = memo(function CombinedCard({ item }) {
  const isBill = item._type === 'bill';
  const isPaid = isBill ? item.is_paid : item.is_paid_this_period;

  const displayAmount = isBill
    ? (item.payment_mode === 'split' && item.is_household_bill ? (item.user_share ?? item.amount) : item.amount)
    : item.balance;

  const catColor = isBill
    ? getCategoryColor(item.category)
    : getCategoryColor(item.type === 'credit_card' ? 'debt' : item.type);

  const typeLabel = isBill ? item.category : formatLabel(item.type || 'debt');
  const TypeIcon = isBill ? FileText : TrendingDown;
  const iconTone = isBill ? 'accent' : 'debt';

  return (
    <Card className={cn('overflow-hidden transition-shadow hover:shadow-[var(--shadow-card-hover)]', isPaid && 'opacity-80')}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <IconStat icon={TypeIcon} tone={iconTone} className="rounded-xl p-3" iconClassName="h-5 w-5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3
                className={cn(
                  'text-base font-semibold truncate',
                  isPaid ? 'text-muted line-through' : 'text-foreground',
                )}
              >
                {item.name || 'Untitled'}
              </h3>
              <Badge variant={isBill ? 'info' : 'debt'} className="shrink-0 normal-case">
                {isBill ? 'Bill' : 'Debt'}
              </Badge>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {isPaid && (
                <Badge variant="success" className="normal-case gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Paid
                </Badge>
              )}
              {item.is_household_bill && (
                <Badge variant="info" className="normal-case gap-1">
                  <Users className="h-3 w-3" />
                  Shared
                </Badge>
              )}
              {(isBill ? item.payment_mode === 'split' : item.is_split) && (
                <Badge variant="purple" className="normal-case">
                  Split
                </Badge>
              )}
              {typeLabel && (
                <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', catColor)}>
                  {isBill ? typeLabel : formatLabel(typeLabel)}
                </span>
              )}
              {item.auto_pay && (
                <Badge variant="success" className="normal-case">
                  Auto-pay
                </Badge>
              )}
            </div>

            <div className="mt-4">
              <p className="text-caption font-medium text-muted">{isBill ? 'Amount' : 'Balance'}</p>
              <CurrencyDisplay
                amount={displayAmount}
                className={cn('text-money mt-0.5 block', isPaid && 'text-muted line-through')}
              />
              {isBill && item.payment_mode === 'split' && item.is_household_bill && (
                <span className="mt-0.5 block text-sm text-accent-600">
                  Your share: {fmtCurrency(item.user_share ?? item.amount)}
                </span>
              )}
            </div>

            {!isBill && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-caption">
                  <span className="font-medium text-muted">Payoff progress</span>
                  <span className="font-semibold text-brand-600">
                    {(item.percent_paid ?? 0) >= 100 ? 'Paid off!' : `${item.percent_paid ?? 0}%`}
                  </span>
                </div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-subtle ring-1 ring-border/50">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-500"
                    style={{ width: `${Math.min(item.percent_paid ?? 0, 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-surface-subtle/80 px-2.5 py-2 text-caption">
              <span>
                Due{' '}
                {item.next_due_date
                  ? formatFriendlyDate(item.next_due_date)
                  : item.due_day
                    ? `day ${item.due_day}`
                    : '--'}
              </span>
              {isBill && item.frequency && (
                <>
                  <span className="text-muted">·</span>
                  <span className="capitalize">{formatLabel(item.frequency)}</span>
                </>
              )}
              {!isBill && item.minimum_payment && (
                <>
                  <span className="text-muted">·</span>
                  <span>Min {fmtCurrency(item.minimum_payment)}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {!isBill && (
        <DebtInterestPanel
          balance={item.balance}
          apr={item.apr}
          minimumPayment={item.minimum_payment}
        />
      )}
    </Card>
  );
});
