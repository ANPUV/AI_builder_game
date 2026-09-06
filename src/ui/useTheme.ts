import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const KEY = 'aifor-study/theme';

/** What the player picked last, or what their OS says, in that order. */
function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* private windows land here; fall through to the OS preference */
  }
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

/**
 * Theme lives on the root element as `data-theme`, which is the only thing the
 * stylesheet reads. Components never branch on it.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* not worth interrupting play over */
    }
  }, [theme]);

  return {
    theme,
    toggleTheme: useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []),
  };
}
