import { useState, useEffect, useCallback } from 'react';
import {
  Upload,
  Trash2,
  Eye,
  FileText,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';
import { listDocuments, deleteDocument } from '../services/api';
import { useBudget } from '../context/BudgetContext';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import UploadDropzone from '../components/uploads/UploadDropzone';
import DocumentDetailDrawer from '../components/uploads/DocumentDetailDrawer';
import { getStatusPill } from '../lib/uploadStatus';
import ProFeatureGate from '../components/ProFeatureGate';

const DOC_TYPES = ['receipt', 'paystub', 'other'];
const DOC_TYPE_LABELS = { receipt: 'Receipt', paystub: 'Paystub', other: 'Other' };

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isImageType(contentType) {
  return contentType && contentType.startsWith('image/') && contentType !== 'image/heic';
}

function parsedSummary(parsed, documentType) {
  if (!parsed) return null;
  if (documentType === 'paystub') {
    const net = parsed.net_amount || parsed.net_pay;
    const parts = [parsed.employer_name, net && `$${net}`].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
  }
  const parts = [parsed.vendor_name, parsed.amount && `$${parsed.amount}`].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export default function Uploads() {
  const { activeBudget, budgetVersion } = useBudget();
  const toast = useToast();

  const [selectedType, setSelectedType] = useState('receipt');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [detailInitial, setDetailInitial] = useState(null);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (activeBudget?.id) params.budget_id = activeBudget.id;
      const { data } = await listDocuments(params);
      setDocuments(Array.isArray(data) ? data : data?.items || []);
    } catch {
      toast('Failed to load documents', 'error');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [activeBudget?.id, toast]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments, budgetVersion]);

  const handleUploaded = useCallback(
    (doc) => {
      const summary = parsedSummary(doc?.parsed_json, doc?.document_type);
      if (summary) {
        toast(`Uploaded — ${summary}`);
      } else {
        toast('File uploaded — open details to review extracted fields');
      }
      fetchDocuments();
      if (doc?.id) {
        setDetailId(doc.id);
        setDetailInitial(doc);
      }
    },
    [fetchDocuments, toast]
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteDocument(deleteTarget.id);
      toast('Document deleted');
      setDeleteTarget(null);
      if (detailId === deleteTarget.id) {
        setDetailId(null);
        setDetailInitial(null);
      }
      fetchDocuments();
    } catch {
      toast('Failed to delete document', 'error');
    }
  }, [deleteTarget, detailId, fetchDocuments, toast]);

  const openDetail = useCallback((doc) => {
    setDetailId(doc.id);
    setDetailInitial(doc);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailId(null);
    setDetailInitial(null);
  }, []);

  return (
    <ProFeatureGate featureKey="receipt_ocr">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Upload className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Uploads</h1>
            <p className="text-sm text-gray-500">
              Upload paystubs, receipts, and other documents. OCR runs after upload when storage is configured.
            </p>
          </div>
        </div>

        <div className="flex bg-gray-100 rounded-lg p-1 w-fit">
          {DOC_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(type)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors min-h-[44px] ${
                selectedType === type
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {DOC_TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        <UploadDropzone documentType={selectedType} onUploaded={handleUploaded} />

        {loading ? (
          <LoadingSpinner />
        ) : documents.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Nothing uploaded yet. Drop a file above or take a photo.</p>
          </div>
        ) : (
          <>
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">File</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Extracted</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Uploaded</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {documents.map((doc) => {
                    const status = getStatusPill(doc.status);
                    const summary = parsedSummary(doc.parsed_json, doc.document_type);
                    return (
                      <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {isImageType(doc.content_type) ? (
                              <ImageIcon className="h-5 w-5 text-gray-400 shrink-0" />
                            ) : (
                              <FileText className="h-5 w-5 text-gray-400 shrink-0" />
                            )}
                            <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                              {doc.original_filename || doc.filename || 'Untitled'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 capitalize">{doc.document_type || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-[180px] truncate">
                          {summary || (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                          {formatDate(doc.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openDetail(doc)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                              title="Details"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(doc)}
                              className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3">
              {documents.map((doc) => {
                const status = getStatusPill(doc.status);
                const summary = parsedSummary(doc.parsed_json, doc.document_type);
                return (
                  <div key={doc.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {isImageType(doc.content_type) ? (
                            <ImageIcon className="h-4 w-4 text-gray-400 shrink-0" />
                          ) : (
                            <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                          )}
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {doc.original_filename || doc.filename || 'Untitled'}
                          </p>
                        </div>
                        {summary && (
                          <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                            <Sparkles className="h-3 w-3 text-amber-500" />
                            {summary}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${status.color}`}>
                            {status.label}
                          </span>
                          <span className="text-xs text-gray-400 capitalize">{doc.document_type || '—'}</span>
                          <span className="text-xs text-gray-400">{formatDate(doc.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openDetail(doc)}
                          className="p-2 text-gray-400 hover:text-blue-600 min-w-[44px] min-h-[44px] flex items-center justify-center"
                          title="Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(doc)}
                          className="p-2 text-gray-400 hover:text-red-600 min-w-[44px] min-h-[44px] flex items-center justify-center"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <ConfirmDialog
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="Delete Document"
          message={`Are you sure you want to delete "${deleteTarget?.original_filename || deleteTarget?.filename || 'this document'}"? This action cannot be undone.`}
          confirmText="Delete"
          danger
        />

        {detailId && (
          <DocumentDetailDrawer
            documentId={detailId}
            initialDoc={detailInitial}
            onClose={closeDetail}
            onUpdated={fetchDocuments}
          />
        )}
      </div>
    </ProFeatureGate>
  );
}
