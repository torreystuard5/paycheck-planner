import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Wallet, Calendar, ChevronDown, ChevronUp, DollarSign, RefreshCw, Clock, Archive } from 'lucide-react';
import SortDropdown from '../components/SortDropdown';
import { formatFriendlyDate } from '../utils/formatDate';
import api from '../services/api';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import CurrencyDisplay from '../components/CurrencyDisplay';
import DateInput from '../components/DateInput';

const FREQUENCIES = ['weekly', 'biweekly', 'semi_monthly', 'monthly'];

const defaultForm = {
  name: '',
  amount: '',
  frequency: 'biweekly',
  next_pay_date: new Date().toISOString().split('T')[0],
};

const defaultEntryForm = {
  income_source_id: '',
  pay_date: new Date().toISOString().split('T')[0],
  net_amount: '',
  gross_amount: '',
  memo: '',
};

export default function Income() {
  const [incomes, setIncomes] = useState([]);
  const [entries, setEntries] = useState([]);
  const [monthlySummary, setMonthlySummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showModal, setShowModal] = useState(false);
  const [editingIncome, setEditingIncome] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  // Paycheck entry state
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [entryForm, setEntryForm] = useState(defaultEntryForm);
  const [savingEntry, setSavingEntry] = useState(false);
  const [deleteEntryTarget, setDeleteEntryTarget] = useState(null);
  const [allEntries, setAllEntries] = useState([]);
  const [expandedEntryId, setExpandedEntryId] = useState(null);
  const [showArchive, setShowArchive] = useState(false);
  const [firstLoad, setFirstLoad] = useState(true);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const fetchIncomes = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const [incomesRes, entriesRes, summaryRes, allEntriesRes] = await Promise.allSettled([
        api.get(`/api/v1/income?sort_by=${sortBy}&sort_order=${sortOrder}`),
        api.get(`/api/v1/paycheck-entries?month=${currentMonth}&year=${currentYear}`),
        api.get(`/api/v1/paycheck-entries/monthly-summary?month=${currentMonth}&year=${currentYear}`),
        api.get('/api/v1/paycheck-entries'),
      ]);
      if (incomesRes.status === 'fulfilled') setIncomes(Array.isArray(incomesRes.value.data) ? incomesRes.value.data : []);
      if (entriesRes.status === 'fulfilled') setEntries(Array.isArray(entriesRes.value.data) ? entriesRes.value.data : []);
      if (summaryRes.status === 'fulfilled') setMonthlySummary(summaryRes.value.data);
      if (allEntriesRes.status === 'fulfilled') {
        const all = Array.isArray(allEntriesRes.value.data) ? allEntriesRes.value.data : [];
        setAllEntries(all);
        // Auto-expand the most recent entry on first load
        if (firstLoad && all.length > 0) {
          setExpandedEntryId(all[0].id);
          setFirstLoad(false);
        }
      }
    } catch {
      setError('Failed to load income data.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [sortBy, sortOrder, currentMonth, currentYear, firstLoad]);

  useEffect(() => {
    fetchIncomes(true);
  }, [fetchIncomes]);

  // ── Income source handlers ──
  const openAdd = () => {
    setEditingIncome(null);
    setForm(defaultForm);
    setShowModal(true);
  };

  const openEdit = (income) => {
    setEditingIncome(income);
    setForm({
      name: income.name || '',
      amount: income.amount || '',
      frequency: income.frequency || 'biweekly',
      next_pay_date: income.next_pay_date || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name || null,
        amount: form.amount ? parseFloat(form.amount) : null,
        frequency: form.frequency || 'monthly',
        next_pay_date: form.next_pay_date || null,
      };
      if (editingIncome) {
        await api.put(`/api/v1/income/${editingIncome.id}`, payload);
      } else {
        await api.post('/api/v1/income', payload);
      }
      setShowModal(false);
      fetchIncomes();
    } catch {
      setError('Failed to save income source.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/v1/income/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchIncomes();
    } catch {
      setError('Failed to delete income source.');
    }
  };

  // ── Paycheck entry handlers ──
  const openAddEntry = () => {
    setEditingEntry(null);
    setEntryForm(defaultEntryForm);
    setShowEntryModal(true);
  };

  const openEditEntry = (entry) => {
    setEditingEntry(entry);
    setEntryForm({
      income_source_id: entry.income_source_id || '',
      pay_date: entry.pay_date || '',
      net_amount: entry.net_amount || '',
      gross_amount: entry.gross_amount || '',
      memo: entry.memo || '',
    });
    setShowEntryModal(true);
  };

  const handleEntrySubmit = async (e) => {
    e.preventDefault();
    setSavingEntry(true);
    setError(null);
    try {
      const payload = {
        income_source_id: entryForm.income_source_id || null,
        pay_date: entryForm.pay_date,
        net_amount: parseFloat(entryForm.net_amount),
        gross_amount: entryForm.gross_amount ? parseFloat(entryForm.gross_amount) : null,
        memo: entryForm.memo || null,
      };
      if (editingEntry) {
        await api.put(`/api/v1/paycheck-entries/${editingEntry.id}`, payload);
      } else {
        await api.post('/api/v1/paycheck-entries', payload);
      }
      setShowEntryModal(false);
      fetchIncomes();
    } catch {
      setError('Failed to save paycheck entry.');
    } finally {
      setSavingEntry(false);
    }
  };

  const handleDeleteEntry = async () => {
    if (!deleteEntryTarget) return;
    try {
      await api.delete(`/api/v1/paycheck-entries/${deleteEntryTarget.id}`);
      setDeleteEntryTarget(null);
      fetchIncomes();
    } catch {
      setError('Failed to delete paycheck entry.');
    }
  };

  // ── Estimated monthly from frequency (fallback when no entries exist) ──
  const estimatedFromSources = incomes.reduce((sum, inc) => {
    const amt = Number(inc.amount) || 0;
    switch (inc.frequency) {
      case 'weekly': return sum + (amt * 52) / 12;
      case 'biweekly': return sum + (amt * 26) / 12;
      case 'semi_monthly': return sum + amt * 2;
      case 'monthly': return sum + amt;
      default: return sum + amt;
    }
  }, 0);

  const actualMonthlyNet = monthlySummary ? Number(monthlySummary.total_net) : 0;
  const paycheckCount = monthlySummary ? monthlySummary.paycheck_count : 0;

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

  if (loading) return <LoadingSpinner />;

  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Income & Paychecks</h1>
            <p className="text-sm text-gray-600 mt-1">Manage your income sources and log paychecks</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={openAddEntry} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 transition-colors">
              <DollarSign className="h-4 w-4" />
              Log Paycheck
            </button>
            <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors">
              <Plus className="h-4 w-4" />
              Add Source
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Monthly income summary */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">{monthLabel} Income</p>
            {paycheckCount > 0 ? (
              <>
                <CurrencyDisplay amount={actualMonthlyNet} className="text-2xl font-bold text-green-600 mt-1 block" />
                <p className="text-xs text-gray-500 mt-1">{paycheckCount} paycheck{paycheckCount !== 1 ? 's' : ''} logged this month</p>
              </>
            ) : (
              <>
                <CurrencyDisplay amount={estimatedFromSources} className="text-2xl font-bold text-green-600 mt-1 block" />
                <p className="text-xs text-gray-500 mt-1">Estimated from income sources — log a paycheck for actuals</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Paycheck History */}
      {allEntries.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Paycheck History</h2>
            <span className="text-xs font-medium px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
              {allEntries.length} check{allEntries.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {(showArchive ? allEntries : allEntries.slice(0, 10)).map((entry) => {
              const source = incomes.find((s) => s.id === entry.income_source_id);
              const isExpEntry = expandedEntryId === entry.id;
              return (
                <div key={entry.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setExpandedEntryId(isExpEntry ? null : entry.id)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="bg-green-50 p-2 rounded-lg shrink-0">
                        <DollarSign className="h-5 w-5 text-green-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{source?.name || 'Paycheck'}</p>
                        <p className="text-xs text-gray-500">{formatFriendlyDate(entry.pay_date)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <CurrencyDisplay amount={entry.net_amount} className="text-base font-bold text-gray-900" />
                      {isExpEntry ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </button>
                  <div
                    className="overflow-hidden transition-all duration-300 ease-in-out"
                    style={{ maxHeight: isExpEntry ? '250px' : '0px', opacity: isExpEntry ? 1 : 0 }}
                  >
                    <div className="px-4 pb-4">
                      <div className="border-t border-gray-200 pt-3 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Pay Date</span>
                          <span className="text-gray-700">{formatFriendlyDate(entry.pay_date)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Source</span>
                          <span className="text-gray-700">{source?.name || '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Net (Take-Home)</span>
                          <CurrencyDisplay amount={entry.net_amount} className="font-medium text-gray-900" />
                        </div>
                        {entry.gross_amount && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Gross</span>
                            <CurrencyDisplay amount={entry.gross_amount} className="font-medium text-gray-700" />
                          </div>
                        )}
                        {entry.memo && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Memo</span>
                            <span className="text-gray-700">{entry.memo}</span>
                          </div>
                        )}
                        <div className="flex justify-end gap-2 pt-2">
                          <button onClick={(e) => { e.stopPropagation(); openEditEntry(entry); }} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteEntryTarget(entry); }} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {!showArchive && allEntries.length > 10 && (
            <button
              onClick={() => setShowArchive(true)}
              className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Archive className="h-4 w-4" />
              View Archive ({allEntries.length - 10} older)
            </button>
          )}
          {showArchive && allEntries.length > 10 && (
            <button
              onClick={() => setShowArchive(false)}
              className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronUp className="h-4 w-4" />
              Hide Archive
            </button>
          )}
        </div>
      )}

      {/* Income Sources */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Income Sources</h2>
          <SortDropdown
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(sb, so) => { setSortBy(sb); setSortOrder(so); }}
            options={[
              { value: 'source', label: 'Source' },
              { value: 'amount', label: 'Amount' },
              { value: 'pay_date', label: 'Pay Date' },
              { value: 'created_at', label: 'Date Added' },
            ]}
          />
        </div>

        {incomes.length === 0 ? (
          <EmptyState icon={Wallet} title="No Income Sources" message="Add your first income source to get started." actionLabel="Add Source" onAction={openAdd} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {incomes.map((income) => {
              const isExpanded = expandedId === income.id;
              return (
                <div key={income.id} className={`bg-white rounded-lg shadow-sm border border-gray-200 ${!income.is_active ? 'opacity-60' : ''}`}>
                  <div className="p-4">
                    {/* Line 1: Name + actions */}
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-semibold text-gray-900 truncate">{income.name}</h3>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEdit(income)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteTarget(income)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : income.id)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Line 2: Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 capitalize">
                        {income.frequency?.replace(/_/g, ' ') || 'Monthly'}
                      </span>
                      {!income.is_active && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Inactive</span>
                      )}
                    </div>

                    {/* Line 3: Amount */}
                    <div className="mt-2">
                      <CurrencyDisplay amount={income.amount} className="text-lg font-bold text-gray-900" />
                    </div>

                    {/* Line 4: Next pay date */}
                    <div className="flex items-center gap-1.5 mt-1.5 text-sm text-gray-500">
                      <Calendar className="w-4 h-4" />
                      <span>Next: {income.next_pay_date ? formatFriendlyDate(income.next_pay_date) : '--'}</span>
                    </div>
                  </div>

                  {/* Expanded section */}
                  <div
                    className="overflow-hidden transition-all duration-300 ease-in-out"
                    style={{ maxHeight: isExpanded ? '200px' : '0px', opacity: isExpanded ? 1 : 0 }}
                  >
                    <div className="px-4 pb-4">
                      <div className="border-t border-gray-200 pt-3 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Per Paycheck</span>
                          <CurrencyDisplay amount={income.amount} className="font-medium text-gray-900" />
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Est. Monthly</span>
                          <CurrencyDisplay
                            amount={(() => {
                              const amt = Number(income.amount) || 0;
                              switch (income.frequency) {
                                case 'weekly': return (amt * 52) / 12;
                                case 'biweekly': return (amt * 26) / 12;
                                case 'semi_monthly': return amt * 2;
                                case 'monthly': return amt;
                                default: return amt;
                              }
                            })()}
                            className="font-medium text-gray-900"
                          />
                        </div>
                        {income.created_at && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Added</span>
                            <span className="text-gray-700">{formatFriendlyDate(income.created_at)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Income Source Modal ── */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingIncome ? 'Edit Income Source' : 'Add Income Source'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="e.g. Main Job, Side Gig" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className={inputClass}>
                {FREQUENCIES.map((f) => <option key={f} value={f} className="capitalize">{f.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Next Pay Date</label>
            <DateInput value={form.next_pay_date} onChange={(e) => setForm({ ...form, next_pay_date: e.target.value })} className={inputClass} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : editingIncome ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Log Paycheck Modal ── */}
      <Modal isOpen={showEntryModal} onClose={() => setShowEntryModal(false)} title={editingEntry ? 'Edit Paycheck' : 'Log Paycheck'}>
        <form onSubmit={handleEntrySubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Income Source (optional)</label>
            <select value={entryForm.income_source_id} onChange={(e) => setEntryForm({ ...entryForm, income_source_id: e.target.value })} className={inputClass}>
              <option value="">— None —</option>
              {incomes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pay Date</label>
            <DateInput value={entryForm.pay_date} onChange={(e) => setEntryForm({ ...entryForm, pay_date: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Net Amount (take-home)</label>
              <input type="number" step="0.01" required value={entryForm.net_amount} onChange={(e) => setEntryForm({ ...entryForm, net_amount: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gross Amount (optional)</label>
              <input type="number" step="0.01" value={entryForm.gross_amount} onChange={(e) => setEntryForm({ ...entryForm, gross_amount: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Memo (optional)</label>
            <input type="text" maxLength={255} value={entryForm.memo} onChange={(e) => setEntryForm({ ...entryForm, memo: e.target.value })} className={inputClass} placeholder="e.g. Overtime included" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowEntryModal(false)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={savingEntry} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
              {savingEntry ? 'Saving...' : editingEntry ? 'Update' : 'Log Paycheck'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm dialogs */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Income Source"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        danger
      />
      <ConfirmDialog
        isOpen={!!deleteEntryTarget}
        onClose={() => setDeleteEntryTarget(null)}
        onConfirm={handleDeleteEntry}
        title="Delete Paycheck Entry"
        message="Are you sure you want to delete this paycheck entry? This action cannot be undone."
        confirmText="Delete"
        danger
      />
    </div>
  );
}
