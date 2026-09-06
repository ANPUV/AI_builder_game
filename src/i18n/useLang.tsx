import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { LANGUAGES, translate, type Key, type Lang } from './index';
import { buildingDescription, buildingName, itemName, recipeName } from './content';
import type { Building, Item, Recipe } from '../data';

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

/**
 * Content names bound to the current language.
 *
 * Components call these instead of reading `.name` off the data object, so a
 * language switch repaints node labels, tooltips and the tech tree with
 * everything else. Untranslated ids fall through to English per string.
 */
export function useContent() {
  const { lang } = useLang();
  return useMemo(
    () => ({
      bName: (b: Building) => buildingName(b, lang),
      bDesc: (b: Building) => buildingDescription(b, lang),
      iName: (i: Item) => itemName(i, lang),
      rName: (r: Recipe) => recipeName(r, lang),
    }),
    [lang],
  );
}
