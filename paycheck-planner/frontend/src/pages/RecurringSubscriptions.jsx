import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Repeat } from 'lucide-react';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import CurrencyDisplay from '../components/CurrencyDisplay';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import DateInput from '../components/DateInput';

const FREQ_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
  { value: 'custom', label: 'Custom' },
];

const emptyForm = {
  name: '',
  amount: '',
  frequency: 'monthly',
  next_billing_date: '',
  category: '',
  notes: '',
};

export default function RecurringSubscriptions() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/v1/recurring-subscriptions');
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name || '',
      amount: row.amount != null ? String(row.amount) : '',
      frequency: row.frequency || 'monthly',
      next_billing_date: row.next_billing_date || '',
      category: row.category || '',
      notes: row.notes || '',
    });
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        amount: form.amount === '' ? null : parseFloat(form.amount),
        frequency: form.frequency,
        next_billing_date: form.next_billing_date || null,
        category: form.category.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await api.put(`/api/v1/recurring-subscriptions/${editing.id}`, payload);
      } else {
        await api.post('/api/v1/recurring-subscriptions', payload);
      }
      setModalOpen(false);
      await load();
    } catch {
      /* toast optional */
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/v1/recurring-subscriptions/${deleteTarget.id}`);
      setDeleteTarget(null);
      await load();
    } catch { /* ignore */ }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recurring subscriptions</h1>
          <p className="text-sm text-gray-600 mt-1">Track streaming, memberships, and other recurring charges (separate from your plan tier).</p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Add subscription
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No subscriptions yet"
          message="Add Netflix-style services so you can see upcoming charges in one place."
          actionLabel="Add subscription"
          onAction={openAdd}
        />
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Amount</th>
                <th className="text-left px-4 py-3 font-medium">Frequency</th>
                <th className="text-left px-4 py-3 font-medium">Next bill</th>
                <th className="text-right px-4 py-3 font-medium w-24"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((row) => (
                <tr key={row.id} className={!row.is_active ? 'opacity-50' : ''}>
                  <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                  <td className="px-4 py-3"><CurrencyDisplay amount={row.amount} className="inline" /></td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{row.frequency}</td>
                  <td className="px-4 py-3 text-gray-600">{row.next_billing_date || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => openEdit(row)} className="p-1.5 text-gray-400 hover:text-blue-600" title="Edit">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setDeleteTarget(row)} className="p-1.5 text-gray-400 hover:text-red-600" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit subscription' : 'New subscription'}>
        <form onSubmit={submit} className="space-y-4 text-sm">
          <div>
            <label className="block text-gray-700 mb-1">Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-700 mb-1">Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-gray-700 mb-1">Frequency</label>
              <select
                value={form.frequency}
                onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                {FREQ_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Next billing date</label>
            <DateInput
              value={form.next_billing_date}
              onChange={(e) => setForm((f) => ({ ...f, next_billing_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Category</label>
            <input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="e.g. Entertainment"
            />
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete subscription?"
        message={deleteTarget ? `Remove "${deleteTarget.name}" from your list?` : ''}
        confirmText="Delete"
        danger
      />
    </div>
  );
}
