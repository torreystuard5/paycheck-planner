import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Edit, Trash2, CreditCard, TrendingDown, Shield, DollarSign, Upload, ChevronDown, ChevronUp, AlertCircle, CheckCircle, Users } from 'lucide-react';
import SortDropdown from '../components/SortDropdown';
import ImportExportButton from '../components/ImportExportButton';
import { formatDistanceToNow } from 'date-fns';
import { formatFriendlyDate } from '../utils/formatDate';
import { getCategoryColor } from '../utils/categoryColors';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import CurrencyDisplay from '../components/CurrencyDisplay';
import usePolling from '../hooks/usePolling';

const TABS = ['Overview', 'Payoff Strategy', 'Credit Cards'];
const DEBT_TYPES = ['credit_card', 'student_loan', 'auto_loan', 'mortgage', 'personal_loan', 'other'];

const defaultForm = {
  name: '',
  type: 'credit_card',
  balance: '',
  credit_limit: '',
  apr: '',
  minimum_payment: '',
  due_day: '',
  auto_pay: false,
  reminder_days: 3,
  is_split: false,
  split_members: [],
};

const fmtCurrency = (val) => {
  const n = Number(val);
  const v = isNaN(n) ? 0 : n;
  return `$${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

export default function Debts() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('Overview');
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showModal, setShowModal] = useState(false);
  const [editingDebt, setEditingDebt] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [strategies, setStrategies] = useState(null);
  const [extraPayment, setExtraPayment] = useState('');
  const [simulation, setSimulation] = useState(null);
  const [interestProjection, setInterestProjection] = useState([]);
  const [creditData, setCreditData] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [householdMembers, setHouseholdMembers] = useState([]);
  const [markingPaid, setMarkingPaid] = useState({});
  const [payTarget, setPayTarget] = useState(null);   // debt to pay
  const [payAmount, setPayAmount] = useState('');       // editable amount
  const [payError, setPayError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchDebts(true);
  }, [sortBy, sortOrder]);

  useEffect(() => {
    if (user?.household_id) {
      api.get('/api/v1/households/me')
        .then((res) => setHouseholdMembers(res.data.members || []))
        .catch(() => setHouseholdMembers([]));
    }
  }, [user?.household_id]);

  const pollDebts = useCallback(async () => {
    try {
      const res = await api.get(`/api/v1/debts?sort_by=${sortBy}&sort_order=${sortOrder}`);
      setDebts(Array.isArray(res.data) ? res.data : []);
      setLastUpdated(new Date());
    } catch {
      // silent poll
    }
  }, [sortBy, sortOrder]);

  usePolling(pollDebts, 30000, !!user?.household_id);

  useEffect(() => {
    if (activeTab === 'Payoff Strategy') fetchPayoffData();
    if (activeTab === 'Credit Cards') fetchCreditData();
  }, [activeTab]);

  const fetchDebts = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/v1/debts?sort_by=${sortBy}&sort_order=${sortOrder}`);
      setDebts(Array.isArray(res.data) ? res.data : []);
    } catch {
      setError('Failed to load debts.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchPayoffData = async () => {
    setTabLoading(true);
    try {
      const [stratRes, projRes] = await Promise.allSettled([
        api.post('/api/v1/debts/compare-strategies', { extra_payment: 0 }),
        api.get('/api/v1/debts/interest-projection'),
      ]);
      if (stratRes.status === 'fulfilled') setStrategies(stratRes.value.data);
      if (projRes.status === 'fulfilled') setInterestProjection(Array.isArray(projRes.value.data) ? projRes.value.data : []);
    } catch {
      setError('Failed to load payoff data.');
    } finally {
      setTabLoading(false);
    }
  };

  const fetchCreditData = async () => {
    setTabLoading(true);
    try {
      const [creditRes, recRes] = await Promise.allSettled([
        api.get('/api/v1/debts/credit-efficiency'),
        api.post('/api/v1/debts/credit-efficiency/recommend', { available_amount: 100 }),
      ]);
      if (creditRes.status === 'fulfilled') setCreditData(creditRes.value.data);
      if (recRes.status === 'fulfilled') setRecommendations(Array.isArray(recRes.value.data) ? recRes.value.data : recRes.value.data?.recommendations || []);
    } catch {
      setError('Failed to load credit data.');
    } finally {
      setTabLoading(false);
    }
  };

  const simulateExtra = async () => {
    if (!extraPayment) return;
    try {
      const res = await api.post('/api/v1/debts/simulate-extra', { extra_amounts: [0, parseFloat(extraPayment)] });
      setSimulation(res.data);
    } catch {
      setError('Failed to simulate extra payments.');
    }
  };

  const openAdd = () => {
    setEditingDebt(null);
    setForm(defaultForm);
    setShowModal(true);
  };

  const openEdit = (debt) => {
    setEditingDebt(debt);
    setForm({
      name: debt.name || '',
      type: debt.type || 'credit_card',
      balance: debt.balance || '',
      credit_limit: debt.credit_limit || '',
      apr: debt.apr || '',
      minimum_payment: debt.minimum_payment || '',
      due_day: debt.due_day || '',
      auto_pay: debt.auto_pay ?? false,
      reminder_days: debt.reminder_days ?? 3,
      is_split: debt.is_split ?? false,
      split_members: debt.split_members || [],
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name || null,
        type: form.type || 'other',
        balance: form.balance ? parseFloat(form.balance) : null,
        credit_limit: form.credit_limit ? parseFloat(form.credit_limit) : null,
        apr: form.apr ? parseFloat(form.apr) : null,
        minimum_payment: form.minimum_payment ? parseFloat(form.minimum_payment) : null,
        due_day: form.due_day ? parseInt(form.due_day, 10) : null,
        auto_pay: form.auto_pay,
        reminder_days: parseInt(form.reminder_days, 10) || 3,
        is_split: form.is_split,
        split_members: form.is_split ? form.split_members : [],
      };
      if (editingDebt) {
        await api.put(`/api/v1/debts/${editingDebt.id}`, payload);
      } else {
        await api.post('/api/v1/debts', payload);
      }
      setShowModal(false);
      fetchDebts();
    } catch {
      setError('Failed to save debt.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/v1/debts/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchDebts();
    } catch {
      setError('Failed to delete debt.');
    }
  };

  const openPayModal = (debt) => {
    setPayTarget(debt);
    setPayAmount(debt.minimum_payment ? String(Number(debt.minimum_payment)) : '');
    setPayError(null);
  };

  const confirmPayment = async () => {
    if (!payTarget) return;
    const num = Number(payAmount);
    if (!payAmount || isNaN(num) || num <= 0) {
      setPayError('Enter an amount greater than $0.');
      return;
    }
    const bal = Number(payTarget.balance) || 0;
    if (bal > 0 && num > bal) {
      setPayError(`Amount cannot exceed the balance of $${bal.toFixed(2)}.`);
      return;
    }
    const debtId = payTarget.id;
    setPayTarget(null);
    setMarkingPaid((prev) => ({ ...prev, [debtId]: true }));
    try {
      const res = await api.post(`/api/v1/debts/${debtId}/mark-paid`, { amount: num });
      setDebts((prev) => prev.map((d) => (d.id === debtId ? res.data : d)));
    } catch (err) {
      if (err?.response?.status === 409) {
        fetchDebts();
      } else {
        setError('Failed to mark debt as paid.');
      }
    } finally {
      setMarkingPaid((prev) => ({ ...prev, [debtId]: false }));
    }
  };

  const handleUnmarkPaid = async (debtId) => {
    setMarkingPaid((prev) => ({ ...prev, [debtId]: true }));
    try {
      const res = await api.delete(`/api/v1/debts/${debtId}/unmark-paid`);
      setDebts((prev) => prev.map((d) => (d.id === debtId ? res.data : d)));
    } catch {
      setError('Failed to undo payment.');
    } finally {
      setMarkingPaid((prev) => ({ ...prev, [debtId]: false }));
    }
  };

  const handleExport = async () => {
    try {
      const response = await api.get('/api/v1/export/debts?format=csv', {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'debts_export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Export failed. Please try again.');
    }
  };

  const handleImport = async (file) => {
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await api.post('/api/v1/import/debts', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(response.data);
      if (response.data.imported_count > 0) {
        fetchDebts();
      }
    } catch {
      setImportResult({ imported_count: 0, error_count: 1, errors: ['Import failed. Please check your CSV file format.'] });
    } finally {
      setImporting(false);
    }
  };

  const toggleSplitMember = (memberId) => {
    setForm((prev) => {
      const members = prev.split_members || [];
      if (members.includes(memberId)) {
        return { ...prev, split_members: members.filter(id => id !== memberId) };
      } else {
        return { ...prev, split_members: [...members, memberId] };
      }
    });
  };

  const totalDebt = debts.reduce((sum, d) => sum + (Number(d.balance) || 0), 0);
  const totalMinPayment = debts.reduce((sum, d) => sum + (Number(d.minimum_payment) || 0), 0);

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

  if (loading) return <LoadingSpinner />;

  const getUtilizationRating = (pct) => {
    const val = Number(pct) || 0;
    if (val < 10) return { label: 'Excellent', bg: 'bg-green-100', text: 'text-green-700', bar: 'bg-green-500', ring: 'text-green-500' };
    if (val < 30) return { label: 'Good', bg: 'bg-blue-100', text: 'text-blue-700', bar: 'bg-blue-500', ring: 'text-blue-500' };
    if (val < 50) return { label: 'Fair', bg: 'bg-yellow-100', text: 'text-yellow-700', bar: 'bg-yellow-500', ring: 'text-yellow-500' };
    if (val < 75) return { label: 'Poor', bg: 'bg-orange-100', text: 'text-orange-700', bar: 'bg-orange-500', ring: 'text-orange-500' };
    return { label: 'Critical', bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-500', ring: 'text-red-500' };
  };

  const getUtilBarColor = (pct) => {
    const val = Number(pct) || 0;
    if (val < 30) return 'bg-green-500';
    if (val <= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const renderDebtCard = (debt) => {
    const isExpanded = expandedId === debt.id;
    const isSplit = debt.is_split;
    const splitCount = (debt.split_members?.length || 0) + 1;
    const yourShare = isSplit && debt.balance ? (Number(debt.balance) / splitCount) : null;
    const catColor = getCategoryColor(debt.type === 'credit_card' ? 'debt' : debt.type);

    return (
      <div key={debt.id} className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4">
          {/* Line 1: Name + actions */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-gray-900 truncate">{debt.name}</h3>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => openEdit(debt)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                <Edit className="w-4 h-4" />
              </button>
              <button onClick={() => setDeleteTarget(debt)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setExpandedId(isExpanded ? null : debt.id)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Line 2: Badges */}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {debt.is_paid_this_period && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                <CheckCircle className="w-3 h-3" /> Paid
              </span>
            )}
            {debt.is_household_bill && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
                <Users className="w-3 h-3" /> Shared
              </span>
            )}
            {isSplit && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-600">
                Split
              </span>
            )}
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${catColor}`}>
              {debt.type?.replace(/_/g, ' ') || 'Debt'}
            </span>
            {debt.auto_pay && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                Auto-pay
              </span>
            )}
          </div>

          {/* Line 3: Balance */}
          <div className="mt-2">
            <CurrencyDisplay amount={debt.balance} className="text-lg font-bold text-gray-900" />
            {yourShare != null && (
              <span className="block text-sm text-blue-600 mt-0.5">Your Share: {fmtCurrency(yourShare)}</span>
            )}
          </div>

          {/* Line 4: Due info */}
          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm text-gray-500">
            <span>Due {debt.next_due_date ? formatFriendlyDate(debt.next_due_date) : (debt.due_day ? `day ${debt.due_day}` : '--')}</span>
            {debt.apr && (
              <>
                <span className="text-gray-300">·</span>
                <span>{debt.apr}% APR</span>
              </>
            )}
            {debt.minimum_payment && (
              <>
                <span className="text-gray-300">·</span>
                <span>Min: {fmtCurrency(debt.minimum_payment)}</span>
              </>
            )}
          </div>

          {/* Mark Paid / Undo */}
          <div className="mt-3">
            {debt.is_paid_this_period ? (
              <button
                onClick={() => handleUnmarkPaid(debt.id)}
                disabled={!!markingPaid[debt.id]}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                {markingPaid[debt.id] ? 'Undoing…' : 'Paid ✓'}
                {!markingPaid[debt.id] && <span className="text-xs text-green-500 ml-1">Undo</span>}
              </button>
            ) : (
              <button
                onClick={() => openPayModal(debt)}
                disabled={!!markingPaid[debt.id]}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <DollarSign className="w-4 h-4" />
                {markingPaid[debt.id] ? 'Marking…' : 'Mark Paid'}
              </button>
            )}
          </div>
        </div>

        {/* Expanded section */}
        <div
          className="overflow-hidden transition-all duration-300 ease-in-out"
          style={{ maxHeight: isExpanded ? '300px' : '0px', opacity: isExpanded ? 1 : 0 }}
        >
          <div className="px-4 pb-4">
            <div className="border-t border-gray-200 pt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Balance</span>
                <CurrencyDisplay amount={debt.balance} className="font-medium text-gray-900" />
              </div>
              {debt.credit_limit && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Credit Limit</span>
                  <CurrencyDisplay amount={debt.credit_limit} className="font-medium text-gray-900" />
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">APR</span>
                <span className="font-medium text-gray-900">{debt.apr ? `${debt.apr}%` : '--'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Minimum Payment</span>
                <CurrencyDisplay amount={debt.minimum_payment} className="font-medium text-gray-900" />
              </div>
              {isSplit && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Your Share</span>
                  <span className="font-medium text-purple-600">{fmtCurrency(yourShare)}</span>
                </div>
              )}
              {debt.created_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Added</span>
                  <span className="text-gray-700">{formatFriendlyDate(debt.created_at)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Debts</h1>
            <p className="text-sm text-gray-600 mt-1">Track and pay down your debts</p>
            {lastUpdated && user?.household_id && (
              <p className="text-xs text-gray-400 mt-0.5">Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}</p>
            )}
          </div>
          {activeTab === 'Overview' && (
            <div className="flex flex-wrap items-center gap-2">
              <SortDropdown
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortChange={(sb, so) => { setSortBy(sb); setSortOrder(so); }}
                options={[
                  { value: 'name', label: 'Name' },
                  { value: 'balance', label: 'Balance' },
                  { value: 'minimum_payment', label: 'Minimum Payment' },
                  { value: 'interest_rate', label: 'Interest Rate' },
                  { value: 'due_date', label: 'Due Date' },
                  { value: 'created_at', label: 'Date Added' },
                ]}
              />
              <ImportExportButton
                onExport={handleExport}
                onImport={() => { setShowImportModal(true); setImportResult(null); }}
              />
              <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors">
                <Plus className="h-4 w-4" />
                Add Debt
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'Overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <p className="text-sm text-gray-600">Total Debt</p>
              <CurrencyDisplay amount={totalDebt} className="text-2xl font-bold text-gray-900 mt-1 block" />
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <p className="text-sm text-gray-600">Total Min Payments</p>
              <CurrencyDisplay amount={totalMinPayment} className="text-2xl font-bold text-gray-900 mt-1 block" />
            </div>
          </div>

          {debts.length === 0 ? (
            <EmptyState icon={CreditCard} title="No Debts Found" message="Add a debt to start tracking your payoff progress." actionLabel="Add Debt" onAction={openAdd} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {debts.map(renderDebtCard)}
            </div>
          )}
        </div>
      )}

      {activeTab === 'Payoff Strategy' && (
        <div className="space-y-6">
          {tabLoading ? <LoadingSpinner /> : (
            <>
              {strategies && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingDown className="w-5 h-5 text-blue-500" />
                      <h3 className="font-semibold text-gray-900">Snowball Method</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">Pay smallest balances first for quick wins</p>
                    {strategies.snowball && (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Total Interest</span>
                          <CurrencyDisplay amount={strategies.snowball.total_interest_paid} className="font-medium text-gray-900" />
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Months to Payoff</span>
                          <span className="font-medium text-gray-900">{strategies.snowball.months_to_payoff || '--'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Total Paid</span>
                          <CurrencyDisplay amount={strategies.snowball.total_amount_paid} className="font-medium text-gray-900" />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <DollarSign className="w-5 h-5 text-green-500" />
                      <h3 className="font-semibold text-gray-900">Avalanche Method</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">Pay highest interest first to save money</p>
                    {strategies.avalanche && (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Total Interest</span>
                          <CurrencyDisplay amount={strategies.avalanche.total_interest_paid} className="font-medium text-gray-900" />
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Months to Payoff</span>
                          <span className="font-medium text-gray-900">{strategies.avalanche.months_to_payoff || '--'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Total Paid</span>
                          <CurrencyDisplay amount={strategies.avalanche.total_amount_paid} className="font-medium text-gray-900" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Simulate Extra Payments</h3>
                <div className="flex gap-3 mb-4">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Extra monthly amount"
                    value={extraPayment}
                    onChange={(e) => setExtraPayment(e.target.value)}
                    className={`${inputClass} max-w-xs`}
                  />
                  <button onClick={simulateExtra} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                    Simulate
                  </button>
                </div>
                {Array.isArray(simulation) && simulation.length > 0 && (
                  <div className="space-y-3">
                    {simulation.map((sim, idx) => (
                      <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                        <div className="bg-green-50 rounded-lg p-4">
                          <p className="text-gray-600">Extra: <CurrencyDisplay amount={sim.extra_amount} className="font-medium" /></p>
                          <CurrencyDisplay amount={sim.interest_saved_vs_minimum} className="text-lg font-bold text-green-600 block mt-1" />
                          <p className="text-xs text-gray-500">Interest saved</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-4">
                          <p className="text-gray-600">Months to Payoff</p>
                          <p className="text-lg font-bold text-blue-600 mt-1">{sim.months_to_payoff || '--'}</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-4">
                          <p className="text-gray-600">Total Interest</p>
                          <CurrencyDisplay amount={sim.total_interest} className="text-lg font-bold text-purple-600 block mt-1" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {interestProjection.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Interest Projection</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={interestProjection}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value) => { const n = Number(value); return [`$${(isFinite(n) ? n : 0).toFixed(2)}`, '']; }} />
                      <Area type="monotone" dataKey="total_remaining_balance" stroke="#3b82f6" fill="#93c5fd" fillOpacity={0.3} name="Balance" />
                      <Area type="monotone" dataKey="cumulative_interest" stroke="#ef4444" fill="#fca5a5" fillOpacity={0.3} name="Interest" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {!strategies && interestProjection.length === 0 && (
                <EmptyState icon={TrendingDown} title="No Strategy Data" message="Add debts to compare payoff strategies." />
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'Credit Cards' && (
        <div className="space-y-6">
          {tabLoading ? <LoadingSpinner /> : (
            <>
              {creditData ? (() => {
                const rating = getUtilizationRating(creditData.overall_utilization_pct);
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex flex-col items-center">
                      <h3 className="font-semibold text-gray-900 mb-4">Credit Utilization</h3>
                      <div className="relative w-36 h-36 mb-4">
                        <svg className="w-full h-full" viewBox="0 0 36 36">
                          <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                          <path
                            d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeDasharray={`${Math.min(Number(creditData.overall_utilization_pct || 0), 100)}, 100`}
                            className={rating.ring}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className={`text-3xl font-bold ${rating.ring}`}>{creditData.overall_utilization_pct != null ? `${creditData.overall_utilization_pct}%` : '--'}</span>
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-gray-500 mb-1">Utilization Rating</p>
                        <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${rating.bg} ${rating.text}`}>{rating.label}</span>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                      <h3 className="font-semibold text-gray-900 mb-4">Details</h3>
                      <div className="space-y-4">
                        {creditData.overall_utilization_pct != null && (
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-gray-600">Credit Utilization</span>
                              <span className="font-medium text-gray-900">{(isFinite(Number(creditData.overall_utilization_pct)) ? Number(creditData.overall_utilization_pct) : 0).toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                              <div className={`h-2.5 rounded-full ${rating.bar}`} style={{ width: `${Math.min(Number(creditData.overall_utilization_pct), 100)}%` }} />
                            </div>
                          </div>
                        )}
                        {creditData.total_limit != null && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Total Credit Limit</span>
                            <CurrencyDisplay amount={creditData.total_limit} className="font-medium text-gray-900" />
                          </div>
                        )}
                        {creditData.total_balance != null && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Total Balance</span>
                            <CurrencyDisplay amount={creditData.total_balance} className="font-medium text-gray-900" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <EmptyState icon={Shield} title="No Credit Data" message="Add debts to see your credit card utilization." />
              )}

              {Array.isArray(recommendations) && recommendations.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-500" />
                    Recommendations
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[...recommendations]
                      .sort((a, b) => (Number(b.current_utilization || b.utilization_pct || 0)) - (Number(a.current_utilization || a.utilization_pct || 0)))
                      .map((rec, idx) => {
                        if (typeof rec === 'string') {
                          return (
                            <div key={idx} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                              <p className="text-sm text-gray-700">{rec}</p>
                            </div>
                          );
                        }
                        const cardName = rec.card_name || rec.name || rec.debt_name || `Card ${idx + 1}`;
                        const currentUtil = Number(rec.current_utilization || rec.utilization_pct || 0);
                        const projectedUtil = Number(rec.projected_utilization || rec.projected_pct || 0);
                        const suggestion = rec.suggestion || rec.message || rec.recommendation || '';
                        const currentUtilPct = currentUtil > 1 ? currentUtil : currentUtil * 100;
                        const projectedUtilPct = projectedUtil > 1 ? projectedUtil : projectedUtil * 100;
                        return (
                          <div key={idx} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3">
                            <h4 className="font-semibold text-gray-900">{cardName}</h4>
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-600">Current Utilization</span>
                                <span className="font-medium text-gray-900">{currentUtilPct.toFixed(1)}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div className={`h-2 rounded-full ${getUtilBarColor(currentUtilPct)}`} style={{ width: `${Math.min(currentUtilPct, 100)}%` }} />
                              </div>
                            </div>
                            {projectedUtilPct > 0 && (
                              <div>
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="text-gray-600">Projected Utilization</span>
                                  <span className="font-medium text-gray-900">{projectedUtilPct.toFixed(1)}%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div className={`h-2 rounded-full ${getUtilBarColor(projectedUtilPct)}`} style={{ width: `${Math.min(projectedUtilPct, 100)}%` }} />
                                </div>
                              </div>
                            )}
                            {suggestion && (
                              <div className="bg-blue-50 rounded-lg p-2.5">
                                <p className="text-sm text-blue-700">{suggestion}</p>
                              </div>
                            )}
                          </div>
                        );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingDebt ? 'Edit Debt' : 'Add Debt'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputClass}>
                {DEBT_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Balance</label>
              <input type="number" step="0.01" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Credit Limit</label>
              <input type="number" step="0.01" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} className={inputClass} placeholder="Optional" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">APR (%)</label>
              <input type="number" step="0.01" value={form.apr} onChange={(e) => setForm({ ...form, apr: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Payment</label>
              <input type="number" step="0.01" value={form.minimum_payment} onChange={(e) => setForm({ ...form, minimum_payment: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Day</label>
              <input type="number" min="1" max="31" value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reminder Days Before</label>
              <input type="number" min="0" max="30" value={form.reminder_days} onChange={(e) => setForm({ ...form, reminder_days: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="auto_pay" checked={form.auto_pay} onChange={(e) => setForm({ ...form, auto_pay: e.target.checked })} className="rounded border-gray-300" />
            <label htmlFor="auto_pay" className="text-sm text-gray-700">Auto-pay enabled</label>
          </div>

          {/* Split toggle */}
          {householdMembers.length > 1 && (
            <div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, is_split: !form.is_split })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_split ? 'bg-purple-600' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.is_split ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm text-gray-700">Split this debt</span>
              </div>

              {form.is_split && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-gray-500">Select members to split with:</p>
                  {householdMembers
                    .filter(m => m.id !== user?.id)
                    .map((m) => (
                      <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.split_members.includes(m.id)}
                          onChange={() => toggleSplitMember(m.id)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">{m.first_name} {m.last_name}</span>
                      </label>
                    ))}
                  {form.balance && form.split_members.length > 0 && (
                    <div className="mt-2 p-3 bg-purple-50 rounded-lg">
                      <p className="text-xs text-purple-700 font-medium mb-1">Split Preview</p>
                      <p className="text-sm text-purple-900">
                        {fmtCurrency(parseFloat(form.balance) / (form.split_members.length + 1))} per person ({form.split_members.length + 1} people)
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : editingDebt ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showImportModal} onClose={() => setShowImportModal(false)} title="Import Debts from CSV">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Upload a CSV file with columns: name, type, balance, credit_limit, apr, minimum_payment, due_day
          </p>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Click to select a .csv file</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
                e.target.value = '';
              }}
            />
          </div>

          {importing && (
            <div className="text-sm text-gray-600 text-center">Importing...</div>
          )}

          {importResult && (
            <div className="space-y-2">
              {importResult.imported_count > 0 && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  {importResult.imported_count} debt{importResult.imported_count !== 1 ? 's' : ''} imported successfully
                </div>
              )}
              {importResult.error_count > 0 && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {importResult.error_count} error{importResult.error_count !== 1 ? 's' : ''}
                  </div>
                  <ul className="ml-6 list-disc space-y-1 mt-2">
                    {importResult.errors?.map((err, i) => (
                      <li key={i} className="text-xs">{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => setShowImportModal(false)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* Payment Amount Modal */}
      <Modal isOpen={!!payTarget} onClose={() => setPayTarget(null)} title="Record Payment">
        {payTarget && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              How much are you paying toward <span className="font-semibold text-gray-900">{payTarget.name}</span>?
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  max={Number(payTarget.balance) || undefined}
                  value={payAmount}
                  onChange={(e) => { setPayAmount(e.target.value); setPayError(null); }}
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:outline-none text-sm"
                  placeholder="0.00"
                />
              </div>
              {payTarget.minimum_payment && (
                <p className="text-xs text-gray-500 mt-1">Minimum payment: {fmtCurrency(payTarget.minimum_payment)}</p>
              )}
              {payTarget.balance && (
                <p className="text-xs text-gray-500 mt-0.5">Current balance: {fmtCurrency(payTarget.balance)}</p>
              )}
            </div>
            {payError && (
              <p className="text-sm text-red-600">{payError}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setPayTarget(null)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmPayment}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
              >
                Confirm Payment
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Debt"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        danger
      />
    </div>
  );
}
