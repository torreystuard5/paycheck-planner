const colors = {
  on_track: 'bg-green-100 text-green-700',
  upcoming: 'bg-green-100 text-green-700',
  due_soon: 'bg-amber-100 text-amber-700',
  urgent: 'bg-red-100 text-red-700',
  overdue: 'bg-red-100 text-red-700',
  over_budget: 'bg-red-100 text-red-700',
  paid: 'bg-green-100 text-green-700',
  excellent: 'bg-green-100 text-green-700',
  good: 'bg-green-100 text-green-700',
  fair: 'bg-amber-100 text-amber-700',
  poor: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export default function StatusBadge({ status }) {
  const cls = colors[status] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}
