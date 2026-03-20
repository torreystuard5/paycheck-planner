import { useAuth } from '../context/AuthContext';
import { Calendar, Receipt, CreditCard, TrendingUp } from 'lucide-react';

const cards = [
  {
    title: 'Next Paycheck',
    value: '--',
    sub: 'Loading...',
    icon: Calendar,
    color: 'text-blue-600 bg-blue-50',
  },
  {
    title: 'Bills Due This Period',
    value: '--',
    sub: 'Loading...',
    icon: Receipt,
    color: 'text-amber-600 bg-amber-50',
  },
  {
    title: 'Total Debt',
    value: '--',
    sub: 'Loading...',
    icon: CreditCard,
    color: 'text-red-600 bg-red-50',
  },
  {
    title: 'Credit Utilization',
    value: '--%',
    sub: 'Loading...',
    icon: TrendingUp,
    color: 'text-green-600 bg-green-50',
  },
];

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Welcome back, {user?.first_name}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div
            key={card.title}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-500">{card.title}</p>
              <div className={`p-2 rounded-lg ${card.color}`}>
                <card.icon className="h-5 w-5" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-xs text-gray-500 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Upcoming paycheck plan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Upcoming Paycheck Plan
          </h2>
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            Paycheck allocation will appear here
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Recent Activity
          </h2>
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            Recent payments and updates will appear here
          </div>
        </div>
      </div>
    </div>
  );
}
