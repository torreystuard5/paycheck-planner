import { useEffect, useState, useRef } from 'react';
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
import { useBusinessWrite } from '../../hooks/useBusinessWrite';

const DEFAULT_CATEGORIES = [
  'Mileage', 'Supplies', 'Software', 'Meals & Entertainment', 'Travel', 'Utilities', 'Rent',
  'Equipment', 'Insurance', 'Marketing', 'Professional Services', 'Office Supplies',
  'Vehicle Expenses', 'Other',
];
const CUSTOM_CAT = '__custom__';
const DEFAULT_MILEAGE_RATE = 0.7;

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  amount: '',
  category: 'Supplies',
  categorySelect: 'Supplies',
  vendor: '',
  description: '',
  receipt_url: '',
  is_mileage: false,
  miles: '',
  mileageOverride: false,
};

export default function DeductionsPage() {
  const toast = useToast();
  const write = useBusinessWrite('manage_deductions');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('month');
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [catFromApi, setCatFromApi] = useState([]);
  const [vendorsFromApi, setVendorsFromApi] = useState([]);
  const [mileageRate, setMileageRate] = useState(DEFAULT_MILEAGE_RATE);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);
  const [vendorOpen, setVendorOpen] = useState(false);
  const [vendorHits, setVendorHits] = useState([]);
  const vTimer = useRef(null);

  const mergedCategories = [...DEFAULT_CATEGORIES];
  const seen = new Set(DEFAULT_CATEGORIES.map((c) => c.toLowerCase()));
  catFromApi.forEach((c) => {
    const t = (c || '').trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      mergedCategories.push(t);
    }
  });
  const filterCategoryOptions = ['', ...[...new Set(mergedCategories)]];

  const load = async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterCategory) params.set('category', filterCategory);
      const [listRes, sumRes, catRes, venRes, settingsRes] = await Promise.all([
        api.get(`/api/v1/business/deductions?${params.toString()}`),
        api.get(`/api/v1/business/deductions/summary?range=${range}`),
        api.get('/api/v1/business/deductions/category-options'),
        api.get('/api/v1/business/deductions/vendor-options'),
        api.get('/api/v1/business/settings').catch(() => ({ data: { mileage_rate_per_mile: DEFAULT_MILEAGE_RATE } })),
      ]);
      setRows(Array.isArray(listRes.data) ? listRes.data : []);
      setSummary(sumRes.data);
      setCatFromApi(catRes.data?.values || []);
      setVendorsFromApi(venRes.data?.values || []);
      const r = Number(settingsRes.data?.mileage_rate_per_mile);
      setMileageRate(Number.isFinite(r) && r > 0 ? r : DEFAULT_MILEAGE_RATE);
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

  const filterVendors = (t) => {
    if (vTimer.current) clearTimeout(vTimer.current);
    const q = (t || '').trim().toLowerCase();
    if (!q) {
      setVendorHits(vendorsFromApi.slice(0, 20));
      return;
    }
    vTimer.current = setTimeout(() => {
      setVendorHits(vendorsFromApi.filter((v) => v.toLowerCase().includes(q)).slice(0, 20));
    }, 150);
  };

  const mileageAmount = () => {
    const mi = parseFloat(form.miles);
    if (!form.is_mileage || !Number.isFinite(mi) || mi <= 0) return null;
    return mi * mileageRate;
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setVendorOpen(false);
    setModal(true);
  };

  const openEdit = (r) => {
    setEditing(r);
    const cat = r.category || 'Other';
    const preset = DEFAULT_CATEGORIES.find((p) => p.toLowerCase() === cat.toLowerCase()) || mergedCategories.find((p) => p.toLowerCase() === cat.toLowerCase());
    const catSel = preset || CUSTOM_CAT;
    setForm({
      date: r.date?.slice(0, 10) || '',
      amount: String(r.amount ?? ''),
      category: catSel === CUSTOM_CAT ? cat : cat,
      categorySelect: catSel,
      vendor: r.vendor || '',
      description: r.description || '',
      receipt_url: r.receipt_url || '',
      is_mileage: !!r.is_mileage,
      miles: r.miles != null ? String(r.miles) : '',
      mileageOverride: false,
    });
    setVendorOpen(false);
    setModal(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    const catVal = form.categorySelect === CUSTOM_CAT ? (form.category || '').trim() : form.categorySelect;
    if (!form.date || !form.amount || !catVal) {
      toast('Date, amount, and category are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        date: form.date,
        amount: parseFloat(form.amount),
        category: catVal,
        vendor: form.vendor.trim() || null,
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

  const ma = mileageAmount();
  const mileageLine = form.is_mileage && ma != null && form.miles
    ? `${form.miles} miles × $${mileageRate.toFixed(2)} = $${ma.toFixed(2)}`
    : null;

  if (loading && !rows.length) return <LoadingSpinner />;

  return (
    <div className="space-y-6 max-w-5xl min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deductions</h1>
          <p className="text-sm text-gray-600 mt-1">Business expenses</p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          {...write.props({ className: 'inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700' })}
        >
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
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[11rem]">
            <option value="">All Categories</option>
            {filterCategoryOptions.filter(Boolean).map((c) => (
              <option key={c} value={c}>{formatLabel(c)}</option>
            ))}
          </select>
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
        <EmptyState title="No deductions yet" message="Track tax-deductible expenses." actionLabel={write.allowed ? 'Add deduction' : undefined} onAction={write.allowed ? openAdd : undefined} />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm overflow-x-auto max-w-[100vw] sm:max-w-none">
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
                      <button type="button" onClick={() => openEdit(r)} {...write.props({ className: 'p-1.5 text-gray-500 hover:text-blue-600 rounded' })}><Pencil className="w-4 h-4" /></button>
                      <button type="button" onClick={() => setDel(r)} {...write.props({ className: 'p-1.5 text-gray-500 hover:text-red-600 rounded' })}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Edit deduction' : 'Add deduction'}>
        <form onSubmit={submit} className="space-y-3 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
              <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className={form.is_mileage && !form.mileageOverride ? 'bg-sky-50/80 border border-sky-100 rounded-lg p-2' : ''}>
              <label className="block text-xs font-medium text-gray-700 mb-1">Amount {form.is_mileage && !form.mileageOverride && <span className="text-sky-600 font-normal">(auto)</span>}</label>
              <input
                type="number"
                step="0.01"
                required
                readOnly={form.is_mileage && !form.mileageOverride}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value, mileageOverride: true })}
                className="w-full border rounded-lg px-3 py-2 text-sm read-only:bg-gray-50"
              />
              {form.is_mileage && !form.mileageOverride && (
                <button type="button" className="text-xs text-blue-600 mt-1 hover:underline" onClick={() => setForm({ ...form, mileageOverride: true })}>Override amount</button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
            <select value={form.categorySelect} onChange={(e) => setForm({ ...form, categorySelect: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
              {mergedCategories.map((c) => (
                <option key={c} value={c}>{formatLabel(c)}</option>
              ))}
              <option value={CUSTOM_CAT}>Custom…</option>
            </select>
            {form.categorySelect === CUSTOM_CAT && (
              <input className="w-full border rounded-lg px-3 py-2 text-sm mt-2" placeholder="Custom category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            )}
          </div>
          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-1">Vendor</label>
            <input
              autoComplete="off"
              value={form.vendor}
              onChange={(e) => {
                setForm({ ...form, vendor: e.target.value });
                filterVendors(e.target.value);
                setVendorOpen(true);
              }}
              onFocus={() => { filterVendors(form.vendor); setVendorOpen(true); }}
              onBlur={() => setTimeout(() => setVendorOpen(false), 200)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            {vendorOpen && vendorHits.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow max-h-40 overflow-y-auto text-sm">
                {vendorHits.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setForm({ ...form, vendor: v }); setVendorOpen(false); }}
                  >
                    {formatLabel(v)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_mileage} onChange={(e) => {
              const on = e.target.checked;
              const next = { ...form, is_mileage: on, mileageOverride: false };
              if (on) {
                const mi = parseFloat(next.miles);
                if (Number.isFinite(mi) && mi > 0) {
                  next.amount = (mi * mileageRate).toFixed(2);
                }
              }
              setForm(next);
            }} />
            Mileage entry
          </label>
          {form.is_mileage && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Miles</label>
              <input
                type="number"
                step="0.1"
                value={form.miles}
                onChange={(e) => {
                  const miles = e.target.value;
                  const mi = parseFloat(miles);
                  let amt = form.amount;
                  if (!form.mileageOverride && Number.isFinite(mi) && mi > 0) {
                    amt = (mi * mileageRate).toFixed(2);
                  }
                  setForm({ ...form, miles, amount: amt });
                }}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
              {mileageLine && <p className="text-xs text-gray-600 mt-1">{mileageLine}</p>}
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
