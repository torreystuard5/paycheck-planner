import { useState, useEffect } from 'react';
import { ChevronDown, Loader2, Rocket } from 'lucide-react';
import api from '../services/api';

const COLLAPSED_KEY = 'paydrift_updates_collapsed';
const TABS = ['Recent Updates', 'Coming Soon'];

const UPDATE_TYPE_BADGE = {
  update: 'bg-blue-100 text-blue-700',
  fix: 'bg-amber-100 text-amber-700',
  new_feature: 'bg-green-100 text-green-700',
};

function formatUpdateDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RecentUpdates() {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    return stored === null ? true : stored === 'true';
  });
  const [activeTab, setActiveTab] = useState('Recent Updates');
  const [updates, setUpdates] = useState([]);
  const [comingSoon, setComingSoon] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (!collapsed && !fetched) {
      setLoading(true);
      Promise.allSettled([
        api.get('/api/v1/app-updates'),
        api.get('/api/v1/coming-soon'),
      ]).then(([updatesRes, comingSoonRes]) => {
        if (updatesRes.status === 'fulfilled') {
          const data = updatesRes.value.data;
          setUpdates(Array.isArray(data) ? data : []);
        }
        if (comingSoonRes.status === 'fulfilled') {
          const data = comingSoonRes.value.data;
          setComingSoon(Array.isArray(data) ? data : []);
        }
        setFetched(true);
        setLoading(false);
      });
    }
  }, [collapsed, fetched]);

  const sortedUpdates = [...updates].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">What&apos;s New</span>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
        />
      </button>

      {!collapsed && (
        <div className="border-t border-gray-100">
          {/* Tabs */}
          <div className="flex gap-0 border-b border-gray-100">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            </div>
          ) : activeTab === 'Recent Updates' ? (
            sortedUpdates.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">No updates yet.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {sortedUpdates.slice(0, 8).map((update, idx) => (
                  <div key={update.id || idx} className="py-3 px-4 flex items-start gap-3">
                    <span className="text-sm text-gray-500 shrink-0 w-16">
                      {formatUpdateDate(update.date)}
                    </span>
                    {update.type && (
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${UPDATE_TYPE_BADGE[update.type] || 'bg-gray-100 text-gray-700'}`}>
                        {update.type === 'new_feature' ? 'New' : update.type === 'fix' ? 'Fix' : 'Update'}
                      </span>
                    )}
                    <span className="text-sm text-gray-800">{update.description || update.message}</span>
                  </div>
                ))}
              </div>
            )
          ) : (
            comingSoon.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">No upcoming features yet.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {comingSoon.map((item, idx) => (
                  <div key={item.id || idx} className="py-3 px-4 flex items-start gap-3">
                    <Rocket className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{item.feature_name}</p>
                      <p className="text-sm text-gray-600">{item.description}</p>
                      {item.eta && <p className="text-xs text-gray-400 mt-0.5">ETA: {item.eta}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
