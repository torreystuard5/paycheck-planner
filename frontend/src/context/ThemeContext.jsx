import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const THEME_STORAGE_KEY = 'paydrift-theme';

export const THEME_OPTIONS = ['light', 'dark', 'system'];

function getSystemTheme() {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(preference) {
  if (preference === 'system' || !preference) return getSystemTheme();
  return preference === 'dark' ? 'dark' : 'light';
}

export function applyTheme(preference) {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  return resolved;
}

export function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_OPTIONS.includes(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readStoredTheme);
  const [resolved, setResolved] = useState(() => applyTheme(readStoredTheme()));

  const setPreference = useCallback((next) => {
    const value = THEME_OPTIONS.includes(next) ? next : 'system';
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
      /* ignore quota / private mode */
    }
    setPreferenceState(value);
    setResolved(applyTheme(value));
  }, []);

  useEffect(() => {
    if (preference !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(applyTheme('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const value = useMemo(
    () => ({ preference, resolved, setPreference, isDark: resolved === 'dark' }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
