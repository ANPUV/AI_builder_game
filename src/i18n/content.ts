import type { Building, Item, Recipe } from '../data';
import { VI_BUILDINGS, VI_ITEMS, VI_RECIPES } from './content.vi';
import type { Lang } from './index';

/**
 * Display names for the content layer.
 *
 * The engine still knows nothing about any of this: these are id-keyed
 * overlays read only when something is drawn. `src/data` stays the single
 * source of truth for what exists and what it costs.
 *
 * Two rules the Vietnamese file follows, and any future language must:
 *
 * 1. **Figures are copied, never restated.** Every description carries a
 *    sourced number — DeepSeek's $1.32/$3.96 per 1M, ASML's $380M scanner,
 *    SK hynix's ~58% HBM share. Prices, units, dates and percentages appear in
 *    the translation exactly as they appear in English. A translated price is
 *    a wrong price.
 * 2. **Proper nouns stay.** "GPT-5.6 Luna", "Hugging Face", "pgvector" and
 *    "FedRAMP" are what these things are called in Vietnamese technical
 *    writing too. Only descriptive names are translated — "GPU Market"
 *    becomes "Chợ GPU", "Claude Haiku 4.5" stays put.
 *
 * Anything without an entry falls back to English, so a partial translation
 * degrades one string at a time instead of showing ids.
 */
export interface ContentText {
  name?: string;
  description?: string;
}

const BUILDINGS: Partial<Record<Lang, Record<string, ContentText>>> = { vi: VI_BUILDINGS };
const ITEMS: Partial<Record<Lang, Record<string, ContentText>>> = { vi: VI_ITEMS };
const RECIPES: Partial<Record<Lang, Record<string, ContentText>>> = { vi: VI_RECIPES };

export const buildingName = (b: Building, lang: Lang): string =>
  BUILDINGS[lang]?.[b.id]?.name ?? b.name;

export const buildingDescription = (b: Building, lang: Lang): string =>
  BUILDINGS[lang]?.[b.id]?.description ?? b.description;

export const itemName = (i: Item, lang: Lang): string => ITEMS[lang]?.[i.id]?.name ?? i.name;

export const recipeName = (r: Recipe, lang: Lang): string => RECIPES[lang]?.[r.id]?.name ?? r.name;

/** How much of the content layer this language actually covers. */
export function coverage(lang: Lang, total: { items: number; buildings: number; recipes: number }) {
  return {
    items: Object.keys(ITEMS[lang] ?? {}).length / total.items,
    buildings: Object.keys(BUILDINGS[lang] ?? {}).length / total.buildings,
    recipes: Object.keys(RECIPES[lang] ?? {}).length / total.recipes,
  };
}
