import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Briefcase, Loader2 } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function SelectMode() {
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const [loading, setLoading] = useState(null);

  const selectMode = async (mode) => {
    setLoading(mode);
    try {
      const { data } = await api.patch('/api/v1/users/me/app-mode', { app_mode: mode });
      updateUser(data);
      navigate('/dashboard', { replace: true });
    } catch {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Welcome to PayDrift</h1>
          <p className="text-gray-600 mt-2">How will you use PayDrift?</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Personal Card */}
          <button
            onClick={() => selectMode('personal')}
            disabled={!!loading}
            className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-8 text-left hover:border-blue-400 hover:shadow-md transition-all disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <div className="bg-blue-50 w-14 h-14 rounded-xl flex items-center justify-center mb-4">
              {loading === 'personal' ? (
                <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
              ) : (
                <User className="w-7 h-7 text-blue-600" />
              )}
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Personal</h2>
            <p className="text-sm text-gray-600">
              Track bills, debts, savings, and income. Plan your paychecks and manage household budgets.
            </p>
          </button>

          {/* Business Card */}
          <button
            onClick={() => selectMode('business')}
            disabled={!!loading}
            className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-8 text-left hover:border-purple-400 hover:shadow-md transition-all disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <div className="bg-purple-50 w-14 h-14 rounded-xl flex items-center justify-center mb-4">
              {loading === 'business' ? (
                <Loader2 className="w-7 h-7 text-purple-600 animate-spin" />
              ) : (
                <Briefcase className="w-7 h-7 text-purple-600" />
              )}
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Business</h2>
            <p className="text-sm text-gray-600">
              Track sales, business deductions, staff pay, contingency funds, and net profit.
            </p>
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          You can switch modes anytime in Settings.
        </p>
      </div>
    </div>
  );
}
