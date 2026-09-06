import { BALANCE } from './balance';
import { BUILDINGS, type Building } from './buildings';
import { ITEMS, type Item } from './items';
import {
  MILESTONES,
  STARTING_BUILDINGS,
  STARTING_RECIPES,
  type Milestone,
} from './milestones';
import { LISTING_BY_BUILDING } from './market';
import { RECIPES, type Recipe } from './recipes';

export * from './balance';
export * from './vendors';
export * from './buildings';
export * from './items';
export * from './milestones';
export * from './recipes';
export * from './market';

const byId = <T extends { id: string }>(rows: T[]): Record<string, T> =>
  Object.fromEntries(rows.map((r) => [r.id, r]));

export const ITEM_BY_ID: Record<string, Item> = byId(ITEMS);
export const BUILDING_BY_ID: Record<string, Building> = byId(BUILDINGS);
export const RECIPE_BY_ID: Record<string, Recipe> = byId(RECIPES);
export const MILESTONE_BY_ID: Record<string, Milestone> = byId(MILESTONES);

/** Every recipe a given building chassis is able to run. */
export const RECIPES_BY_BUILDING: Record<string, Recipe[]> = RECIPES.reduce(
  (acc, recipe) => {
    (acc[recipe.buildingId] ??= []).push(recipe);
    return acc;
  },
  {} as Record<string, Recipe[]>,
);

/**
 * THE HARDWARE PRICE INDEX ------------------------------------------------
 * Between mid-2024 and September 2026 a 32GB DDR5 kit went from about $95 to
 * about $400, a 2TB NVMe from $120 to $379, and an RTX PRO 6000 from $8,565 to
 * $16,000 — because manufacturers moved capacity to server DRAM, HBM and
 * GDDR7. The AI buildout is what made the AI builder's own hardware expensive.
 *
 * `priceElasticity` says how hard a given thing tracks that. 1.0 is DRAM by
 * definition; 0 (the default) never moves, which is every node in the main
 * game — a provider's per-token price is not set by the memory spot market.
 */
export function priceAt(base: number, elasticity: number | undefined, priceIndex: number): number {
  if (!elasticity) return base;
  return Math.round(base * (1 + elasticity * (priceIndex - 1)));
}

/** What this chassis costs to place right now. */
export const buildingCostAt = (b: Building, priceIndex: number): number =>
  priceAt(b.cost, b.priceElasticity, priceIndex);

/**
 * What one craft of this recipe costs right now. A source node buying parts
 * pays today's price for them, so the recipe's cash cost scales with the
 * elasticity of whatever it produces.
 */
export function recipeCostAt(r: Recipe, priceIndex: number): number {
  const base = r.cost ?? 0;
  if (!r.outputs.length) return base;
  const parts = r.outputs.reduce(
    (sum, s) => sum + priceAt(ITEM_BY_ID[s.itemId]?.value ?? 0, ITEM_BY_ID[s.itemId]?.priceElasticity, priceIndex) * s.qty,
    0,
  );
  const raw = r.outputs.reduce(
    (sum, s) => sum + (ITEM_BY_ID[s.itemId]?.value ?? 0) * s.qty,
    0,
  );
  // Only hardware sources have elastic outputs; everything else returns `base`.
  return raw > 0 && parts !== raw ? Math.round(parts) : base;
}

/** Is this chassis still on sale at the current index? */
export const isWithdrawn = (b: Building, priceIndex: number): boolean =>
  b.withdrawnAtIndex !== undefined && priceIndex >= b.withdrawnAtIndex;

export const item = (id: string): Item =>
  ITEM_BY_ID[id] ?? { id, name: id, icon: '?', form: 'solid', value: 0, color: '#888' };

export const building = (id: string): Building | undefined => BUILDING_BY_ID[id];
export const recipe = (id: string | null): Recipe | undefined =>
  id ? RECIPE_BY_ID[id] : undefined;

/** Units of `itemId` a recipe moves per minute at 100% clock. */
export function ratePerMinute(r: Recipe, itemId: string, side: 'inputs' | 'outputs'): number {
  const stack = r[side].find((s) => s.itemId === itemId);
  if (!stack) return 0;
  return (stack.qty / r.seconds) * 60;
}

/**
 * Dev-time content check. Called once on boot; logs anything in the data files
 * that points at an id which does not exist. Useful while swapping content.
 */
