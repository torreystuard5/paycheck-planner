import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Receipt,
  CreditCard,
  Calendar as CalendarIcon,
  X,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import api from '../services/api';
import { useBudget } from '../context/BudgetContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { Button, Card, FilterChips, PageHeader } from '../components/ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getCalendarGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const weeks = [];
  let day = 1;
  let nextMonthDay = 1;

  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const idx = w * 7 + d;
      if (idx < firstDay) {
        week.push({ day: daysInPrev - firstDay + d + 1, current: false });
      } else if (day <= daysInMonth) {
        week.push({ day: day++, current: true });
      } else {
        week.push({ day: nextMonthDay++, current: false });
      }
    }
    weeks.push(week);
    if (day > daysInMonth) break;
  }
  return weeks;
}

function formatCurrency(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

// ── Pill colors ──
function eventColor(evt) {
  if (evt.type === 'paycheck') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (evt.type === 'debt') {
    if (evt.is_paid) return 'bg-green-100 text-green-700 border-green-200';
    return 'bg-violet-100 text-violet-700 border-violet-200';
  }
  // bill
  return evt.is_paid
    ? 'bg-green-100 text-green-700 border-green-200'
    : 'bg-amber-100 text-amber-700 border-amber-200';
}

function eventDot(evt) {
  if (evt.type === 'paycheck') return 'bg-emerald-500';
  if (evt.type === 'debt') return evt.is_paid ? 'bg-green-500' : 'bg-violet-500';
  return evt.is_paid ? 'bg-green-500' : 'bg-amber-500';
}

function EventPill({ evt, onClick }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(evt); }}
      className={`w-full text-left px-1.5 py-0.5 rounded text-[11px] font-medium truncate border ${eventColor(evt)} hover:opacity-80 transition-opacity`}
    >
      {evt.type === 'paycheck' && <span className="mr-0.5">$</span>}
      {evt.title}
    </button>
  );
}

