import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Loader2, Rocket } from 'lucide-react';
import api from '../services/api';
import { formatFriendlyDate } from '../utils/formatDate';
import { mergeChangelogEntries } from '../lib/productUpdates';
import { Badge, Card, cn } from './ui';

const COLLAPSED_KEY = 'paydrift_updates_collapsed';
const TABS = ['Recent Updates', 'Coming Soon'];

const UPDATE_TYPE_BADGE = {
  update: 'info',
  fix: 'warning',
  new_feature: 'success',
};

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
  const [unseenCount, setUnseenCount] = useState(0);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    api.get('/api/v1/whats-new-unseen-count')
      .then(({ data }) => setUnseenCount(data.unseen_count || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!collapsed && unseenCount > 0) {
      setUnseenCount(0);
      api.patch('/api/v1/whats-new-seen').catch(() => {});
    }
  }, [collapsed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!collapsed && !fetched) {
      setLoading(true);
      Promise.allSettled([
        api.get('/api/v1/app-updates'),
        api.get('/api/v1/coming-soon'),
        api.get('/api/v1/announcements/active'),
      ]).then(([updatesRes, comingSoonRes, announcementsRes]) => {
        if (updatesRes.status === 'fulfilled') {
          const data = updatesRes.value.data;
          setUpdates(mergeChangelogEntries(Array.isArray(data) ? data : []));
        } else {
          setUpdates(mergeChangelogEntries([]));
        }
        const csItems = [];
        if (comingSoonRes.status === 'fulfilled') {
          const data = comingSoonRes.value.data;
          if (Array.isArray(data)) csItems.push(...data);
        }
        if (announcementsRes.status === 'fulfilled') {
          const data = announcementsRes.value.data;
          if (Array.isArray(data)) {
            const csAnnouncements = data
              .filter((a) => a.type === 'coming_soon')
              .map((a) => ({
                id: `ann-${a.id}`,
                feature_name: a.title || 'Coming Soon',
                description: a.message,
                eta: null,
                created_at: a.created_at,
              }));
            csItems.push(...csAnnouncements);
          }
        }
        setComingSoon(csItems);
        setFetched(true);
        setLoading(false);
      });
    }
  }, [collapsed, fetched]);

  const sortedUpdates = updates;

  return (
    <Card className="overflow-hidden" role="region" aria-labelledby="recent-updates-heading">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/30 sm:p-5"
        aria-expanded={!collapsed}
        aria-controls="recent-updates-panel"
      >
        <div className="flex items-center gap-2">
          <span id="recent-updates-heading" className="font-semibold text-foreground">
            What&apos;s New
          </span>
          {unseenCount > 0 && (
            <span
              className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-danger-600 px-1.5 text-xs font-bold text-white"
              aria-label={`${unseenCount} unread updates`}
            >
              {unseenCount}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn('h-5 w-5 text-muted transition-transform duration-200', !collapsed && 'rotate-180')}
          aria-hidden
        />
      </button>

      {!collapsed && (
        <div id="recent-updates-panel" className="border-t border-border">
          <div className="flex border-b border-border" role="tablist" aria-label="What's new sections">
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'min-h-11 flex-1 px-4 py-2.5 text-sm font-medium transition-colors',
                  activeTab === tab
                    ? 'border-b-2 border-accent-600 text-accent-700'
                    : 'text-muted hover:text-foreground',
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8" role="status">
              <Loader2 className="h-5 w-5 animate-spin text-accent-600" aria-hidden />
            </div>
          ) : activeTab === 'Recent Updates' ? (
            sortedUpdates.length === 0 ? (
              <div className="py-8 text-center text-body">
                No updates yet.{' '}
                <Link to="/changelog" className="font-medium text-accent-600 hover:underline">
                  View changelog
                </Link>
              </div>
            ) : (
              <div className="max-h-64 divide-y divide-border overflow-y-auto overscroll-contain">
                {sortedUpdates.slice(0, 8).map((update, idx) => (
                  <div key={update.id || idx} className="flex items-start gap-3 px-4 py-3">
                    <time className="w-16 shrink-0 text-caption tabular-nums" dateTime={update.date}>
                      {formatFriendlyDate(update.date)}
                    </time>
                    {update.type && (
                      <Badge variant={UPDATE_TYPE_BADGE[update.type] || 'neutral'} className="shrink-0 normal-case">
                        {update.type === 'new_feature' ? 'New' : update.type === 'fix' ? 'Fix' : 'Update'}
                      </Badge>
                    )}
                    <span className="min-w-0 flex-1 text-sm text-foreground">
                      {update.description || update.message}
                    </span>
                  </div>
                ))}
              </div>
            )
          ) : comingSoon.length === 0 ? (
            <div className="py-8 text-center text-body">No upcoming features yet.</div>
          ) : (
            <div className="max-h-64 divide-y divide-border overflow-y-auto overscroll-contain">
              {comingSoon.map((item, idx) => (
                <div key={item.id || idx} className="flex items-start gap-3 px-4 py-3">
                  <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{item.feature_name}</p>
                    <p className="text-body">{item.description}</p>
                    {item.eta && <p className="text-caption mt-0.5">ETA: {item.eta}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