export function validateContent(): string[] {
  const problems: string[] = [];
  for (const r of RECIPES) {
    if (!BUILDING_BY_ID[r.buildingId]) problems.push(`recipe "${r.id}" -> unknown building "${r.buildingId}"`);
    for (const s of [...r.inputs, ...r.outputs]) {
      if (!ITEM_BY_ID[s.itemId]) problems.push(`recipe "${r.id}" -> unknown item "${s.itemId}"`);
    }
  }
  for (const m of MILESTONES) {
    for (const id of Object.keys(m.requires)) {
      if (!ITEM_BY_ID[id]) problems.push(`milestone "${m.id}" requires unknown item "${id}"`);
    }
    for (const id of m.unlocksBuildings) {
      if (!BUILDING_BY_ID[id]) problems.push(`milestone "${m.id}" unlocks unknown building "${id}"`);
    }
    for (const id of m.unlocksRecipes) {
      if (!RECIPE_BY_ID[id]) problems.push(`milestone "${m.id}" unlocks unknown recipe "${id}"`);
    }
  }
  // A recipe whose single-item input exceeds the buffer can never start.
  for (const r of RECIPES) {
    for (const i of r.inputs) {
      if (i.qty > BALANCE.bufferPerItem) {
        problems.push(
          `recipe "${r.id}" needs ${i.qty} ${i.itemId} but BALANCE.bufferPerItem is ${BALANCE.bufferPerItem} — the engine raises the cap for it, but consider whether that is intended`,
        );
      }
    }
  }
  // Every model building must name a vendor, or it silently lands in the
  // shared pool and its provider's rate limit means nothing.
  for (const b of BUILDINGS) {
    if (b.tier === 'Online Models' && !b.vendor) {
      problems.push(`building "${b.id}" is a model but has no vendor — it will draw on the shared pool`);
    }
    // Local models legitimately have none: they run on hardware you own, so
    // they draw the shared pool on purpose. Naming a vendor would be a bug.
    if (b.tier === 'Local Models' && b.vendor) {
      problems.push(`building "${b.id}" is a local model but names a vendor "${b.vendor}"`);
    }
    if (b.vendorScoped && b.computeSupply <= 0) {
      problems.push(`building "${b.id}" is vendorScoped but supplies no throughput`);
    }
  }
  // Contract chassis are only reachable through the board, so one with no
  // listing can never be placed however many milestones unlock it.
  for (const b of BUILDINGS) {
    if (b.kind === 'contract' && !LISTING_BY_BUILDING[b.id]) {
      problems.push(`contract "${b.id}" has no marketplace listing — it can never be signed`);
    }
  }
  for (const id of Object.keys(LISTING_BY_BUILDING)) {
    const b = BUILDING_BY_ID[id];
    if (!b) problems.push(`market listing -> unknown building "${id}"`);
    else if (b.kind !== 'contract') problems.push(`market listing "${id}" is not a contract`);
  }
  // At least one vendor-scoped tier must exist, or no model can ever run.
  if (!BUILDINGS.some((b) => b.vendorScoped && b.computeSupply > 0)) {
    problems.push('no vendor-scoped capacity exists — every model node will throttle');
  }
  // A withdrawn product must never be the ONLY route to something a milestone
  // asks for. Apple pulling the 512GB Mac Studio is a great moment; it dying
  // silently and stranding the run is not.
  const withdrawn = BUILDINGS.filter((b) => b.withdrawnAtIndex !== undefined);
  for (const b of withdrawn) {
    for (const r of RECIPES_BY_BUILDING[b.id] ?? []) {
      for (const o of r.outputs) {
        const others = producersOf(o.itemId).filter(
          (p) => p.buildingId !== b.id && !isWithdrawnById(p.buildingId),
        );
        if (!others.length) {
          problems.push(
            `building "${b.id}" withdraws at index ${b.withdrawnAtIndex} and is the ONLY producer of "${o.itemId}" — a run that misses it is stranded`,
          );
        }
      }
    }
  }

  // A manual recipe must never be the only way to satisfy a milestone: the
  // player would be clicking to progress with no automated alternative.
  for (const m of MILESTONES) {
    for (const itemId of Object.keys(m.requires)) {
      const sellers = RECIPES.filter((r) => r.payout !== undefined && r.inputs.some((s) => s.itemId === itemId));
      if (sellers.length && sellers.every((r) => r.manual)) {
        problems.push(`milestone "${m.id}" requires ${itemId}, which is only ever bought by a manual contract`);
      }
    }
  }

  // Every on-site audit must name a tier that some building actually has, or
  // the contract can never run and nothing in the UI says why.
  for (const r of RECIPES) {
    if (r.requiresOnSite && !BUILDINGS.some((b) => b.tier === r.requiresOnSite!.tier)) {
      problems.push(`recipe "${r.id}" requires on-site tier "${r.requiresOnSite.tier}", which no building has`);
    }
    // A build that can blow up must sit on a chassis the player can repair.
    if (r.failureRatePerMin && BUILDING_BY_ID[r.buildingId]?.kind !== 'capacity') {
      problems.push(`recipe "${r.id}" can fail but "${r.buildingId}" is not capacity — repair has nothing to restore`);
    }
  }

  // Catalysts are never consumed, so they never count as DELIVERED. A milestone
  // that asks for one it can only ever hold is unwinnable, and nothing in the
  // UI would say so.
  for (const m of MILESTONES) {
    for (const itemId of Object.keys(m.requires)) {
      const soldAsInput = RECIPES.some(
        (r) => r.payout !== undefined && r.inputs.some((s) => s.itemId === itemId),
      );
      const heldAsCatalyst = RECIPES.some(
        (r) => r.payout !== undefined && (r.catalysts ?? []).some((s) => s.itemId === itemId),
      );
      if (!soldAsInput && heldAsCatalyst) {
        problems.push(
          `milestone "${m.id}" requires ${itemId}, but every contract holds it as a catalyst — catalysts are never consumed, so it can never be delivered`,
        );
      }
    }
  }

  problems.push(...unreachableMilestones());
  return problems;
}

