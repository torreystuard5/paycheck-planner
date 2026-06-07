import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import { cn } from '../../ui';
import { COMMAND_CENTER_TABS } from './constants';

export default function CommandCenterSidebar({
  activeTab,
  onTabChange,
  onClose,
  className,
}) {
  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-gray-200/80 bg-slate-900 text-white',
        className,
      )}
    >
      <div className="border-b border-white/10 px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-900/30">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight">Command Center</p>
            <p className="truncate text-xs text-slate-400">PayDrift Admin</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Command Center navigation">
        {COMMAND_CENTER_TABS.map(({ key, label, icon: Icon, description }) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                onTabChange(key);
                onClose?.();
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                active
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-white' : 'text-slate-400')} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{label}</span>
                <span className={cn('block truncate text-xs', active ? 'text-blue-100' : 'text-slate-500')}>
                  {description}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <Link
          to="/dashboard"
          onClick={onClose}
          className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to app
        </Link>
      </div>
    </aside>
  );
}
