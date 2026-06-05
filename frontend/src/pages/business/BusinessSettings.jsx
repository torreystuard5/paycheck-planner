import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatApiError } from '../../utils/formatApiError';
import BusinessPageShell from '../../components/business/BusinessPageShell';
import { useBusinessAccess } from '../../hooks/useBusinessAccess';
import { useBusinessWrite } from '../../hooks/useBusinessWrite';
import { useBusinessProfile } from '../../hooks/useBusinessProfile';
import { useToast } from '../../components/Toast';
import { businessData } from '../../services/businessApi';
import { Button, Card, SettingsSection } from '../../components/ui';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function BusinessSettings() {
  const { teamRole } = useBusinessAccess();
  const write = useBusinessWrite('manage_subscription');
  const { refresh: refreshProfile } = useBusinessProfile();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    business_name: '',
    business_tagline: '',
    fiscal_year_start_month: 1,
    mileage_rate_per_mile: '0.70',
  });

  useEffect(() => {
    businessData.getSettings()
      .then(({ data }) => {
        setForm({
          business_name: data.business_name || '',
          business_tagline: data.business_tagline || '',
          fiscal_year_start_month: data.fiscal_year_start_month || 1,
          mileage_rate_per_mile: String(data.mileage_rate_per_mile ?? '0.70'),
        });
      })
      .catch((e) => setError(formatApiError(e)))
      .finally(() => setLoading(false));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    if (!write.allowed) return;
    setSaving(true);
    setError(null);
    try {
      await businessData.patchSettings({
        business_name: form.business_name.trim() || null,
        business_tagline: form.business_tagline.trim() || null,
        fiscal_year_start_month: Number(form.fiscal_year_start_month),
        mileage_rate_per_mile: parseFloat(form.mileage_rate_per_mile),
      });
      await refreshProfile();
      toast('Business settings saved.', 'success');
    } catch (err) {
      const msg = formatApiError(err);
      setError(msg);
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BusinessPageShell
      title="Business Settings"
      description="Workspace branding, fiscal year, and expense defaults"
      loading={loading}
      error={error}
      teamRole={teamRole}
      maxWidth="max-w-2xl"
    >
      {!write.allowed && (
        <Card className="border-warning-200 bg-warning-50 p-4">
          <p className="text-sm text-warning-800">
            Only the business owner can change workspace settings.
          </p>
        </Card>
      )}

      <form onSubmit={save} className="space-y-5">
        <SettingsSection title="Branding" description="Shown across your Business workspace">
          <div className="space-y-4">
            <div>
              <label htmlFor="biz-name" className="form-label">Business name</label>
              <input
                id="biz-name"
                type="text"
                maxLength={255}
                value={form.business_name}
                onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
                disabled={write.disabled}
                placeholder="Acme Consulting LLC"
                className="form-input"
              />
            </div>
            <div>
              <label htmlFor="biz-tagline" className="form-label">Tagline (optional)</label>
              <input
                id="biz-tagline"
                type="text"
                maxLength={500}
                value={form.business_tagline}
                onChange={(e) => setForm((f) => ({ ...f, business_tagline: e.target.value }))}
                disabled={write.disabled}
                placeholder="Design studio & freelance services"
                className="form-input"
              />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title="Fiscal year" description="Used for tax prep and annual reports">
          <div>
            <label htmlFor="fiscal-start" className="form-label">Fiscal year starts in</label>
            <select
              id="fiscal-start"
              value={form.fiscal_year_start_month}
              onChange={(e) => setForm((f) => ({ ...f, fiscal_year_start_month: Number(e.target.value) }))}
              disabled={write.disabled}
              className="form-input max-w-xs"
            >
              {MONTHS.map((label, i) => (
                <option key={label} value={i + 1}>{label}</option>
              ))}
            </select>
          </div>
        </SettingsSection>

        <SettingsSection title="Expense defaults" description="Mileage rate for deduction calculations">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[10rem]">
              <label htmlFor="mileage-rate" className="form-label">Dollars per mile</label>
              <input
                id="mileage-rate"
                type="number"
                step="0.01"
                min="0.01"
                max="50"
                value={form.mileage_rate_per_mile}
                onChange={(e) => setForm((f) => ({ ...f, mileage_rate_per_mile: e.target.value }))}
                disabled={write.disabled}
                className="form-input"
              />
            </div>
            <p className="text-caption pb-2">IRS 2026 optional standard rate: $0.70/mile</p>
          </div>
        </SettingsSection>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={write.disabled || saving}
            className="bg-purple-600 text-white hover:bg-purple-700"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
          <Link to="/settings" className="text-sm font-medium text-muted hover:text-foreground">
            Account & subscription →
          </Link>
        </div>
      </form>
    </BusinessPageShell>
  );
}
