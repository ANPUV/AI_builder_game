import { ALL_VENDORS, BUILDING_BY_ID, MILESTONE_BY_ID, RECIPE_BY_ID, listingFor } from '../data';
import { HOTBAR_SLOTS, STATE_VERSION, createInitialState } from './factory';
import type { GameState } from './types';

const KEY = 'aifor-study/save/v1';
// The game was called "AI Builder" until the rename; keep reading that slot so
// a player mid-run does not lose their factory to a branding change.
const LEGACY_KEY = 'ai-builder-game/save/v1';
// Where a save from an older STATE_VERSION is parked rather than deleted.
const BACKUP_KEY = 'aifor-study/save/stale';

export function saveState(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private windows and full quotas both land here. Losing an autosave is
    // not worth interrupting play over.
  }
}

/**
 * Rebuild a state object from parsed JSON, dropping anything that points at
 * content which no longer exists.
 *
 * That matters here: the whole point of the data files is that they get
 * swapped, and a stale save should degrade rather than crash. Shared by the
 * autosave slot and by imported files, so a file exported from an older build
 * gets exactly the same treatment as a local save.
 */
export function reviveState(parsed: GameState): GameState | null {
  if (!parsed || typeof parsed !== 'object') return null;
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
  // A milestone only ever transcribes its unlocksBuildings/unlocksRecipes into
  // these two arrays at the moment it completes (see completeMilestone in
  // simulate.ts) — completedMilestones itself is just a historical record, not
  // re-read on load. So a building added to an ALREADY-completed milestone
  // after a save was written would otherwise never reach that save: the
  // milestone can't complete a second time to transcribe it. Re-derive from
  // every completed milestone on every load so old saves keep pace with
  // content added to milestones they already cleared.
  for (const id of state.completedMilestones) {
    const m = MILESTONE_BY_ID[id];
    if (!m) continue;
    for (const bId of m.unlocksBuildings) {
      if (!state.unlockedBuildings.includes(bId)) state.unlockedBuildings.push(bId);
    }
    for (const rId of m.unlocksRecipes) {
      if (!state.unlockedRecipes.includes(rId)) state.unlockedRecipes.push(rId);
    }
  }
  state.unlockedBuildings = state.unlockedBuildings.filter((id) => BUILDING_BY_ID[id]);
  state.unlockedRecipes = state.unlockedRecipes.filter((id) => RECIPE_BY_ID[id]);
  state.status = {};
  return state;
}

/** Load the autosave slot. */
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
    const revived = reviveState(parsed);
    // A save from an older STATE_VERSION cannot be loaded, but silently wiping
    // somebody's factory is worse than keeping a copy they can still export.
    // Park it in a backup slot instead of dropping it on the floor.
    if (!revived && parsed?.version !== STATE_VERSION) {
      try {
        localStorage.setItem(BACKUP_KEY, raw);
      } catch {
        /* out of quota: nothing better to do */
      }
    }
    return revived;
  } catch {
    return null;
  }
}

/** Is there a save we had to set aside because it predates STATE_VERSION? */
export function hasStaleBackup(): boolean {
  try {
    return localStorage.getItem(BACKUP_KEY) !== null;
  } catch {
    return false;
  }
}

// --- files ---------------------------------------------------------------
// The autosave lives in localStorage, which is scoped to one origin. Play on
// http://localhost:5174 after saving on :5173 and the world looks empty even
// though nothing was lost. A file is the copy that survives that, a browser
// profile change, a cleared cache, and a STATE_VERSION bump.

interface SaveFile {
  app: 'aifor-study';
  stateVersion: number;
  savedAt: string;
  state: GameState;
}

/** The JSON written to disk: the world plus enough to identify it later. */
export function exportSaveJSON(state: GameState): string {
  const file: SaveFile = {
    app: 'aifor-study',
    stateVersion: STATE_VERSION,
    savedAt: new Date().toISOString(),
    state,
  };
  return JSON.stringify(file, null, 2);
}

export type ImportResult =
  | { ok: true; state: GameState; savedAt?: string }
  | { ok: false; reason: string };

/**
 * Read a file back. Accepts both the wrapped export format and a bare state
 * object, so a save copied straight out of localStorage still imports.
 */
export function importSaveJSON(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'That file is not valid JSON.' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'That file does not contain a save.' };
  }

  const file = parsed as Partial<SaveFile>;
  const candidate = (file.app === 'aifor-study' ? file.state : parsed) as GameState | undefined;
  if (!candidate || typeof candidate !== 'object' || typeof candidate.version !== 'number') {
    return { ok: false, reason: 'That file does not look like an AIfor.study save.' };
  }
  if (candidate.version !== STATE_VERSION) {
    return {
      ok: false,
      reason: `That save is from version ${candidate.version}; this build reads version ${STATE_VERSION}.`,
    };
  }
  const state = reviveState(candidate);
  if (!state) return { ok: false, reason: 'That save could not be read.' };
  return { ok: true, state, savedAt: file.savedAt };
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* nothing to do */
  }
}
