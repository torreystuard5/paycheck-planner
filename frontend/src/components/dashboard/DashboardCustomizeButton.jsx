import { LayoutGrid } from 'lucide-react';
import { DASHBOARD_WIDGET_ORDER } from '../../config/dashboardWidgets';
import { Badge, Button } from '../ui';

export default function DashboardCustomizeButton({ onClick, visibleCount }) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={onClick}
      aria-haspopup="dialog"
    >
      <LayoutGrid className="h-4 w-4" aria-hidden />
      Customize Dashboard
      {visibleCount < DASHBOARD_WIDGET_ORDER.length && (
        <Badge variant="neutral" className="ml-0.5 normal-case px-1.5 py-0 text-[10px]">
          {visibleCount}/{DASHBOARD_WIDGET_ORDER.length}
        </Badge>
      )}
    </Button>
  );
}
