import { Plus } from 'lucide-react';

export default function Savings() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Savings Goals</h1>
          <p className="text-sm text-gray-500 mt-1">Set goals and track your progress</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors">
          <Plus className="h-4 w-4" />
          Add Goal
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Placeholder goal cards */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex items-center justify-center h-48 text-gray-400 text-sm">
          Your savings goals will appear here
        </div>
      </div>
    </div>
  );
}
