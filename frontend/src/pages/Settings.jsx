import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Save, User, DollarSign, Download, Loader2, Calendar, Plus, Edit, Trash2, Clock, Briefcase, Palette } from 'lucide-react';
import ThemePreferencePicker from '../components/ThemePreferencePicker';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { getFormatPreview, formatFriendlyDate } from '../utils/formatDate';
import DateInput from '../components/DateInput';
import { APP_VERSION } from '../config';
import {
  Badge,
  Button,
  Card,
  FilterChips,
  PageHeader,
  SettingsSection,
  cn,
} from '../components/ui';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SCHEDULE_FREQUENCIES = ['weekly', 'biweekly', 'semi_monthly', 'monthly'];

const defaultScheduleForm = {
  frequency: 'biweekly',
  day_of_week: '3', // Thursday
  anchor_date: '',
  first_day: '1',
  second_day: '15',
  day_of_month: '1',
  income_source_name: '',
};

function describeSchedule(schedule) {
  switch (schedule.frequency) {
    case 'weekly':
      return `Every ${DAY_NAMES[schedule.day_of_week] || 'Thursday'}`;
    case 'biweekly':
      return `Every Other ${DAY_NAMES[schedule.day_of_week] || 'Thursday'}${schedule.anchor_date ? ` (anchored ${formatFriendlyDate(schedule.anchor_date)})` : ''}`;
    case 'semi_monthly':
      return `${schedule.first_day || 1}${getOrdinal(schedule.first_day || 1)} and ${schedule.second_day || 15}${getOrdinal(schedule.second_day || 15)} of each month`;
    case 'monthly':
      return `${schedule.day_of_month || 1}${getOrdinal(schedule.day_of_month || 1)} of each month`;
    default:
      return schedule.frequency;
  }
}

function getOrdinal(n) {
  const num = Number(n);
  if (num === 1 || num === 21) return 'st';
  if (num === 2 || num === 22) return 'nd';
  if (num === 3 || num === 23) return 'rd';
  return 'th';
}

const TABS = [
  { key: 'account', label: 'Account' },
  { key: 'pay', label: 'Pay & Schedule' },
  { key: 'app', label: 'App' },
];

