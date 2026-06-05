import { useEffect, useState, useRef } from 'react';
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
import BusinessPageShell from '../../components/business/BusinessPageShell';
import { useToast } from '../../components/Toast';
import { useBusinessWrite } from '../../hooks/useBusinessWrite';
import { useBusinessAccess } from '../../hooks/useBusinessAccess';
import { Button } from '../../components/ui';

const DEFAULT_CATEGORIES = ['Products', 'Services', 'Labor & Supplies', 'Consulting', 'Subscriptions', 'Wholesale', 'Retail', 'Other'];
const CUSTOM_CAT = '__custom__';
const PAYMENT_METHODS = ['Cash', 'Check', 'Visa', 'Mastercard', 'American Express', 'Discover', 'Debit Card', 'Bank Transfer (ACH)', 'PayPal', 'Venmo', 'Zelle', 'Apple Pay', 'Google Pay', 'Other'];

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  amount: '',
  source: '',
  customer_id: null,
  category: '',
  categorySelect: 'Products',
  payment_method: 'Cash',
  notes: '',
  is_taxable: true,
};

export default function SalesPage() {
  const toast = useToast();
  const write = useBusinessWrite('manage_sales');
  const { teamRole } = useBusinessAccess();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('month');
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [catFromApi, setCatFromApi] = useState([]);
  const [modal, setModal] = useState(false);
  const [quickAdd, setQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);
  const [custHits, setCustHits] = useState([]);
  const [custOpen, setCustOpen] = useState(false);
  const custTimer = useRef(null);

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
      const [listRes, sumRes, catRes] = await Promise.all([
        api.get(`/api/v1/business/sales?${params.toString()}`),
        api.get(`/api/v1/business/sales/summary?range=${range}`),
        api.get('/api/v1/business/sales/category-options'),
      ]);
      setRows(Array.isArray(listRes.data) ? listRes.data : []);
      setSummary(sumRes.data);
      setCatFromApi(catRes.data?.values || []);
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

  const searchCustomers = (t) => {
    if (custTimer.current) clearTimeout(custTimer.current);
    if (!t || t.length < 1) {
      setCustHits([]);
      return;
    }
    custTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/api/v1/business/customers?q=${encodeURIComponent(t)}`);
        setCustHits(Array.isArray(data) ? data : []);
      } catch {
        setCustHits([]);
      }
    }, 200);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setCustHits([]);
    setCustOpen(false);
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
      source: r.source || '',
      customer_id: r.customer_id || null,
      category: catSel === CUSTOM_CAT ? cat : cat,
      categorySelect: catSel,
      payment_method: r.payment_method && PAYMENT_METHODS.some((p) => p.toLowerCase() === r.payment_method.toLowerCase())
        ? PAYMENT_METHODS.find((p) => p.toLowerCase() === r.payment_method.toLowerCase())
        : (r.payment_method || 'Other'),
      notes: r.notes || '',
      is_taxable: r.is_taxable !== false,
    });
    setCustHits([]);
    setCustOpen(false);
    setModal(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.date || !form.amount) {
      toast('Date and amount are required.', 'error');
      return;
    }
    const catVal = form.categorySelect === CUSTOM_CAT ? (form.category || '').trim() || null : form.categorySelect;
    setSaving(true);
    try {
      const payload = {
        date: form.date,
        amount: parseFloat(form.amount),
        source: form.source?.trim() || null,
        customer_id: form.customer_id || null,
        category: catVal,
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

  const quickAddCustomer = async (e) => {
    e.preventDefault();
    if (!quickName.trim()) {
      toast('Name required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/api/v1/business/customers', { name: quickName.trim() });
      setForm((f) => ({ ...f, customer_id: data.id, source: data.name }));
      setQuickAdd(false);
      setQuickName('');
      setCustOpen(false);
      toast('Customer created.');
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

  return (
    <BusinessPageShell
      title="Sales"
      description="Track revenue"
      loading={loading && !rows.length}
      error={error}
      teamRole={teamRole}
      maxWidth="max-w-5xl"
      actions={(
        <Button
          type="button"
          onClick={openAdd}
          disabled={write.disabled}
          title={write.title}
          className="bg-brand-600 text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          Add sale
        </Button>
      )}
    >
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-muted mb-1">Range</label>
          <select value={range} onChange={(e) => setRange(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm">
            <option value="month">This month</option>
            <option value="quarter">This quarter</option>
            <option value="ytd">Year to date</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Category</label>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm min-w-[10rem]">
            <option value="">All Categories</option>
            {filterCategoryOptions.filter(Boolean).map((c) => (
              <option key={c} value={c}>{formatLabel(c)}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-muted mb-1">Search</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => load()} className="border border-border rounded-lg px-3 py-2 text-sm w-full" placeholder="Source, notes…" />
        </div>
        <button type="button" onClick={() => { setLoading(true); load(); }} className="px-3 py-2 text-sm bg-surface-subtle rounded-lg hover:bg-surface-subtle">Apply</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface rounded-lg border border-border p-4 shadow-sm">
          <p className="text-xs text-muted uppercase">Total ({range})</p>
          <CurrencyDisplay amount={summary?.total} className="text-2xl font-bold text-foreground mt-1 block" />
        </div>
        <div className="bg-surface rounded-lg border border-border p-4 shadow-sm">
          <p className="text-xs text-muted uppercase mb-2">By category</p>
          <ul className="text-sm space-y-1 max-h-28 overflow-y-auto">
            {Object.entries(summary?.by_category || {}).map(([k, v]) => (
              <li key={k} className="flex justify-between gap-2">
                <span>{formatLabel(k)}</span>
                <CurrencyDisplay amount={v} className="font-medium" />
              </li>
            ))}
            {!summary?.by_category || !Object.keys(summary.by_category).length ? (
              <li className="text-muted">No data</li>
            ) : null}
          </ul>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="bg-surface rounded-lg border border-border p-4 shadow-sm h-64 min-h-[200px]">
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
        <EmptyState
          title="No sales yet"
          message="Add your first sale to see it here."
          actionLabel={write.allowed ? 'Add sale' : undefined}
          onAction={write.allowed ? openAdd : undefined}
        />
      ) : (
        <div className="bg-surface rounded-lg border border-border overflow-hidden shadow-sm max-w-[100vw] sm:max-w-none">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-muted">
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
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap">{formatFriendlyDate(r.date)}</td>
                    <td className="px-3 py-2 font-medium"><CurrencyDisplay amount={r.amount} /></td>
                    <td className="px-3 py-2 hidden sm:table-cell text-muted truncate max-w-[120px]">{r.customer_name || r.source || '—'}</td>
                    <td className="px-3 py-2">{formatLabel(r.category) || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button type="button" onClick={() => openEdit(r)} {...write.props({ className: 'p-1.5 text-muted hover:text-accent-600 rounded disabled:hover:text-muted' })} aria-label="Edit"><Pencil className="w-4 h-4" /></button>
                        <button type="button" onClick={() => setDel(r)} {...write.props({ className: 'p-1.5 text-muted hover:text-red-600 rounded disabled:hover:text-muted' })} aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
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
        <form onSubmit={submit} className="space-y-3 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Date</label>
              <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Amount</label>
              <input type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="relative">
            <label className="block text-xs font-medium text-foreground mb-1">Source / customer</label>
            <input
              autoComplete="off"
              value={form.source}
              onChange={(e) => {
                const v = e.target.value;
                setForm({ ...form, source: v, customer_id: null });
                searchCustomers(v);
                setCustOpen(true);
              }}
              onFocus={() => setCustOpen(true)}
              onBlur={() => setTimeout(() => setCustOpen(false), 200)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            {custOpen && (custHits.length > 0 || form.source) && (
              <div className="absolute z-20 mt-1 w-full bg-surface border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto text-sm">
                {custHits.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-surface-subtle border-b border-gray-50 last:border-0"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setForm({ ...form, customer_id: c.id, source: c.name });
                      setCustOpen(false);
                    }}
                  >
                    {formatLabel(c.name)}{c.company ? ` · ${formatLabel(c.company)}` : ''}
                  </button>
                ))}
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-indigo-600 hover:bg-indigo-50 font-medium"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setQuickAdd(true); setQuickName(form.source || ''); }}
                >
                  + Add new customer
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Category</label>
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
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Payment method</label>
              <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                {PAYMENT_METHODS.map((p) => (
                  <option key={p} value={p}>{formatLabel(p)}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_taxable} onChange={(e) => setForm({ ...form, is_taxable: e.target.checked })} />
            Taxable
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal(false)} disabled={saving} className="px-4 py-2 text-sm text-foreground rounded-lg hover:bg-surface-subtle">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={quickAdd} onClose={() => setQuickAdd(false)} title="New customer">
        <form onSubmit={quickAddCustomer} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Name</label>
            <input required value={quickName} onChange={(e) => setQuickName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setQuickAdd(false)} className="px-4 py-2 text-sm rounded-lg hover:bg-surface-subtle">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg">{saving ? 'Saving…' : 'Create'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!del} onClose={() => setDel(null)} onConfirm={confirmDelete} title="Delete sale" message="Remove this sale record?" confirmText="Delete" danger />
    </BusinessPageShell>
  );
}
