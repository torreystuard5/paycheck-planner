import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit, Trash2, ChevronDown, ChevronUp, DollarSign, Clock, Archive, Calendar, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import UploadDropzone from '../components/uploads/UploadDropzone';
import DocumentDetailDrawer from '../components/uploads/DocumentDetailDrawer';
import ProFeatureGate from '../components/ProFeatureGate';
import { formatFriendlyDate } from '../utils/formatDate';
import api from '../services/api';
import { useBudget } from '../context/BudgetContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';

import CurrencyDisplay from '../components/CurrencyDisplay';
import DateInput from '../components/DateInput';

const defaultEntryForm = {
  source_name: '',
  pay_date: new Date().toISOString().split('T')[0],
  net_amount: '',
  gross_amount: '',
  memo: '',
};

export default function Income() {
  const { activeBudget, budgetVersion, bumpBudgetVersion } = useBudget();
  const [entries, setEntries] = useState([]);
  const [monthlySummary, setMonthlySummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
  const [paystubDetailId, setPaystubDetailId] = useState(null);

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  // Generate last 12 months for the dropdown
  const monthOptions = useMemo(() => {
    const opts = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push({ month: d.getMonth() + 1, year: d.getFullYear(), label: d.toLocaleString('default', { month: 'long', year: 'numeric' }) });
    }
    return opts;
  }, []);

  // Distinct source names for auto-fill
  const [distinctSources, setDistinctSources] = useState([]);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    const bq = activeBudget?.id ? `&budget_id=${activeBudget.id}` : '';
    const bqFirst = activeBudget?.id ? `?budget_id=${activeBudget.id}` : '';
    try {
      const [entriesRes, summaryRes, sourcesRes] = await Promise.allSettled([
        api.get(`/api/v1/paycheck-entries?month=${selectedMonth}&year=${selectedYear}${bq}`),
        api.get(`/api/v1/paycheck-entries/monthly-summary?month=${selectedMonth}&year=${selectedYear}${bq}`),
        api.get(`/api/v1/paycheck-entries/distinct-sources${bqFirst}`),
      ]);
      if (entriesRes.status === 'fulfilled') {
        const all = Array.isArray(entriesRes.value.data) ? entriesRes.value.data : [];
        setEntries(all);
        setAllEntries(all);
        // Auto-expand the most recent entry on first load
        if (firstLoad && all.length > 0) {
          setExpandedEntryId(all[0].id);
          setFirstLoad(false);
        }
      }
      if (summaryRes.status === 'fulfilled') setMonthlySummary(summaryRes.value.data);
      if (sourcesRes.status === 'fulfilled') {
        setDistinctSources(Array.isArray(sourcesRes.value.data) ? sourcesRes.value.data : []);
      }
    } catch {
      setError('Failed to load income data.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [selectedMonth, selectedYear, firstLoad, activeBudget?.id]);

  useEffect(() => {
    fetchData(true);
  }, [fetchData, budgetVersion]);

  // ── Paycheck entry handlers ──
  const openAddEntry = () => {
    setEditingEntry(null);
    // Auto-fill source from history
    const autoSource = distinctSources.length > 0 ? distinctSources[0] : '';
    setEntryForm({ ...defaultEntryForm, source_name: autoSource });
    setShowEntryModal(true);
  };

  const openEditEntry = (entry) => {
    setEditingEntry(entry);
    setEntryForm({
      source_name: entry.source_name || '',
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
        source_name: entryForm.source_name || null,
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
      // Auto-select the month of the paycheck just logged/edited
      if (entryForm.pay_date) {
        const pd = new Date(entryForm.pay_date + 'T00:00:00');
        setSelectedMonth(pd.getMonth() + 1);
        setSelectedYear(pd.getFullYear());
      }
      // Invalidate all budget-version-keyed pages (Dashboard, etc.)
      bumpBudgetVersion();
      fetchData();
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
      fetchData();
    } catch {
      setError('Failed to delete paycheck entry.');
    }
  };

  const actualMonthlyNet = monthlySummary ? Number(monthlySummary.total_net) : 0;
  const paycheckCount = monthlySummary ? monthlySummary.paycheck_count : 0;

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

  if (loading) return <LoadingSpinner />;

  const monthLabel = new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  const handleMonthChange = (e) => {
    const [m, y] = e.target.value.split('-').map(Number);
    setSelectedMonth(m);
    setSelectedYear(y);
  };

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div className="min-w-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Income & Paychecks</h1>
            <p className="text-sm text-gray-600 mt-1">Track your take-home pay</p>
          </div>
          <button onClick={openAddEntry} className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700">
            <DollarSign className="h-4 w-4" />
            Log Paycheck
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      <ProFeatureGate featureKey="receipt_ocr">
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Upload className="h-5 w-5 text-blue-600" />
                Upload paystub
              </h2>
              <p className="text-sm text-gray-600">
                Scan a paystub to pre-fill a paycheck entry, or{' '}
                <Link to="/uploads" className="text-blue-600 hover:underline">
                  manage all uploads
                </Link>
                .
              </p>
            </div>
          </div>
          <UploadDropzone
            documentType="paystub"
            compact
            onUploaded={(doc) => {
              if (doc?.id) setPaystubDetailId(doc.id);
            }}
          />
        </div>
      </ProFeatureGate>

      {paystubDetailId && (
        <DocumentDetailDrawer
          documentId={paystubDetailId}
          onClose={() => setPaystubDetailId(null)}
          onUpdated={() => {
            setPaystubDetailId(null);
            bumpBudgetVersion();
            fetchData();
          }}
        />
      )}

      {/* Monthly income summary */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">{monthLabel} Income</p>
            <CurrencyDisplay amount={actualMonthlyNet} className="text-2xl font-bold text-green-600 mt-1 block" />
            <p className="text-xs text-gray-500 mt-1">
              {paycheckCount > 0
                ? `Based on ${paycheckCount} logged paycheck${paycheckCount !== 1 ? 's' : ''}`
                : 'No paychecks logged this month'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <select
              value={`${selectedMonth}-${selectedYear}`}
              onChange={handleMonthChange}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
            >
              {monthOptions.map((opt) => (
                <option key={`${opt.month}-${opt.year}`} value={`${opt.month}-${opt.year}`}>
                  {opt.label}
                </option>
              ))}
            </select>
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
                        <p className="text-sm font-medium text-gray-900 truncate">{entry.source_name || 'Paycheck'}</p>
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
                        {entry.source_name && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Source</span>
                            <span className="text-gray-700">{entry.source_name}</span>
                          </div>
                        )}
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

      {/* ── Log Paycheck Modal ── */}
      <Modal isOpen={showEntryModal} onClose={() => setShowEntryModal(false)} title={editingEntry ? 'Edit Paycheck' : 'Log Paycheck'}>
        <form onSubmit={handleEntrySubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <input
              type="text"
              list="source-suggestions"
              value={entryForm.source_name}
              onChange={(e) => setEntryForm({ ...entryForm, source_name: e.target.value })}
              className={inputClass}
              placeholder="e.g. Main Job, Side Gig"
            />
            {distinctSources.length > 0 && (
              <datalist id="source-suggestions">
                {distinctSources.map((s) => <option key={s} value={s} />)}
              </datalist>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pay Date</label>
            <DateInput value={entryForm.pay_date} onChange={(e) => setEntryForm({ ...entryForm, pay_date: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
            <button type="button" onClick={() => setShowEntryModal(false)} className="min-h-[44px] px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={savingEntry} className="min-h-[44px] px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
              {savingEntry ? 'Saving...' : editingEntry ? 'Update' : 'Log Paycheck'}
            </button>
          </div>
        </form>
      </Modal>

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
