import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { listBusinessDocuments } from '../../services/api';
import CurrencyDisplay from '../../components/CurrencyDisplay';
import LoadingSpinner from '../../components/LoadingSpinner';
import UploadDropzone from '../../components/uploads/UploadDropzone';

const YEAR = new Date().getFullYear();

export default function BusinessTaxPrep() {
  const [year, setYear] = useState(YEAR);
  const [data, setData] = useState(null);
  const [taxDocs, setTaxDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/api/v1/business/tax-prep/summary', { params: { year } }),
      listBusinessDocuments({ document_type: 'tax' }),
    ])
      .then(([summaryRes, docsRes]) => {
        setData(summaryRes.data);
        setTaxDocs(Array.isArray(docsRes.data) ? docsRes.data : []);
      })
      .finally(() => setLoading(false));
  }, [year]);

  const exportCsv = () => {
    window.open(`/api/v1/business/tax-prep/export.csv?year=${year}`, '_blank');
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Business Tax Prep</h1>
        <div className="flex gap-2 items-center">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[44px]"
          >
            {[YEAR, YEAR - 1, YEAR - 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportCsv}
            className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg min-h-[44px]"
          >
            Export CSV
          </button>
        </div>
      </div>

      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
        {data?.disclaimer}
      </p>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-600">Category</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data?.categories?.map((c) => (
              <tr key={c.key} className="border-t border-gray-100">
                <td className="px-4 py-3">{c.label}</td>
                <td className="px-4 py-3 text-right">
                  <CurrencyDisplay amount={c.total} />
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-200 font-semibold">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3 text-right">
                <CurrencyDisplay amount={data?.total_deductions} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-gray-900">Supporting tax documents</h2>
          <Link to="/business/documents" className="text-sm text-purple-600 hover:underline">
            All business documents
          </Link>
        </div>
        <UploadDropzone
          documentType="tax"
          scope="business"
          compact
          onUploaded={() => {
            listBusinessDocuments({ document_type: 'tax' }).then(({ data: d }) =>
              setTaxDocs(Array.isArray(d) ? d : [])
            );
          }}
        />
        {taxDocs.length > 0 ? (
          <ul className="text-sm divide-y border rounded-lg">
            {taxDocs.map((doc) => (
              <li key={doc.id} className="px-3 py-2 flex justify-between gap-2">
                <span className="truncate">{doc.original_filename || 'Tax document'}</span>
                <span className="text-gray-500 shrink-0">{doc.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No tax documents uploaded yet for this workspace.</p>
        )}
      </section>

      {data?.contractors_1099?.length > 0 && (
        <section>
          <h2 className="font-semibold text-gray-900 mb-2">1099 contractors</h2>
          <ul className="text-sm space-y-1">
            {data.contractors_1099.map((c) => (
              <li key={c.vendor} className="flex justify-between gap-2">
                <span>{c.vendor}</span>
                <span>
                  <CurrencyDisplay amount={c.total} />
                  {c.requires_1099 && (
                    <span className="ml-2 text-xs text-purple-700">1099</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
