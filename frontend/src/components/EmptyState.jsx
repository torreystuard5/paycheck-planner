import { Inbox } from 'lucide-react';
import { Button } from './ui';

export default function EmptyState({ icon: Icon = Inbox, title = 'No data yet', message, actionLabel, onAction }) {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface-subtle shadow-[var(--shadow-card)] transition-transform duration-300 hover:scale-[1.02]">
        <Icon className="h-8 w-8 text-muted" strokeWidth={1.5} aria-hidden />
      </div>
      <h3 className="mb-1 text-sm font-semibold text-foreground">{title}</h3>
      {message && <p className="mb-5 max-w-sm text-body">{message}</p>}
      {actionLabel && onAction && (
        <Button variant="accent" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
