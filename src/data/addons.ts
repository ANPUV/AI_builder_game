import { BUILDINGS, type BuildingTier } from './buildings';
import { MILESTONES, type Track } from './milestones';

/**
 * The optional content tracks.
 *
 * These are not a new concept — the milestone data already splits into `main`,
 * `homelab` and `slop`, and each advances independently. An addon is simply a
 * non-main track the player can switch off, so this derives its membership
 * from the milestones rather than maintaining a second list that would drift.
 *
 * `main` is deliberately absent: it is the game.
 */
export const ADDONS = [
  {
    track: 'homelab' as const,
    name: 'Home Lab',
    blurb: 'Build your own machines: parts, quantization, racks, and a hardware market that prices you out.',
  },
  {
    track: 'slop' as const,
    name: 'AI Slop',
    blurb: 'Content mills, pSEO and NSFW work. Pays well, raises the Slop Index, and invites fines.',
  },
] as const;

export type AddonTrack = (typeof ADDONS)[number]['track'];

/** Which addon tracks are on. Absent from a save means on, so old runs are unchanged. */
export type AddonSettings = Record<AddonTrack, boolean>;

export const DEFAULT_ADDONS: AddonSettings = { homelab: true, slop: true };

function collect(track: Track, key: 'unlocksBuildings' | 'unlocksRecipes'): Set<string> {
  const ids = new Set<string>();
  for (const m of MILESTONES) {
    if ((m.track ?? 'main') !== track) continue;
    for (const id of m[key]) ids.add(id);
  }
  return ids;
}

/**
 * Membership needs both signals.
 *
 * Milestones are the main one, but they miss a chassis that an addon owns
 * without gating — the Hugging Face Hub sits in the Home Lab tab and is
 * unlocked off the main spine, so a milestone-only rule left it in the build
 * bar with Home Lab switched off. The build-bar tab a node lives in is the
 * other half of the answer.
 */
const TIER_TRACK: Partial<Record<BuildingTier, AddonTrack>> = {
  'Home Lab': 'homelab',
  Slop: 'slop',
};

const BUILDINGS_BY_TRACK = new Map<AddonTrack, Set<string>>(
  ADDONS.map((a) => {
    const ids = collect(a.track, 'unlocksBuildings');
    for (const b of BUILDINGS) if (TIER_TRACK[b.tier] === a.track) ids.add(b.id);
    return [a.track, ids];
  }),
);
const RECIPES_BY_TRACK = new Map<AddonTrack, Set<string>>(
  ADDONS.map((a) => [a.track, collect(a.track, 'unlocksRecipes')]),
);

/** The addon a building belongs to, or null when it is part of the main game. */
export function addonOfBuilding(buildingId: string): AddonTrack | null {
  for (const [track, ids] of BUILDINGS_BY_TRACK) if (ids.has(buildingId)) return track;
  return null;
}

export function addonOfRecipe(recipeId: string): AddonTrack | null {
  for (const [track, ids] of RECIPES_BY_TRACK) if (ids.has(recipeId)) return track;
  return null;
}

/**
 * Whether a building may be built and offered right now.
 *
 * Note what this does *not* do: nodes already on the canvas keep running when
 * their addon is switched off, the same way a withdrawn product keeps working
 * for whoever already bought one. Deleting somebody's factory because they
 * unticked a box would be a worse surprise than an orphaned node.
 */
export function buildingEnabled(buildingId: string, addons: AddonSettings): boolean {
  const track = addonOfBuilding(buildingId);
  return track === null || addons[track];
}

export function trackEnabled(track: Track, addons: AddonSettings): boolean {
  return track === 'main' || addons[track as AddonTrack] !== false;
}
