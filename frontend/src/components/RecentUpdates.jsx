import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import updates from '../data/updates.json';

const COLLAPSED_KEY = 'paydrift_updates_collapsed';
const LAST_SEEN_KEY = 'paydrift_last_seen_update';

function formatUpdateDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RecentUpdates() {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    return stored === null ? true : stored === 'true';
  });

  const [lastSeenId, setLastSeenId] = useState(() => {
    return localStorage.getItem(LAST_SEEN_KEY) || '';
  });

  const sorted = [...updates].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const newestId = sorted.length > 0 ? sorted[0].id : '';

  const newCount = lastSeenId
    ? sorted.findIndex((u) => u.id === lastSeenId)
    : sorted.length;
  const unseenCount = newCount === -1 ? 0 : newCount;

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (!collapsed && newestId) {
      setLastSeenId(newestId);
      localStorage.setItem(LAST_SEEN_KEY, newestId);
    }
  }, [collapsed, newestId]);

  const displayUpdates = sorted.slice(0, 6);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">Recent Updates</span>
          {unseenCount > 0 && collapsed && (
            <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {unseenCount} new
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
        />
      </button>

      {!collapsed && (
        <div className="border-t border-gray-100">
          <div className="divide-y divide-gray-100">
            {displayUpdates.map((update) => (
              <div key={update.id} className="py-3 px-4 flex items-start gap-3">
                <span className="text-sm text-gray-500 shrink-0 w-16">
                  {formatUpdateDate(update.date)}
                </span>
                <span className="text-gray-300">—</span>
                <span className="text-sm text-gray-800">{update.message}</span>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-gray-100">
            <span className="text-sm text-blue-600 hover:text-blue-700 cursor-pointer">
              See all updates &rarr;
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
