import { useState, useEffect, useCallback, useMemo } from 'react';
import { Edit, Trash2, ChevronDown, ChevronUp, DollarSign, Clock, Archive, Calendar, Upload, FileText, Loader2 } from 'lucide-react';
import { formatFriendlyDate } from '../utils/formatDate';
import api from '../services/api';
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

  const [paystubHistory, setPaystubHistory] = useState([]);
  const [paystubStep, setPaystubStep] = useState('idle');
  const [paystubFileId, setPaystubFileId] = useState(null);
  const [paystubOcr, setPaystubOcr] = useState(null);
  const [paystubBusy, setPaystubBusy] = useState(false);
  const [paystubForm, setPaystubForm] = useState({
    employer_name: '',
    pay_period_start: '',
    pay_period_end: '',
    gross_pay: '',
    net_pay: '',
    taxes_withheld: '',
    pay_date: '',
  });

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
    try {
      const [entriesRes, summaryRes, sourcesRes] = await Promise.allSettled([
        api.get(`/api/v1/paycheck-entries?month=${selectedMonth}&year=${selectedYear}`),
        api.get(`/api/v1/paycheck-entries/monthly-summary?month=${selectedMonth}&year=${selectedYear}`),
        api.get('/api/v1/paycheck-entries/distinct-sources'),
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
  }, [selectedMonth, selectedYear, firstLoad]);

  const loadPaystubHistory = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/income/paystub-uploads');
      setPaystubHistory(Array.isArray(res.data) ? res.data : []);
    } catch {
      setPaystubHistory([]);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  useEffect(() => {
    loadPaystubHistory();
  }, [loadPaystubHistory]);

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
    <div className="space-y-6">
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Income & Paychecks</h1>
            <p className="text-sm text-gray-600 mt-1">Track your take-home pay</p>
          </div>
          <button onClick={openAddEntry} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 transition-colors">
            <DollarSign className="h-4 w-4" />
            Log Paycheck
          </button>
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

      {/* Paystub upload (OCR) */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-gray-900">Upload paystub</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Add a photo or PDF of a paystub. We&apos;ll try to read amounts and dates; you can fix anything before saving as a recurring income source.
        </p>
        {paystubStep === 'idle' && (
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl py-10 px-4 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
            <Upload className="h-8 w-8 text-gray-400 mb-2" />
            <span className="text-sm font-medium text-gray-700">Drop a file or tap to choose</span>
            <span className="text-xs text-gray-400 mt-1">JPG, PNG, or PDF · max 15MB</span>
            <input
              type="file"
              accept="image/*,.pdf,application/pdf"
              capture="environment"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                setPaystubBusy(true);
                setPaystubStep('processing');
                try {
                  const fd = new FormData();
                  fd.append('file', f);
                  const up = await api.post('/api/v1/income/paystub-upload', fd, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                  });
                  const id = up.data.id;
                  setPaystubFileId(id);
                  const ocrRes = await api.post(`/api/v1/income/paystub-ocr/${id}`);
                  const ex = ocrRes.data.extracted || {};
                  const pick = (k) => (ex[k]?.value != null ? String(ex[k].value) : '');
                  setPaystubOcr(ocrRes.data);
                  setPaystubForm({
                    employer_name: pick('employer_name') || '',
                    pay_period_start: pick('pay_period_start') || '',
                    pay_period_end: pick('pay_period_end') || '',
                    gross_pay: pick('gross_pay') || '',
                    net_pay: pick('net_pay') || '',
                    taxes_withheld: pick('taxes_withheld') || '',
                    pay_date: pick('pay_date') || '',
                  });
                  setPaystubStep('review');
                } catch {
                  setPaystubStep('idle');
                } finally {
                  setPaystubBusy(false);
                }
              }}
            />
          </label>
        )}
        {paystubStep === 'processing' && (
          <div className="flex items-center justify-center gap-2 py-12 text-gray-600">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Processing…</span>
          </div>
        )}
        {paystubStep === 'review' && (
          <form
            className="space-y-3 max-w-lg"
            onSubmit={async (ev) => {
              ev.preventDefault();
              setPaystubBusy(true);
              try {
                await api.post('/api/v1/income/paystub-confirm', {
                  upload_id: paystubFileId,
                  employer_name: paystubForm.employer_name,
                  pay_period_start: paystubForm.pay_period_start || null,
                  pay_period_end: paystubForm.pay_period_end || null,
                  gross_pay: paystubForm.gross_pay || null,
                  net_pay: paystubForm.net_pay,
                  taxes_withheld: paystubForm.taxes_withheld || null,
                  pay_date: paystubForm.pay_date || null,
                });
                setPaystubStep('idle');
                setPaystubFileId(null);
                setPaystubOcr(null);
                await loadPaystubHistory();
              } catch {
                /* ignore */
              } finally {
                setPaystubBusy(false);
              }
            }}
          >
            {['employer_name', 'net_pay', 'gross_pay', 'taxes_withheld', 'pay_date', 'pay_period_start', 'pay_period_end'].map((field) => {
              const label = field.replace(/_/g, ' ');
              const ex = paystubOcr?.extracted?.[field];
              const warn = ex?.confidence === 'needs_review';
              return (
                <div key={field}>
                  <label className={`block text-xs font-medium mb-1 ${warn ? 'text-amber-800' : 'text-gray-600'}`}>
                    {label}{warn ? ' — please verify' : ''}
                  </label>
                  <input
                    className={`w-full px-3 py-2 border rounded-lg text-sm ${warn ? 'border-amber-300 bg-amber-50' : 'border-gray-300'}`}
                    value={paystubForm[field]}
                    onChange={(e) => setPaystubForm((p) => ({ ...p, [field]: e.target.value }))}
                    required={field === 'employer_name' || field === 'net_pay'}
                  />
                </div>
              );
            })}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => { setPaystubStep('idle'); setPaystubFileId(null); }} className="px-4 py-2 text-sm text-gray-700 border rounded-lg">
                Cancel
              </button>
              <button type="submit" disabled={paystubBusy} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg disabled:opacity-50">
                {paystubBusy ? 'Saving…' : 'Confirm & save income source'}
              </button>
            </div>
          </form>
        )}
        {paystubHistory.length > 0 && (
          <div className="mt-6 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Recent uploads</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              {paystubHistory.slice(0, 8).map((h) => (
                <li key={h.id} className="flex justify-between gap-2">
                  <span className="truncate">{h.file_type} · {h.ocr_status}</span>
                  <span className="text-xs text-gray-400 shrink-0">{h.created_at?.slice?.(0, 10)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
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
