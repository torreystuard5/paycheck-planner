import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Filter, Receipt, Download, ChevronDown, Trash2 } from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { formatFriendlyDate } from '../utils/formatDate';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useBudget } from '../context/BudgetContext';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import CurrencyDisplay from '../components/CurrencyDisplay';
import DateInput from '../components/DateInput';
import usePolling from '../hooks/usePolling';

// Payment form uses backend fields: bill_id/debt_id (UUID), amount, paid_date, pay_period_date, is_extra

export default function Payments() {
  const { user } = useAuth();
  const { activeBudget, budgetVersion } = useBudget();
  const [payments, setPayments] = useState([]);
  const [bills, setBills] = useState([]);
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    bill_id: '',
    debt_id: '',
    amount: '',
    paid_date: new Date().toISOString().split('T')[0],
    pay_period_date: new Date().toISOString().split('T')[0],
    is_extra: false,
  });
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const exportRef = useRef(null);

  useEffect(() => {
    fetchAll(true);
  }, [budgetVersion]);

  const pollPayments = useCallback(async () => {
    const bq = activeBudget?.id ? `?budget_id=${activeBudget.id}` : '';
    try {
      const [paymentsRes, billsRes, debtsRes] = await Promise.allSettled([
        api.get(`/api/v1/payments${bq}`),
        api.get(`/api/v1/bills${bq}`),
        api.get(`/api/v1/debts${bq}`),
      ]);
      if (paymentsRes.status === 'fulfilled') setPayments(Array.isArray(paymentsRes.value.data) ? paymentsRes.value.data : []);
      if (billsRes.status === 'fulfilled') setBills(Array.isArray(billsRes.value.data) ? billsRes.value.data : []);
      if (debtsRes.status === 'fulfilled') setDebts(Array.isArray(debtsRes.value.data) ? debtsRes.value.data : []);
      setLastUpdated(new Date());
    } catch {
      // silent poll
    }
  }, [activeBudget?.id]);

  usePolling(pollPayments, 30000, !!user?.household_id);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchAll = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    const bq = activeBudget?.id ? `?budget_id=${activeBudget.id}` : '';
    try {
      const [paymentsRes, billsRes, debtsRes] = await Promise.allSettled([
        api.get(`/api/v1/payments${bq}`),
        api.get(`/api/v1/bills${bq}`),
        api.get(`/api/v1/debts${bq}`),
      ]);
      if (paymentsRes.status === 'fulfilled') setPayments(Array.isArray(paymentsRes.value.data) ? paymentsRes.value.data : []);
      if (billsRes.status === 'fulfilled') setBills(Array.isArray(billsRes.value.data) ? billsRes.value.data : []);
      if (debtsRes.status === 'fulfilled') setDebts(Array.isArray(debtsRes.value.data) ? debtsRes.value.data : []);
    } catch {
      setError('Failed to load payment data.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleFilter = async () => {
    setLoading(true);
    try {
      let url = '/api/v1/payments';
      const params = [];
      if (startDate) params.push(`start_date=${startDate}`);
      if (endDate) params.push(`end_date=${endDate}`);
      if (params.length) url += `?${params.join('&')}`;
      const res = await api.get(url);
      setPayments(Array.isArray(res.data) ? res.data : []);
    } catch {
      setError('Failed to filter payments.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        amount: form.amount ? parseFloat(form.amount) : null,
        paid_date: form.paid_date || null,
        pay_period_date: form.pay_period_date || null,
        is_extra: form.is_extra,
      };
      if (form.bill_id) payload.bill_id = form.bill_id;
      if (form.debt_id) payload.debt_id = form.debt_id;
      await api.post('/api/v1/payments', payload);
      setShowModal(false);
      setForm({
        bill_id: '',
        debt_id: '',
        amount: '',
        paid_date: new Date().toISOString().split('T')[0],
        pay_period_date: new Date().toISOString().split('T')[0],
        is_extra: false,
      });
      fetchAll();
    } catch {
      setError('Failed to record payment.');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async (exportFormat = 'excel') => {
    setShowExportMenu(false);
    try {
      let url = `/api/v1/export/payments?format=${exportFormat}`;
      if (startDate) url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;
      const response = await api.get(url, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', `payments_export.${exportFormat === 'excel' ? 'xlsx' : 'csv'}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      setError('Export failed. Please try again.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/v1/payments/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchAll();
    } catch {
      setError('Failed to delete payment.');
    } finally {
      setDeleting(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment History</h1>
          <p className="text-sm text-gray-600 mt-1">View and manage your payments</p>
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
              <div className="absolute right-0 mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <button onClick={() => handleExport('excel')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg">
                  Excel (.xlsx)
                </button>
                <button onClick={() => handleExport('csv')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg">
                  CSV (.csv)
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors">
            <Plus className="h-4 w-4" />
            Record Payment
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <DateInput
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
          aria-label="Start date"
        />
        <span className="text-sm text-gray-400">to</span>
        <DateInput
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
          aria-label="End date"
        />
        <button onClick={handleFilter} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors">
          <Filter className="h-4 w-4" />
          Filter
        </button>
      </div>

      {payments.length === 0 ? (
        <EmptyState icon={Receipt} title="No Payments Found" message="Record a payment to start tracking your payment history." actionLabel="Record Payment" onAction={() => setShowModal(true)} />
      ) : (
        <>
          {/* Mobile card layout */}
          <div className="sm:hidden space-y-3">
            {payments.map((payment) => {
              const billName = payment.bill_id ? bills.find(b => b.id === payment.bill_id)?.name : null;
              const debtName = payment.debt_id ? debts.find(d => d.id === payment.debt_id)?.name : null;
              const isDerived = !payment.pay_period_date && !!payment.derived_pay_period_date;
              const payPeriodDisplay = payment.pay_period_date
                ? formatFriendlyDate(payment.pay_period_date)
                : payment.derived_pay_period_date
                  ? formatFriendlyDate(payment.derived_pay_period_date)
                  : null;
              return (
                <div key={payment.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">
                      {payment.paid_date ? formatFriendlyDate(payment.paid_date) : '--'}
                    </span>
                    <CurrencyDisplay amount={payment.amount} className="font-semibold text-gray-900" />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {payment.bill_id && <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Bill</span>}
                    {payment.debt_id && <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">Debt</span>}
                    <span className="text-sm text-gray-700 truncate">{billName || debtName || 'Payment'}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    {payPeriodDisplay && (
                      <span className={isDerived ? 'italic' : ''}>
                        Period: {payPeriodDisplay}{isDerived ? ' (est.)' : ''}
                      </span>
                    )}
                    {!payPeriodDisplay && <span>Period: —</span>}
                    {payment.is_extra
                      ? <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">Extra</span>
                      : <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">Regular</span>}
                    {payment.auto_logged ? (
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
                        {payment.source === 'dashboard' ? 'Dashboard' : payment.source === 'bills_page' ? 'Bills' : payment.source === 'debts_page' ? 'Debts' : payment.source === 'calendar' ? 'Calendar' : 'Auto'}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-gray-50 text-gray-400 rounded-full">Manual</span>
                    )}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => setDeleteTarget({ ...payment, _billName: billName, _debtName: debtName })}
                      className="flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      aria-label="Delete payment"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table layout */}
          <div className="hidden sm:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-6 py-3 text-gray-600 font-medium">Paid Date</th>
                    <th className="text-left px-6 py-3 text-gray-600 font-medium">Pay Period</th>
                    <th className="text-left px-6 py-3 text-gray-600 font-medium">For</th>
                    <th className="text-right px-6 py-3 text-gray-600 font-medium">Amount</th>
                    <th className="text-left px-6 py-3 text-gray-600 font-medium">Type</th>
                    <th className="text-left px-6 py-3 text-gray-600 font-medium">Source</th>
                    <th className="px-6 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => {
                    const billName = payment.bill_id ? bills.find(b => b.id === payment.bill_id)?.name : null;
                    const debtName = payment.debt_id ? debts.find(d => d.id === payment.debt_id)?.name : null;
                    const isDerived = !payment.pay_period_date && !!payment.derived_pay_period_date;
                    const payPeriodDisplay = payment.pay_period_date
                      ? formatFriendlyDate(payment.pay_period_date)
                      : payment.derived_pay_period_date
                        ? formatFriendlyDate(payment.derived_pay_period_date)
                        : '—';
                    return (
                      <tr key={payment.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-6 py-4 text-gray-900">
                          {payment.paid_date ? formatFriendlyDate(payment.paid_date) : '--'}
                        </td>
                        <td className={`px-6 py-4 ${isDerived ? 'italic text-gray-400' : 'text-gray-600'}`}>
                          {payPeriodDisplay}{isDerived ? ' (est.)' : ''}
                        </td>
                        <td className="px-6 py-4 text-gray-700 max-w-[200px] truncate">
                          {billName || debtName || 'Payment'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <CurrencyDisplay amount={payment.amount} className="font-medium text-gray-900" />
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {payment.is_extra ? <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">Extra</span> : <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">Regular</span>}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {payment.auto_logged ? (
                            <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
                              {payment.source === 'dashboard' ? 'Dashboard' : payment.source === 'bills_page' ? 'Bills' : payment.source === 'debts_page' ? 'Debts' : payment.source === 'calendar' ? 'Calendar' : 'Auto'}
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 bg-gray-50 text-gray-400 rounded-full">Manual</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => setDeleteTarget({ ...payment, _billName: billName, _debtName: debtName })}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            aria-label="Delete payment"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Payment">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Are you sure you want to delete this payment? This action cannot be undone.
          </p>
          {deleteTarget && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <p><span className="font-medium text-gray-600">For:</span> {deleteTarget._billName || deleteTarget._debtName || 'Payment'}</p>
              <p><span className="font-medium text-gray-600">Amount:</span> <CurrencyDisplay amount={deleteTarget.amount} /></p>
              <p><span className="font-medium text-gray-600">Paid:</span> {deleteTarget.paid_date ? formatFriendlyDate(deleteTarget.paid_date) : '--'}</p>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
              {deleting ? 'Deleting...' : 'Delete Payment'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Record Payment">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pay For</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Bill</label>
                <select
                  value={form.bill_id}
                  onChange={(e) => setForm({ ...form, bill_id: e.target.value, debt_id: '' })}
                  className={inputClass}
                >
                  <option value="">None</option>
                  {bills.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Debt</label>
                <select
                  value={form.debt_id}
                  onChange={(e) => setForm({ ...form, debt_id: e.target.value, bill_id: '' })}
                  className={inputClass}
                >
                  <option value="">None</option>
                  {debts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Paid Date</label>
              <DateInput value={form.paid_date} onChange={(e) => setForm({ ...form, paid_date: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pay Period Date</label>
              <DateInput value={form.pay_period_date} onChange={(e) => setForm({ ...form, pay_period_date: e.target.value })} className={inputClass} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="is_extra" checked={form.is_extra} onChange={(e) => setForm({ ...form, is_extra: e.target.checked })} className="rounded border-gray-300" />
              <label htmlFor="is_extra" className="text-sm text-gray-700">Extra Payment</label>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
