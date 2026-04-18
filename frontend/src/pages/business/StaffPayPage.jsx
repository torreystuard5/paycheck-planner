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

const payEmpty = {
  period_start: '',
  period_end: '',
  hours: '',
  gross_pay: '',
  taxes_withheld: '0',
  net_pay: '',
  paid_on: '',
  notes: '',
};

export default function StaffPayPage() {
  const toast = useToast();
  const [staff, setStaff] = useState([]);
  const [runs, setRuns] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('month');
  const [staffModal, setStaffModal] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [staffForm, setStaffForm] = useState({ name: '', role: '', pay_type: 'hourly', pay_rate: '' });
  const [payForm, setPayForm] = useState(payEmpty);
  const [selStaff, setSelStaff] = useState(null);
  const [editingStaff, setEditingStaff] = useState(null);
  const [editingPay, setEditingPay] = useState(null);
  const [saving, setSaving] = useState(false);
  const [delStaff, setDelStaff] = useState(null);
  const [delPay, setDelPay] = useState(null);

  const loadStaff = async () => {
    const { data } = await api.get('/api/v1/business/staff');
    setStaff(Array.isArray(data) ? data : []);
  };

  const load = async () => {
    try {
      await loadStaff();
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

  useEffect(() => {
    if (!staff.length) {
      setRuns([]);
      return;
    }
    (async () => {
      try {
        const { data } = await api.get(`/api/v1/business/staff-pay/summary?range=${range}`);
        setSummary(data);
        const all = [];
        for (const s of staff) {
          try {
            const r = await api.get(`/api/v1/business/staff/${s.id}/pay-runs`);
            (Array.isArray(r.data) ? r.data : []).forEach((pr) => {
              all.push({ ...pr, staffName: s.name });
            });
          } catch { /* ignore */ }
        }
        all.sort((a, b) => (b.period_end || '').localeCompare(a.period_end || ''));
        setRuns(all.slice(0, 200));
      } catch { /* ignore */ }
    })();
  }, [staff, range]);

  const saveStaff = async (e) => {
    e.preventDefault();
    if (!staffForm.name.trim()) {
      toast('Name is required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: staffForm.name.trim(),
        role: staffForm.role || null,
        pay_type: staffForm.pay_type,
        pay_rate: staffForm.pay_rate ? parseFloat(staffForm.pay_rate) : null,
      };
      if (editingStaff) {
        await api.patch(`/api/v1/business/staff/${editingStaff.id}`, payload);
        toast('Staff updated.');
      } else {
        await api.post('/api/v1/business/staff', payload);
        toast('Staff added.');
      }
      setStaffModal(false);
      setEditingStaff(null);
      await loadStaff();
    } catch (err) {
      toast(formatApiError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const savePay = async (e) => {
    e.preventDefault();
    if (!selStaff) return;
    if (!payForm.period_start || !payForm.period_end || !payForm.net_pay) {
      toast('Period and net pay are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        period_start: payForm.period_start,
        period_end: payForm.period_end,
        hours: payForm.hours ? parseFloat(payForm.hours) : null,
        gross_pay: parseFloat(payForm.gross_pay || payForm.net_pay),
        taxes_withheld: parseFloat(payForm.taxes_withheld || 0),
        net_pay: parseFloat(payForm.net_pay),
        paid_on: payForm.paid_on || null,
        notes: payForm.notes || null,
      };
      if (editingPay) {
        await api.patch(`/api/v1/business/staff/${selStaff.id}/pay-runs/${editingPay.id}`, payload);
        toast('Pay run updated.');
      } else {
        await api.post(`/api/v1/business/staff/${selStaff.id}/pay-runs`, payload);
        toast('Pay run added.');
      }
      setPayModal(false);
      setEditingPay(null);
      await loadStaff();
      const { data } = await api.get(`/api/v1/business/staff-pay/summary?range=${range}`);
      setSummary(data);
      const all = [];
      const st = await api.get('/api/v1/business/staff');
      const slist = Array.isArray(st.data) ? st.data : [];
      for (const s of slist) {
        const r = await api.get(`/api/v1/business/staff/${s.id}/pay-runs`);
        (Array.isArray(r.data) ? r.data : []).forEach((pr) => {
          all.push({ ...pr, staffName: s.name });
        });
      }
      all.sort((a, b) => (b.period_end || '').localeCompare(a.period_end || ''));
      setRuns(all.slice(0, 200));
    } catch (err) {
      toast(formatApiError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelStaff = async () => {
    if (!delStaff) return;
    try {
      await api.delete(`/api/v1/business/staff/${delStaff.id}`);
      toast('Removed.');
      setDelStaff(null);
      await loadStaff();
    } catch (e) {
      toast(formatApiError(e), 'error');
    }
  };

  const confirmDelPay = async () => {
    if (!delPay) return;
    try {
      await api.delete(`/api/v1/business/staff/${delPay.staff_id}/pay-runs/${delPay.id}`);
      toast('Deleted.');
      setDelPay(null);
      await loadStaff();
    } catch (e) {
      toast(formatApiError(e), 'error');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff pay</h1>
          <p className="text-sm text-gray-600 mt-1">Team and payroll runs</p>
        </div>
        <button type="button" onClick={() => { setEditingStaff(null); setStaffForm({ name: '', role: '', pay_type: 'hourly', pay_rate: '' }); setStaffModal(true); }} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Add staff
        </button>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Staff</h2>
        {staff.length === 0 ? (
          <EmptyState title="No staff yet" message="Add employees or contractors." actionLabel="Add staff" onAction={() => { setEditingStaff(null); setStaffForm({ name: '', role: '', pay_type: 'hourly', pay_rate: '' }); setStaffModal(true); }} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {staff.map((s) => (
              <div key={s.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{s.name}</p>
                  <p className="text-xs text-gray-500">{formatLabel(s.pay_type)}{s.pay_rate != null ? ` · $${Number(s.pay_rate).toFixed(2)}` : ''}</p>
                  {s.role && <p className="text-xs text-gray-600 truncate">{s.role}</p>}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button type="button" onClick={() => { setSelStaff(s); setEditingPay(null); setPayForm(payEmpty); setPayModal(true); }} className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700">Pay run</button>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => { setEditingStaff(s); setStaffForm({ name: s.name, role: s.role || '', pay_type: s.pay_type, pay_rate: s.pay_rate != null ? String(s.pay_rate) : '' }); setStaffModal(true); }} className="p-1 text-gray-500 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                    <button type="button" onClick={() => setDelStaff(s)} className="p-1 text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Pay runs</h2>
          <select value={range} onChange={(e) => setRange(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="month">This month</option>
            <option value="quarter">This quarter</option>
            <option value="ytd">YTD</option>
          </select>
        </div>
        {summary && (
          <p className="text-sm text-gray-600 mb-3">Total paid ({range}): <CurrencyDisplay amount={summary.total_paid} className="inline font-semibold text-gray-900" /></p>
        )}
        {runs.length === 0 ? (
          <p className="text-sm text-gray-500">No pay runs yet.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-3 py-2">Staff</th>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Net pay</th>
                  <th className="px-3 py-2 w-20" />
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">{r.staffName}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatFriendlyDate(r.period_start)} – {formatFriendlyDate(r.period_end)}</td>
                    <td className="px-3 py-2 font-medium"><CurrencyDisplay amount={r.net_pay} /></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button type="button" onClick={() => {
                          const st = staff.find((x) => x.id === r.staff_id);
                          setSelStaff(st);
                          setEditingPay(r);
                          setPayForm({
                            period_start: r.period_start?.slice(0, 10) || '',
                            period_end: r.period_end?.slice(0, 10) || '',
                            hours: r.hours != null ? String(r.hours) : '',
                            gross_pay: String(r.gross_pay ?? ''),
                            taxes_withheld: String(r.taxes_withheld ?? '0'),
                            net_pay: String(r.net_pay ?? ''),
                            paid_on: r.paid_on?.slice(0, 10) || '',
                            notes: r.notes || '',
                          });
                          setPayModal(true);
                        }} className="p-1 text-gray-500 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                        <button type="button" onClick={() => setDelPay(r)} className="p-1 text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={staffModal} onClose={() => setStaffModal(false)} title={editingStaff ? 'Edit staff' : 'Add staff'}>
        <form onSubmit={saveStaff} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <input required value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
            <input value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Pay type</label>
              <select value={staffForm.pay_type} onChange={(e) => setStaffForm({ ...staffForm, pay_type: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="hourly">Hourly</option>
                <option value="salary">Salary</option>
                <option value="contractor">Contractor</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Pay rate</label>
              <input type="number" step="0.01" value={staffForm.pay_rate} onChange={(e) => setStaffForm({ ...staffForm, pay_rate: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setStaffModal(false)} disabled={saving} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={payModal} onClose={() => setPayModal(false)} title={editingPay ? 'Edit pay run' : `Pay run — ${selStaff?.name || ''}`}>
        <form onSubmit={savePay} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Period start</label>
              <input type="date" required value={payForm.period_start} onChange={(e) => setPayForm({ ...payForm, period_start: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Period end</label>
              <input type="date" required value={payForm.period_end} onChange={(e) => setPayForm({ ...payForm, period_end: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hours</label>
              <input type="number" step="0.01" value={payForm.hours} onChange={(e) => setPayForm({ ...payForm, hours: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Gross pay</label>
              <input type="number" step="0.01" value={payForm.gross_pay} onChange={(e) => setPayForm({ ...payForm, gross_pay: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Taxes withheld</label>
              <input type="number" step="0.01" value={payForm.taxes_withheld} onChange={(e) => setPayForm({ ...payForm, taxes_withheld: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Net pay</label>
              <input type="number" step="0.01" required value={payForm.net_pay} onChange={(e) => setPayForm({ ...payForm, net_pay: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Paid on</label>
            <input type="date" value={payForm.paid_on} onChange={(e) => setPayForm({ ...payForm, paid_on: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setPayModal(false)} disabled={saving} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!delStaff} onClose={() => setDelStaff(null)} onConfirm={confirmDelStaff} title="Remove staff" message={`Remove ${delStaff?.name}?`} confirmText="Remove" danger />
      <ConfirmDialog isOpen={!!delPay} onClose={() => setDelPay(null)} onConfirm={confirmDelPay} title="Delete pay run" message="Delete this pay run?" confirmText="Delete" danger />
    </div>
  );
}
