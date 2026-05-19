import { Calendar } from 'lucide-react';
import CurrencyDisplay from './CurrencyDisplay';
import PaycheckPlanItemActions from './PaycheckPlanItemActions';
import { formatPaycheckDate, formatFriendlyDate } from '../utils/formatDate';

const fmt = (val) => {
  const n = Number(val);
  const v = Number.isNaN(n) ? 0 : n;
  return `$${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

export default function UpcomingPaychecks({
  periods = [],
  overrideBusyKey,
  onPullForward,
  onRevert,
}) {
  if (!periods.length) return null;

  return (
    <div className="mt-6 pt-6 border-t border-gray-200 space-y-4">
      <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-gray-500" />
        Upcoming paychecks
      </h3>
      {periods.map((period) => {
        const items = Array.isArray(period.assigned_items) ? period.assigned_items : [];
        const label = period.is_next ? 'Next paycheck' : 'Upcoming';
        const itemBusyKey = (item) =>
          `${item.item_type}_${item.id}_${item.occurrence_due_date || item.due_date}`;

        return (
          <div
            key={String(period.paycheck_date || period.pay_period_start)}
            className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 space-y-2"
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
              <p className="text-xs text-gray-500">No bills or debts assigned to this period.</p>
            ) : (
              <ul className="space-y-1.5">
                {items.map((item) => {
                  const key = `${item.item_type}_${item.id}`;
                  const isBusy = overrideBusyKey === itemBusyKey(item);
                  return (
                    <li
                      key={key}
                      className="flex flex-wrap items-center gap-2 text-sm bg-white rounded-md px-2 py-1.5 border border-gray-100"
                    >
                      <span className="flex-1 min-w-0 truncate text-gray-700">
                        {item.name}
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
  );
}

