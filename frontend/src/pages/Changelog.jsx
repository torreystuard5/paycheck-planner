import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import api from '../services/api';
import { formatFriendlyDate } from '../utils/formatDate';

const TYPE_BADGE = {
  update: { label: 'Update', cls: 'bg-blue-100 text-blue-700' },
  fix: { label: 'Fix', cls: 'bg-amber-100 text-amber-700' },
  new_feature: { label: 'New', cls: 'bg-green-100 text-green-700' },
};

export default function Changelog() {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Mark as seen on mount so last_seen_whats_new stays consistent
    api.patch('/api/v1/whats-new-seen').catch(() => {});

    api
      .get('/api/v1/app-updates')
      .then(({ data }) => {
        const items = Array.isArray(data) ? data : [];
        items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        setUpdates(items);
      })
      .catch(() => setError('Failed to load changelog.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Changelog</h1>
        <p className="text-sm text-gray-500 mt-1">
          Recent updates, fixes, and new features in PayDrift.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : error ? (
          <div className="py-12 text-center text-sm text-red-600">{error}</div>
        ) : updates.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">
            No changelog entries yet.
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto overscroll-contain divide-y divide-gray-100">
            {updates.map((entry, idx) => {
              const badge = TYPE_BADGE[entry.type] || TYPE_BADGE.update;
              return (
                <div
                  key={entry.id || idx}
                  className="px-4 py-3 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3"
                >
                  <span className="text-xs sm:text-sm text-gray-400 shrink-0 sm:w-24">
                    {formatFriendlyDate(entry.date)}
                  </span>
                  <span
                    className={`inline-flex self-start px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                  <span className="text-sm text-gray-800 leading-relaxed">
                    {entry.description}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
