import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Trash2, FileText, Filter } from 'lucide-react';
import { deleteBusinessDocument, listBusinessDocuments } from '../../services/api';
import BusinessPageShell from '../../components/business/BusinessPageShell';
import ConfirmDialog from '../../components/ConfirmDialog';
import UploadDropzone from '../../components/uploads/UploadDropzone';
import DocumentDetailDrawer from '../../components/uploads/DocumentDetailDrawer';
import { useBusinessWrite } from '../../hooks/useBusinessWrite';
import { useBusinessAccess } from '../../hooks/useBusinessAccess';
import { useToast } from '../../components/Toast';
import { getStatusPill } from '../../lib/uploadStatus';
import { Badge, Button, Card, FilterChips } from '../../components/ui';

const TYPE_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'receipt', label: 'Receipts' },
  { key: 'invoice', label: 'Invoices' },
  { key: 'paystub', label: 'Paystubs' },
  { key: 'tax', label: 'Tax' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'other', label: 'Other' },
];

const UPLOAD_TYPES = ['paystub', 'receipt', 'invoice', 'bill', 'vendor', 'tax', 'other'];

function parsedSummary(parsed, documentType) {
  if (!parsed) return null;
  if (documentType === 'paystub') {
    const net = parsed.net_amount || parsed.net_pay;
    return [parsed.employer_name, net && `$${net}`].filter(Boolean).join(' · ') || null;
  }
  return [parsed.vendor_name, parsed.amount && `$${parsed.amount}`].filter(Boolean).join(' · ') || null;
}

export default function BusinessDocuments() {
  const write = useBusinessWrite('manage_deductions');
  const { teamRole } = useBusinessAccess();
  const toast = useToast();
  const [docs, setDocs] = useState([]);
  const [uploadType, setUploadType] = useState('receipt');
  const [filterType, setFilterType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = filterType !== 'all' ? { document_type: filterType } : {};
    listBusinessDocuments(params)
      .then(({ data }) => setDocs(Array.isArray(data) ? data : []))
      .catch(() => {
        setError('Failed to load documents.');
        setDocs([]);
      })
      .finally(() => setLoading(false));
  }, [filterType]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBusinessDocument(deleteTarget.id);
      toast('Document deleted');
      if (detailId === deleteTarget.id) setDetailId(null);
      setDeleteTarget(null);
      load();
    } catch {
      toast('Delete failed', 'error');
    }
  };

  return (
    <BusinessPageShell
      title="Business Documents"
      description="Paystubs, receipts, invoices, and tax supporting documents"
      loading={loading && docs.length === 0}
      error={error}
      teamRole={teamRole}
      maxWidth="max-w-3xl"
      actions={(
        <Link
          to="/business/tax-prep"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-subtle"
        >
          <FileText className="h-4 w-4" />
          Tax prep
        </Link>
      )}
    >
      <FilterChips
        options={TYPE_OPTIONS}
        value={filterType}
        onChange={setFilterType}
        aria-label="Document type filter"
      />

      <Card className="space-y-3 p-4 sm:p-5">
        <h2 className="text-title flex items-center gap-2">
          <Filter className="h-4 w-4 text-purple-600" />
          Upload document
        </h2>
        <select
          value={uploadType}
          onChange={(e) => setUploadType(e.target.value)}
          disabled={write.disabled}
          className="form-input"
          aria-label="Upload document type"
        >
          {UPLOAD_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <UploadDropzone
          documentType={uploadType}
          scope="business"
          compact
          disabled={write.disabled}
          onUploaded={(doc) => {
            toast('Uploaded — open details to review');
            load();
            if (doc?.id) setDetailId(doc.id);
          }}
        />
      </Card>

      <Card className="divide-y divide-border p-0">
        {docs.length === 0 ? (
          <p className="p-6 text-center text-body">No documents yet.</p>
        ) : (
          docs.map((d) => {
            const status = getStatusPill(d.status);
            const summary = parsedSummary(d.parsed_json, d.document_type);
            return (
              <div key={d.id} className="flex items-center justify-between gap-3 p-3 sm:p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {d.original_filename || d.document_type}
                  </p>
                  {summary && <p className="truncate text-caption">{summary}</p>}
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${status.color}`}>
                      {status.label}
                    </span>
                    <Badge variant="neutral" className="normal-case capitalize">{d.document_type}</Badge>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDetailId(d.id)}
                    aria-label="View details"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={write.disabled}
                    onClick={() => setDeleteTarget(d)}
                    className="text-danger-600 hover:text-danger-700"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </Card>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete document"
        message={`Delete "${deleteTarget?.original_filename || 'this file'}"?`}
        confirmText="Delete"
        danger
      />

      {detailId && (
        <DocumentDetailDrawer
          documentId={detailId}
          scope="business"
          onClose={() => setDetailId(null)}
          onUpdated={load}
        />
      )}
    </BusinessPageShell>
  );
}
