import { Menu, RefreshCw } from 'lucide-react';
import { cn } from '../../ui';
import { getTabMeta } from './constants';

export default function CommandCenterTopBar({
  activeTab,
  onMenuClick,
  onRefresh,
  refreshing,
  actions,
}) {
  const tab = getTabMeta(activeTab);

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200/80 bg-white/95 backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-gray-900 sm:text-lg">
            {tab.label}
          </h1>
          <p className="hidden truncate text-xs text-gray-500 sm:block">
            {tab.description}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-blue-600 disabled:opacity-50',
              )}
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
            </button>
          )}
          {actions}
        </div>
      </div>
    </header>
  );
}
