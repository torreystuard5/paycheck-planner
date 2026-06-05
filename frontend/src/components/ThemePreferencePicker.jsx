import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { cn } from './ui';

const OPTIONS = [
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark', label: 'Dark', icon: Moon },
  { key: 'system', label: 'System', icon: Monitor },
];

export default function ThemePreferencePicker() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {OPTIONS.map(({ key, label, icon: Icon }) => {
        const selected = preference === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setPreference(key)}
            className={cn(
              'flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all duration-200 active:scale-[0.98]',
              selected
                ? 'border-accent-500 bg-accent-50 text-accent-700 shadow-sm'
                : 'border-border bg-surface text-muted hover:border-border hover:bg-surface-subtle hover:text-foreground',
            )}
            aria-pressed={selected}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
