import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import api from '../../services/api';
import { formatApiError } from '../../utils/formatApiError';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useToast } from '../../components/Toast';

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  address: '',
  company: '',
  notes: '',
};

export default function CustomersPage() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      const { data } = await api.get(`/api/v1/business/customers?${params.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      toast(formatApiError(e), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setModal(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({
      name: c.name || '',
      email: c.email || '',
      phone: c.phone || '',
      address: c.address || '',
      company: c.company || '',
      notes: c.notes || '',
    });
    setModal(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast('Name is required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        company: form.company.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await api.patch(`/api/v1/business/customers/${editing.id}`, payload);
        toast('Customer updated.');
      } else {
        await api.post('/api/v1/business/customers', payload);
        toast('Customer added.');
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
      await api.delete(`/api/v1/business/customers/${del.id}`);
      toast('Customer removed.');
      setDel(null);
      await load();
    } catch (e) {
      toast(formatApiError(e), 'error');
    }
  };

  if (loading && !rows.length) return <LoadingSpinner />;

  return (
    <div className="space-y-6 max-w-5xl min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-600 mt-1">Track clients for sales</p>
        </div>
        <button type="button" onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> Add customer
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-end max-w-xl">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-500 mb-1">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (setLoading(true), load())} className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm" placeholder="Name, email, company…" />
          </div>
        </div>
        <button type="button" onClick={() => { setLoading(true); load(); }} className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Search</button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No customers yet"
          message="Add your first customer to track sales by client."
          actionLabel="Add customer"
          onAction={openAdd}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map((c) => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{c.name}</p>
                {c.company && <p className="text-xs text-gray-600 truncate">{c.company}</p>}
                {c.email && <p className="text-xs text-gray-500 truncate">{c.email}</p>}
                {c.phone && <p className="text-xs text-gray-500">{c.phone}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button type="button" onClick={() => openEdit(c)} className="p-1.5 text-gray-500 hover:text-blue-600 rounded" aria-label="Edit"><Pencil className="w-4 h-4" /></button>
                <button type="button" onClick={() => setDel(c)} className="p-1.5 text-gray-500 hover:text-red-600 rounded" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Edit customer' : 'Add customer'}>
        <form onSubmit={submit} className="space-y-3 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Company</label>
            <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
            <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal(false)} disabled={saving} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!del} onClose={() => setDel(null)} onConfirm={confirmDelete} title="Remove customer" message={del ? `Remove ${del.name}? Linked sales keep their text.` : ''} confirmText="Remove" danger />
    </div>
  );
}
