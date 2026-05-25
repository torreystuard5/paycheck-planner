import { useEffect, useState, useCallback } from 'react';
import { Eye, Trash2, FileText } from 'lucide-react';
import { deleteBusinessDocument, listBusinessDocuments } from '../../services/api';
import LoadingSpinner from '../../components/LoadingSpinner';
import ConfirmDialog from '../../components/ConfirmDialog';
import UploadDropzone from '../../components/uploads/UploadDropzone';
import DocumentDetailDrawer from '../../components/uploads/DocumentDetailDrawer';
import { useBusinessWrite } from '../../hooks/useBusinessWrite';
import { useToast } from '../../components/Toast';
import { getStatusPill } from '../../lib/uploadStatus';

const TYPES = ['paystub', 'receipt', 'invoice', 'bill', 'vendor', 'tax', 'other'];

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
  const toast = useToast();
  const [docs, setDocs] = useState([]);
  const [type, setType] = useState('receipt');
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    listBusinessDocuments()
      .then(({ data }) => setDocs(Array.isArray(data) ? data : []))
      .catch(() => {
        toast('Failed to load documents', 'error');
        setDocs([]);
      })
      .finally(() => setLoading(false));
  }, [toast]);

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

  if (loading && !docs.length) return <LoadingSpinner />;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Business documents</h1>
        <p className="text-sm text-gray-600 mt-1">
          Paystubs, receipts, invoices, and tax supporting documents — stored in secure cloud storage.
        </p>
      </div>

      <div className="bg-white border rounded-lg p-4 space-y-3">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          disabled={write.disabled}
          className="w-full border rounded-lg px-3 py-2 min-h-[44px] disabled:opacity-50"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <UploadDropzone
          documentType={type}
          scope="business"
          compact
          disabled={write.disabled}
          onUploaded={(doc) => {
            toast('Uploaded — open details to review');
            load();
            if (doc?.id) setDetailId(doc.id);
          }}
        />
      </div>

      <ul className="text-sm divide-y border rounded-lg bg-white">
        {docs.length === 0 ? (
          <li className="p-6 text-center text-gray-500">No documents yet.</li>
        ) : (
          docs.map((d) => {
            const status = getStatusPill(d.status);
            const summary = parsedSummary(d.parsed_json, d.document_type);
            return (
              <li key={d.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate">
                    {d.original_filename || d.document_type}
                  </p>
                  {summary && <p className="text-xs text-gray-600 truncate">{summary}</p>}
                  <div className="flex gap-2 mt-1 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${status.color}`}>
                      {status.label}
                    </span>
                    <span className="text-xs text-gray-400 capitalize">{d.document_type}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setDetailId(d.id)}
                    className="p-2 text-gray-400 hover:text-purple-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title="Details"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(d)}
                    disabled={write.disabled}
                    className="p-2 text-gray-400 hover:text-red-600 min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })
        )}
      </ul>

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
    </div>
  );
}
