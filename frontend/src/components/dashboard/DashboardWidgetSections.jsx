import DashboardWidgetRenderer from './DashboardWidgetRenderer';
import { buildDashboardSections } from '../../utils/dashboardLayout';
import { cn } from '../ui';

export default function DashboardWidgetSections({
  widgetOrder,
  widgetVisibility,
  ...rendererProps
}) {
  const sections = buildDashboardSections(widgetOrder, widgetVisibility);

  const isWidgetVisible = (id) => Boolean(widgetVisibility[id]);

  return (
    <div className="space-y-6">
      {sections.map((section, index) => {
        const sectionKey = section.type === 'plan-row'
          ? `plan-${section.ids.join('-')}`
          : section.id;
        const animStyle = { animationDelay: `${Math.min(index * 50, 200)}ms` };

        if (section.type === 'plan-row') {
          return (
            <div
              key={sectionKey}
              className={cn(
                'grid grid-cols-1 gap-5 animate-fade-in lg:gap-6',
                section.ids.length === 2 && 'lg:grid-cols-2',
              )}
              style={animStyle}
            >
              {section.ids.map((widgetId) => (
                isWidgetVisible(widgetId) ? (
                  <DashboardWidgetRenderer
                    key={widgetId}
                    widgetId={widgetId}
                    {...rendererProps}
                  />
                ) : null
              ))}
            </div>
          );
        }

        if (!isWidgetVisible(section.id)) return null;

        return (
          <div key={sectionKey} className="animate-fade-in" style={animStyle}>
            <DashboardWidgetRenderer widgetId={section.id} {...rendererProps} />
          </div>
        );
      })}
    </div>
  );
}
