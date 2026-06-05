import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import api from '../../services/api';
import { formatApiError } from '../../utils/formatApiError';
import BusinessPageShell from '../../components/business/BusinessPageShell';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { useBusinessWrite } from '../../hooks/useBusinessWrite';
import { useBusinessAccess } from '../../hooks/useBusinessAccess';
import { Button, Card } from '../../components/ui';

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
  const write = useBusinessWrite('manage_sales');
  const { teamRole } = useBusinessAccess();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);

  const load = async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      const { data } = await api.get(`/api/v1/business/customers?${params.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(formatApiError(e));
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

  return (
    <BusinessPageShell
      title="Customers"
      description="Track clients for sales"
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
          className="bg-purple-600 text-white hover:bg-purple-700"
        >
          <Plus className="h-4 w-4" />
          Add customer
        </Button>
      )}
    >
      <div className="flex max-w-xl flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="form-label">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (setLoading(true), load())}
              className="form-input pl-9"
              placeholder="Name, email, company…"
            />
          </div>
        </div>
        <Button type="button" variant="secondary" onClick={() => { setLoading(true); load(); }}>
          Search
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No customers yet"
          message="Add your first customer to track sales by client."
          actionLabel={write.allowed ? 'Add customer' : undefined}
          onAction={write.allowed ? openAdd : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((c) => (
            <Card key={c.id} className="flex justify-between gap-2 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{c.name}</p>
                {c.company && <p className="truncate text-caption">{c.company}</p>}
                {c.email && <p className="truncate text-caption">{c.email}</p>}
                {c.phone && <p className="text-caption">{c.phone}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(c)} disabled={write.disabled} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setDel(c)} disabled={write.disabled} className="text-danger-600" aria-label="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Edit customer' : 'Add customer'}>
        <form onSubmit={submit} className="max-h-[75vh] space-y-3 overflow-y-auto">
          <div>
            <label className="form-label">Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="form-input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="form-input" />
            </div>
            <div>
              <label className="form-label">Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="form-input" />
            </div>
          </div>
          <div>
            <label className="form-label">Company</label>
            <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="form-input" />
          </div>
          <div>
            <label className="form-label">Address</label>
            <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="form-input" rows={2} />
          </div>
          <div>
            <label className="form-label">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="form-input" rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModal(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-purple-600 text-white hover:bg-purple-700">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!del}
        onClose={() => setDel(null)}
        onConfirm={confirmDelete}
        title="Remove customer"
        message={del ? `Remove ${del.name}? Linked sales keep their text.` : ''}
        confirmText="Remove"
        danger
      />
    </BusinessPageShell>
  );
}
