import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Edit, Trash2, Search, FileText, Download, Upload, ChevronDown, X, AlertCircle, CheckCircle, Undo2, Users, DollarSign } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import CurrencyDisplay from '../components/CurrencyDisplay';
import DateInput from '../components/DateInput';
import usePolling from '../hooks/usePolling';

const CATEGORIES = ['Housing', 'Utilities', 'Insurance', 'Transportation', 'Subscriptions', 'Food', 'Healthcare', 'Other'];
const FREQUENCIES = [
  { value: 'one_time', label: 'One-time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'semi_monthly', label: 'Semi-monthly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const defaultForm = {
  name: '',
  amount: '',
  due_day: '',
  category: 'Other',
  frequency: 'monthly',
  auto_pay: false,
  reminder_days: 3,
  payment_mode: 'single',
  assigned_member_id: '',
  day_of_week: '',
  start_date: '',
};

const fmtCurrency = (val) => {
  const n = Number(val);
  const v = isNaN(n) ? 0 : n;
  return `$${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

const freqLabel = (freq) => {
  const f = FREQUENCIES.find(x => x.value === freq);
  return f ? f.label : (freq || 'Monthly');
};

export default function Bills() {
  const { user } = useAuth();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [payForm, setPayForm] = useState({ paid_amount: '', paid_date: '' });
  const [paying, setPaying] = useState(false);
  const exportRef = useRef(null);
  const fileInputRef = useRef(null);

  // Breakdown state
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [breakdownBill, setBreakdownBill] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownError, setBreakdownError] = useState(null);

  // Member payment state
  const [showMemberPayModal, setShowMemberPayModal] = useState(false);
  const [memberPayForm, setMemberPayForm] = useState({ member_id: '', amount_paid: '', paid_at: '' });
  const [memberPaying, setMemberPaying] = useState(false);
  const [householdMembers, setHouseholdMembers] = useState([]);

  useEffect(() => {
    fetchBills(true);
  }, [statusFilter]);

  const pollBills = useCallback(async () => {
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const res = await api.get(`/api/v1/bills${params}`);
      setBills(Array.isArray(res.data) ? res.data : []);
      setLastUpdated(new Date());
    } catch {
      // silent poll failure
    }
  }, [statusFilter]);

  usePolling(pollBills, 30000, !!user?.household_id);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch household members when user is in a household
  useEffect(() => {
    if (user?.household_id) {
      api.get('/api/v1/households/me')
        .then((res) => setHouseholdMembers(res.data.members || []))
        .catch(() => setHouseholdMembers([]));
    }
  }, [user?.household_id]);

  const fetchBills = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const res = await api.get(`/api/v1/bills${params}`);
      setBills(Array.isArray(res.data) ? res.data : []);
    } catch {
      setError('Failed to load bills.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const openAdd = () => {
    setEditingBill(null);
    setForm(defaultForm);
    setShowModal(true);
  };

  const openEdit = (bill) => {
    setEditingBill(bill);
    setForm({
      name: bill.name || '',
      amount: bill.amount || '',
      due_day: bill.due_day || '',
      category: bill.category || 'Other',
      frequency: bill.frequency || 'monthly',
      auto_pay: bill.auto_pay ?? false,
      reminder_days: bill.reminder_days ?? 3,
      payment_mode: bill.payment_mode || 'single',
      assigned_member_id: bill.assigned_member_id || '',
      day_of_week: bill.day_of_week != null ? String(bill.day_of_week) : '',
      start_date: bill.start_date || '',
    });
    setShowModal(true);
  };

  const openPayModal = (bill) => {
    setPayTarget(bill);
    const displayAmount = bill.payment_mode === 'split' && bill.is_household_bill
      ? Number(bill.user_share ?? bill.amount)
      : Number(bill.amount);
    setPayForm({
      paid_amount: String(displayAmount || ''),
      paid_date: format(new Date(), 'yyyy-MM-dd'),
    });
    setShowPayModal(true);
  };

  const handlePay = async (e) => {
    e.preventDefault();
    if (!payTarget) return;
    setPaying(true);
    try {
      const payload = {};
      if (payForm.paid_amount) payload.paid_amount = parseFloat(payForm.paid_amount);
      if (payForm.paid_date) payload.paid_date = new Date(payForm.paid_date).toISOString();
      await api.patch(`/api/v1/bills/${payTarget.id}/pay`, payload);
      setShowPayModal(false);
      setPayTarget(null);
      fetchBills();
      showSuccess('Bill marked as paid!');
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail ? `Failed to mark bill as paid: ${detail}` : 'Failed to mark bill as paid.');
    } finally {
      setPaying(false);
    }
  };

  const handleUnpay = async (bill) => {
    try {
      await api.patch(`/api/v1/bills/${bill.id}/unpay`);
      fetchBills();
      showSuccess('Bill marked as unpaid.');
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail ? `Failed to undo payment: ${detail}` : 'Failed to undo payment.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name || null,
        amount: form.amount ? parseFloat(form.amount) : null,
        due_day: form.due_day ? parseInt(form.due_day, 10) : null,
        category: form.category || null,
        frequency: form.frequency || 'monthly',
        auto_pay: form.auto_pay,
        reminder_days: parseInt(form.reminder_days, 10) || 3,
        payment_mode: form.payment_mode || 'single',
        assigned_member_id: form.assigned_member_id || null,
        day_of_week: form.day_of_week !== '' ? parseInt(form.day_of_week, 10) : null,
        start_date: form.start_date || null,
      };
      if (editingBill) {
        await api.put(`/api/v1/bills/${editingBill.id}`, payload);
      } else {
        await api.post('/api/v1/bills', payload);
      }
      setShowModal(false);
      fetchBills();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail ? `Failed to save bill: ${detail}` : 'Failed to save bill.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/v1/bills/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchBills();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail ? `Failed to delete bill: ${detail}` : 'Failed to delete bill.');
    }
  };

  const handleExport = async (format = 'excel') => {
    setShowExportMenu(false);
    try {
      const response = await api.get(`/api/v1/export/bills?format=${format}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `bills_export.${format === 'excel' ? 'xlsx' : 'csv'}`);
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
      const response = await api.post('/api/v1/import/bills', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(response.data);
      if (response.data.imported_count > 0) {
        fetchBills();
      }
    } catch {
      setImportResult({ imported_count: 0, error_count: 1, errors: ['Import failed. Please check your CSV file format.'] });
    } finally {
      setImporting(false);
    }
  };

  // Breakdown functions
  const openBreakdown = async (bill) => {
    setBreakdownBill(bill);
    setBreakdown(null);
    setBreakdownError(null);
    setBreakdownLoading(true);
    setShowBreakdownModal(true);
    try {
      const res = await api.get(`/api/v1/bills/${bill.id}/breakdown`);
      setBreakdown(res.data);
    } catch {
      setBreakdownError('Failed to load bill breakdown.');
    } finally {
      setBreakdownLoading(false);
    }
  };

  const openMemberPayModal = () => {
    setMemberPayForm({
      member_id: user?.id || '',
      amount_paid: '',
      paid_at: format(new Date(), 'yyyy-MM-dd'),
    });
    setShowMemberPayModal(true);
  };

  const handleMemberPayment = async (e) => {
    e.preventDefault();
    if (!breakdownBill) return;
    setMemberPaying(true);
    try {
      const payload = {
        member_id: memberPayForm.member_id || undefined,
        amount_paid: parseFloat(memberPayForm.amount_paid),
      };
      if (memberPayForm.paid_at) {
        payload.paid_at = new Date(memberPayForm.paid_at).toISOString();
      }
      const res = await api.post(`/api/v1/bills/${breakdownBill.id}/member-payment`, payload);
      setBreakdown(res.data);
      setShowMemberPayModal(false);
      showSuccess('Payment recorded!');
      fetchBills();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail ? `Failed to record member payment: ${detail}` : 'Failed to record member payment.');
    } finally {
      setMemberPaying(false);
    }
  };

  // Pre-fill member payment amount with remaining balance
  const handleMemberSelect = (memberId) => {
    setMemberPayForm((prev) => {
      const member = breakdown?.members?.find((m) => m.member_id === memberId);
      const remaining = member ? Number(member.balance) : 0;
      return {
        ...prev,
        member_id: memberId,
        amount_paid: remaining > 0 ? remaining.toFixed(2) : prev.amount_paid,
      };
    });
  };

  const filtered = bills.filter((b) => {
    if (b.is_user_responsible === false) return false;
    const matchSearch = !search || b.name?.toLowerCase().includes(search.toLowerCase());
    const matchCategory = !filterCategory || b.category === filterCategory;
    return matchSearch && matchCategory;
  });

  if (loading) return <LoadingSpinner />;

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';
  const statusTabs = [
    { label: 'All', value: '' },
    { label: 'Unpaid', value: 'unpaid' },
    { label: 'Paid', value: 'paid' },
  ];

  const showPaymentModeToggle = householdMembers.length > 1;
  const needsDayOfWeek = form.frequency === 'weekly' || form.frequency === 'biweekly';

  // Compute member share preview for split mode
  const memberSharePreview = () => {
    if (form.payment_mode !== 'split' || !form.amount || householdMembers.length === 0) return null;
    const share = (parseFloat(form.amount) / householdMembers.length).toFixed(2);
    return share;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bills</h1>
          <p className="text-sm text-gray-600 mt-1">Manage your recurring bills</p>
          {lastUpdated && user?.household_id && (
            <p className="text-xs text-gray-400 mt-0.5">Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}</p>
          )}
        </div>
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
            Add Bill
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              statusFilter === tab.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search bills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FileText} title="No bills found" message="Add a bill to get started tracking your expenses." actionLabel="Add Bill" onAction={openAdd} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((bill) => (
            <div key={bill.id} className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${bill.is_paid ? 'opacity-80' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={`font-semibold text-gray-900 ${bill.is_paid ? 'line-through text-gray-500' : ''}`}>{bill.name || 'Untitled'}</h3>
                    {bill.is_household_bill && (
                      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full">
                        <Users className="w-3 h-3" />
                        Shared
                      </span>
                    )}
                    {bill.payment_mode === 'split' && (
                      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded-full">
                        Split
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{bill.category || 'Uncategorized'}</p>
                  {bill.assigned_member_name && (
                    <p className="text-xs text-blue-600">Assigned to {bill.assigned_member_name}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  {bill.is_household_bill && (
                    <button onClick={() => openBreakdown(bill)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors" title="View split breakdown">
                      <DollarSign className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => openEdit(bill)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteTarget(bill)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="mb-2">
                <CurrencyDisplay amount={bill.payment_mode === 'split' && bill.is_household_bill ? (bill.user_share ?? bill.amount) : bill.amount} className="text-xl font-bold text-gray-900" />
                {bill.payment_mode === 'split' && bill.is_household_bill && (
                  <span className="text-xs text-purple-600 ml-1.5">(your share)</span>
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  {(bill.frequency === 'weekly' || bill.frequency === 'biweekly') && bill.day_of_week != null
                    ? `Every ${bill.frequency === 'biweekly' ? 'other ' : ''}${DAY_NAMES[bill.day_of_week]}`
                    : `Due day ${bill.due_day || '--'}`
                  }
                </span>
                {bill.auto_pay && <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Auto-pay</span>}
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-gray-400 capitalize">{freqLabel(bill.frequency)}</p>
                {bill.next_due_date && (
                  <p className="text-xs text-gray-500">Next: {bill.next_due_date}</p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100">
                {bill.is_paid ? (
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Paid {bill.paid_date ? format(new Date(bill.paid_date), 'MMM d') : ''}
                    </span>
                    <button
                      onClick={() => handleUnpay(bill)}
                      className="text-xs text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
                    >
                      <Undo2 className="w-3 h-3" />
                      Undo
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => openPayModal(bill)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Mark as Paid
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pay Bill Modal */}
      <Modal isOpen={showPayModal} onClose={() => { setShowPayModal(false); setPayTarget(null); }} title="Mark as Paid">
        <form onSubmit={handlePay} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Paid Amount</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={payForm.paid_amount}
              onChange={(e) => setPayForm({ ...payForm, paid_amount: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Paid Date</label>
            <DateInput
              value={payForm.paid_date}
              onChange={(e) => setPayForm({ ...payForm, paid_date: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowPayModal(false); setPayTarget(null); }} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={paying} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
              {paying ? 'Saving...' : 'Confirm'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Bill Breakdown Modal */}
      <Modal isOpen={showBreakdownModal} onClose={() => { setShowBreakdownModal(false); setBreakdownBill(null); setBreakdown(null); }} title={`Split Breakdown: ${breakdownBill?.name || ''}`}>
        {breakdownLoading ? (
          <div className="flex justify-center py-8"><LoadingSpinner /></div>
        ) : breakdownError ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{breakdownError}</div>
        ) : breakdown ? (
          <div className="space-y-5">
            {/* Summary bar */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Total</p>
                <p className="text-lg font-bold text-gray-900">{fmtCurrency(breakdown.bill?.amount)}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-xs text-green-600 mb-1">Paid</p>
                <p className="text-lg font-bold text-green-700">{fmtCurrency(breakdown.total_paid)}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-xs text-amber-600 mb-1">Remaining</p>
                <p className="text-lg font-bold text-amber-700">{fmtCurrency(breakdown.total_remaining)}</p>
              </div>
            </div>

            {/* Per-member breakdown */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Per-Member Breakdown</h3>
              <div className="space-y-2">
                {breakdown.members?.map((member) => {
                  const balance = Number(member.balance);
                  const isPaid = balance <= 0;
                  return (
                    <div key={member.member_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium shrink-0">
                          {(member.member_name || '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{member.member_name}</p>
                          <p className="text-xs text-gray-500">
                            Share: {fmtCurrency(member.share)} | Paid: {fmtCurrency(member.paid)}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 ml-3">
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                            <CheckCircle className="w-3 h-3" />
                            Paid
                          </span>
                        ) : (
                          <span className="text-sm font-semibold text-amber-600">
                            {fmtCurrency(balance)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Record Payment button */}
            <button
              onClick={openMemberPayModal}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <DollarSign className="w-4 h-4" />
              Record Payment
            </button>
          </div>
        ) : null}
      </Modal>

      {/* Member Payment Modal */}
      <Modal isOpen={showMemberPayModal} onClose={() => setShowMemberPayModal(false)} title="Record Member Payment">
        <form onSubmit={handleMemberPayment} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Paid By</label>
            <select
              value={memberPayForm.member_id}
              onChange={(e) => handleMemberSelect(e.target.value)}
              className={inputClass}
            >
              <option value="">Select member...</option>
              {householdMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.first_name} {m.last_name} {m.id === user?.id ? '(You)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={memberPayForm.amount_paid}
              onChange={(e) => setMemberPayForm({ ...memberPayForm, amount_paid: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <DateInput
              value={memberPayForm.paid_at}
              onChange={(e) => setMemberPayForm({ ...memberPayForm, paid_at: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowMemberPayModal(false)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={memberPaying} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {memberPaying ? 'Saving...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add/Edit Bill Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingBill ? 'Edit Bill' : 'Add Bill'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className={inputClass}>
                {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>

          {/* Day of week picker for weekly/biweekly */}
          {needsDayOfWeek ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Day of Week</label>
              <div className="flex gap-1">
                {DAY_NAMES.map((day, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setForm({ ...form, day_of_week: String(idx) })}
                    className={`flex-1 px-2 py-2 text-xs font-medium rounded-lg border transition-colors ${
                      form.day_of_week === String(idx)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
              {form.frequency === 'biweekly' && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date (anchor for biweekly cycle)</label>
                  <DateInput
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className={inputClass}
                  />
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Day</label>
              <input type="number" min="1" max="31" value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} className={inputClass} />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Payment mode toggle - only show for multi-member households */}
          {showPaymentModeToggle && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Payment Mode</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, payment_mode: 'single' })}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    form.payment_mode === 'single'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Single Pay
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, payment_mode: 'split' })}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    form.payment_mode === 'split'
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Split Pay
                </button>
              </div>

              {form.payment_mode === 'split' && memberSharePreview() && (
                <div className="mt-2 p-3 bg-purple-50 rounded-lg">
                  <p className="text-xs text-purple-700 font-medium mb-1">Member Share Preview</p>
                  <p className="text-sm text-purple-900">
                    {fmtCurrency(memberSharePreview())} per member ({householdMembers.length} members)
                  </p>
                </div>
              )}

              {form.payment_mode === 'single' && (
                <div className="mt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
                  <select
                    value={form.assigned_member_id}
                    onChange={(e) => setForm({ ...form, assigned_member_id: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Bill owner (default)</option>
                    {householdMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.first_name} {m.last_name} {m.id === user?.id ? '(You)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
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
              {saving ? 'Saving...' : editingBill ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal isOpen={showImportModal} onClose={() => setShowImportModal(false)} title="Import Bills from CSV">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Upload a CSV file with columns: name, amount, due_day, frequency, category, auto_pay
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
                  {importResult.imported_count} bill{importResult.imported_count !== 1 ? 's' : ''} imported successfully
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
        title="Delete Bill"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        danger
      />
    </div>
  );
}
