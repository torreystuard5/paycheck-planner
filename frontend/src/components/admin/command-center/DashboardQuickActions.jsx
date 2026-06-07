import {
  Megaphone,
  MessageSquare,
  Radio,
  ScrollText,
  Settings,
  Users,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import CommandCenterPanel, { CommandCenterSectionHeader } from './CommandCenterPanel';

const QUICK_ACTIONS = [
  {
    key: 'announcement',
    label: 'New announcement',
    description: 'In-app banner for all users',
    icon: Megaphone,
    tab: 'settings',
    accent: 'text-blue-600 bg-blue-50',
  },
  {
    key: 'broadcast',
    label: 'Send broadcast',
    description: 'Email all or a segment',
    icon: Radio,
    tab: 'broadcast',
    accent: 'text-purple-600 bg-purple-50',
  },
  {
    key: 'support',
    label: 'Support queue',
    description: 'Review open tickets',
    icon: MessageSquare,
    tab: 'support',
    accent: 'text-rose-600 bg-rose-50',
  },
  {
    key: 'users',
    label: 'Find user',
    description: 'Search accounts & actions',
    icon: Users,
    tab: 'users',
    accent: 'text-indigo-600 bg-indigo-50',
  },
  {
    key: 'settings',
    label: 'Global controls',
    description: 'Maintenance & feature flags',
    icon: Settings,
    tab: 'settings',
    accent: 'text-gray-600 bg-gray-100',
  },
  {
    key: 'audit',
    label: 'Audit log',
    description: 'Review admin activity',
    icon: ScrollText,
    tab: 'audit',
    accent: 'text-amber-600 bg-amber-50',
  },
];

export default function DashboardQuickActions({
  onNavigate,
  maintenanceMode,
  openTicketCount,
}) {
  return (
    <div className="space-y-4">
      {maintenanceMode && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
          <div>
            <span className="font-semibold">Maintenance mode is ON.</span>
            {' '}
            Only admins can access the app.
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="ml-2 font-medium underline hover:no-underline"
            >
              Manage in Settings
            </button>
          </div>
        </div>
      )}

      <CommandCenterPanel>
        <CommandCenterSectionHeader
          title="Quick Actions"
          description="Jump to common support and ops tasks."
          icon={Zap}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_ACTIONS.map(({ key, label, description, icon: Icon, tab, accent }) => (
            <button
              key={key}
              type="button"
              onClick={() => onNavigate(tab)}
              className="flex items-start gap-3 rounded-xl border border-gray-200/80 bg-white p-4 text-left transition-all hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <div className={`rounded-lg p-2.5 ${accent}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{label}</p>
                <p className="mt-0.5 text-xs text-gray-500">{description}</p>
                {key === 'support' && openTicketCount > 0 && (
                  <span className="mt-1.5 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    {openTicketCount} open
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </CommandCenterPanel>
    </div>
  );
}
