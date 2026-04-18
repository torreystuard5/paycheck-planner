import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import api from '../../services/api';
import { formatApiError } from '../../utils/formatApiError';
import { formatFriendlyDate } from '../../utils/formatDate';
import { formatLabel } from '../../utils/formatLabel';
import CurrencyDisplay from '../../components/CurrencyDisplay';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useToast } from '../../components/Toast';

const CATS = ['Mileage', 'Supplies', 'Software', 'Meals', 'Travel', 'Utilities', 'Rent', 'Equipment', 'Other'];

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  amount: '',
  category: 'Supplies',
  vendor: '',
  description: '',
  receipt_url: '',
  is_mileage: false,
  miles: '',
};

export default function DeductionsPage() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('month');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);

  const load = async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      const [listRes, sumRes] = await Promise.all([
        api.get(`/api/v1/business/deductions?${params.toString()}`),
        api.get(`/api/v1/business/deductions/summary?range=${range}`),
      ]);
      setRows(Array.isArray(listRes.data) ? listRes.data : []);
      setSummary(sumRes.data);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [range]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setModal(true);
  };

  const openEdit = (r) => {
    setEditing(r);
    setForm({
      date: r.date?.slice(0, 10) || '',
      amount: String(r.amount ?? ''),
      category: r.category || 'Other',
      vendor: r.vendor || '',
      description: r.description || '',
      receipt_url: r.receipt_url || '',
      is_mileage: !!r.is_mileage,
      miles: r.miles != null ? String(r.miles) : '',
    });
    setModal(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.date || !form.amount || !form.category) {
      toast('Date, amount, and category are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        date: form.date,
        amount: parseFloat(form.amount),
        category: form.category,
        vendor: form.vendor || null,
        description: form.description || null,
        receipt_url: form.receipt_url || null,
        is_mileage: form.is_mileage,
        miles: form.miles ? parseFloat(form.miles) : null,
      };
      if (editing) {
        await api.patch(`/api/v1/business/deductions/${editing.id}`, payload);
        toast('Deduction updated.');
      } else {
        await api.post('/api/v1/business/deductions', payload);
        toast('Deduction added.');
      }
      setModal(false);
      await load();
    } catch (err) {
      toast(formatApiError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!del) return;
    try {
      await api.delete(`/api/v1/business/deductions/${del.id}`);
      toast('Deleted.');
      setDel(null);
      await load();
    } catch (e) {
      toast(formatApiError(e), 'error');
    }
  };

  if (loading && !rows.length) return <LoadingSpinner />;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deductions</h1>
          <p className="text-sm text-gray-600 mt-1">Business expenses</p>
        </div>
        <button type="button" onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700">
          <Plus className="w-4 h-4" /> Add deduction
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Range</label>
          <select value={range} onChange={(e) => setRange(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="month">This month</option>
            <option value="quarter">This quarter</option>
            <option value="ytd">Year to date</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Category</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-36" placeholder="Filter" />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-gray-500 mb-1">Search</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => load()} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full" />
        </div>
        <button type="button" onClick={() => { setLoading(true); load(); }} className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Apply</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase">Total</p>
          <CurrencyDisplay amount={summary?.total} className="text-xl font-bold text-gray-900 mt-1 block" />
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm sm:col-span-2">
          <p className="text-xs text-gray-500 uppercase mb-1">By category</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(summary?.by_category || {}).map(([k, v]) => (
              <span key={k} className="px-2 py-1 bg-gray-100 rounded">{formatLabel(k)}: <CurrencyDisplay amount={v} className="inline font-medium" /></span>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase">Mileage (miles)</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{Number(summary?.total_miles || 0).toFixed(1)}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No deductions yet" message="Track tax-deductible expenses." actionLabel="Add deduction" onAction={openAdd} />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2 hidden md:table-cell">Vendor</th>
                <th className="px-3 py-2 w-24" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 whitespace-nowrap">{formatFriendlyDate(r.date)}</td>
                  <td className="px-3 py-2 font-medium"><CurrencyDisplay amount={r.amount} /></td>
                  <td className="px-3 py-2">{formatLabel(r.category)}</td>
                  <td className="px-3 py-2 hidden md:table-cell text-gray-600">{r.vendor || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button type="button" onClick={() => openEdit(r)} className="p-1.5 text-gray-500 hover:text-blue-600 rounded"><Pencil className="w-4 h-4" /></button>
                      <button type="button" onClick={() => setDel(r)} className="p-1.5 text-gray-500 hover:text-red-600 rounded"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Edit deduction' : 'Add deduction'}>
        <form onSubmit={submit} className="space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
              <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
              <input type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
              {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Vendor</label>
            <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_mileage} onChange={(e) => setForm({ ...form, is_mileage: e.target.checked })} />
            Mileage entry
          </label>
          {form.is_mileage && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Miles</label>
              <input type="number" step="0.1" value={form.miles} onChange={(e) => setForm({ ...form, miles: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal(false)} disabled={saving} className="px-4 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-100">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!del} onClose={() => setDel(null)} onConfirm={confirmDelete} title="Delete deduction" message="Remove this record?" confirmText="Delete" danger />
    </div>
  );
}
