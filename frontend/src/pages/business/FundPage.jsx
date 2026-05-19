import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import api from '../../services/api';
import { formatApiError } from '../../utils/formatApiError';
import { formatFriendlyDate } from '../../utils/formatDate';
import CurrencyDisplay from '../../components/CurrencyDisplay';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useToast } from '../../components/Toast';
import { useBusinessWrite } from '../../hooks/useBusinessWrite';
import { formatLabel } from '../../utils/formatLabel';

export default function FundPage() {
  const location = useLocation();
  const fundType = location.pathname.includes('upgrade') ? 'upgrade' : 'contingency';
  const title = fundType === 'upgrade' ? 'Upgrade Fund' : 'Contingency Fund';
  const toast = useToast();
  const write = useBusinessWrite('manage_funds');
  const [fund, setFund] = useState(null);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [txModal, setTxModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [txForm, setTxForm] = useState({ date: new Date().toISOString().slice(0, 10), amount: '', kind: 'deposit', note: '' });
  const [editForm, setEditForm] = useState({ name: '', target_amount: '', monthly_contribution: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [delTx, setDelTx] = useState(null);

  const load = async () => {
    try {
      const { data: funds } = await api.get(`/api/v1/business/funds?fund_type=${fundType}`);
      const list = Array.isArray(funds) ? funds : [];
      const f = list[0] || null;
      setFund(f);
      if (f) {
        const { data } = await api.get(`/api/v1/business/funds/${f.id}/transactions`);
        setTxs(Array.isArray(data) ? data : []);
      } else {
        setTxs([]);
      }
    } catch (e) {
      toast(formatApiError(e), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [fundType]);

  const pct = () => {
    if (!fund?.target_amount || Number(fund.target_amount) <= 0) return 0;
    return Math.min(100, Math.round((Number(fund.current_balance) / Number(fund.target_amount)) * 100));
  };

  const saveTx = async (e) => {
    e.preventDefault();
    if (!fund) return;
    const amt = parseFloat(txForm.amount);
    if (!txForm.date || Number.isNaN(amt)) {
      toast('Date and amount required.', 'error');
      return;
    }
    if (txForm.kind === 'deposit' && amt <= 0) {
      toast('Deposit must be a positive amount.', 'error');
      return;
    }
    if (txForm.kind === 'withdrawal' && amt <= 0) {
      toast('Withdrawal must be a positive amount.', 'error');
      return;
    }
    const amount = txForm.kind === 'adjustment' ? amt : Math.abs(amt);
    setSaving(true);
    try {
      await api.post(`/api/v1/business/funds/${fund.id}/transactions`, {
        date: txForm.date,
        amount,
        kind: txForm.kind,
        note: txForm.note || null,
      });
      toast('Transaction recorded.');
      setTxModal(false);
      setTxForm({ date: new Date().toISOString().slice(0, 10), amount: '', kind: 'deposit', note: '' });
      await load();
    } catch (err) {
      toast(formatApiError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!fund) return;
    setSaving(true);
    try {
      await api.patch(`/api/v1/business/funds/${fund.id}`, {
        name: editForm.name || fund.name,
        target_amount: editForm.target_amount === '' ? null : parseFloat(editForm.target_amount),
        monthly_contribution: editForm.monthly_contribution === '' ? null : parseFloat(editForm.monthly_contribution),
        notes: editForm.notes || null,
      });
      toast('Fund updated.');
      setEditModal(false);
      await load();
    } catch (err) {
      toast(formatApiError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelTx = async () => {
    if (!delTx || !fund) return;
    try {
      await api.delete(`/api/v1/business/funds/${fund.id}/transactions/${delTx.id}`);
      toast('Removed.');
      setDelTx(null);
      await load();
    } catch (e) {
      toast(formatApiError(e), 'error');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-600 mt-1">Balance and contributions</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTxModal(true)}
            {...write.props({ className: 'inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700' })}
          >
            <Plus className="w-4 h-4" /> Transaction
          </button>
          {fund && (
            <button type="button" onClick={() => {
              setEditForm({
                name: fund.name,
                target_amount: fund.target_amount != null ? String(fund.target_amount) : '',
                monthly_contribution: fund.monthly_contribution != null ? String(fund.monthly_contribution) : '',
                notes: fund.notes || '',
              });
              setEditModal(true);
            }} {...write.props({ className: 'inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50' })}>
              <Pencil className="w-4 h-4" /> Settings
            </button>
          )}
        </div>
      </div>

      {fund ? (
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-4">
          <div>
            <p className="text-xs text-gray-500 uppercase">Current balance</p>
            <CurrencyDisplay amount={fund.current_balance} className="text-3xl font-bold text-gray-900 mt-1 block" />
          </div>
          {fund.target_amount != null && (
            <>
              <div>
                <p className="text-xs text-gray-500 uppercase">Target</p>
                <CurrencyDisplay amount={fund.target_amount} className="text-lg font-medium text-gray-800" />
              </div>
              <div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${pct()}%` }} />
                </div>
                <p className="text-xs text-gray-500 mt-1">{pct()}% of target</p>
              </div>
            </>
          )}
          {fund.monthly_contribution != null && (
            <p className="text-sm text-gray-600">Monthly contribution: <CurrencyDisplay amount={fund.monthly_contribution} className="inline font-semibold" /></p>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500">Loading fund…</p>
      )}

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Transactions</h2>
        {txs.length === 0 ? (
          <p className="text-sm text-gray-500">No transactions yet.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 whitespace-nowrap">{formatFriendlyDate(t.date)}</td>
                    <td className="px-3 py-2">{formatLabel(t.kind)}</td>
                    <td className={`px-3 py-2 font-medium ${Number(t.amount) < 0 ? 'text-red-600' : Number(t.amount) > 0 ? 'text-green-700' : ''}`}>
                      <CurrencyDisplay amount={t.amount} />
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => setDelTx(t)} {...write.props({ className: 'p-1 text-gray-500 hover:text-red-600' })}><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={txModal} onClose={() => setTxModal(false)} title="Add transaction">
        <form onSubmit={saveTx} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
            <input type="date" required value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Kind</label>
            <select value={txForm.kind} onChange={(e) => setTxForm({ ...txForm, kind: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
            <input type="number" step="0.01" required value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Note</label>
            <input value={txForm.note} onChange={(e) => setTxForm({ ...txForm, note: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setTxModal(false)} disabled={saving} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={editModal} onClose={() => setEditModal(false)} title="Fund settings">
        <form onSubmit={saveEdit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Target amount</label>
            <input type="number" step="0.01" value={editForm.target_amount} onChange={(e) => setEditForm({ ...editForm, target_amount: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Monthly contribution</label>
            <input type="number" step="0.01" value={editForm.monthly_contribution} onChange={(e) => setEditForm({ ...editForm, monthly_contribution: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditModal(false)} disabled={saving} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!delTx} onClose={() => setDelTx(null)} onConfirm={confirmDelTx} title="Remove transaction" message="This will update the fund balance." confirmText="Remove" danger />
    </div>
  );
}
