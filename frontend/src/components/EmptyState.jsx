import { Inbox } from 'lucide-react';

export default function EmptyState({ icon: Icon = Inbox, title = 'No data yet', message, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="h-12 w-12 text-gray-300 mb-4" />
      <h3 className="text-sm font-medium text-gray-900 mb-1">{title}</h3>
      {message && <p className="text-sm text-gray-500 mb-4 max-w-sm">{message}</p>}
      {actionLabel && onAction && (
        <button onClick={onAction} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
