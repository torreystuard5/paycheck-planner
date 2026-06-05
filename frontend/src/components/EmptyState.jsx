import { Inbox } from 'lucide-react';
import { Button } from './ui';

export default function EmptyState({ icon: Icon = Inbox, title = 'No data yet', message, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="mb-4 h-12 w-12 text-border" strokeWidth={1.5} />
      <h3 className="mb-1 text-sm font-medium text-foreground">{title}</h3>
      {message && <p className="mb-4 max-w-sm text-body">{message}</p>}
      {actionLabel && onAction && (
        <Button variant="accent" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
