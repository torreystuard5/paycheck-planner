import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Radio,
  ScrollText,
  Search,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { COMMAND_CENTER_TABS } from './constants';

const EXTRA_ACTIONS = [
  { key: 'new-announcement', label: 'Create announcement', tab: 'settings', icon: Megaphone },
];

export default function CommandPalette({ isOpen, onClose, onNavigate, onAction }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      return undefined;
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const items = useMemo(() => {
    const tabItems = COMMAND_CENTER_TABS.map((t) => ({
      ...t,
      type: 'tab',
      searchText: `${t.label} ${t.description}`.toLowerCase(),
    }));
    const actionItems = EXTRA_ACTIONS.map((a) => ({
      ...a,
      type: 'action',
      searchText: a.label.toLowerCase(),
    }));
    const q = query.trim().toLowerCase();
    const all = [...tabItems, ...actionItems];
    if (!q) return all;
    return all.filter((item) => item.searchText.includes(q));
  }, [query]);

  if (!isOpen) return null;

  const handleSelect = (item) => {
    if (item.type === 'action') {
      onAction?.(item.key);
      onNavigate(item.tab);
    } else {
      onNavigate(item.key);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[15vh]">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close command palette"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to tab or action…"
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
            autoFocus
          />
          <kbd className="hidden rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 sm:inline">
            esc
          </kbd>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 sm:hidden"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="max-h-72 overflow-y-auto py-2">
          {items.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-gray-500">No matches</li>
          ) : (
            items.map((item) => {
              const Icon = item.icon || LayoutDashboard;
              return (
                <li key={`${item.type}-${item.key}`}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-blue-50"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-gray-500" />
                    <span className="font-medium text-gray-900">{item.label}</span>
                    {item.description && (
                      <span className="ml-auto truncate text-xs text-gray-400">{item.description}</span>
                    )}
                    {item.type === 'action' && (
                      <span className="ml-auto text-xs text-blue-600">Action</span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
          <span className="hidden sm:inline">Tip: </span>
          Ctrl+K anywhere in Command Center
        </div>
      </div>
    </div>
  );
}

export function useCommandPalette(onNavigate, onAction) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const palette = (
    <CommandPalette
      isOpen={open}
      onClose={() => setOpen(false)}
      onNavigate={onNavigate}
      onAction={onAction}
    />
  );

  return { paletteOpen: open, setPaletteOpen: setOpen, palette };
}