export default function Settings() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('account');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [profile, setProfile] = useState({
    first_name: '',
    last_name: '',
    email: '',
  });
  const [dateFormat, setDateFormat] = useState('MM/DD/YYYY');
  const [preferences, setPreferences] = useState({
    pay_frequency: 'biweekly',
    next_pay_date: '',
    net_pay_amount: '',
    currency: 'USD',
  });
  const [mileageRate, setMileageRate] = useState('0.70');
  const [mileageSaving, setMileageSaving] = useState(false);

  // Paycheck schedule state
  const [schedules, setSchedules] = useState([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [scheduleForm, setScheduleForm] = useState(defaultScheduleForm);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [deleteScheduleTarget, setDeleteScheduleTarget] = useState(null);

  useEffect(() => {
    fetchProfile();
    fetchSchedules();
  }, []);

  useEffect(() => {
    if (user?.app_mode !== 'business') return;
    (async () => {
      try {
        const { data } = await api.get('/api/v1/business/settings');
        setMileageRate(String(data.mileage_rate_per_mile ?? 0.7));
      } catch {
        /* ignore */
      }
    })();
  }, [user?.app_mode, user?.id]);

  const fetchSchedules = async () => {
    try {
      const res = await api.get('/api/v1/paycheck-schedules');
      setSchedules(Array.isArray(res.data) ? res.data : []);
    } catch {
      setSchedules([]);
    }
  };

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/v1/auth/me');
      const data = res.data;
      setProfile({
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        email: data.email || '',
      });
      setDateFormat(data.date_format || 'MM/DD/YYYY');
      setPreferences((prev) => ({
        ...prev,
        pay_frequency: data.pay_frequency || 'biweekly',
        next_pay_date: data.next_pay_date || '',
        net_pay_amount: data.net_pay_amount || '',
        currency: data.currency || 'USD',
      }));
    } catch {
      if (user) {
        setProfile({
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          email: user.email || '',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await api.put('/api/v1/auth/me', {
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        pay_frequency: preferences.pay_frequency,
        next_pay_date: preferences.next_pay_date || undefined,
        net_pay_amount: preferences.net_pay_amount ? parseFloat(preferences.net_pay_amount) : undefined,
        currency: preferences.currency,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      fetchProfile();
    } catch {
      setError('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const saveMileage = async () => {
    setMileageSaving(true);
    setError(null);
    try {
      await api.patch('/api/v1/business/settings', { mileage_rate_per_mile: parseFloat(mileageRate) });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Could not save mileage rate.');
    } finally {
      setMileageSaving(false);
    }
  };

  const handleExportAll = async () => {
    setExporting(true);
    try {
      const response = await api.get('/api/v1/export/all', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'paydrift_export.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Schedule CRUD
  const openAddSchedule = () => {
    setEditingSchedule(null);
    setScheduleForm(defaultScheduleForm);
    setShowScheduleModal(true);
  };

  const openEditSchedule = (schedule) => {
    setEditingSchedule(schedule);
    setScheduleForm({
      frequency: schedule.frequency || 'biweekly',
      day_of_week: schedule.day_of_week != null ? String(schedule.day_of_week) : '3',
      anchor_date: schedule.anchor_date || '',
      first_day: schedule.first_day != null ? String(schedule.first_day) : '1',
      second_day: schedule.second_day != null ? String(schedule.second_day) : '15',
      day_of_month: schedule.day_of_month != null ? String(schedule.day_of_month) : '1',
      income_source_name: schedule.income_source_name || '',
    });
    setShowScheduleModal(true);
  };

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    setScheduleSaving(true);
    try {
      const payload = {
        frequency: scheduleForm.frequency,
        income_source_name: scheduleForm.income_source_name || null,
      };

      if (scheduleForm.frequency === 'weekly' || scheduleForm.frequency === 'biweekly') {
        payload.day_of_week = parseInt(scheduleForm.day_of_week, 10);
      }
      if (scheduleForm.frequency === 'biweekly') {
        payload.anchor_date = scheduleForm.anchor_date || null;
      }
      if (scheduleForm.frequency === 'semi_monthly') {
        payload.first_day = parseInt(scheduleForm.first_day, 10);
        payload.second_day = parseInt(scheduleForm.second_day, 10);
      }
      if (scheduleForm.frequency === 'monthly') {
        payload.day_of_month = parseInt(scheduleForm.day_of_month, 10);
      }

      if (editingSchedule) {
        await api.put(`/api/v1/paycheck-schedules/${editingSchedule.id}`, payload);
      } else {
        await api.post('/api/v1/paycheck-schedules', payload);
      }
      setShowScheduleModal(false);
      fetchSchedules();
    } catch {
      setError('Failed to save paycheck schedule.');
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleDeleteSchedule = async () => {
    if (!deleteScheduleTarget) return;
    try {
      await api.delete(`/api/v1/paycheck-schedules/${deleteScheduleTarget.id}`);
      setDeleteScheduleTarget(null);
      fetchSchedules();
    } catch {
      setError('Failed to delete paycheck schedule.');
    }
  };

  const dayOptions = Array.from({ length: 28 }, (_, i) => i + 1);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="page-container min-w-0">
      <PageHeader
        title="Settings"
        description="Manage your account, pay schedule, and app preferences"
      />

      {error && (
        <Card className="border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error}</Card>
      )}
      {success && (
        <Card className="border-brand-200 bg-brand-50 p-3 text-sm text-brand-700">Settings saved successfully.</Card>
      )}

      <FilterChips options={TABS} value={activeTab} onChange={setActiveTab} />

      {/* Tab: Account */}
      {activeTab === 'account' && (
        <form onSubmit={handleSave} className="mx-auto max-w-2xl space-y-5">
          <SettingsSection title="Profile" icon={User} iconTone="accent">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="s-first" className="form-label">First Name</label>
                <input id="s-first" type="text" value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} className="form-input" />
              </div>
              <div>
                <label htmlFor="s-last" className="form-label">Last Name</label>
                <input id="s-last" type="text" value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} className="form-input" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="s-email" className="form-label">Email</label>
                <input id="s-email" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} className="form-input" />
              </div>
            </div>
          </SettingsSection>

          <SettingsSection title="Currency" description="How amounts are displayed across the app" icon={DollarSign} iconTone="brand">
            <div className="max-w-xs">
              <label htmlFor="s-curr" className="form-label">Display Currency</label>
              <select id="s-curr" value={preferences.currency} onChange={(e) => setPreferences({ ...preferences, currency: e.target.value })} className="form-input">
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="CAD">CAD</option>
                <option value="AUD">AUD</option>
              </select>
            </div>
          </SettingsSection>

          <SettingsSection title="Date Format" icon={Calendar} iconTone="purple">
            <div className="max-w-xs">
              <label htmlFor="s-datefmt" className="form-label">Display Format</label>
              <select
                id="s-datefmt"
                value={dateFormat}
                onChange={async (e) => {
                  const newFormat = e.target.value;
                  setDateFormat(newFormat);
                  try {
                    await api.patch('/api/v1/auth/me/date-format', { date_format: newFormat });
                  } catch {}
                }}
                className="form-input"
              >
                <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY (International)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
              </select>
              <p className="text-caption mt-2">
                Preview: <span className="font-medium text-foreground">{getFormatPreview(dateFormat)}</span>
              </p>
            </div>
          </SettingsSection>

          <div className="flex justify-end">
            <Button type="submit" variant="accent" disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      )}

      {/* Tab: Pay & Schedule */}
      {activeTab === 'pay' && (
        <div className="mx-auto max-w-2xl space-y-5">
          <form onSubmit={handleSave}>
            <SettingsSection
              title="Pay Schedule"
              description="Default pay frequency and amount for planning"
              icon={DollarSign}
              iconTone="brand"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="s-freq" className="form-label">Pay Frequency</label>
                  <select id="s-freq" value={preferences.pay_frequency} onChange={(e) => setPreferences({ ...preferences, pay_frequency: e.target.value })} className="form-input">
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="semi_monthly">Semi-Monthly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="s-npd" className="form-label">Next Pay Date</label>
                  <input id="s-npd" type="date" value={preferences.next_pay_date} onChange={(e) => setPreferences({ ...preferences, next_pay_date: e.target.value })} className="form-input" />
                </div>
                <div>
                  <label htmlFor="s-net" className="form-label">Net Pay Amount</label>
                  <input id="s-net" type="number" step="0.01" value={preferences.net_pay_amount} onChange={(e) => setPreferences({ ...preferences, net_pay_amount: e.target.value })} className="form-input" />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button type="submit" variant="accent" disabled={saving}>
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </SettingsSection>
          </form>

          <SettingsSection
            title="Paycheck Schedules"
            description="Configure schedules for pay period bill grouping"
            icon={Clock}
            iconTone="accent"
            actions={
              <Button variant="accent" size="sm" onClick={openAddSchedule}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            }
          >
            {schedules.length === 0 ? (
              <div className="py-8 text-center">
                <Clock className="mx-auto mb-2 h-8 w-8 text-muted" />
                <p className="text-body">No paycheck schedules configured yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {schedules.map((schedule) => (
                  <Card key={schedule.id} variant="inset" className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      {schedule.income_source_name && (
                        <p className="font-medium text-foreground">{schedule.income_source_name}</p>
                      )}
                      <p className="text-caption">{describeSchedule(schedule)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditSchedule(schedule)} className="min-h-8 px-1.5" aria-label="Edit schedule">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteScheduleTarget(schedule)} className="min-h-8 px-1.5 text-danger-600" aria-label="Delete schedule">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </SettingsSection>
        </div>
      )}

      {/* Tab: App */}
      {activeTab === 'app' && (
        <div className="mx-auto max-w-2xl space-y-5">
          <SettingsSection
            title="Appearance"
            description="Choose light, dark, or match your device"
            icon={Palette}
            iconTone="accent"
          >
            <ThemePreferencePicker />
          </SettingsSection>

          <SettingsSection
            title="App Mode"
            description="Switch between Personal and Business mode"
            icon={Briefcase}
            iconTone="purple"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const { data } = await api.patch('/api/v1/users/me/app-mode', { app_mode: 'personal' });
                    updateUser(data);
                    navigate('/dashboard');
                  } catch {}
                }}
                className={cn(
                  'flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all',
                  user?.app_mode === 'personal' || !user?.app_mode
                    ? 'border-accent-500 bg-accent-50 text-accent-700 shadow-sm'
                    : 'border-border bg-surface text-muted hover:border-border hover:bg-surface-subtle',
                )}
              >
                <User className="h-4 w-4" />
                Personal
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const { data } = await api.patch('/api/v1/users/me/app-mode', { app_mode: 'business' });
                    updateUser(data);
                    navigate('/business/dashboard');
                  } catch {}
                }}
                className={cn(
                  'flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all',
                  user?.app_mode === 'business'
                    ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-sm'
                    : 'border-border bg-surface text-muted hover:border-border hover:bg-surface-subtle',
                )}
              >
                <Briefcase className="h-4 w-4" />
                Business
              </button>
            </div>
          </SettingsSection>

          <SettingsSection title="Subscription" description="Your current plan and billing">
            <p className="text-body mb-3">
              Plan: <strong>{user?.subscription_tier || 'early_access'}</strong>
              {user?.subscription_tier === 'early_access' && (
                <Badge variant="success" className="ml-2 normal-case">Full early access</Badge>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/upgrade"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700"
              >
                View plans / Upgrade
              </Link>
              <Button
                variant="secondary"
                type="button"
                onClick={async () => {
                  try {
                    const { data } = await api.post('/api/v1/billing/portal');
                    if (data.url) window.location.href = data.url;
                    else if (data.message) setError(data.message);
                  } catch (err) {
                    setError(err.response?.data?.detail || err.response?.data?.message || 'Billing portal unavailable');
                  }
                }}
              >
                Manage billing
              </Button>
            </div>
          </SettingsSection>

          {user?.app_mode === 'business' && (
            <SettingsSection title="Business expense defaults" description="Mileage reimbursement rate per mile">
              <p className="text-caption mb-4">
                Used on the Deductions page. IRS 2026 optional standard business rate is $0.70/mile.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[10rem]">
                  <label htmlFor="mileage-rate" className="form-label">Dollars per mile</label>
                  <input
                    id="mileage-rate"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="50"
                    value={mileageRate}
                    onChange={(e) => setMileageRate(e.target.value)}
                    className="form-input"
                  />
                </div>
                <Button type="button" onClick={saveMileage} disabled={mileageSaving} className="bg-purple-600 text-white hover:bg-purple-700">
                  {mileageSaving ? 'Saving…' : 'Save mileage rate'}
                </Button>
              </div>
            </SettingsSection>
          )}

          <SettingsSection
            title="Export All Data"
            description="Download bills, debts, and payment history"
            icon={Download}
            iconTone="accent"
          >
            <Button onClick={handleExportAll} disabled={exporting} variant="accent">
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Export All Data
                </>
              )}
            </Button>
          </SettingsSection>
        </div>
      )}

      <p className="text-caption text-center">PayDrift {APP_VERSION}</p>

      {/* Paycheck Schedule Modal */}
      <Modal isOpen={showScheduleModal} onClose={() => setShowScheduleModal(false)} title={editingSchedule ? 'Edit Schedule' : 'Add Paycheck Schedule'}>
        <form onSubmit={handleScheduleSubmit} className="space-y-4">
          <div>
            <label className="form-label">Income Source Name (optional)</label>
            <input
              type="text"
              value={scheduleForm.income_source_name}
              onChange={(e) => setScheduleForm({ ...scheduleForm, income_source_name: e.target.value })}
              className="form-input"
              placeholder="e.g. Main Job, Side Gig"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
            <select
              value={scheduleForm.frequency}
              onChange={(e) => setScheduleForm({ ...scheduleForm, frequency: e.target.value })}
              className="form-input"
            >
              {SCHEDULE_FREQUENCIES.map((f) => (
                <option key={f} value={f}>{f.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
              ))}
            </select>
          </div>

          {/* Weekly: Day of week */}
          {scheduleForm.frequency === 'weekly' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week</label>
              <select
                value={scheduleForm.day_of_week}
                onChange={(e) => setScheduleForm({ ...scheduleForm, day_of_week: e.target.value })}
                className="form-input"
              >
                {DAY_NAMES.map((name, idx) => (
                  <option key={idx} value={idx}>{name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Biweekly: Day of week + anchor date */}
          {scheduleForm.frequency === 'biweekly' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week</label>
                <select
                  value={scheduleForm.day_of_week}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, day_of_week: e.target.value })}
                  className="form-input"
                >
                  {DAY_NAMES.map((name, idx) => (
                    <option key={idx} value={idx}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Paycheck Date (anchor)</label>
                <DateInput
                  value={scheduleForm.anchor_date}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, anchor_date: e.target.value })}
                  className="form-input"
                />
                <p className="text-xs text-gray-500 mt-1">Enter the date of your most recent paycheck to anchor the biweekly cycle.</p>
              </div>
            </>
          )}

          {/* Semi-Monthly: Two day-of-month dropdowns */}
          {scheduleForm.frequency === 'semi_monthly' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Pay Day</label>
                <select
                  value={scheduleForm.first_day}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, first_day: e.target.value })}
                  className="form-input"
                >
                  {dayOptions.map((d) => (
                    <option key={d} value={d}>{d}{getOrdinal(d)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Second Pay Day</label>
                <select
                  value={scheduleForm.second_day}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, second_day: e.target.value })}
                  className="form-input"
                >
                  {dayOptions.map((d) => (
                    <option key={d} value={d}>{d}{getOrdinal(d)}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Monthly: One day-of-month dropdown */}
          {scheduleForm.frequency === 'monthly' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pay Day</label>
              <select
                value={scheduleForm.day_of_month}
                onChange={(e) => setScheduleForm({ ...scheduleForm, day_of_month: e.target.value })}
                className="form-input"
              >
                {dayOptions.map((d) => (
                  <option key={d} value={d}>{d}{getOrdinal(d)}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowScheduleModal(false)}>Cancel</Button>
            <Button type="submit" variant="accent" disabled={scheduleSaving}>
              {scheduleSaving ? 'Saving...' : editingSchedule ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteScheduleTarget}
        onClose={() => setDeleteScheduleTarget(null)}
        onConfirm={handleDeleteSchedule}
        title="Delete Schedule"
        message={`Are you sure you want to delete this paycheck schedule? This action cannot be undone.`}
        confirmText="Delete"
        danger
      />
    </div>
  );
}
