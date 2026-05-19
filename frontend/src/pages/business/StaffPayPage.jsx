import { useEffect, useState, useMemo } from 'react';
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
import { payPeriodContaining, formatDateISO, PAY_PERIODS_PER_YEAR } from '../../utils/payPeriods';

const ROLE_PRESETS = ['Manager', 'Cashier', 'Server', 'Cook', 'Driver', 'Associate', 'Supervisor', 'Owner', 'Other'];
const CUSTOM_ROLE = '__custom__';

const payEmpty = () => ({
  period_start: '',
  period_end: '',
  hours: '',
  gross_pay: '',
  taxes_withheld: '0',
  net_pay: '',
  paid_on: '',
  notes: '',
});

const staffEmpty = () => ({
  name: '',
  role: '',
  roleSelect: 'Manager',
  pay_type: 'hourly',
  pay_rate: '',
  pay_frequency: '',
  anchor_date: '',
  tax_rate: '15.3',
});

export default function StaffPayPage() {
  const toast = useToast();
  const write = useBusinessWrite('manage_staff_pay');
  const [staff, setStaff] = useState([]);
  const [roleOptionsFromApi, setRoleOptionsFromApi] = useState([]);
  const [runs, setRuns] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('month');
  const [staffModal, setStaffModal] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [staffForm, setStaffForm] = useState(staffEmpty);
  const [payForm, setPayForm] = useState(payEmpty);
  const [selStaff, setSelStaff] = useState(null);
  const [editingStaff, setEditingStaff] = useState(null);
  const [editingPay, setEditingPay] = useState(null);
  const [saving, setSaving] = useState(false);
  const [delStaff, setDelStaff] = useState(null);
  const [delPay, setDelPay] = useState(null);
  const [payAuto, setPayAuto] = useState({
    period: true, gross: true, taxes: true, net: true, paidOn: true,
  });
  const [netOverride, setNetOverride] = useState(false);

  const mergedRoles = useMemo(() => {
    const out = [...ROLE_PRESETS];
    const seen = new Set(ROLE_PRESETS.map((x) => x.toLowerCase()));
    (roleOptionsFromApi || []).forEach((r) => {
      const t = (r || '').trim();
      if (!t) return;
      const k = t.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(t);
      }
    });
    return out;
  }, [roleOptionsFromApi]);

  const loadStaff = async () => {
    const { data } = await api.get('/api/v1/business/staff');
    setStaff(Array.isArray(data) ? data : []);
  };

  const load = async () => {
    try {
      await loadStaff();
      const ro = await api.get('/api/v1/business/staff/role-options');
      setRoleOptionsFromApi(ro.data?.values || []);
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

  const taxRatePct = (s) => {
    const v = s?.tax_rate != null ? Number(s.tax_rate) : 15.3;
    return Number.isFinite(v) ? v : 15.3;
  };

  const applyPayScheduleDefaults = (s, form) => {
    let next = { ...form };
    const auto = { period: true, gross: true, taxes: true, net: true, paidOn: true };
    if (s?.pay_frequency && s?.anchor_date) {
      const p = payPeriodContaining(s.pay_frequency, s.anchor_date.slice(0, 10));
      if (p) {
        next.period_start = formatDateISO(p.start);
        next.period_end = formatDateISO(p.end);
        next.paid_on = formatDateISO(p.end);
      }
    }
    const tr = taxRatePct(s) / 100;
    const hoursNum = parseFloat(next.hours);
    const rate = s?.pay_rate != null ? Number(s.pay_rate) : 0;
    if (s?.pay_type === 'hourly' || s?.pay_type === 'contractor') {
      if (Number.isFinite(hoursNum) && hoursNum > 0 && rate > 0) {
        const g = hoursNum * rate;
        next.gross_pay = g.toFixed(2);
        next.taxes_withheld = (g * tr).toFixed(2);
        next.net_pay = (g - parseFloat(next.taxes_withheld)).toFixed(2);
      }
    } else if (s?.pay_type === 'salary' && s?.pay_frequency && rate > 0) {
      const n = PAY_PERIODS_PER_YEAR[s.pay_frequency] || 12;
      const g = rate / n;
      next.gross_pay = g.toFixed(2);
      next.taxes_withheld = (g * tr).toFixed(2);
      next.net_pay = (g - parseFloat(next.taxes_withheld)).toFixed(2);
    }
    return { form: next, auto };
  };

  const openPayModal = (s, existingPay = null) => {
    setSelStaff(s);
    setEditingPay(existingPay);
    setNetOverride(false);
    if (existingPay) {
      setPayForm({
        period_start: existingPay.period_start?.slice(0, 10) || '',
        period_end: existingPay.period_end?.slice(0, 10) || '',
        hours: existingPay.hours != null ? String(existingPay.hours) : '',
        gross_pay: String(existingPay.gross_pay ?? ''),
        taxes_withheld: String(existingPay.taxes_withheld ?? '0'),
        net_pay: String(existingPay.net_pay ?? ''),
        paid_on: existingPay.paid_on?.slice(0, 10) || '',
        notes: existingPay.notes || '',
      });
      setPayAuto({ period: false, gross: false, taxes: false, net: false, paidOn: false });
    } else {
      let base = payEmpty();
      const { form, auto } = applyPayScheduleDefaults(s, base);
      const next = recalcFromHoursAndGross(form, s, { ...auto, gross: true, taxes: true, net: true }, false);
      setPayForm(next);
      setPayAuto({ ...auto, gross: true, taxes: true, net: true, paidOn: auto.paidOn });
    }
    setPayModal(true);
  };

  const onPayField = (key, val, clearsAuto) => {
    setPayForm((prev) => ({ ...prev, [key]: val }));
    if (clearsAuto) setPayAuto((a) => ({ ...a, [clearsAuto]: false }));
  };

  const recalcFromHoursAndGross = (form, s, auto, overrideNet) => {
    const tr = taxRatePct(s) / 100;
    let gross = parseFloat(form.gross_pay);
    const hoursNum = parseFloat(form.hours);
    const rate = s?.pay_rate != null ? Number(s.pay_rate) : 0;
    let next = { ...form };
    if (auto.gross && (s.pay_type === 'hourly' || s.pay_type === 'contractor')) {
      if (Number.isFinite(hoursNum) && hoursNum > 0 && rate > 0) {
        gross = hoursNum * rate;
        next.gross_pay = gross.toFixed(2);
      }
    } else if (auto.gross && s.pay_type === 'salary' && s.pay_frequency && rate > 0) {
      const n = PAY_PERIODS_PER_YEAR[s.pay_frequency] || 12;
      gross = rate / n;
      next.gross_pay = gross.toFixed(2);
    }
    gross = parseFloat(next.gross_pay);
    if (!Number.isFinite(gross)) return next;
    if (auto.taxes) {
      next.taxes_withheld = (gross * tr).toFixed(2);
    }
    if (auto.net && !overrideNet) {
      const tx = parseFloat(next.taxes_withheld) || 0;
      next.net_pay = (gross - tx).toFixed(2);
    }
    return next;
  };

  const saveStaff = async (e) => {
    e.preventDefault();
    if (!staffForm.name.trim()) {
      toast('Name is required.', 'error');
      return;
    }
    const roleVal = staffForm.roleSelect === CUSTOM_ROLE
      ? (staffForm.role || '').trim() || null
      : staffForm.roleSelect;
    setSaving(true);
    try {
      const payload = {
        name: staffForm.name.trim(),
        role: roleVal,
        pay_type: staffForm.pay_type,
        pay_rate: staffForm.pay_rate ? parseFloat(staffForm.pay_rate) : null,
        pay_frequency: staffForm.pay_frequency || null,
        anchor_date: staffForm.anchor_date || null,
        tax_rate: staffForm.tax_rate === '' || Number.isNaN(parseFloat(staffForm.tax_rate))
          ? null
          : parseFloat(staffForm.tax_rate),
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

  const openStaffModal = (s = null) => {
    setEditingStaff(s);
    if (s) {
      const preset = mergedRoles.find((p) => p.toLowerCase() === (s.role || '').trim().toLowerCase());
      const roleSelect = preset || (s.role ? CUSTOM_ROLE : 'Manager');
      setStaffForm({
        name: s.name,
        role: preset ? '' : (s.role || ''),
        roleSelect: roleSelect === CUSTOM_ROLE && !s.role ? 'Manager' : roleSelect,
        pay_type: s.pay_type,
        pay_rate: s.pay_rate != null ? String(s.pay_rate) : '',
        pay_frequency: s.pay_frequency || '',
        anchor_date: s.anchor_date?.slice(0, 10) || '',
        tax_rate: s.tax_rate != null ? String(s.tax_rate) : '15.3',
      });
    } else {
      setStaffForm(staffEmpty());
    }
    setStaffModal(true);
  };

  const autoCls = (on) => (on ? 'bg-sky-50/80 border-sky-100 border rounded-lg' : '');

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff pay</h1>
          <p className="text-sm text-gray-600 mt-1">Team and payroll runs</p>
        </div>
        <button
          type="button"
          onClick={() => openStaffModal(null)}
          {...write.props({ className: 'inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700' })}
        >
          <Plus className="w-4 h-4" /> Add staff
        </button>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Staff</h2>
        {staff.length === 0 ? (
          <EmptyState title="No staff yet" message="Add employees or contractors." actionLabel={write.allowed ? 'Add staff' : undefined} onAction={write.allowed ? () => openStaffModal(null) : undefined} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {staff.map((s) => (
              <div key={s.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{s.name}</p>
                  <p className="text-xs text-gray-500">{formatLabel(s.pay_type)}{s.pay_rate != null ? ` · $${Number(s.pay_rate).toFixed(2)}` : ''}</p>
                  {s.role && <p className="text-xs text-gray-600 truncate">{formatLabel(s.role)}</p>}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button type="button" onClick={() => openPayModal(s, null)} {...write.props({ className: 'text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700' })}>Pay run</button>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => openStaffModal(s)} className="p-1 text-gray-500 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
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
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto shadow-sm max-w-[100vw] sm:max-w-none">
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
                          openPayModal(st, r);
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
        <form onSubmit={saveStaff} className="space-y-3 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <input required value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
            <select
              value={staffForm.roleSelect}
              onChange={(e) => setStaffForm({ ...staffForm, roleSelect: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              {mergedRoles.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
              <option value={CUSTOM_ROLE}>Custom…</option>
            </select>
            {staffForm.roleSelect === CUSTOM_ROLE && (
              <input
                placeholder="Custom role"
                value={staffForm.role}
                onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm mt-2"
              />
            )}
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
              <input type="number" step="0.01" value={staffForm.pay_rate} onChange={(e) => setStaffForm({ ...staffForm, pay_rate: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder={staffForm.pay_type === 'salary' ? 'Annual salary' : 'Rate'} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Pay frequency</label>
            <select value={staffForm.pay_frequency} onChange={(e) => setStaffForm({ ...staffForm, pay_frequency: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">—</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="semi_monthly">Semi-Monthly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">First pay date (anchor)</label>
            <input type="date" value={staffForm.anchor_date} onChange={(e) => setStaffForm({ ...staffForm, anchor_date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tax rate (%)</label>
            <div className="flex items-center gap-2">
              <input type="number" step="0.01" value={staffForm.tax_rate} onChange={(e) => setStaffForm({ ...staffForm, tax_rate: e.target.value })} className="flex-1 border rounded-lg px-3 py-2 text-sm" />
              <span className="text-sm text-gray-500">%</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setStaffModal(false)} disabled={saving} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={payModal} onClose={() => setPayModal(false)} title={editingPay ? 'Edit pay run' : `Pay run — ${selStaff?.name || ''}`}>
        <form onSubmit={savePay} className="space-y-3 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className={autoCls(payAuto.period)}>
              <label className="block text-xs font-medium text-gray-700 mb-1">Period start {payAuto.period && <span className="text-sky-600 font-normal">(auto)</span>}</label>
              <input type="date" required value={payForm.period_start} onChange={(e) => onPayField('period_start', e.target.value, 'period')} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className={autoCls(payAuto.period)}>
              <label className="block text-xs font-medium text-gray-700 mb-1">Period end</label>
              <input type="date" required value={payForm.period_end} onChange={(e) => onPayField('period_end', e.target.value, 'period')} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hours</label>
              <input type="number" step="0.01" value={payForm.hours} onChange={(e) => {
                const v = e.target.value;
                setPayForm((prev) => recalcFromHoursAndGross(
                  { ...prev, hours: v },
                  selStaff,
                  { gross: true, taxes: true, net: true },
                  netOverride,
                ));
                setPayAuto((a) => ({ ...a, gross: true, taxes: true, net: true }));
              }} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className={autoCls(payAuto.gross)}>
              <label className="block text-xs font-medium text-gray-700 mb-1">Gross pay {payAuto.gross && <span className="text-sky-600 font-normal">(auto)</span>}</label>
              <input type="number" step="0.01" value={payForm.gross_pay} onChange={(e) => {
                const v = e.target.value;
                setPayAuto((a) => ({ ...a, gross: false, taxes: true, net: !netOverride }));
                setPayForm((prev) => {
                  const merged = { ...prev, gross_pay: v };
                  const g = parseFloat(v);
                  if (!Number.isFinite(g)) return merged;
                  const tr = taxRatePct(selStaff) / 100;
                  const taxStr = (g * tr).toFixed(2);
                  const netStr = (g - parseFloat(taxStr)).toFixed(2);
                  return {
                    ...merged,
                    taxes_withheld: taxStr,
                    net_pay: netOverride ? merged.net_pay : netStr,
                  };
                });
              }} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={autoCls(payAuto.taxes)}>
              <label className="block text-xs font-medium text-gray-700 mb-1">Taxes withheld {payAuto.taxes && <span className="text-sky-600 font-normal">(auto)</span>}</label>
              <input type="number" step="0.01" value={payForm.taxes_withheld} onChange={(e) => { onPayField('taxes_withheld', e.target.value, 'taxes'); setPayAuto((a) => ({ ...a, taxes: false, net: false })); }} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className={autoCls(payAuto.net && !netOverride)}>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-700">Net pay {payAuto.net && !netOverride && <span className="text-sky-600 font-normal">(auto)</span>}</label>
                {!netOverride ? (
                  <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setNetOverride(true)}>Override</button>
                ) : (
                  <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => { setNetOverride(false); setPayAuto((a) => ({ ...a, net: true })); }}>Use auto</button>
                )}
              </div>
              <input type="number" step="0.01" required readOnly={!netOverride} value={payForm.net_pay} onChange={(e) => onPayField('net_pay', e.target.value, 'net')} className="w-full border rounded-lg px-3 py-2 text-sm read-only:bg-gray-50" />
            </div>
          </div>
          <div className={autoCls(payAuto.paidOn)}>
            <label className="block text-xs font-medium text-gray-700 mb-1">Paid on {payAuto.paidOn && <span className="text-sky-600 font-normal">(auto)</span>}</label>
            <input type="date" value={payForm.paid_on} onChange={(e) => onPayField('paid_on', e.target.value, 'paidOn')} className="w-full border rounded-lg px-3 py-2 text-sm" />
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
