import { useCallback, useEffect, useMemo, useState } from 'react';

import { THEME_STORAGE_KEY, THEME_OPTIONS, applyTheme, readStoredTheme } from './theme';

import { ThemeContext } from './ThemeContextValue';

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
