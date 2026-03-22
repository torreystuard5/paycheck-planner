import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Edit, Trash2, CreditCard, TrendingDown, Shield, DollarSign, Download, Upload, ChevronDown, AlertCircle, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import CurrencyDisplay from '../components/CurrencyDisplay';
import usePolling from '../hooks/usePolling';

const TABS = ['Overview', 'Payoff Strategy', 'Credit Score'];
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
};

export default function Debts() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('Overview');
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const exportRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchDebts(true);
  }, []);

  const pollDebts = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/debts');
      setDebts(Array.isArray(res.data) ? res.data : []);
      setLastUpdated(new Date());
    } catch {
      // silent poll
    }
  }, []);

  usePolling(pollDebts, 30000, !!user?.household_id);

  useEffect(() => {
    if (activeTab === 'Payoff Strategy') fetchPayoffData();
    if (activeTab === 'Credit Score') fetchCreditData();
  }, [activeTab]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchDebts = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/v1/debts');
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

  const handleExport = async (format = 'excel') => {
    setShowExportMenu(false);
    try {
      const response = await api.get(`/api/v1/export/debts?format=${format}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `debts_export.${format === 'excel' ? 'xlsx' : 'csv'}`);
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

  const totalDebt = debts.reduce((sum, d) => sum + (Number(d.balance) || 0), 0);
  const totalMinPayment = debts.reduce((sum, d) => sum + (Number(d.minimum_payment) || 0), 0);

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

  if (loading) return <LoadingSpinner />;

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-amber-500';
    return 'text-red-500';
  };

  const getScoreBg = (score) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Debts</h1>
          <p className="text-sm text-gray-600 mt-1">Track and pay down your debts</p>
          {lastUpdated && user?.household_id && (
            <p className="text-xs text-gray-400 mt-0.5">Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}</p>
          )}
        </div>
        {activeTab === 'Overview' && (
          <div className="flex items-center gap-2">
            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Download className="h-4 w-4" />
                Export
                <ChevronDown className="h-3 w-3" />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                  <button onClick={() => handleExport('excel')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg">
                    Excel (.xlsx)
                  </button>
                  <button onClick={() => handleExport('csv')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg">
                    CSV (.csv)
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => { setShowImportModal(true); setImportResult(null); }}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Upload className="h-4 w-4" />
              Import CSV
            </button>
            <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors">
              <Plus className="h-4 w-4" />
              Add Debt
            </button>
          </div>
        )}
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
              <p className="text-sm text-gray-600">Total Minimum Payments</p>
              <CurrencyDisplay amount={totalMinPayment} className="text-2xl font-bold text-gray-900 mt-1 block" />
            </div>
          </div>

          {debts.length === 0 ? (
            <EmptyState icon={CreditCard} title="No debts found" message="Add a debt to start tracking your payoff progress." actionLabel="Add Debt" onAction={openAdd} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {debts.map((debt) => (
                <div key={debt.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{debt.name}</h3>
                      <p className="text-sm text-gray-500 capitalize">{debt.type?.replace(/_/g, ' ') || 'Debt'}</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(debt)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteTarget(debt)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <CurrencyDisplay amount={debt.balance} className="text-xl font-bold text-gray-900 block mb-3" />
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Min Payment</span>
                      <CurrencyDisplay amount={debt.minimum_payment} className="block font-medium text-gray-900" />
                    </div>
                    <div>
                      <span className="text-gray-500">APR</span>
                      <p className="font-medium text-gray-900">{debt.apr ? `${debt.apr}%` : '--'}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-gray-500">Due day {debt.due_day || '--'}</span>
                    {debt.auto_pay && <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Auto-pay</span>}
                  </div>
                </div>
              ))}
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
                <EmptyState icon={TrendingDown} title="No strategy data" message="Add debts to compare payoff strategies." />
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'Credit Score' && (
        <div className="space-y-6">
          {tabLoading ? <LoadingSpinner /> : (
            <>
              {creditData ? (
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
                          className={getScoreColor(100 - Number(creditData.overall_utilization_pct || 0))}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-3xl font-bold ${getScoreColor(100 - Number(creditData.overall_utilization_pct || 0))}`}>{creditData.overall_utilization_pct != null ? `${creditData.overall_utilization_pct}%` : '--'}</span>
                      </div>
                    </div>
                    {creditData.overall_tier && <span className={`text-sm font-medium capitalize px-3 py-1 rounded-full bg-${creditData.overall_color === 'green' ? 'green' : creditData.overall_color === 'yellow' ? 'amber' : creditData.overall_color === 'orange' ? 'orange' : 'red'}-100 text-${creditData.overall_color === 'green' ? 'green' : creditData.overall_color === 'yellow' ? 'amber' : creditData.overall_color === 'orange' ? 'orange' : 'red'}-700`}>{creditData.overall_tier}</span>}
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
                            <div className={`h-2.5 rounded-full ${getScoreBg(100 - Number(creditData.overall_utilization_pct))}`} style={{ width: `${Math.min(Number(creditData.overall_utilization_pct), 100)}%` }} />
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
              ) : (
                <EmptyState icon={Shield} title="No credit data" message="Add debts to see your credit efficiency score." />
              )}

              {Array.isArray(recommendations) && recommendations.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-500" />
                    Recommendations
                  </h3>
                  <ul className="space-y-3">
                    {recommendations.map((rec, idx) => (
                      <li key={idx} className="flex gap-3 text-sm">
                        <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shrink-0 text-xs font-medium">{idx + 1}</span>
                        <span className="text-gray-700">{typeof rec === 'string' ? rec : rec.message || rec.recommendation || JSON.stringify(rec)}</span>
                      </li>
                    ))}
                  </ul>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Debt Type</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Payment</label>
              <input type="number" step="0.01" value={form.minimum_payment} onChange={(e) => setForm({ ...form, minimum_payment: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Day</label>
              <input type="number" min="1" max="31" value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reminder Days</label>
              <input type="number" min="0" max="30" value={form.reminder_days} onChange={(e) => setForm({ ...form, reminder_days: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="auto_pay" checked={form.auto_pay} onChange={(e) => setForm({ ...form, auto_pay: e.target.checked })} className="rounded border-gray-300" />
            <label htmlFor="auto_pay" className="text-sm text-gray-700">Auto-pay enabled</label>
          </div>
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
