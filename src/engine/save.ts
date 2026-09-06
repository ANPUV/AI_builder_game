import { ALL_VENDORS, BUILDING_BY_ID, RECIPE_BY_ID, listingFor } from '../data';
import { HOTBAR_SLOTS, STATE_VERSION, createInitialState } from './factory';
import type { GameState } from './types';

const KEY = 'aifor-study/save/v1';
// The game was called "AI Builder" until the rename; keep reading that slot so
// a player mid-run does not lose their factory to a branding change.
const LEGACY_KEY = 'ai-builder-game/save/v1';

export function saveState(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private windows and full quotas both land here. Losing an autosave is
    // not worth interrupting play over.
  }
}

/**
 * Load a save, dropping anything that points at content which no longer
 * exists. That matters here: the whole point of the data files is that they
 * get swapped, and a stale save should degrade rather than crash.
 */
export function loadState(): GameState | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as GameState;
    if (parsed.version !== STATE_VERSION) return null;

    const fresh = createInitialState();
    const state: GameState = { ...fresh, ...parsed };

    for (const m of Object.values(state.machines)) {
      if (!BUILDING_BY_ID[m.buildingId]) {
        delete state.machines[m.id];
        continue;
      }
      if (m.recipeId && !RECIPE_BY_ID[m.recipeId]) m.recipeId = null;
      // A provider that no longer exists in the data leaves the node unconfigured.
      if (m.vendor && !ALL_VENDORS.includes(m.vendor as never)) m.vendor = null;
    }
    for (const l of Object.values(state.links)) {
      if (!state.machines[l.fromId] || !state.machines[l.toId]) delete state.links[l.id];
    }
    // A save written before a content swap can hold offers for contracts that
    // no longer exist, or that the current tree never unlocks.
    state.offers ??= {};
    state.lastOffered ??= {};
    for (const o of Object.values(state.offers)) {
      if (!listingFor(o.buildingId) || !BUILDING_BY_ID[o.buildingId]) delete state.offers[o.id];
    }
    state.hotbar = Array.from({ length: HOTBAR_SLOTS }, (_, i) => {
      const id = state.hotbar?.[i];
      return id && BUILDING_BY_ID[id] ? id : null;
    });
    state.unlockedBuildings = state.unlockedBuildings.filter((id) => BUILDING_BY_ID[id]);
    state.unlockedRecipes = state.unlockedRecipes.filter((id) => RECIPE_BY_ID[id]);
    state.status = {};
    return state;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* nothing to do */
  }
}
