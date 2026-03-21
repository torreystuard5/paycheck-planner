import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Filter, Receipt, Download, ChevronDown } from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import CurrencyDisplay from '../components/CurrencyDisplay';
import usePolling from '../hooks/usePolling';

// Payment form uses backend fields: bill_id/debt_id (UUID), amount, paid_date, pay_period_date, is_extra

export default function Payments() {
  const { user } = useAuth();
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
  const exportRef = useRef(null);

  useEffect(() => {
    fetchAll(true);
  }, []);

  const pollPayments = useCallback(async () => {
    try {
      const [paymentsRes, billsRes, debtsRes] = await Promise.allSettled([
        api.get('/api/v1/payments'),
        api.get('/api/v1/bills'),
        api.get('/api/v1/debts'),
      ]);
      if (paymentsRes.status === 'fulfilled') setPayments(Array.isArray(paymentsRes.value.data) ? paymentsRes.value.data : []);
      if (billsRes.status === 'fulfilled') setBills(Array.isArray(billsRes.value.data) ? billsRes.value.data : []);
      if (debtsRes.status === 'fulfilled') setDebts(Array.isArray(debtsRes.value.data) ? debtsRes.value.data : []);
      setLastUpdated(new Date());
    } catch {
      // silent poll
    }
  }, []);

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
    try {
      const [paymentsRes, billsRes, debtsRes] = await Promise.allSettled([
        api.get('/api/v1/payments'),
        api.get('/api/v1/bills'),
        api.get('/api/v1/debts'),
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
        amount: parseFloat(form.amount),
        paid_date: form.paid_date,
        pay_period_date: form.pay_period_date,
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
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
          aria-label="Start date"
        />
        <span className="text-sm text-gray-400">to</span>
        <input
          type="date"
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
        <EmptyState icon={Receipt} title="No payments found" message="Record a payment to start tracking your payment history." actionLabel="Record Payment" onAction={() => setShowModal(true)} />
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-3 text-gray-600 font-medium">Paid Date</th>
                  <th className="text-left px-6 py-3 text-gray-600 font-medium">Pay Period</th>
                  <th className="text-left px-6 py-3 text-gray-600 font-medium">For</th>
                  <th className="text-right px-6 py-3 text-gray-600 font-medium">Amount</th>
                  <th className="text-left px-6 py-3 text-gray-600 font-medium">Type</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => {
                  const billName = payment.bill_id ? bills.find(b => b.id === payment.bill_id)?.name : null;
                  const debtName = payment.debt_id ? debts.find(d => d.id === payment.debt_id)?.name : null;
                  return (
                    <tr key={payment.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-900">
                        {payment.paid_date ? format(parseISO(payment.paid_date), 'MMM d, yyyy') : '--'}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {payment.pay_period_date ? format(parseISO(payment.pay_period_date), 'MMM d, yyyy') : '--'}
                      </td>
                      <td className="px-6 py-4 text-gray-700">
                        {billName || debtName || 'Payment'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <CurrencyDisplay amount={payment.amount} className="font-medium text-gray-900" />
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {payment.is_extra ? <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">Extra</span> : <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">Regular</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
              <input type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Paid Date</label>
              <input type="date" required value={form.paid_date} onChange={(e) => setForm({ ...form, paid_date: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pay Period Date</label>
              <input type="date" required value={form.pay_period_date} onChange={(e) => setForm({ ...form, pay_period_date: e.target.value })} className={inputClass} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="is_extra" checked={form.is_extra} onChange={(e) => setForm({ ...form, is_extra: e.target.checked })} className="rounded border-gray-300" />
              <label htmlFor="is_extra" className="text-sm text-gray-700">Extra payment</label>
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
