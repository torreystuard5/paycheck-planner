export default function Payments() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payment History</h1>
        <p className="text-sm text-gray-500 mt-1">View and manage your payments</p>
      </div>

      {/* Date filter placeholder */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="date"
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
          aria-label="Start date"
        />
        <span className="text-sm text-gray-400">to</span>
        <input
          type="date"
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
          aria-label="End date"
        />
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors">
          Filter
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
          Payment history will appear here
        </div>
      </div>
    </div>
  );
}
