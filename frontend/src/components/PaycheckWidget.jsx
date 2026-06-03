import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ChevronDown, ArrowRight, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { formatPaycheckDate } from '../utils/formatDate';

const PULL_FORWARD_COLLAPSED_KEY = 'paydrift_pull_forward_collapsed';
const TEAL = '#01696f';

const CATEGORY_META = {
  Housing: { icon: '🏠', bg: '#e6f4f4' },
  Rent: { icon: '🏠', bg: '#e6f4f4' },
  Transportation: { icon: '🚗', bg: '#e6f4ee' },
  Car: { icon: '🚗', bg: '#e6f4ee' },
  Utilities: { icon: '⚡', bg: '#fef8e1' },
  Electric: { icon: '⚡', bg: '#fef8e1' },
  Internet: { icon: '📶', bg: '#e6eefe' },
  WiFi: { icon: '📶', bg: '#e6eefe' },
  Healthcare: { icon: '❤️', bg: '#fde6ef' },
  Health: { icon: '❤️', bg: '#fde6ef' },
  'Debt/Loan': { icon: '🏦', bg: '#efe9fc' },
  Credit: { icon: '💳', bg: '#efe9fc' },
  Subscriptions: { icon: '📄', bg: '#f0f0f0' },
  Other: { icon: '📄', bg: '#f0f0f0' },
};

const fmt = (val) => {
  const n = Number(val);
  const v = Number.isNaN(n) ? 0 : n;
  return `$${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

function readCollapsedPreference() {
  try {
    return localStorage.getItem(PULL_FORWARD_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function parseDue(item) {
  const raw = item.occurrence_due_date || item.due_date;
  if (!raw) return null;
  const d = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dueLabel(item) {
  const due = parseDue(item);
  if (!due) return '';
  const dateStr = format(due, 'MMM d');
  if (item.is_overdue) {
    return `Overdue · was ${dateStr}`;
  }
  return `Due ${dateStr}`;
}

function categoryMeta(item) {
  if (item.item_type === 'debt') {
    return CATEGORY_META['Debt/Loan'];
  }
  const cat = item.category || 'Other';
  return CATEGORY_META[cat] || CATEGORY_META.Other;
}

function itemKey(item) {
  return `${item.item_type}_${item.id}_${item.occurrence_due_date || item.due_date}`;
}

export default function PaycheckWidget({
  widget,
  overrideBusyKey,
  onPullForward,
  onRevert,
}) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(readCollapsedPreference);

  if (!widget) return null;

  const visibleItems = widget.visible_items || [];
  const remainingCount = widget.remaining_count ?? 0;

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(PULL_FORWARD_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const nextPayLabel = widget.next_paycheck_date
    ? formatPaycheckDate(widget.next_paycheck_date)
    : '—';

  const renderRow = (item) => {
    const meta = categoryMeta(item);
    const isDebt = item.item_type === 'debt';
    const busy = overrideBusyKey === itemKey(item);
    const canPull = Boolean(item.can_pull_forward);
    const canRevert = Boolean(item.can_revert_override || item.pulled_forward);

    return (
      <li
        key={itemKey(item)}
        className="flex items-center gap-3 py-3 px-3 md:px-4 rounded-lg transition-all duration-300 hover:bg-[#fafafa]"
      >
        <div
          className="shrink-0 flex items-center justify-center rounded-full text-base w-[34px] h-[34px] md:w-[38px] md:h-[38px]"
          style={{ backgroundColor: meta.bg }}
          aria-hidden
        >
          {meta.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-gray-900 truncate text-sm md:text-base">
              {item.name}
            </span>
            {isDebt && (
              <span
                className="text-[10px] md:text-xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{ backgroundColor: '#f0e8fc', color: '#7a39bb' }}
              >
                Debt
              </span>
            )}
          </div>
          <p
            className="text-xs md:text-sm mt-0.5"
            style={
              item.is_overdue
                ? { color: '#c0392b', fontWeight: 600 }
                : { color: '#6b7280' }
            }
          >
            {dueLabel(item)}
          </p>
        </div>

        <span className="shrink-0 font-bold text-gray-900 text-sm md:text-base tabular-nums">
          {fmt(item.amount)}
        </span>

        {canRevert ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onRevert?.(item)}
            className="shrink-0 flex items-center justify-center rounded-full transition-opacity disabled:opacity-50"
            style={{ width: 28, height: 28, backgroundColor: '#fef8e1' }}
            title="Return to original paycheck"
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
            ) : (
              <ArrowRight className="w-3.5 h-3.5 rotate-180 text-amber-700" />
            )}
          </button>
        ) : canPull ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onPullForward?.(item)}
            className="shrink-0 flex items-center justify-center rounded-full transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ width: 28, height: 28, backgroundColor: '#e6f4f4' }}
            title="Pull into current paycheck"
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: TEAL }} />
            ) : (
              <ArrowRight className="w-3.5 h-3.5" style={{ color: TEAL }} />
            )}
          </button>
        ) : (
          <div className="shrink-0 w-7" aria-hidden />
        )}
      </li>
    );
  };

  return (
    <div
      className="mb-4 w-full max-w-[680px] rounded-xl overflow-hidden shadow-sm border border-gray-100"
      style={{ backgroundColor: '#ffffff' }}
    >
      <button
        type="button"
        onClick={toggleCollapsed}
        className="w-full flex items-center justify-between gap-2 p-4 text-left"
        aria-expanded={!collapsed}
      >
        <h3 className="text-sm md:text-base font-bold flex items-center gap-2" style={{ color: TEAL }}>
          <Calendar className="w-4 h-4 md:w-5 md:h-5 shrink-0" style={{ color: TEAL }} />
          Pull into this paycheck
        </h3>
        <ChevronDown
          className={`w-5 h-5 shrink-0 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
          style={{ color: TEAL }}
        />
      </button>

      <div
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{ maxHeight: collapsed ? '0px' : '2000px', opacity: collapsed ? 0 : 1 }}
      >
        <div className="px-4 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-2 text-xs md:text-sm">
            <span className="text-gray-600">
              Next paycheck · <span className="font-medium text-gray-800">{nextPayLabel}</span>
            </span>
            <span className="text-gray-600 sm:text-right">
              <span className="font-semibold text-gray-900">
                {fmt(widget.total_due_for_visible_items)}
              </span>
              {' due · '}
              <span className="font-medium text-gray-800">
                {Math.min(visibleItems.length, widget.unpaid_count ?? visibleItems.length)} unpaid
              </span>
              {remainingCount > 0 && (
                <span className="text-gray-500"> (+{remainingCount} more)</span>
              )}
            </span>
          </div>

          <div className="w-full h-1 rounded-full bg-gray-100 mb-3 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.max(0, widget.progress_percent ?? 0))}%`,
                backgroundColor: TEAL,
              }}
            />
          </div>

          {visibleItems.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">No unpaid bills or debts due right now.</p>
          ) : (
            <ul className="divide-y divide-gray-100 md:divide-y-0">
              {visibleItems.map((item) => renderRow(item))}
            </ul>
          )}

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 text-sm font-medium">
            <button
              type="button"
              onClick={() => navigate('/bills')}
              className="hover:underline"
              style={{ color: TEAL }}
            >
              + Add bill
            </button>
            <button
              type="button"
              onClick={() => navigate('/bills')}
              className="hover:underline"
              style={{ color: TEAL }}
            >
              Manage bills
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
