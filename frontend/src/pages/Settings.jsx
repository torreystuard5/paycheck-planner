import { useState, useEffect } from 'react';
import { Save, User, Bell, DollarSign, Download, Loader2, Heart, Star, Calendar } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { getFormatPreview } from '../utils/dateFormat';

export default function Settings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [supporterStatus, setSupporterStatus] = useState(null);
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
    email_notifications: true,
    bill_reminders: true,
    payment_confirmations: true,
  });

  useEffect(() => {
    fetchProfile();
    fetchSupporterStatus();
  }, []);

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

  const fetchSupporterStatus = async () => {
    try {
      const res = await api.get('/api/v1/supporter/status');
      setSupporterStatus(res.data);
    } catch {
      // Supporter status not available, that's ok
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await api.put('/api/v1/auth/me', {
        ...profile,
        ...preferences,
        net_pay_amount: preferences.net_pay_amount ? parseFloat(preferences.net_pay_amount) : undefined,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Failed to save settings.');
    } finally {
      setSaving(false);
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

      <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-500" />
            Profile
            {supporterStatus?.subscription_tier === 'lifetime' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                <Star className="w-3 h-3" /> Lifetime Pro
              </span>
            ) : supporterStatus?.is_supporter ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700">
                <Heart className="w-3 h-3" /> Supporter
              </span>
            ) : null}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="s-first" className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                id="s-first"
                type="text"
                value={profile.first_name}
                onChange={(e) => setProfile({ ...profile, first_name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="s-last" className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                id="s-last"
                type="text"
                value={profile.last_name}
                onChange={(e) => setProfile({ ...profile, last_name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="s-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                id="s-email"
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-500" />
            Pay Schedule
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="s-freq" className="block text-sm font-medium text-gray-700 mb-1">Pay Frequency</label>
              <select
                id="s-freq"
                value={preferences.pay_frequency}
                onChange={(e) => setPreferences({ ...preferences, pay_frequency: e.target.value })}
                className={inputClass}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="semi_monthly">Semi-monthly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label htmlFor="s-npd" className="block text-sm font-medium text-gray-700 mb-1">Next Pay Date</label>
              <input
                id="s-npd"
                type="date"
                value={preferences.next_pay_date}
                onChange={(e) => setPreferences({ ...preferences, next_pay_date: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="s-net" className="block text-sm font-medium text-gray-700 mb-1">Net Pay Amount</label>
              <input
                id="s-net"
                type="number"
                step="0.01"
                value={preferences.net_pay_amount}
                onChange={(e) => setPreferences({ ...preferences, net_pay_amount: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Currency</h2>
          <div className="max-w-xs">
            <label htmlFor="s-curr" className="block text-sm font-medium text-gray-700 mb-1">Display Currency</label>
            <select
              id="s-curr"
              value={preferences.currency}
              onChange={(e) => setPreferences({ ...preferences, currency: e.target.value })}
              className={inputClass}
            >
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

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-500" />
            Notifications
          </h2>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.email_notifications}
                onChange={(e) => setPreferences({ ...preferences, email_notifications: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Email notifications</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.bill_reminders}
                onChange={(e) => setPreferences({ ...preferences, bill_reminders: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Bill due date reminders</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.payment_confirmations}
                onChange={(e) => setPreferences({ ...preferences, payment_confirmations: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Payment confirmations</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>

      <div className="max-w-2xl">
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
    </div>
  );
}
