import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Crown,
  User,
  Activity,
  Home,
  MessageSquare,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

export default function AdminStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data } = await api.get('/api/v1/admin/stats');
        setStats(data);
      } catch (err) {
        if (err.response?.status === 403) {
          setForbidden(true);
        } else {
          setError('Failed to load admin stats.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) return <LoadingSpinner />;

  if (forbidden) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <p className="text-lg font-medium text-gray-700 mb-4">
          You don't have permission to view this page.
        </p>
        <Link
          to="/dashboard"
          className="text-blue-600 hover:text-blue-700 font-medium"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  const cards = [
    {
      label: 'Total Signups',
      value: stats.total_users,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Pro Subscribers',
      value: stats.total_pro_subscribers,
      icon: Crown,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: 'Free Users',
      value: stats.total_free_users,
      icon: User,
      color: 'text-gray-600',
      bg: 'bg-gray-100',
    },
    {
      label: 'Active Last 30 Days',
      value: stats.total_active_users_30d,
      icon: Activity,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'Households',
      value: stats.total_households,
      icon: Home,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      label: 'Support Tickets',
      value: stats.total_support_tickets,
      icon: MessageSquare,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
    },
  ];

  const chartData = stats.signups_last_7_days.map((d) => ({
    date: new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    signups: d.count,
  }));

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Stats</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <div
            key={label}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex items-center gap-4"
          >
            <div className={`${bg} p-3 rounded-lg`}>
              <Icon className={`h-6 w-6 ${color}`} />
            </div>
            <div>
              <p className="text-sm text-gray-500">{label}</p>
              <p className="text-2xl font-bold text-gray-900">
                {value.toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Signups chart */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Signups — Last 7 Days
        </h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="signups"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ fill: '#2563eb' }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 text-center py-8">
            No signup data available.
          </p>
        )}
      </div>
    </div>
  );
}
