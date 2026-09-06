import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { LANGUAGES, translate, type Key, type Lang } from './index';

const KEY = 'aifor-study/lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGUAGES.some((l) => l.code === saved)) return saved as Lang;
  } catch {
    /* private windows land here */
  }
  // navigator.language is "vi-VN"; match on the primary subtag only.
  const guess = (navigator.language ?? 'en').split('-')[0];
  return LANGUAGES.some((l) => l.code === guess) ? (guess as Lang) : 'en';
}

interface LangValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: Key, vars?: Record<string, string | number>) => string;
}

const LangContext = createContext<LangValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    document.documentElement.lang = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* not worth interrupting play over */
    }
  }, []);

  const value = useMemo<LangValue>(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang],
  );
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/**
 * Falls back to English when used outside a provider, so a component can be
 * rendered in isolation (a test, a sandbox) without wiring up context.
 */
export function useLang(): LangValue {
  const ctx = useContext(LangContext);
  if (ctx) return ctx;
  return { lang: 'en', setLang: () => {}, t: (key, vars) => translate('en', key, vars) };
}
