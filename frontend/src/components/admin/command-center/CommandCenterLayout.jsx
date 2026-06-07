import { useEffect, useState } from 'react';
import { cn } from '../../ui';
import { COMMAND_CENTER_TABS } from './constants';
import CommandCenterSidebar from './CommandCenterSidebar';
import CommandCenterTopBar from './CommandCenterTopBar';

function MobileTabBar({ activeTab, onTabChange }) {
  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-gray-200/80 bg-white px-3 py-2 lg:hidden"
      aria-label="Command Center tabs"
    >
      {COMMAND_CENTER_TABS.map(({ key, label, icon: Icon }) => {
        const active = activeTab === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </nav>
  );
}

export default function CommandCenterLayout({
  activeTab,
  onTabChange,
  onRefresh,
  refreshing,
  topBarActions,
  children,
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileNavOpen]);

  return (
    <div className="-mx-3 -mt-2 flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-gray-200/80 bg-gray-50 shadow-sm sm:-mx-4 md:-mx-6 md:-mt-4 lg:min-h-[calc(100vh-6rem)]">
      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <div className="hidden w-64 shrink-0 lg:block">
          <CommandCenterSidebar
            activeTab={activeTab}
            onTabChange={onTabChange}
            className="sticky top-0 h-full min-h-[calc(100vh-8rem)] lg:min-h-[calc(100vh-6rem)]"
          />
        </div>

        {/* Mobile drawer */}
        {mobileNavOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              aria-label="Close navigation menu"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-xl lg:hidden">
              <CommandCenterSidebar
                activeTab={activeTab}
                onTabChange={onTabChange}
                onClose={() => setMobileNavOpen(false)}
                className="h-full"
              />
            </div>
          </>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <CommandCenterTopBar
            activeTab={activeTab}
            onMenuClick={() => setMobileNavOpen(true)}
            onRefresh={onRefresh}
            refreshing={refreshing}
            actions={topBarActions}
          />
          <MobileTabBar activeTab={activeTab} onTabChange={onTabChange} />
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
