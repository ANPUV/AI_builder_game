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
    id: 'agentic' as const,
    kind: 'feature' as const,
    name: 'Agentic Ops',
    blurb:
      'Hire agents to run the business: sales that signs leads by itself, marketing that skews who calls, coding that wires the chain. They sell nothing, bill every month, and your customers start churning without one watching them.',
    defaultOn: false,
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
const TIER_TRACK: Partial<Record<BuildingTier, AddonId>> = {
  'Home Lab': 'homelab',
  Slop: 'slop',
  // A feature addon owns a tier too. Agent Ops nodes are unlocked by MAIN-track
  // milestones (they need the agent runs the main spine already produces), so
  // the tier is the only signal that they belong to the addon at all.
  'Agent Ops': 'agentic',
};

const BUILDINGS_BY_TRACK = new Map<AddonTrack, Set<string>>(
  TRACK_ADDONS.map((a) => {
    const ids = collect(a.id, 'unlocksBuildings');
    for (const b of BUILDINGS) {
      // Three signals, in case any one of them is silent: the milestone that
      // unlocks it, the tier it lives in, and an explicit claim on the building
      // for the node neither of those can classify.
      if (TIER_TRACK[b.tier] === a.id || b.addon === a.id) ids.add(b.id);
    }
    return [a.id, ids];
  }),
);
/** Buildings owned by a feature addon, by the tier they live in. */
const BUILDINGS_BY_FEATURE = new Map<FeatureAddonId, Set<string>>();
for (const b of BUILDINGS) {
  const owner = b.addon ?? TIER_TRACK[b.tier];
  if (!owner || TRACK_ADDONS.some((a) => a.id === owner)) continue;
  const set = BUILDINGS_BY_FEATURE.get(owner as FeatureAddonId) ?? new Set<string>();
  set.add(b.id);
  BUILDINGS_BY_FEATURE.set(owner as FeatureAddonId, set);
}
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
  if (track !== null) return addons[track];
  // Feature addons default OFF, so an absent key must not read as permission.
  for (const [id, ids] of BUILDINGS_BY_FEATURE) {
    if (ids.has(buildingId)) return addons[id] ?? DEFAULT_ADDONS[id];
  }
  return true;
}

export function trackEnabled(track: Track, addons: AddonSettings): boolean {
  return track === 'main' || addons[track as AddonTrack] !== false;
}
