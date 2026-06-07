import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Modal from '../../Modal';
import {
  formatAuditActionLabel,
  formatAuditActivityMessage,
  formatAuditDetailsFull,
  getAuditActionStyle,
} from './auditLogFormat';

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function RecentActivityList({ entries = [], onViewAll }) {
  const [detailEntry, setDetailEntry] = useState(null);

  if (entries.length === 0) {
    return <p className="text-sm text-gray-500">No recent activity.</p>;
  }

  return (
    <>
      <ul className="divide-y divide-gray-100">
        {entries.map((entry, i) => {
          const style = getAuditActionStyle(entry.action);
          const { Icon, iconBg, iconColor, badgeClass } = style;
          const message = formatAuditActivityMessage(entry);
          const hasDetails = Boolean(entry.details);

          return (
            <li key={entry.id || i}>
              <div className="group flex gap-3 rounded-lg px-1 py-3 transition-colors hover:bg-gray-50/80">
                <div
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}
                  aria-hidden
                >
                  <Icon className={`h-4 w-4 ${iconColor}`} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${badgeClass}`}>
                      {formatAuditActionLabel(entry.action)}
                    </span>
                    <span className="text-xs text-gray-400" title={formatDateTime(entry.created_at)}>
                      {entry.created_at
                        ? formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })
                        : '—'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium leading-snug text-gray-900">{message}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    by {entry.admin_email || 'Unknown admin'}
                  </p>
                </div>

                {hasDetails && (
                  <button
                    type="button"
                    onClick={() => setDetailEntry(entry)}
                    className="mt-1 shrink-0 self-start rounded-md px-2 py-1 text-xs font-medium text-blue-600 opacity-0 transition-opacity hover:bg-blue-50 group-hover:opacity-100 focus:opacity-100"
                  >
                    Details
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {onViewAll && (
        <button
          type="button"
          onClick={onViewAll}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          View full audit log
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}

      <Modal
        isOpen={!!detailEntry}
        onClose={() => setDetailEntry(null)}
        title={detailEntry ? formatAuditActionLabel(detailEntry.action) : 'Activity details'}
      >
        {detailEntry && (
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Summary</p>
              <p className="mt-1 text-gray-900">{formatAuditActivityMessage(detailEntry)}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Admin</p>
                <p className="mt-1 text-gray-900">{detailEntry.admin_email || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">When</p>
                <p className="mt-1 text-gray-900">{formatDateTime(detailEntry.created_at)}</p>
              </div>
              {detailEntry.target && (
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Target</p>
                  <p className="mt-1 text-gray-900">{detailEntry.target}</p>
                </div>
              )}
            </div>
            {detailEntry.details && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Raw details</p>
                <pre className="mt-1 max-h-64 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800">
                  {formatAuditDetailsFull(detailEntry.details)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
