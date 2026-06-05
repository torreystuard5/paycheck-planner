import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { Edit, Trash2, ChevronDown, ChevronUp, DollarSign, Clock, Archive, Calendar, Upload, LayoutDashboard } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProFeatureGate from '../components/ProFeatureGate';
import { formatFriendlyDate } from '../utils/formatDate';
import api from '../services/api';
import { useBudget } from '../context/BudgetContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import CurrencyDisplay from '../components/CurrencyDisplay';
import DateInput from '../components/DateInput';
import { Badge, Button, Card, IconStat, PageHeader } from '../components/ui';

const UploadDropzone = lazy(() => import('../components/uploads/UploadDropzone'));
const DocumentDetailDrawer = lazy(() => import('../components/uploads/DocumentDetailDrawer'));

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


  if (loading) return <LoadingSpinner />;

  const monthLabel = new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  const handleMonthChange = (e) => {
    const [m, y] = e.target.value.split('-').map(Number);
    setSelectedMonth(m);
    setSelectedYear(y);
  };

  return (
    <div className="page-container min-w-0 space-y-6">
      <PageHeader
        title="Income & Paychecks"
        description="Log paychecks, upload paystubs, and review your monthly income"
        actions={
          <Button variant="primary" onClick={openAddEntry} className="w-full sm:w-auto">
            <DollarSign className="h-4 w-4" />
            Log Paycheck
          </Button>
        }
      />

      {error && (
        <Card className="border-danger-200 bg-danger-50 p-3 text-sm text-danger-700" role="alert">{error}</Card>
      )}
      <Card className="flex flex-col gap-3 border-accent-200/60 bg-accent-50/40 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Paycheck planning lives on your Dashboard</p>
          <p className="text-body mt-1">
            After you log income here, open the Dashboard to see your envelope allocation and bill checklist.
          </p>
        </div>
        <Link
          to="/"
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-subtle sm:w-auto"
        >
          <LayoutDashboard className="h-4 w-4" />
          Go to Dashboard
        </Link>
      </Card>

      <ProFeatureGate featureKey="receipt_ocr">
        <Card className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-title flex items-center gap-2">
                <Upload className="h-5 w-5 text-accent-600" aria-hidden />
                Upload paystub
              </h2>
              <p className="text-body mt-1">
                Scan a paystub to pre-fill a paycheck entry, or{' '}
                <Link to="/uploads" className="font-medium text-accent-600 hover:text-accent-700 hover:underline">
                  manage all uploads
                </Link>
                .
              </p>
            </div>
          </div>
          <Suspense fallback={<LoadingSpinner label="Loading uploader" />}>
            <UploadDropzone
              documentType="paystub"
              compact
              onUploaded={(doc) => {
                if (doc?.id) setPaystubDetailId(doc.id);
              }}
            />
          </Suspense>
        </Card>
      </ProFeatureGate>

      {paystubDetailId && (
        <Suspense fallback={null}>
          <DocumentDetailDrawer
            documentId={paystubDetailId}
            onClose={() => setPaystubDetailId(null)}
            onUpdated={() => {
              setPaystubDetailId(null);
              bumpBudgetVersion();
              fetchData();
            }}
          />
        </Suspense>
      )}

      {/* Monthly income summary */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <IconStat icon={DollarSign} tone="brand" className="rounded-xl p-2.5" iconClassName="h-5 w-5" />
            <div>
              <p className="text-caption font-semibold uppercase tracking-wide text-muted">{monthLabel}</p>
              <CurrencyDisplay amount={actualMonthlyNet} className="text-money mt-1 block text-brand-600" />
              <p className="text-caption mt-1">
                {paycheckCount > 0
                  ? `Based on ${paycheckCount} logged paycheck${paycheckCount !== 1 ? 's' : ''}`
                  : 'No paychecks logged this month'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted" />
            <select
              value={`${selectedMonth}-${selectedYear}`}
              onChange={handleMonthChange}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              {monthOptions.map((opt) => (
                <option key={`${opt.month}-${opt.year}`} value={`${opt.month}-${opt.year}`}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Paycheck History */}
      {allEntries.length > 0 && (
        <div>
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted" />
            <h2 className="text-title">Paycheck History</h2>
            <Badge variant="neutral" className="normal-case">
              {allEntries.length} check{allEntries.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          <div className="space-y-3">
            {(showArchive ? allEntries : allEntries.slice(0, 10)).map((entry) => {
              const isExpEntry = expandedEntryId === entry.id;
              return (
                <Card key={entry.id} className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedEntryId(isExpEntry ? null : entry.id)}
                    className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-surface-subtle sm:p-5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <IconStat icon={DollarSign} tone="brand" className="rounded-lg p-2" iconClassName="h-4 w-4" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{entry.source_name || 'Paycheck'}</p>
                        <p className="text-caption">{formatFriendlyDate(entry.pay_date)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <CurrencyDisplay amount={entry.net_amount} className="text-base font-bold text-foreground" />
                      {isExpEntry ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
                    </div>
                  </button>
                  <div
                    className="overflow-hidden transition-all duration-300 ease-in-out"
                    style={{ maxHeight: isExpEntry ? '250px' : '0px', opacity: isExpEntry ? 1 : 0 }}
                  >
                    <div className="px-4 pb-4 sm:px-5">
                      <div className="space-y-2 border-t border-border pt-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted">Pay Date</span>
                          <span className="text-foreground">{formatFriendlyDate(entry.pay_date)}</span>
                        </div>
                        {entry.source_name && (
                          <div className="flex justify-between">
                            <span className="text-muted">Source</span>
                            <span className="text-foreground">{entry.source_name}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted">Net (Take-Home)</span>
                          <CurrencyDisplay amount={entry.net_amount} className="font-medium text-foreground" />
                        </div>
                        {entry.gross_amount && (
                          <div className="flex justify-between">
                            <span className="text-muted">Gross</span>
                            <CurrencyDisplay amount={entry.gross_amount} className="font-medium text-foreground" />
                          </div>
                        )}
                        {entry.memo && (
                          <div className="flex justify-between">
                            <span className="text-muted">Memo</span>
                            <span className="text-foreground">{entry.memo}</span>
                          </div>
                        )}
                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openEditEntry(entry); }}
                            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-accent-50 hover:text-accent-600"
                            aria-label="Edit paycheck"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDeleteEntryTarget(entry); }}
                            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger-50 hover:text-danger-600"
                            aria-label="Delete paycheck"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          {!showArchive && allEntries.length > 10 && (
            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={() => setShowArchive(true)}
            >
              <Archive className="h-4 w-4" />
              View Archive ({allEntries.length - 10} older)
            </Button>
          )}
          {showArchive && allEntries.length > 10 && (
            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={() => setShowArchive(false)}
            >
              <ChevronUp className="h-4 w-4" />
              Hide Archive
            </Button>
          )}
        </div>
      )}

      {/* ── Log Paycheck Modal ── */}
      <Modal isOpen={showEntryModal} onClose={() => setShowEntryModal(false)} title={editingEntry ? 'Edit Paycheck' : 'Log Paycheck'}>
        <form onSubmit={handleEntrySubmit} className="space-y-4">
          <div>
            <label className="form-label">Source</label>
            <input
              type="text"
              list="source-suggestions"
              value={entryForm.source_name}
              onChange={(e) => setEntryForm({ ...entryForm, source_name: e.target.value })}
              className="form-input"
              placeholder="e.g. Main Job, Side Gig"
            />
            {distinctSources.length > 0 && (
              <datalist id="source-suggestions">
                {distinctSources.map((s) => <option key={s} value={s} />)}
              </datalist>
            )}
          </div>
          <div>
            <label className="form-label">Pay Date</label>
            <DateInput value={entryForm.pay_date} onChange={(e) => setEntryForm({ ...entryForm, pay_date: e.target.value })} className="form-input" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="form-label">Net Amount (take-home)</label>
              <input type="number" step="0.01" required value={entryForm.net_amount} onChange={(e) => setEntryForm({ ...entryForm, net_amount: e.target.value })} className="form-input" />
            </div>
            <div>
              <label className="form-label">Gross Amount (optional)</label>
              <input type="number" step="0.01" value={entryForm.gross_amount} onChange={(e) => setEntryForm({ ...entryForm, gross_amount: e.target.value })} className="form-input" />
            </div>
          </div>
          <div>
            <label className="form-label">Memo (optional)</label>
            <input type="text" maxLength={255} value={entryForm.memo} onChange={(e) => setEntryForm({ ...entryForm, memo: e.target.value })} className="form-input" placeholder="e.g. Overtime included" />
          </div>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="secondary" onClick={() => setShowEntryModal(false)} disabled={savingEntry}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={savingEntry}>
              {savingEntry ? 'Saving…' : editingEntry ? 'Update' : 'Log Paycheck'}
            </Button>
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