/**
 * Milestones count units SOLD to a contract. So a milestone is only winnable
 * if, at the moment you are working on it, some contract you have already
 * unlocked buys every item it asks for.
 *
 * It is very easy to write a tree where the contract that buys an item is
 * unlocked BY the milestone that requires it — a circular gate that leaves the
 * player permanently stuck with no error anywhere. This walks the unlock order
 * and reports any such milestone.
 */
const isWithdrawnById = (id: string): boolean =>
  BUILDING_BY_ID[id]?.withdrawnAtIndex !== undefined;

/**
 * Walked per track. The branches progress in parallel with the main spine, so
 * a homelab milestone may rely on anything the main track has unlocked by the
 * time the player could plausibly be working on it — but never on something
 * only a LATER milestone of its own track provides.
 */
export function unreachableMilestones(): string[] {
  const problems: string[] = [];
  const buildings = new Set(STARTING_BUILDINGS);
  const recipes = new Set(STARTING_RECIPES);

  // Main track first: the branches hang off it, and everything a branch can
  // rely on was unlocked by a main milestone or by an earlier branch step.
  const ordered = [
    ...MILESTONES.filter((m) => (m.track ?? 'main') === 'main'),
    ...MILESTONES.filter((m) => (m.track ?? 'main') !== 'main'),
  ];

  ordered.forEach((m, i) => {
    for (const itemId of Object.keys(m.requires)) {
      const sellers = RECIPES.filter(
        (r) => r.payout !== undefined && r.inputs.some((s) => s.itemId === itemId),
      );
      const available = sellers.filter(
        (r) => recipes.has(r.id) && buildings.has(r.buildingId),
      );
      if (available.length === 0) {
        const who = sellers.length
          ? sellers.map((r) => `"${r.id}"`).join(', ')
          : 'nothing at all';
        problems.push(
          `milestone #${i + 1} "${m.id}" requires ${itemId}, but no contract unlocked by then buys it (sold only by ${who}) — the tree is circular here`,
        );
      }
    }
    for (const id of m.unlocksBuildings) buildings.add(id);
    for (const id of m.unlocksRecipes) recipes.add(id);
  });
  return problems;
}

// --- reverse lookups -----------------------------------------------------
// The UI needs to answer "what makes this?" and "what does this make?".
// Without these the player has no way to connect a milestone requirement to
// the node that satisfies it.

/** Every recipe that emits `itemId`, newest tier last. */
export function producersOf(itemId: string): Recipe[] {
  return RECIPES.filter((r) => r.outputs.some((o) => o.itemId === itemId));
}

/** Every recipe that consumes `itemId`. */
export function consumersOf(itemId: string): Recipe[] {
  return RECIPES.filter((r) =>
    [...r.inputs, ...(r.catalysts ?? [])].some((i) => i.itemId === itemId),
  );
}

/**
 * The distinct items a chassis can currently emit, given what is unlocked.
 * Drives the "Makes:" line in the build bar.
 */
export function makesItems(buildingId: string, unlockedRecipes: string[]): string[] {
  const seen: string[] = [];
  for (const r of RECIPES_BY_BUILDING[buildingId] ?? []) {
    if (!unlockedRecipes.includes(r.id)) continue;
    for (const o of r.outputs) if (!seen.includes(o.itemId)) seen.push(o.itemId);
  }
  return seen;
}

/** The distinct items a chassis currently consumes. */
export function takesItems(buildingId: string, unlockedRecipes: string[]): string[] {
  const seen: string[] = [];
  for (const r of RECIPES_BY_BUILDING[buildingId] ?? []) {
    if (!unlockedRecipes.includes(r.id)) continue;
    for (const i of [...r.inputs, ...(r.catalysts ?? [])]) {
      if (!seen.includes(i.itemId)) seen.push(i.itemId);
    }
  }
  return seen;
}

/**
 * Which unlocked buildings can produce `itemId` right now. Used to tell the
 * player exactly which node satisfies the milestone they are staring at.
 */
export function unlockedProducersOf(
  itemId: string,
  unlockedBuildings: string[],
  unlockedRecipes: string[],
): { building: Building; recipe: Recipe }[] {
  const out: { building: Building; recipe: Recipe }[] = [];
  for (const r of producersOf(itemId)) {
    if (!unlockedRecipes.includes(r.id)) continue;
    const b = BUILDING_BY_ID[r.buildingId];
    if (b && unlockedBuildings.includes(b.id)) out.push({ building: b, recipe: r });
  }
  return out;
}
