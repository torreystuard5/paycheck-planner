import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listBusinessDocuments } from '../../services/api';
import CurrencyDisplay from '../../components/CurrencyDisplay';
import BusinessPageShell from '../../components/business/BusinessPageShell';
import UploadDropzone from '../../components/uploads/UploadDropzone';
import { useBusinessAccess } from '../../hooks/useBusinessAccess';
import { businessData, downloadBusinessTaxCsv } from '../../services/businessApi';
import { Button, Card } from '../../components/ui';

const YEAR = new Date().getFullYear();

export default function BusinessTaxPrep() {
  const { teamRole } = useBusinessAccess();
  const [year, setYear] = useState(YEAR);
  const [data, setData] = useState(null);
  const [taxDocs, setTaxDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      businessData.getTaxSummary(year),
      listBusinessDocuments({ document_type: 'tax' }),
    ])
      .then(([summaryRes, docsRes]) => {
        setData(summaryRes.data);
        setTaxDocs(Array.isArray(docsRes.data) ? docsRes.data : []);
      })
      .catch(() => setError('Failed to load tax prep data.'))
      .finally(() => setLoading(false));
  }, [year]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadBusinessTaxCsv(year);
    } catch {
      setError('CSV export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <BusinessPageShell
      title="Business Tax Prep"
      description="Year-end deduction summary and supporting documents"
      loading={loading}
      error={error}
      teamRole={teamRole}
      maxWidth="max-w-4xl"
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="form-input min-h-11 w-auto"
            aria-label="Tax year"
          >
            {[YEAR, YEAR - 1, YEAR - 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <Button
            type="button"
            onClick={exportCsv}
            disabled={exporting}
            className="bg-purple-600 text-white hover:bg-purple-700"
          >
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        </div>
      )}
    >
      {data?.disclaimer && (
        <Card className="border-warning-200 bg-warning-50 p-4">
          <p className="text-sm text-warning-800">{data.disclaimer}</p>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-surface-subtle text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-muted">Category</th>
              <th className="px-4 py-3 text-right font-medium text-muted">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data?.categories?.map((c) => (
              <tr key={c.key}>
                <td className="px-4 py-3 text-foreground">{c.label}</td>
                <td className="px-4 py-3 text-right">
                  <CurrencyDisplay amount={c.total} />
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="px-4 py-3 text-foreground">Total</td>
              <td className="px-4 py-3 text-right">
                <CurrencyDisplay amount={data?.total_deductions} />
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-title">Supporting tax documents</h2>
          <Link to="/business/documents" className="text-sm font-medium text-purple-600 hover:text-purple-700">
            All business documents
          </Link>
        </div>
        <UploadDropzone
          documentType="tax"
          scope="business"
          compact
          onUploaded={() => {
            listBusinessDocuments({ document_type: 'tax' }).then(({ data: d }) =>
              setTaxDocs(Array.isArray(d) ? d : []),
            );
          }}
        />
        {taxDocs.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {taxDocs.map((doc) => (
              <li key={doc.id} className="flex justify-between gap-2 px-3 py-2">
                <span className="truncate text-foreground">{doc.original_filename || 'Tax document'}</span>
                <span className="shrink-0 text-muted">{doc.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body">No tax documents uploaded yet for this workspace.</p>
        )}
      </Card>

      {data?.contractors_1099?.length > 0 && (
        <Card className="p-4 sm:p-5">
          <h2 className="text-title mb-2">1099 contractors</h2>
          <ul className="space-y-1 text-sm">
            {data.contractors_1099.map((c) => (
              <li key={c.vendor} className="flex justify-between gap-2">
                <span className="text-foreground">{c.vendor}</span>
                <span>
                  <CurrencyDisplay amount={c.total} />
                  {c.requires_1099 && (
                    <span className="ml-2 text-xs font-medium text-purple-700">1099</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </BusinessPageShell>
  );
}
