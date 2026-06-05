import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import api from '../services/api';
import { formatFriendlyDate } from '../utils/formatDate';
import { mergeChangelogEntries } from '../lib/productUpdates';
import WhatsNewBanner from '../components/WhatsNewBanner';
import { Badge, Card, PageHeader } from '../components/ui';

const TYPE_BADGE = {
  update: { label: 'Update', variant: 'info' },
  fix: { label: 'Fix', variant: 'warning' },
  new_feature: { label: 'New', variant: 'success' },
};

export default function Changelog() {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.patch('/api/v1/whats-new-seen').catch(() => {});

    api
      .get('/api/v1/app-updates')
      .then(({ data }) => {
        const items = Array.isArray(data) ? data : [];
        setUpdates(mergeChangelogEntries(items));
      })
      .catch(() => {
        setUpdates(mergeChangelogEntries([]));
        setError(null);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-container min-w-0">
      <PageHeader
        title="Changelog"
        description="Recent updates, fixes, and new features in PayDrift"
      />

      <WhatsNewBanner />

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
            <Loader2 className="h-6 w-6 animate-spin text-accent-600" aria-hidden />
            <span className="sr-only">Loading changelog</span>
          </div>
        ) : error ? (
          <div className="py-12 text-center text-sm text-danger-600" role="alert">{error}</div>
        ) : updates.length === 0 ? (
          <div className="py-12 text-center text-body">No changelog entries yet.</div>
        ) : (
          <div
            className="max-h-[70vh] divide-y divide-border overflow-y-auto overscroll-contain"
            role="feed"
            aria-label="Changelog entries"
          >
            {updates.map((entry, idx) => {
              const badge = TYPE_BADGE[entry.type] || TYPE_BADGE.update;
              return (
                <article
                  key={entry.id || `${entry.date}-${idx}`}
                  className="flex flex-col gap-2 px-4 py-4 transition-colors hover:bg-surface-subtle/50 sm:flex-row sm:items-start sm:gap-4 sm:px-6"
                >
                  <div className="flex shrink-0 items-center gap-2 sm:w-36 sm:flex-col sm:items-start">
                    <time className="text-caption font-medium tabular-nums" dateTime={entry.date}>
                      {formatFriendlyDate(entry.date)}
                    </time>
                    <Badge variant={badge.variant} className="normal-case">
                      {badge.label}
                    </Badge>
                  </div>
                  <p className="flex-1 text-sm leading-relaxed text-foreground">
                    {entry.description}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
