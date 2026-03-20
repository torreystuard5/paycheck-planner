import { useState } from 'react';
import { Plus } from 'lucide-react';

const TABS = ['Overview', 'Payoff Strategy', 'Credit Score'];

export default function Debts() {
  const [activeTab, setActiveTab] = useState('Overview');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Debts</h1>
          <p className="text-sm text-gray-500 mt-1">Track and pay down your debts</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors">
          <Plus className="h-4 w-4" />
          Add Debt
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
          {activeTab} content will appear here
        </div>
      </div>
    </div>
  );
}