// ── Detail popover ──
function EventDetail({ evt, onClose, onTogglePaid }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" onClick={onClose}>
      <div ref={ref} className="bg-white w-full sm:max-w-sm sm:rounded-xl rounded-t-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{evt.title}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Amount</span>
            <span className="text-sm font-semibold text-gray-900">{formatCurrency(evt.amount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Date</span>
            <span className="text-sm text-gray-700">{new Date(evt.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Type</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${eventColor(evt)}`}>
              {evt.type === 'paycheck' ? 'Paycheck' : evt.type === 'debt' ? 'Debt' : 'Bill'}
            </span>
          </div>
          {evt.category && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Category</span>
              <span className="text-sm text-gray-700">{evt.category}</span>
            </div>
          )}
          {(evt.type === 'bill' || evt.type === 'debt') && evt.is_paid !== null && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Status</span>
              {evt.type === 'bill' ? (
                <button
                  onClick={() => onTogglePaid(evt)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                    evt.is_paid
                      ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                      : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  {evt.is_paid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  {evt.is_paid ? 'Paid' : 'Unpaid'}
                </button>
              ) : (
                <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border ${
                  evt.is_paid
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {evt.is_paid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  {evt.is_paid ? 'Paid' : 'Unpaid'}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100">
          <Link
            to={evt.type === 'paycheck' ? '/payments' : evt.type === 'debt' ? '/bills-debts?tab=debts' : '/bills-debts?tab=bills'}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            <ExternalLink className="h-4 w-4" />
            View {evt.type === 'paycheck' ? 'Payments' : evt.type === 'debt' ? 'Debts' : 'Bills'}
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Main component ──
export default function Calendar() {
  const { activeBudget, budgetVersion } = useBudget();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvt, setSelectedEvt] = useState(null);
  const [expandedDay, setExpandedDay] = useState(null);
  const [view, setView] = useState('household');

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = { month: month + 1, year, view };
      if (activeBudget?.id) params.budget_id = activeBudget.id;
      const { data } = await api.get('/api/v1/calendar', { params });
      setEvents(data);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [month, year, view, activeBudget?.id]);

  useEffect(() => { fetchEvents(); }, [fetchEvents, budgetVersion]);

  const goPrev = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const goNext = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };
  const goToday = () => { setMonth(today.getMonth()); setYear(today.getFullYear()); };

  const weeks = getCalendarGrid(year, month);
  const isToday = (day, isCurrent) =>
    isCurrent && day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  // Events grouped by day
  const eventsByDay = {};
  events.forEach(e => {
    const d = new Date(e.date + 'T12:00:00').getDate();
    if (!eventsByDay[d]) eventsByDay[d] = [];
    eventsByDay[d].push(e);
  });

  // Summary
  const totalBills = events.filter(e => e.type === 'bill').reduce((s, e) => s + e.amount, 0);
  const totalDebts = events.filter(e => e.type === 'debt').reduce((s, e) => s + e.amount, 0);
  const totalPaychecks = events.filter(e => e.type === 'paycheck').reduce((s, e) => s + e.amount, 0);
  const billsPaid = events.filter(e => e.type === 'bill' && e.is_paid).length;
  const billsTotal = events.filter(e => e.type === 'bill').length;
  const net = totalPaychecks - totalBills - totalDebts;

  const handleTogglePaid = async (evt) => {
    if (evt.type !== 'bill') return;
    const billId = evt.id.replace('bill_', '');
    try {
      if (evt.is_paid) {
        await api.patch(`/api/v1/bills/${billId}/unpay`);
      } else {
        await api.patch(`/api/v1/bills/${billId}/pay?source=calendar`);
      }
      fetchEvents();
      setSelectedEvt(null);
    } catch {}
  };

  // Mobile agenda view data
  const agendaDays = Object.entries(eventsByDay)
    .map(([day, evts]) => ({ day: parseInt(day), evts }))
    .sort((a, b) => a.day - b.day);

  return (
    <div className="page-container min-w-0">
      <PageHeader title="Calendar" description="Bills, debts, and paychecks at a glance" />

      <div className="flex justify-center">
        <FilterChips
          options={[
            { key: 'household', label: 'Household' },
            { key: 'personal', label: 'Personal' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={goPrev} className="min-h-10 min-w-10 p-2">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="w-[140px] text-center text-title sm:w-[180px]">
            {MONTH_NAMES[month]} {year}
          </h2>
          <Button variant="secondary" size="sm" onClick={goNext} className="min-h-10 min-w-10 p-2">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={goToday} className="text-accent-600">
          Today
        </Button>
      </div>

      <div className="card-grid">
        <Card className="p-4 sm:p-5">
          <p className="text-caption mb-1">Bills due</p>
          <p className="text-money">{formatCurrency(totalBills)}</p>
          <p className="text-caption mt-0.5">{billsPaid}/{billsTotal} paid</p>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="text-caption mb-1">Debt payments</p>
          <p className="text-money text-debt-600">{formatCurrency(totalDebts)}</p>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="text-caption mb-1">Paychecks</p>
          <p className="text-money text-brand-600">{formatCurrency(totalPaychecks)}</p>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="text-caption mb-1">Net</p>
          <p className={`text-money ${net >= 0 ? 'text-brand-600' : 'text-danger-600'}`}>
            {net >= 0 ? '+' : ''}{formatCurrency(net)}
          </p>
        </Card>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* Desktop grid */}
          <Card className="hidden overflow-hidden md:block">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-border bg-surface-subtle/60">
              {DAYS.map(d => (
                <div key={d} className="px-2 py-2.5 text-center text-xs font-semibold uppercase text-muted">{d}</div>
              ))}
            </div>

            {/* Weeks */}
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
                {week.map((cell, ci) => {
                  const dayEvents = cell.current ? (eventsByDay[cell.day] || []) : [];
                  const show = dayEvents.slice(0, 3);
                  const more = dayEvents.length - show.length;
                  const expanded = expandedDay === cell.day && cell.current;

                  return (
                    <div
                      key={ci}
                      className={`min-h-[100px] border-r border-border/60 p-1.5 last:border-r-0 ${
                        !cell.current ? 'bg-surface-subtle/40' : ''
                      } ${isToday(cell.day, cell.current) ? 'bg-accent-50/60' : ''}`}
                      onClick={() => cell.current && dayEvents.length > 3 && setExpandedDay(expanded ? null : cell.day)}
                    >
                      <div className={`text-xs font-medium mb-1 ${
                        !cell.current ? 'text-gray-300'
                          : isToday(cell.day, cell.current)
                            ? 'flex h-6 w-6 items-center justify-center rounded-full bg-accent-600 text-white'
                            : 'text-foreground'
                      }`}>
                        {cell.day}
                      </div>
                      <div className="space-y-0.5">
                        {(expanded ? dayEvents : show).map((evt, ei) => (
                          <EventPill key={ei} evt={evt} onClick={setSelectedEvt} />
                        ))}
                        {!expanded && more > 0 && (
                          <button className="text-[11px] text-blue-600 font-medium px-1 hover:underline">
                            +{more} more
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </Card>

          {/* Mobile agenda */}
          <div className="md:hidden space-y-3">
            {agendaDays.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <CalendarIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No events this month</p>
              </div>
            ) : (
              agendaDays.map(({ day, evts }) => (
                <div key={day} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className={`px-4 py-2.5 border-b border-gray-100 ${
                    isToday(day, true) ? 'bg-blue-50' : 'bg-gray-50'
                  }`}>
                    <p className={`text-sm font-semibold ${isToday(day, true) ? 'text-blue-700' : 'text-gray-700'}`}>
                      {new Date(year, month, day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {isToday(day, true) && <span className="ml-2 text-xs font-medium text-blue-500">Today</span>}
                    </p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {evts.map((evt, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedEvt(evt)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className={`w-2 h-2 rounded-full shrink-0 ${eventDot(evt)}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{evt.title}</p>
                          <p className="text-xs text-gray-500">
                            {evt.type === 'paycheck' ? 'Paycheck' : evt.type === 'debt' ? 'Debt' : 'Bill'}
                            {evt.category ? ` · ${evt.category}` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-semibold ${evt.type === 'paycheck' ? 'text-emerald-600' : 'text-gray-900'}`}>
                            {formatCurrency(evt.amount)}
                          </p>
                          {(evt.type === 'bill' || evt.type === 'debt') && evt.is_paid !== null && (
                            <p className={`text-[10px] font-medium ${evt.is_paid ? 'text-green-600' : 'text-amber-600'}`}>
                              {evt.is_paid ? 'Paid' : 'Unpaid'}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Event detail popover */}
      {selectedEvt && (
        <EventDetail
          evt={selectedEvt}
          onClose={() => setSelectedEvt(null)}
          onTogglePaid={handleTogglePaid}
        />
      )}
    </div>
  );
}
