import { useEffect, useState } from 'react';
import api from '../../services/api';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useBusinessWrite } from '../../hooks/useBusinessWrite';

const TYPES = ['paystub', 'receipt', 'invoice', 'bill', 'vendor', 'tax', 'other'];

export default function BusinessDocuments() {
  const write = useBusinessWrite('manage_deductions');
  const [docs, setDocs] = useState([]);
  const [type, setType] = useState('paystub');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = () => {
    api.get('/api/v1/business/documents').then(({ data }) => setDocs(data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      const { data: presign } = await api.post('/api/v1/business/documents/presign', {
        filename: file.name,
        content_type: file.type || 'application/pdf',
        file_size: file.size,
        document_type: type,
      });
      await fetch(presign.upload_url, {
        method: 'PUT',
        headers: presign.required_headers || { 'Content-Type': file.type },
        body: file,
      });
      await api.post('/api/v1/business/documents/finalize', {
        document_id: presign.document_id,
        file_size: file.size,
      });
      setFile(null);
      load();
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Business documents</h1>
      <p className="text-sm text-gray-600">Paystub OCR, receipts, invoices — stored securely in cloud storage.</p>

      <form onSubmit={upload} className="space-y-3 bg-white border rounded-lg p-4">
        <select value={type} onChange={(e) => setType(e.target.value)} disabled={write.disabled} className="w-full border rounded-lg px-3 py-2 min-h-[44px] disabled:opacity-50">
          {TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0])} disabled={write.disabled} className="w-full text-sm disabled:opacity-50" />
        <button
          type="submit"
          {...write.props({
            disabled: !file || uploading,
            className: 'w-full py-2 bg-purple-600 text-white rounded-lg disabled:opacity-50 min-h-[44px]',
          })}
        >
          {uploading ? 'Uploading…' : 'Upload & scan'}
        </button>
      </form>

      <ul className="text-sm divide-y border rounded-lg bg-white">
        {docs.map((d) => (
          <li key={d.id} className="p-3 flex justify-between gap-2">
            <span>{d.original_filename || d.document_type}</span>
            <span className="text-gray-500">{d.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
