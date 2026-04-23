import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, User, DollarSign, Download, Loader2, Calendar, Plus, Edit, Trash2, Clock, Briefcase } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { getFormatPreview, formatFriendlyDate } from '../utils/formatDate';
import DateInput from '../components/DateInput';
import { APP_VERSION } from '../config';

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

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-600 mt-1">Manage your account preferences</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">Settings saved successfully.</div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <nav className="flex gap-1 min-w-max" aria-label="Settings tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap min-h-[44px] ${
                activeTab === tab.key
                  ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab: Account */}
      {activeTab === 'account' && (
        <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-500" />
              Profile
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="s-first" className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input id="s-first" type="text" value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label htmlFor="s-last" className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input id="s-last" type="text" value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="s-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input id="s-email" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} className={inputClass} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Currency</h2>
            <div className="max-w-xs">
              <label htmlFor="s-curr" className="block text-sm font-medium text-gray-700 mb-1">Display Currency</label>
              <select id="s-curr" value={preferences.currency} onChange={(e) => setPreferences({ ...preferences, currency: e.target.value })} className={inputClass}>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="CAD">CAD</option>
                <option value="AUD">AUD</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-500" />
              Date Format
            </h2>
            <div className="max-w-xs">
              <label htmlFor="s-datefmt" className="block text-sm font-medium text-gray-700 mb-1">Display Format</label>
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
                className={inputClass}
              >
                <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY (International)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
              </select>
              <p className="mt-2 text-sm text-gray-500">
                Preview: <span className="font-medium text-gray-700">{getFormatPreview(dateFormat)}</span>
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      {/* Tab: Pay & Schedule */}
      {activeTab === 'pay' && (
        <div className="space-y-6 max-w-2xl">
          <form onSubmit={handleSave}>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-500" />
                Pay Schedule
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="s-freq" className="block text-sm font-medium text-gray-700 mb-1">Pay Frequency</label>
                  <select id="s-freq" value={preferences.pay_frequency} onChange={(e) => setPreferences({ ...preferences, pay_frequency: e.target.value })} className={inputClass}>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="semi_monthly">Semi-Monthly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="s-npd" className="block text-sm font-medium text-gray-700 mb-1">Next Pay Date</label>
                  <input id="s-npd" type="date" value={preferences.next_pay_date} onChange={(e) => setPreferences({ ...preferences, next_pay_date: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="s-net" className="block text-sm font-medium text-gray-700 mb-1">Net Pay Amount</label>
                  <input id="s-net" type="number" step="0.01" value={preferences.net_pay_amount} onChange={(e) => setPreferences({ ...preferences, net_pay_amount: e.target.value })} className={inputClass} />
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <button type="submit" disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>

          {/* Paycheck Schedule Management */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-500" />
                Paycheck Schedule
              </h2>
              <button
                onClick={openAddSchedule}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Schedule
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Configure your paycheck schedules to enable pay period bill grouping.
            </p>

            {schedules.length === 0 ? (
              <div className="text-center py-6">
                <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No paycheck schedules configured yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {schedules.map((schedule) => (
                  <div key={schedule.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <div>
                      {schedule.income_source_name && (
                        <p className="text-sm font-medium text-gray-900">{schedule.income_source_name}</p>
                      )}
                      <p className="text-sm text-gray-600">{describeSchedule(schedule)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditSchedule(schedule)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteScheduleTarget(schedule)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: App */}
      {activeTab === 'app' && (
        <div className="space-y-6 max-w-2xl">
          {/* Mode Selection — no tier gate, early access = everyone can switch */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-purple-500" />
              App Mode
            </h2>
            <p className="text-sm text-gray-600 mb-4">Switch between Personal and Business mode to change your sidebar and dashboard.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const { data } = await api.patch('/api/v1/users/me/app-mode', { app_mode: 'personal' });
                    updateUser(data);
                    navigate('/dashboard');
                  } catch {}
                }}
                className={`flex-1 flex items-center gap-2 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                  user?.app_mode === 'personal' || !user?.app_mode
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                <User className="w-4 h-4" />
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
                className={`flex-1 flex items-center gap-2 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                  user?.app_mode === 'business'
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                <Briefcase className="w-4 h-4" />
                Business
              </button>
            </div>
          </div>

          {user?.app_mode === 'business' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Business expense defaults</h2>
              <p className="text-sm text-gray-600 mb-4">
                Mileage reimbursement rate per mile (used on the Deductions page for mileage entries). The IRS 2026 optional standard business rate is $0.70/mile.
              </p>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="min-w-[10rem]">
                  <label htmlFor="mileage-rate" className="block text-xs text-gray-500 mb-1">Dollars per mile</label>
                  <input
                    id="mileage-rate"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="50"
                    value={mileageRate}
                    onChange={(e) => setMileageRate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <button type="button" onClick={saveMileage} disabled={mileageSaving} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
                  {mileageSaving ? 'Saving…' : 'Save mileage rate'}
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Download className="w-5 h-5 text-blue-500" />
              Export All Data
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Download all your bills, debts, and payment history in a single Excel file.
            </p>
            <button
              onClick={handleExportAll}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Export All Data
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Version footer */}
      <p className="text-xs text-gray-400 text-center pt-4">PayDrift {APP_VERSION}</p>

      {/* Paycheck Schedule Modal */}
      <Modal isOpen={showScheduleModal} onClose={() => setShowScheduleModal(false)} title={editingSchedule ? 'Edit Schedule' : 'Add Paycheck Schedule'}>
        <form onSubmit={handleScheduleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Income Source Name (optional)</label>
            <input
              type="text"
              value={scheduleForm.income_source_name}
              onChange={(e) => setScheduleForm({ ...scheduleForm, income_source_name: e.target.value })}
              className={inputClass}
              placeholder="e.g. Main Job, Side Gig"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
            <select
              value={scheduleForm.frequency}
              onChange={(e) => setScheduleForm({ ...scheduleForm, frequency: e.target.value })}
              className={inputClass}
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
                className={inputClass}
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
                  className={inputClass}
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
                  className={inputClass}
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
                  className={inputClass}
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
                  className={inputClass}
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
                className={inputClass}
              >
                {dayOptions.map((d) => (
                  <option key={d} value={d}>{d}{getOrdinal(d)}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowScheduleModal(false)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={scheduleSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {scheduleSaving ? 'Saving...' : editingSchedule ? 'Update' : 'Create'}
            </button>
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
