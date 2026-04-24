import { useState, useEffect, useCallback } from 'react';
import {
  Upload,
  Trash2,
  Eye,
  FileText,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import { listDocuments, getDocument, deleteDocument } from '../services/api';
import { useBudget } from '../context/BudgetContext';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import UploadDropzone from '../components/uploads/UploadDropzone';
import { getStatusPill } from '../lib/uploadStatus';

const DOC_TYPES = ['receipt', 'paystub', 'other'];
const DOC_TYPE_LABELS = { receipt: 'Receipt', paystub: 'Paystub', other: 'Other' };

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isImageType(contentType) {
  return contentType && contentType.startsWith('image/') && contentType !== 'image/heic';
}

export default function Uploads() {
  const { activeBudget, budgetVersion } = useBudget();
  const toast = useToast();

  const [selectedType, setSelectedType] = useState('receipt');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewDoc, setViewDoc] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);

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
  }, [activeBudget?.id]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments, budgetVersion]);

  const handleUploaded = useCallback(() => {
    toast('File uploaded successfully');
    fetchDocuments();
  }, [fetchDocuments, toast]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteDocument(deleteTarget.id);
      toast('Document deleted');
      setDeleteTarget(null);
      fetchDocuments();
    } catch {
      toast('Failed to delete document', 'error');
    }
  }, [deleteTarget, fetchDocuments, toast]);

  const handleView = useCallback(async (doc) => {
    setViewLoading(true);
    try {
      const { data } = await getDocument(doc.id);
      const url = data.download_url || data.signed_url || data.url;
      if (!url) {
        toast('Unable to get download URL', 'error');
        setViewLoading(false);
        return;
      }
      // PDF: open in new tab. Image: show in modal.
      if (doc.content_type === 'application/pdf') {
        window.open(url, '_blank', 'noopener');
        setViewLoading(false);
      } else {
        setViewDoc({ ...doc, signedUrl: url });
        setViewLoading(false);
      }
    } catch {
      toast('Failed to load document', 'error');
      setViewLoading(false);
    }
  }, [toast]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Upload className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Uploads</h1>
          <p className="text-sm text-gray-500">Upload paystubs, receipts, and other documents. We'll store them securely.</p>
        </div>
      </div>

      {/* Document type segmented control */}
      <div className="flex bg-gray-100 rounded-lg p-1 w-fit">
        {DOC_TYPES.map((type) => (
          <button
            key={type}
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

      {/* Upload dropzone */}
      <UploadDropzone documentType={selectedType} onUploaded={handleUploaded} />

      {/* Documents list */}
      {loading ? (
        <LoadingSpinner />
      ) : documents.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nothing uploaded yet. Drop a file above or take a photo.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">File</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Uploaded</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {documents.map((doc) => {
                  const status = getStatusPill(doc.status);
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
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{formatDate(doc.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleView(doc)}
                            disabled={viewLoading}
                            className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
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

          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {documents.map((doc) => {
              const status = getStatusPill(doc.status);
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
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${status.color}`}>
                          {status.label}
                        </span>
                        <span className="text-xs text-gray-400 capitalize">{doc.document_type || '—'}</span>
                        <span className="text-xs text-gray-400">{formatDate(doc.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleView(doc)}
                        disabled={viewLoading}
                        className="p-2 text-gray-400 hover:text-blue-600 min-w-[44px] min-h-[44px] flex items-center justify-center"
                        title="View"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
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

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Document"
        message={`Are you sure you want to delete "${deleteTarget?.original_filename || deleteTarget?.filename || 'this document'}"? This action cannot be undone.`}
        confirmText="Delete"
        danger
      />

      {/* Image view modal */}
      <Modal isOpen={!!viewDoc} onClose={() => setViewDoc(null)} title={viewDoc?.original_filename || viewDoc?.filename || 'Document'}>
        {viewDoc && (
          <div className="space-y-4">
            {isImageType(viewDoc.content_type) ? (
              <img
                src={viewDoc.signedUrl}
                alt={viewDoc.original_filename || viewDoc.filename || 'Uploaded document'}
                className="w-full rounded-lg"
              />
            ) : (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Preview not available for this file type.</p>
              </div>
            )}
            <div className="flex justify-end">
              <a
                href={viewDoc.signedUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors min-h-[44px]"
              >
                Download
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
