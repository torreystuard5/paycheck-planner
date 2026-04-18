import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
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

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  amount: '',
  source: '',
  category: '',
  payment_method: '',
  notes: '',
  is_taxable: true,
};

export default function SalesPage() {
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
        api.get(`/api/v1/business/sales?${params.toString()}`),
        api.get(`/api/v1/business/sales/summary?range=${range}`),
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
      source: r.source || '',
      category: r.category || '',
      payment_method: r.payment_method || '',
      notes: r.notes || '',
      is_taxable: r.is_taxable !== false,
    });
    setModal(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.date || !form.amount) {
      toast('Date and amount are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        date: form.date,
        amount: parseFloat(form.amount),
        source: form.source || null,
        category: form.category || null,
        payment_method: form.payment_method || null,
        notes: form.notes || null,
        is_taxable: form.is_taxable,
      };
      if (editing) {
        await api.patch(`/api/v1/business/sales/${editing.id}`, payload);
        toast('Sale updated.');
      } else {
        await api.post('/api/v1/business/sales', payload);
        toast('Sale added.');
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
      await api.delete(`/api/v1/business/sales/${del.id}`);
      toast('Sale deleted.');
      setDel(null);
      await load();
    } catch (e) {
      toast(formatApiError(e), 'error');
    }
  };

  const chartData = (summary?.by_month || []).map((m) => ({
    month: m.month,
    total: Number(m.total) || 0,
  }));

  if (loading && !rows.length) return <LoadingSpinner />;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
          <p className="text-sm text-gray-600 mt-1">Track revenue</p>
        </div>
        <button type="button" onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
          <Plus className="w-4 h-4" /> Add sale
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
          <input value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => load()} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full" placeholder="Source, notes…" />
        </div>
        <button type="button" onClick={() => { setLoading(true); load(); }} className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Apply</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase">Total ({range})</p>
          <CurrencyDisplay amount={summary?.total} className="text-2xl font-bold text-gray-900 mt-1 block" />
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase mb-2">By category</p>
          <ul className="text-sm space-y-1 max-h-28 overflow-y-auto">
            {Object.entries(summary?.by_category || {}).map(([k, v]) => (
              <li key={k} className="flex justify-between gap-2">
                <span>{formatLabel(k)}</span>
                <CurrencyDisplay amount={v} className="font-medium" />
              </li>
            ))}
            {!summary?.by_category || !Object.keys(summary.by_category).length ? (
              <li className="text-gray-500">No data</li>
            ) : null}
          </ul>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, '']} />
              <Bar dataKey="total" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No sales yet" message="Add your first sale to see it here." actionLabel="Add sale" onAction={openAdd} />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2 hidden sm:table-cell">Source</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 w-24" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 whitespace-nowrap">{formatFriendlyDate(r.date)}</td>
                    <td className="px-3 py-2 font-medium"><CurrencyDisplay amount={r.amount} /></td>
                    <td className="px-3 py-2 hidden sm:table-cell text-gray-600 truncate max-w-[120px]">{r.source || '—'}</td>
                    <td className="px-3 py-2">{formatLabel(r.category) || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button type="button" onClick={() => openEdit(r)} className="p-1.5 text-gray-500 hover:text-blue-600 rounded" aria-label="Edit"><Pencil className="w-4 h-4" /></button>
                        <button type="button" onClick={() => setDel(r)} className="p-1.5 text-gray-500 hover:text-red-600 rounded" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Edit sale' : 'Add sale'}>
        <form onSubmit={submit} className="space-y-3">
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
            <label className="block text-xs font-medium text-gray-700 mb-1">Source / customer</label>
            <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Payment method</label>
              <input value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_taxable} onChange={(e) => setForm({ ...form, is_taxable: e.target.checked })} />
            Taxable
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal(false)} disabled={saving} className="px-4 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-100">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!del} onClose={() => setDel(null)} onConfirm={confirmDelete} title="Delete sale" message="Remove this sale record?" confirmText="Delete" danger />
    </div>
  );
}
