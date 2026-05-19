import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Plus,
  Download,
  Pencil,
  Trash2,
  Search,
  ArrowUpDown,
  DollarSign,
  TrendingUp,
  Hash,
  Tag,
} from 'lucide-react';
import api from '../services/api';
import { useBudget } from '../context/BudgetContext';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import ProFeatureGate from '../components/ProFeatureGate';

const TAX_CATEGORIES = [
  'Medical',
  'Charitable',
  'Business',
  'Education',
  'Home Office',
  'State/Local Taxes',
  'Other',
];

const CATEGORY_COLORS = {
  'Medical': 'bg-red-100 text-red-700 border-red-200',
  'Charitable': 'bg-pink-100 text-pink-700 border-pink-200',
  'Business': 'bg-blue-100 text-blue-700 border-blue-200',
  'Education': 'bg-purple-100 text-purple-700 border-purple-200',
  'Home Office': 'bg-amber-100 text-amber-700 border-amber-200',
  'State/Local Taxes': 'bg-teal-100 text-teal-700 border-teal-200',
  'Other': 'bg-gray-100 text-gray-700 border-gray-200',
};

const fmtCurrency = (val) => {
  const n = Number(val);
  return `$${(isNaN(n) ? 0 : n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

const defaultForm = {
  name: '',
  amount: '',
  category: 'Other',
  date: new Date().toISOString().split('T')[0],
  tax_year: new Date().getFullYear(),
  receipt_note: '',
};

// ── Category bar chart ──
function CategoryBars({ byCategory, total }) {
  const entries = Object.entries(byCategory).sort(([, a], [, b]) => Number(b) - Number(a));
  if (entries.length === 0) return null;

  const max = Math.max(...entries.map(([, v]) => Number(v)));

  return (
    <div className="space-y-2">
      {entries.map(([cat, amt]) => {
        const pct = max > 0 ? (Number(amt) / max) * 100 : 0;
        const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS['Other'];
        return (
          <div key={cat} className="flex items-center gap-3">
            <span className="text-xs text-gray-600 w-28 shrink-0 text-right truncate">{cat}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
              <div
                className={`h-full rounded-full ${color.split(' ')[0]} transition-all duration-500`}
                style={{ width: `${pct}%`, minWidth: pct > 0 ? '8px' : '0' }}
              />
            </div>
            <span className="text-xs font-semibold text-gray-700 w-20 shrink-0">{fmtCurrency(amt)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ──
export default function TaxPrep() {
  const { activeBudget, budgetVersion } = useBudget();
  const toast = useToast();
  const currentYear = new Date().getFullYear();

  const [taxYear, setTaxYear] = useState(currentYear);
  const [deductions, setDeductions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filters & sort
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ ...defaultForm, tax_year: currentYear });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { tax_year: taxYear };
      if (activeBudget?.id) params.budget_id = activeBudget.id;
      const [deductionsRes, summaryRes] = await Promise.all([
        api.get('/api/v1/tax/deductions', { params }),
        api.get('/api/v1/tax/summary', { params }),
      ]);
      setDeductions(deductionsRes.data);
      setSummary(summaryRes.data);
    } catch {
      toast('Failed to load deductions');
      setDeductions([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [taxYear, activeBudget?.id]);

  useEffect(() => { fetchData(); }, [fetchData, budgetVersion]);

  // Year options
  const yearOptions = [];
  for (let y = currentYear; y >= currentYear - 5; y--) yearOptions.push(y);

  // Open add modal
  const openAdd = () => {
    setEditingItem(null);
    setForm({ ...defaultForm, tax_year: taxYear });
    setShowModal(true);
  };

  // Open edit modal
  const openEdit = (item) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      amount: String(item.amount),
      category: item.category,
      date: item.date,
      tax_year: item.tax_year,
      receipt_note: item.receipt_note || '',
    });
    setShowModal(true);
  };

  // Save (create or update)
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        amount: parseFloat(form.amount),
        category: form.category,
        date: form.date,
        tax_year: parseInt(form.tax_year, 10),
        receipt_note: form.receipt_note || null,
      };
      if (editingItem) {
        await api.put(`/api/v1/tax/deductions/${editingItem.id}`, payload);
        toast('Deduction updated');
      } else {
        await api.post('/api/v1/tax/deductions', payload);
        toast('Deduction added');
      }
      setShowModal(false);
      fetchData();
    } catch {
      toast('Failed to save deduction');
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/v1/tax/deductions/${deleteTarget.id}`);
      toast('Deduction deleted');
      setDeleteTarget(null);
      fetchData();
    } catch {
      toast('Failed to delete');
    }
  };

  // Export CSV
  const handleExport = async () => {
    try {
      const params = { tax_year: taxYear };
      if (activeBudget?.id) params.budget_id = activeBudget.id;
      const res = await api.get('/api/v1/tax/export', {
        params,
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `paydrift-tax-deductions-${taxYear}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast('CSV downloaded');
    } catch {
      toast('Failed to export');
    }
  };

  // Filter & sort
  const filtered = deductions
    .filter((d) => {
      if (filterCategory && d.category !== filterCategory) return false;
      if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') cmp = a.date.localeCompare(b.date);
      else if (sortBy === 'amount') cmp = Number(a.amount) - Number(b.amount);
      else cmp = a.name.localeCompare(b.name);
      return sortOrder === 'asc' ? cmp : -cmp;
    });

  const toggleSort = (field) => {
    if (sortBy === field) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(field); setSortOrder('desc'); }
  };

  // Top category
  const topCategory = summary?.by_category
    ? Object.entries(summary.by_category).sort(([, a], [, b]) => Number(b) - Number(a))[0]
    : null;

  return (
    <ProFeatureGate featureKey="tax_prep">
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <FileText className="h-7 w-7 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Tax Prep</h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={taxYear}
            onChange={(e) => setTaxYear(parseInt(e.target.value, 10))}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Deduction</span>
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-gray-400" />
                <p className="text-xs text-gray-500">Total Deductions</p>
              </div>
              <p className="text-lg font-bold text-gray-900">{fmtCurrency(summary?.total_deductions || 0)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Hash className="h-4 w-4 text-gray-400" />
                <p className="text-xs text-gray-500">Entries</p>
              </div>
              <p className="text-lg font-bold text-gray-900">{summary?.deduction_count || 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Tag className="h-4 w-4 text-gray-400" />
                <p className="text-xs text-gray-500">Top Category</p>
              </div>
              <p className="text-sm font-bold text-gray-900 truncate">
                {topCategory ? topCategory[0] : '—'}
              </p>
              {topCategory && (
                <p className="text-xs text-gray-400">{fmtCurrency(topCategory[1])}</p>
              )}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-gray-400" />
                <p className="text-xs text-gray-500">Avg / Month</p>
              </div>
              <p className="text-lg font-bold text-gray-900">
                {summary?.monthly_breakdown?.length
                  ? fmtCurrency(Number(summary.total_deductions) / summary.monthly_breakdown.length)
                  : '$0.00'}
              </p>
            </div>
          </div>

          {/* Category breakdown */}
          {summary?.by_category && Object.keys(summary.by_category).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">By Category</h3>
              <CategoryBars byCategory={summary.by_category} total={summary.total_deductions} />
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search deductions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">All Categories</option>
              {TAX_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => toggleSort('date')}
                  >
                    <span className="flex items-center gap-1">Date <ArrowUpDown className="h-3 w-3" /></span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Category</th>
                  <th
                    className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => toggleSort('amount')}
                  >
                    <span className="flex items-center justify-end gap-1">Amount <ArrowUpDown className="h-3 w-3" /></span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Notes</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm text-gray-500">No deductions for {taxYear}</p>
                      <button onClick={openAdd} className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
                        <Plus className="h-4 w-4" />Add your first deduction
                      </button>
                    </td>
                  </tr>
                ) : (
                  filtered.map((d) => {
                    const catColor = CATEGORY_COLORS[d.category] || CATEGORY_COLORS['Other'];
                    return (
                      <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                          {new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.name}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${catColor}`}>
                            {d.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{fmtCurrency(d.amount)}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate">{d.receipt_note || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(d)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => setDeleteTarget(d)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No deductions for {taxYear}</p>
                <button onClick={openAdd} className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
                  <Plus className="h-4 w-4" />Add your first deduction
                </button>
              </div>
            ) : (
              filtered.map((d) => {
                const catColor = CATEGORY_COLORS[d.category] || CATEGORY_COLORS['Other'];
                return (
                  <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{d.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${catColor}`}>
                            {d.category}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        {d.receipt_note && (
                          <p className="text-xs text-gray-400 mt-1 truncate">{d.receipt_note}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-gray-900">{fmtCurrency(d.amount)}</p>
                        <div className="flex items-center gap-1 mt-1 justify-end">
                          <button onClick={() => openEdit(d)} className="p-2 text-gray-400 hover:text-blue-600 min-w-[44px] min-h-[44px] flex items-center justify-center">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => setDeleteTarget(d)} className="p-2 text-gray-400 hover:text-red-600 min-w-[44px] min-h-[44px] flex items-center justify-center">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Add / Edit modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingItem ? 'Edit Deduction' : 'Add Deduction'}>
        <form onSubmit={handleSave} className="space-y-4 px-6 pb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              required
              maxLength={255}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass}
              placeholder="e.g. Medical copay, Home office internet"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className={inputClass}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={inputClass}
              >
                {TAX_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tax Year</label>
              <select
                value={form.tax_year}
                onChange={(e) => setForm({ ...form, tax_year: parseInt(e.target.value, 10) })}
                className={inputClass}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={form.receipt_note}
              onChange={(e) => setForm({ ...form, receipt_note: e.target.value })}
              className={inputClass}
              placeholder="Receipt reference, description, etc."
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : editingItem ? 'Update' : 'Add'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Deduction"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        danger
      />
    </div>
    </ProFeatureGate>
  );
}
