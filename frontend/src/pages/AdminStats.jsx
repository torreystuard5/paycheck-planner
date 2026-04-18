import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Crown,
  User,
  Activity,
  Home,
  MessageSquare,
  RefreshCw,
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
import { formatFriendlyDate } from '../utils/formatDate';
import LoadingSpinner from '../components/LoadingSpinner';
import AdminDrillDown from '../components/AdminDrillDown';

export default function AdminStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [drillDown, setDrillDown] = useState(null);

  const fetchStats = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
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
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => fetchStats({ silent: true }), 60_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

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
    { label: 'Total Signups', value: stats.total_users, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', drillKey: 'total_signups' },
    { label: 'Pro Subscribers', value: stats.total_pro_subscribers, icon: Crown, color: 'text-amber-600', bg: 'bg-amber-50', drillKey: 'pro_subscribers' },
    { label: 'Free Users', value: stats.total_free_users, icon: User, color: 'text-gray-600', bg: 'bg-gray-100', drillKey: 'free_users' },
    { label: 'Active Last 30 Days', value: stats.total_active_users_30d, icon: Activity, color: 'text-green-600', bg: 'bg-green-50', drillKey: 'active_30d' },
    { label: 'Households', value: stats.total_households, icon: Home, color: 'text-purple-600', bg: 'bg-purple-50', drillKey: 'households' },
    { label: 'Support Tickets', value: stats.total_support_tickets, icon: MessageSquare, color: 'text-rose-600', bg: 'bg-rose-50', drillKey: 'support_tickets' },
  ];

  const chartData = stats.signups_last_7_days.map((d) => ({
    date: formatFriendlyDate(d.date),
    signups: d.count,
  }));

  if (drillDown) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <AdminDrillDown drillKey={drillDown} onBack={() => setDrillDown(null)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Stats</h1>
        <button
          onClick={() => fetchStats({ silent: true })}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {cards.map(({ label, value, icon: Icon, color, bg, drillKey }) => (
          <button
            key={label}
            onClick={() => setDrillDown(drillKey)}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex items-center gap-4 text-left hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group w-full"
          >
            <div className={`${bg} p-3 rounded-lg group-hover:scale-105 transition-transform`}>
              <Icon className={`h-6 w-6 ${color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-gray-500 group-hover:text-blue-600 transition-colors">{label}</p>
              <p className="text-2xl font-bold text-gray-900">
                {value.toLocaleString()}
              </p>
            </div>
          </button>
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
