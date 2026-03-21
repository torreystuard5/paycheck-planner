import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Wallet, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import api from '../services/api';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import CurrencyDisplay from '../components/CurrencyDisplay';

const FREQUENCIES = ['weekly', 'biweekly', 'semi_monthly', 'monthly'];

const defaultForm = {
  name: '',
  amount: '',
  frequency: 'biweekly',
  next_pay_date: new Date().toISOString().split('T')[0],
};

export default function Income() {
  const [incomes, setIncomes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingIncome, setEditingIncome] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    fetchIncomes();
  }, []);

  const fetchIncomes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/v1/income');
      setIncomes(Array.isArray(res.data) ? res.data : []);
    } catch {
      setError('Failed to load income sources.');
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setEditingIncome(null);
    setForm(defaultForm);
    setShowModal(true);
  };

  const openEdit = (income) => {
    setEditingIncome(income);
    setForm({
      name: income.name || '',
      amount: income.amount || '',
      frequency: income.frequency || 'biweekly',
      next_pay_date: income.next_pay_date || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        amount: parseFloat(form.amount),
        frequency: form.frequency,
        next_pay_date: form.next_pay_date,
      };
      if (editingIncome) {
        await api.put(`/api/v1/income/${editingIncome.id}`, payload);
      } else {
        await api.post('/api/v1/income', payload);
      }
      setShowModal(false);
      fetchIncomes();
    } catch {
      setError('Failed to save income source.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/v1/income/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchIncomes();
    } catch {
      setError('Failed to delete income source.');
    }
  };

  const totalMonthlyIncome = incomes.reduce((sum, inc) => {
    const amt = Number(inc.amount) || 0;
    switch (inc.frequency) {
      case 'weekly': return sum + amt * 52 / 12;
      case 'biweekly': return sum + amt * 26 / 12;
      case 'semi_monthly': return sum + amt * 2;
      case 'monthly': return sum + amt;
      default: return sum + amt;
    }
  }, 0);

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Income & Paychecks</h1>
          <p className="text-sm text-gray-600 mt-1">Manage your income sources and paychecks</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors">
          <Plus className="h-4 w-4" />
          Add Paycheck
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <p className="text-sm text-gray-600">Estimated Monthly Income</p>
        <CurrencyDisplay amount={totalMonthlyIncome} className="text-2xl font-bold text-green-600 mt-1 block" />
      </div>

      {incomes.length === 0 ? (
        <EmptyState icon={Wallet} title="No income sources" message="Add your first paycheck or income source to get started." actionLabel="Add Paycheck" onAction={openAdd} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {incomes.map((income) => (
            <div key={income.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{income.name}</h3>
                  <p className="text-sm text-gray-500 capitalize">{income.frequency?.replace(/_/g, ' ') || 'Monthly'}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(income)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteTarget(income)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <CurrencyDisplay amount={income.amount} className="text-xl font-bold text-gray-900 block mb-2" />
              <div className="flex items-center gap-1 text-sm text-gray-500">
                <Calendar className="w-4 h-4" />
                <span>Next: {income.next_pay_date ? format(parseISO(income.next_pay_date), 'MMM d, yyyy') : '--'}</span>
              </div>
              {!income.is_active && (
                <span className="inline-block mt-2 text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Inactive</span>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingIncome ? 'Edit Paycheck' : 'Add Paycheck'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="e.g. Main Job, Side Gig" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input type="number" step="0.01" min="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className={inputClass}>
                {FREQUENCIES.map((f) => <option key={f} value={f} className="capitalize">{f.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Next Pay Date</label>
            <input type="date" required value={form.next_pay_date} onChange={(e) => setForm({ ...form, next_pay_date: e.target.value })} className={inputClass} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : editingIncome ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Income Source"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        danger
      />
    </div>
  );
}
