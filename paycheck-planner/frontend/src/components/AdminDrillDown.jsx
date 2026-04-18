import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Users,
  Crown,
  User,
  Activity,
  Home,
  MessageSquare,
  Clock,
  ArrowRightCircle,
  CheckCircle2,
} from 'lucide-react';
import api from '../services/api';

const TICKET_STATUS_BADGE = {
  open: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
};

const TICKET_STATUS_ICON = {
  open: Clock,
  in_progress: ArrowRightCircle,
  resolved: CheckCircle2,
};

// ─── Shared table wrapper ────────────────────────────────────────────
function SortHeader({ label, field, sortBy, sortOrder, onSort }) {
  const active = sortBy === field;
  return (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          sortOrder === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : null}
      </span>
    </th>
  );
}

function Pagination({ page, perPage, total, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
      <span>{total.toLocaleString()} result{total !== 1 ? 's' : ''}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── User-based drill-downs (Total Signups, Pro, Free, Active 30d) ──
function UserDrillDown({ filterType, title, icon: Icon, color, bg, onBack }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [loading, setLoading] = useState(true);
  const perPage = 25;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page on search/filter change
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, per_page: perPage, sort_by: sortBy, sort_order: sortOrder };
      if (filterType && filterType !== 'all') params.filter = filterType;
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await api.get('/api/v1/admin/users', { params });
      setRows(data.users || []);
      setTotal(data.total || 0);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortOrder, filterType, debouncedSearch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className={`${bg} p-2 rounded-lg`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <span className="text-sm text-gray-500">({total.toLocaleString()})</span>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-gray-500 text-center py-12 text-sm">No users found.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <SortHeader label="Email" field="email" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <SortHeader label="Signed Up" field="created_at" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <SortHeader label="Last Login" field="last_login" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{u.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                    {u.first_name} {u.last_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(u.created_at)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(u.last_login_at)}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    {u.is_supporter ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-xs font-medium">
                        <Crown className="h-3 w-3" /> Pro
                      </span>
                    ) : (
                      <span className="text-gray-500 text-xs">Free</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    <span className={`text-xs font-medium ${u.status === 'Active' ? 'text-green-600' : u.status === 'Closed' ? 'text-red-600' : 'text-gray-500'}`}>
                      {u.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} perPage={perPage} total={total} onPageChange={setPage} />
    </div>
  );
}

// ─── Households drill-down ───────────────────────────────────────────
function HouseholdDrillDown({ onBack }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const perPage = 25;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, per_page: perPage };
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await api.get('/api/v1/admin/households', { params });
      setRows(data.households || []);
      setTotal(data.total || 0);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="bg-purple-50 p-2 rounded-lg">
          <Home className="h-5 w-5 text-purple-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Households</h2>
        <span className="text-sm text-gray-500">({total.toLocaleString()})</span>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name or invite code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-gray-500 text-center py-12 text-sm">No households found.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Members</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Split Method</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invite Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((h) => (
                <tr key={h.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{h.name || 'Unnamed'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{h.member_count}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap capitalize">{h.split_method}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 font-mono whitespace-nowrap">{h.invite_code}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(h.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} perPage={perPage} total={total} onPageChange={setPage} />
    </div>
  );
}

// ─── Support Tickets drill-down ──────────────────────────────────────
function TicketDrillDown({ onBack }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [statusFilter, setStatusFilter] = useState(null);
  const [loading, setLoading] = useState(true);
  const perPage = 25;

  useEffect(() => { setPage(1); }, [statusFilter]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, per_page: perPage, sort_by: sortBy, sort_order: sortOrder };
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/api/v1/support/all', { params });
      setRows(data.tickets || []);
      setTotal(data.total || 0);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortOrder, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const STATUS_TABS = [
    { key: null, label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'resolved', label: 'Resolved' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="bg-rose-50 p-2 rounded-lg">
          <MessageSquare className="h-5 w-5 text-rose-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Support Tickets</h2>
        <span className="text-sm text-gray-500">({total.toLocaleString()})</span>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2">
        {STATUS_TABS.map(({ key, label }) => (
          <button
            key={label}
            onClick={() => setStatusFilter(key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              statusFilter === key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-gray-500 text-center py-12 text-sm">No tickets found.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From</th>
                <SortHeader label="Status" field="status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <SortHeader label="Created" field="created_at" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((t) => {
                const StatusIcon = TICKET_STATUS_ICON[t.status] || Clock;
                return (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">{t.subject}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{t.email || t.name || '—'}</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${TICKET_STATUS_BADGE[t.status] || 'bg-gray-100 text-gray-600'}`}>
                        <StatusIcon className="h-3 w-3" />
                        {(t.status || '').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(t.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} perPage={perPage} total={total} onPageChange={setPage} />
    </div>
  );
}

// ─── Main export: drill-down router ──────────────────────────────────
const DRILL_CONFIG = {
  total_signups: { filterType: 'all', title: 'Total Signups', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', type: 'users' },
  pro_subscribers: { filterType: 'pro', title: 'Pro Subscribers', icon: Crown, color: 'text-amber-600', bg: 'bg-amber-50', type: 'users' },
  free_users: { filterType: 'free', title: 'Free Users', icon: User, color: 'text-gray-600', bg: 'bg-gray-100', type: 'users' },
  active_30d: { filterType: 'active_30d', title: 'Active Last 30 Days', icon: Activity, color: 'text-green-600', bg: 'bg-green-50', type: 'users' },
  households: { type: 'households' },
  support_tickets: { type: 'tickets' },
};

export default function AdminDrillDown({ drillKey, onBack }) {
  const config = DRILL_CONFIG[drillKey];
  if (!config) return null;

  if (config.type === 'users') {
    return (
      <UserDrillDown
        filterType={config.filterType}
        title={config.title}
        icon={config.icon}
        color={config.color}
        bg={config.bg}
        onBack={onBack}
      />
    );
  }

  if (config.type === 'households') {
    return <HouseholdDrillDown onBack={onBack} />;
  }

  if (config.type === 'tickets') {
    return <TicketDrillDown onBack={onBack} />;
  }

  return null;
}
