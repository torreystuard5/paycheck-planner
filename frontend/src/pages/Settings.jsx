import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const { user } = useAuth();

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account preferences</p>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* Profile */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="s-first" className="block text-sm font-medium text-gray-700 mb-1">
                First Name
              </label>
              <input id="s-first" type="text" defaultValue={user?.first_name} className={inputClass} />
            </div>
            <div>
              <label htmlFor="s-last" className="block text-sm font-medium text-gray-700 mb-1">
                Last Name
              </label>
              <input id="s-last" type="text" defaultValue={user?.last_name} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="s-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input id="s-email" type="email" defaultValue={user?.email} className={inputClass} />
            </div>
          </div>
        </div>

        {/* Pay Schedule */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pay Schedule</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="s-freq" className="block text-sm font-medium text-gray-700 mb-1">
                Pay Frequency
              </label>
              <select id="s-freq" defaultValue={user?.pay_frequency} className={inputClass}>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="semi_monthly">Semi-monthly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label htmlFor="s-npd" className="block text-sm font-medium text-gray-700 mb-1">
                Next Pay Date
              </label>
              <input id="s-npd" type="date" defaultValue={user?.next_pay_date} className={inputClass} />
            </div>
            <div>
              <label htmlFor="s-net" className="block text-sm font-medium text-gray-700 mb-1">
                Net Pay Amount
              </label>
              <input id="s-net" type="number" step="0.01" defaultValue={user?.net_pay_amount} className={inputClass} />
            </div>
          </div>
        </div>

        {/* Currency */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Currency</h2>
          <div className="max-w-xs">
            <label htmlFor="s-curr" className="block text-sm font-medium text-gray-700 mb-1">
              Display Currency
            </label>
            <select id="s-curr" defaultValue={user?.currency} className={inputClass}>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="CAD">CAD</option>
              <option value="AUD">AUD</option>
            </select>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Notifications</h2>
          <div className="flex items-center justify-center h-24 text-gray-400 text-sm">
            Notification preferences coming soon
          </div>
        </div>

        <div className="flex justify-end">
          <button className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
