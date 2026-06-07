import { LayoutGrid } from 'lucide-react';
import { DASHBOARD_WIDGET_ORDER } from '../../config/dashboardWidgets';
import { Badge, Button, cn } from '../ui';

export default function DashboardCustomizeButton({ onClick, visibleCount, loading = false }) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={onClick}
      aria-haspopup="dialog"
      disabled={loading}
      className="max-w-full"
    >
      <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate sm:hidden">Customize</span>
      <span className="hidden truncate sm:inline">Customize Dashboard</span>
      {visibleCount < DASHBOARD_WIDGET_ORDER.length && (
        <Badge variant="neutral" className={cn('ml-0.5 normal-case px-1.5 py-0 text-[10px]')}>
          {visibleCount}/{DASHBOARD_WIDGET_ORDER.length}
        </Badge>
      )}
    </Button>
  );
}
