import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Edit, Trash2, Search, FileText, Download, Upload, ChevronDown, X, AlertCircle, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import CurrencyDisplay from '../components/CurrencyDisplay';
import usePolling from '../hooks/usePolling';

const CATEGORIES = ['Housing', 'Utilities', 'Insurance', 'Transportation', 'Subscriptions', 'Food', 'Healthcare', 'Other'];
const FREQUENCIES = ['monthly', 'weekly', 'biweekly', 'semi_monthly', 'quarterly', 'annual'];

const defaultForm = {
  name: '',
  amount: '',
  due_day: '',
  category: 'Other',
  frequency: 'monthly',
  auto_pay: false,
  reminder_days: 3,
};

export default function Bills() {
  const { user } = useAuth();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
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
  const exportRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchBills(true);
  }, []);

  const pollBills = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/bills');
      setBills(Array.isArray(res.data) ? res.data : []);
      setLastUpdated(new Date());
    } catch {
      // silent poll failure
    }
  }, []);

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

  const fetchBills = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/v1/bills');
      setBills(Array.isArray(res.data) ? res.data : []);
    } catch {
      setError('Failed to load bills.');
    } finally {
      if (showLoading) setLoading(false);
    }
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
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        amount: parseFloat(form.amount),
        due_day: parseInt(form.due_day, 10),
        category: form.category || null,
        frequency: form.frequency,
        auto_pay: form.auto_pay,
        reminder_days: parseInt(form.reminder_days, 10) || 3,
      };
      if (editingBill) {
        await api.put(`/api/v1/bills/${editingBill.id}`, payload);
      } else {
        await api.post('/api/v1/bills', payload);
      }
      setShowModal(false);
      fetchBills();
    } catch {
      setError('Failed to save bill.');
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
    } catch {
      setError('Failed to delete bill.');
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

  const filtered = bills.filter((b) => {
    const matchSearch = !search || b.name?.toLowerCase().includes(search.toLowerCase());
    const matchCategory = !filterCategory || b.category === filterCategory;
    return matchSearch && matchCategory;
  });

  if (loading) return <LoadingSpinner />;

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

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
            <div key={bill.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{bill.name}</h3>
                  <p className="text-sm text-gray-500">{bill.category || 'Uncategorized'}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(bill)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteTarget(bill)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <CurrencyDisplay amount={bill.amount} className="text-xl font-bold text-gray-900 block mb-2" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Due day {bill.due_day || '--'}</span>
                {bill.auto_pay && <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Auto-pay</span>}
              </div>
              <p className="text-xs text-gray-400 mt-2 capitalize">{bill.frequency || 'monthly'}</p>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingBill ? 'Edit Bill' : 'Add Bill'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Day</label>
              <input type="number" min="1" max="31" required value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className={inputClass}>
                {FREQUENCIES.map((f) => <option key={f} value={f} className="capitalize">{f.replace(/_/g, ' ')}</option>)}
              </select>
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
              {saving ? 'Saving...' : editingBill ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

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
