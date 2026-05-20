import { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import CurrencyDisplay from './CurrencyDisplay';
import PaycheckPlanItemActions from './PaycheckPlanItemActions';
import { formatPaycheckDate, formatFriendlyDate } from '../utils/formatDate';

const PULL_FORWARD_COLLAPSED_KEY = 'paydrift_pull_forward_collapsed';

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

export default function UpcomingPaychecks({
  periods = [],
  overrideBusyKey,
  onPullForward,
  onRevert,
}) {
  const [collapsed, setCollapsed] = useState(readCollapsedPreference);

  if (!periods.length) return null;

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

  return (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/60 overflow-hidden">
      <button
        type="button"
        onClick={toggleCollapsed}
        className="w-full flex items-start justify-between gap-2 p-3 text-left hover:bg-blue-50/80 transition-colors"
        aria-expanded={!collapsed}
      >
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-blue-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
            Pull into this paycheck
          </h3>
          <p className="text-xs text-blue-800/90 mt-1">
            These items are on your next paycheck. Use the arrow to pay them from this paycheck instead.
          </p>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-blue-600 shrink-0 mt-0.5 transition-transform duration-200 ${
            collapsed ? '-rotate-90' : ''
          }`}
        />
      </button>
      <div
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{ maxHeight: collapsed ? '0px' : '4000px', opacity: collapsed ? 0 : 1 }}
      >
        <div className="px-3 pb-3 space-y-3">
          {periods.map((period) => {
            const items = Array.isArray(period.assigned_items) ? period.assigned_items : [];
            const pullable = items.filter((i) => i.can_pull_forward);
            const label = period.is_next ? 'Next paycheck' : 'Upcoming';
            const itemBusyKey = (item) =>
              `${item.item_type}_${item.id}_${item.occurrence_due_date || item.due_date}`;

            return (
              <div
                key={String(period.paycheck_date || period.pay_period_start)}
                className="rounded-lg border border-blue-100 bg-white/80 p-3 space-y-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {formatPaycheckDate(period.paycheck_date || period.pay_period_start)}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <span className="text-gray-500">Due </span>
                    <CurrencyDisplay amount={period.total_due} className="font-medium text-gray-900 inline" />
                  </div>
                </div>
                {items.length === 0 ? (
                  <p className="text-xs text-gray-600">Nothing assigned to the next paycheck yet.</p>
                ) : pullable.length === 0 ? (
                  <p className="text-xs text-gray-600">
                    No unpaid items on the next paycheck to pull forward (all paid or already moved).
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {pullable.map((item) => {
                      const key = `${item.item_type}_${item.id}`;
                      const isBusy = overrideBusyKey === itemBusyKey(item);
                      const isDebt = item.item_type === 'debt';
                      return (
                        <li
                          key={key}
                          className="flex flex-wrap items-center gap-2 text-sm bg-white rounded-md px-2 py-1.5 border border-gray-100"
                        >
                          <span className="flex-1 min-w-0 truncate text-gray-700">
                            {item.name}
                            {isDebt && (
                              <span className="text-[10px] uppercase tracking-wide text-purple-700 bg-purple-50 px-1 py-0.5 rounded ml-1.5">
                                Debt
                              </span>
                            )}
                            <span className="text-gray-400 text-xs ml-1">
                              {item.due_date ? formatFriendlyDate(item.due_date) : ''}
                            </span>
                          </span>
                          <span className="shrink-0 font-medium text-gray-900">{fmt(item.amount)}</span>
                          <PaycheckPlanItemActions
                            item={item}
                            busy={isBusy}
                            compact
                            onPullForward={onPullForward}
                            onRevert={onRevert}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
