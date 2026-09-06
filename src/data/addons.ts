import { BUILDINGS, type BuildingTier } from './buildings';
import { MILESTONES, type Track } from './milestones';

/**
 * Optional addons, of two different shapes.
 *
 * **Track addons** are not a new concept — the milestone data already splits
 * into `main`, `homelab` and `slop`, and each advances independently. A track
 * addon is simply a non-main track the player can switch off, so this derives
 * its membership from the milestones rather than maintaining a second list
 * that would drift. `main` is deliberately absent: it is the game.
 *
 * **Feature addons** don't gate a content branch at all — Venture Capital
 * reacts to every track's milestones and touches the economy directly, so it
 * doesn't fit the track shape. It's declared here anyway so the settings
 * dialog, save format and toggle plumbing are shared rather than duplicated
 * for what is otherwise a very similar on/off switch.
 *
 * The two kinds default differently. A track absent from a save means ON —
 * an old run should not silently lose Home Lab progress. A feature absent
 * from a save means OFF — a brand-new financial mechanic must not retroactively
 * start charging a save that predates it. `defaultOn` on each entry carries
 * that instead of a single blanket assumption.
 */
export const ADDONS = [
  {
    id: 'homelab' as const,
    kind: 'track' as const,
    name: 'Home Lab',
    blurb: 'Build your own machines: parts, quantization, racks, and a hardware market that prices you out.',
    defaultOn: true,
  },
  {
    id: 'slop' as const,
    kind: 'track' as const,
    name: 'AI Slop',
    blurb: 'Content mills, pSEO and NSFW work. Pays well, raises the Slop Index, and invites fines.',
    defaultOn: true,
  },
  {
    id: 'ventureCapital' as const,
    kind: 'feature' as const,
    name: 'Venture Capital',
    blurb:
      'Milestones no longer pay a cash reward on their own. Raise a funding round against each one instead — a lump sum for a permanent slice of revenue — or borrow from the bank at interest.',
    defaultOn: false,
  },
] as const;

export type AddonId = (typeof ADDONS)[number]['id'];
export type AddonTrack = Extract<(typeof ADDONS)[number], { kind: 'track' }>['id'];
export type FeatureAddonId = Extract<(typeof ADDONS)[number], { kind: 'feature' }>['id'];

export type AddonSettings = Record<AddonId, boolean>;

export const DEFAULT_ADDONS: AddonSettings = Object.fromEntries(
  ADDONS.map((a) => [a.id, a.defaultOn]),
) as AddonSettings;

/** Whether a feature addon (not a content track) is switched on. Unlike a track, a key missing at runtime means off. */
export function featureEnabled(id: FeatureAddonId, addons: AddonSettings): boolean {
  return addons[id] === true;
}

function collect(track: Track, key: 'unlocksBuildings' | 'unlocksRecipes'): Set<string> {
  const ids = new Set<string>();
  for (const m of MILESTONES) {
    if ((m.track ?? 'main') !== track) continue;
    for (const id of m[key]) ids.add(id);
  }
  return ids;
}

const TRACK_ADDONS = ADDONS.filter(
  (a): a is Extract<(typeof ADDONS)[number], { kind: 'track' }> => a.kind === 'track',
);

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
  TRACK_ADDONS.map((a) => {
    const ids = collect(a.id, 'unlocksBuildings');
    for (const b of BUILDINGS) if (TIER_TRACK[b.tier] === a.id) ids.add(b.id);
    return [a.id, ids];
  }),
);
const RECIPES_BY_TRACK = new Map<AddonTrack, Set<string>>(
  TRACK_ADDONS.map((a) => [a.id, collect(a.id, 'unlocksRecipes')]),
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
