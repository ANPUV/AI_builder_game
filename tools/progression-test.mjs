/**
 * Headless progression test — can the tech tree actually be played through?
 *
 *   node tools/progression-test.mjs            (or: npm run progression)
 *   node tools/progression-test.mjs --verbose  per-milestone build log
 *   node tools/progression-test.mjs --budget 60  sim-minutes allowed per milestone
 *   node tools/progression-test.mjs --stall 20   sim-minutes of no delivery before STUCK
 *
 * `validateContent()` catches milestones that point at ids which do not exist,
 * and `unreachableMilestones()` catches circular unlock gates statically. Neither
 * can tell you whether a milestone is *reachable in play* — whether the chain that
 * feeds it can be built, fed, powered and sold inside a sane amount of game time.
 * This drives the real engine with a greedy auto-player and reports where it jams.
 *
 * The auto-player sizes the factory from throughput, in two phases:
 *
 *   1. collect() walks the recipe graph in pure RATES. To sell R units/min of an
 *      item, each stage behind it needs R * rateIn/rateOut — no machine counts.
 *      Demand accumulates into one table across all three tracks AND across the
 *      machines already standing, because a stage feeding four chains needs the
 *      sum of what they draw, not the largest single draw.
 *   2. realize() builds to those sizes, buying the rate limit BEFORE the node
 *      that will draw on it, and wires producers to consumers.
 *
 * Alongside that it keeps Exposure under the tightest contract ceiling it has
 * signed, buys controls before contracts start refusing, and unplugs what it
 * cannot power. If a milestone cannot be cleared inside the budget it prints why:
 * delivered vs required, which ingredient is short and how many producers exist,
 * what is unwired, pool satisfaction, cash, and whether the harness's own caps
 * are what bound.
 *
 * A STUCK result is not automatically a content bug: it can equally mean the
 * auto-player is too dumb for that milestone. Read the diagnosis before filing.
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const BUDGET_MIN = Number(argv[argv.indexOf('--budget') + 1]) || 90;
const BUDGET_SEC = BUDGET_MIN * 60;
const STALL_MIN = Number(argv[argv.indexOf('--stall') + 1]) || 12;
const STALL_SEC = STALL_MIN * 60;
const PLAN_EVERY = 5; // sim-seconds between planning passes

// --- bundle data + engine as ONE module graph ----------------------------
// They must share module instances (BALANCE, id counters), so one entry point.
const tmp = mkdtempSync(join(tmpdir(), 'aifor-study-prog-'));
const entry = join(tmp, 'entry.ts');
const bundle = join(tmp, 'game.mjs');
writeFileSync(
  entry,
  `export * as data from ${JSON.stringify(join(root, 'src/data/index.ts'))};\n` +
    `export * as factory from ${JSON.stringify(join(root, 'src/engine/factory.ts'))};\n` +
    `export * as simulate from ${JSON.stringify(join(root, 'src/engine/simulate.ts'))};\n`,
);
await build({
  entryPoints: [entry],
  bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'warning',
});
const { data: D, factory: F, simulate: S } = await import(pathToFileURL(bundle).href);
rmSync(tmp, { recursive: true, force: true });

const { BUILDINGS, RECIPES, MILESTONES, RECIPE_BY_ID, BUILDING_BY_ID, TRACKS } = D;

// --- helpers -------------------------------------------------------------
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const unlockedRecipes = (s) => s.unlockedRecipes.map((id) => RECIPE_BY_ID[id]).filter(Boolean);
const machines = (s) => Object.values(s.machines);
const needs = (r) => [...(r.inputs ?? []), ...(r.catalysts ?? [])];
const isContract = (r) => r.payout != null;

/** Every item a recipe needs a link for: real inputs plus catalysts. */
function feeds(s, machineId, itemId) {
  return Object.values(s.links).some((l) => l.toId === machineId && l.itemId === itemId);
}

let placed = [];
const buildLog = [];
function place(s, buildingId, note) {
  const n = machines(s).length;
  const res = F.placeMachine(s, buildingId, (n % 10) * 220, Math.floor(n / 10) * 190);
  if (res.ok) {
    buildLog.push(BUILDING_BY_ID[buildingId]?.name ?? buildingId);
    placed.push(`${BUILDING_BY_ID[buildingId]?.name ?? buildingId}${note ? ` (${note})` : ''}`);
  }
  return res;
}

const MAX_COPIES = 40;        // per recipe — a safety valve, reported when it binds
const MAX_NODES = 500;
const CASH_RESERVE = 1500;    // keep this much banked for API spend and rent
const TARGET_MINUTES = 6;     // aim to finish the milestone in about this long
const poolOfBuilding = (b) => b?.vendor ?? 'shared';
const everPlaced = {};        // recipeId -> how many we have EVER built

const machinesOf = (s, recipeId) => machines(s).filter((m) => m.recipeId === recipeId);
const rateIn = (r, itemId) => D.ratePerMinute(r, itemId, 'inputs');
const rateOut = (r, itemId) => D.ratePerMinute(r, itemId, 'outputs');

/** Pick the producer of `itemId` we would rather build. */
function bestProducer(s, itemId) {
  const cands = unlockedRecipes(s)
    .filter((r) => !isContract(r) && (r.outputs ?? []).some((o) => o.itemId === itemId))
    .filter((r) => {
      const b = BUILDING_BY_ID[r.buildingId];
      return b && s.unlockedBuildings.includes(b.id) && !D.isWithdrawn(b, s.priceIndex);
    });
  return cands.sort((a, b) => {
    const srcA = (a.inputs ?? []).length === 0, srcB = (b.inputs ?? []).length === 0;
    if (srcA !== srcB) return srcA ? -1 : 1;
    const manA = a.manual ? 1 : 0, manB = b.manual ? 1 : 0;   // avoid click-to-craft
    if (manA !== manB) return manA - manB;
    // Exposure is architectural: wiring a risky provider in costs you contracts
    // whether or not it is crafting. Prefer the safe supplier over the cheap one.
    const riskA = BUILDING_BY_ID[a.buildingId]?.dataRisk ?? 0;
    const riskB = BUILDING_BY_ID[b.buildingId]?.dataRisk ?? 0;
    if (riskA !== riskB) return riskA - riskB;
    // Then the one that needs the least behind it, then the cheapest per craft.
    if ((a.inputs ?? []).length !== (b.inputs ?? []).length)
      return (a.inputs ?? []).length - (b.inputs ?? []).length;
    return (a.cost ?? 0) - (b.cost ?? 0);
  })[0];
}

/**
 * How many nodes of `recipe` we want, from the rate we need out of it.
 *
 * This is the whole point of rate-based sizing: a Landing Page emits 30 user
 * requests/min and a Luna eats 48, so feeding one Luna takes 1.6 Landing Pages —
 * a number you can compute up front from `seconds` and `qty` instead of waiting
 * for `starved` and adding one more. Sizing the graph this way is what lets a
 * deep chain (documents -> chunks -> embeddings -> retrieval -> agent) run at
 * all, because every stage is proportioned to the stage it feeds.
 */
function copiesFor(recipe, itemId, ratePerMin) {
  const per = rateOut(recipe, itemId);
  if (per <= 0) return 1;
  return Math.max(1, Math.ceil(ratePerMin / per));
}

/** Wire producers of `itemId` into consumers that still need feeding. */
function wire(s, producers, itemId, consumers) {
  for (const c of consumers) {
    if (feeds(s, c.id, itemId)) continue;
    // Give it the producer currently carrying the fewest outgoing links.
    const ranked = [...producers].sort((a, b) =>
      Object.values(s.links).filter((l) => l.fromId === a.id).length -
      Object.values(s.links).filter((l) => l.fromId === b.id).length);
    for (const p of ranked) {
      if (F.addLink(s, p.id, itemId, c.id).ok) break;
    }
  }
  // A producer nobody listens to is wasted rent; hang it off any consumer.
  for (const p of producers) {
    if (Object.values(s.links).some((l) => l.fromId === p.id && l.itemId === itemId)) continue;
    for (const c of consumers) if (F.addLink(s, p.id, itemId, c.id).ok) break;
  }
}

/** Would one more of this building fit on its rate limit? */
function fitsOnPool(s, b) {
  const draw = b?.computeDraw ?? 0;
  if (draw <= 0) return true;
  const pool = poolOfBuilding(b);
  const p = s.compute.pools[pool];
  if (!p) return true;
  if (p.supplyKtpm - p.demandKtpm < draw) return false;
  const serving = machines(s).filter(
    (m) => BUILDING_BY_ID[m.buildingId]?.kind === 'capacity' &&
      (m.vendor ?? 'shared') === pool && m.enabled,
  );
  const capped = serving.filter((m) => BUILDING_BY_ID[m.buildingId]?.servesNodes != null);
  if (capped.length && capped.length === serving.length) {
    const covers = capped.reduce((a, m) => a + BUILDING_BY_ID[m.buildingId].servesNodes, 0);
    if (p.drawers + 1 > covers) return false;
  }
  return true;
}

/** Bring the node count for `recipe` up to `want`, and return what we have. */
function stockTo(s, recipe, want, why) {
  // Something we deliberately unplugged for Exposure must not be rebought on the
  // next pass: place -> shed -> place is an infinite money fire, and the run that
  // found this burned $1.5M cycling 203 NSFW Studios through the same decision.
  if ((shedCount[recipe.buildingId] ?? 0) >= 2) return machinesOf(s, recipe.id);
  const have = machinesOf(s, recipe.id);
  const target = Math.min(want, MAX_COPIES);
  for (let i = have.length; i < target; i++) {
    if (machines(s).length >= MAX_NODES) break;
    if (s.credits < CASH_RESERVE + D.buildingCostAt(BUILDING_BY_ID[recipe.buildingId], s.priceIndex)) break;
    // Buy the rate limit BEFORE the node that will draw on it. A pool sitting at
    // exactly 100% is not reported `tight` — nothing is being throttled yet — so
    // waiting for that signal deadlocks: no headroom, so no node; no node, so no
    // throttle; no throttle, so no tier ever gets bought.
    if (!fitsOnPool(s, BUILDING_BY_ID[recipe.buildingId])) {
      buyCapacityFor(s, poolOfBuilding(BUILDING_BY_ID[recipe.buildingId]), 1);
      if (!fitsOnPool(s, BUILDING_BY_ID[recipe.buildingId])) break;
    }
    const res = place(s, recipe.buildingId, `${recipe.name} x${i + 1} — ${why}`);
    if (!res.ok) break;
    everPlaced[recipe.id] = (everPlaced[recipe.id] ?? 0) + 1;
    F.setRecipe(s, res.id, recipe.id);
    const b = BUILDING_BY_ID[recipe.buildingId];
    if (b?.vendorScoped && !s.machines[res.id].vendor) F.setVendor(s, res.id, b.vendor ?? 'openai');
  }
  return machinesOf(s, recipe.id);
}

/**
 * Phase 1 — accumulate the throughput each item needs, in pure rates.
 *
 * To make R units/min of X through recipe P, each unit of X costs
 * `rateIn(P, Y) / rateOut(P, X)` units of Y, so the demand on Y is R times that
 * — no machine counts involved. Accumulating into one table across every target
 * is the point: `user_request` feeding four different chains needs the SUM of
 * what they draw, and sizing each chain on its own silently under-provisions the
 * shared stage, which is exactly how the previous planner starved.
 */
function collect(s, itemId, rate, need, seen = new Set(), depth = 0) {
  if (depth > 10 || rate <= 0) return;
  need[itemId] = (need[itemId] ?? 0) + rate;
  if (seen.has(itemId)) return;              // a cycle: counted once, not chased

  const prod = bestProducer(s, itemId);
  if (!prod) return;
  const per = rateOut(prod, itemId);
  if (per <= 0) return;

  const deeper = new Set(seen).add(itemId);
  for (const inp of inputsOf(prod)) {
    collect(s, inp.itemId, (rate * rateIn(prod, inp.itemId)) / per, need, deeper, depth + 1);
  }
  // Catalysts are never consumed: one unit in the buffer runs the node forever,
  // so they need a supplier and a link, not throughput.
  for (const cat of prod.catalysts ?? []) {
    collect(s, cat.itemId, CATALYST_RATE, need, deeper, depth + 1);
  }
}

const CATALYST_RATE = 1;

/** Phase 2 — build to the sizes phase 1 asked for, then wire it all up. */
function realize(s, need) {
  const chosen = {};
  for (const [itemId, rate] of Object.entries(need)) {
    const prod = bestProducer(s, itemId);
    if (!prod) continue;
    chosen[itemId] = prod;
    stockTo(s, prod, copiesFor(prod, itemId, rate), `${Math.round(rate)}/min of ${itemId}`);
  }
  for (const [itemId, prod] of Object.entries(chosen)) {
    const producers = machinesOf(s, prod.id);
    if (!producers.length) continue;
    const consumers = machines(s).filter((m) => {
      if (producers.some((p) => p.id === m.id)) return false;
      const r = RECIPE_BY_ID[m.recipeId ?? ''];
      return r && needs(r).some((x) => x.itemId === itemId);
    });
    wire(s, producers, itemId, consumers);
  }
}

const inputsOf = (r) => r.inputs ?? [];

/** Put buyers on the board for `itemId`; returns the contract and its nodes. */
function ensureContractNodes(s, itemId, wantRate) {
  const cands = RECIPES.filter(
    (r) => isContract(r) && (r.inputs ?? []).some((i) => i.itemId === itemId) &&
      s.unlockedRecipes.includes(r.id),
  ).sort((a, b) => (b.maxExposure ?? 999) - (a.maxExposure ?? 999));
  if (!cands.length) return null;

  const r = cands[0];
  const per = rateIn(r, itemId);
  const want = per > 0 ? Math.min(CONTRACT_COPIES, Math.max(1, Math.ceil(wantRate / per))) : 1;

  for (let i = machinesOf(s, r.id).length; i < want; i++) {
    // Contract chassis normally arrive as offers; sign one if it is on the board.
    const offer = Object.values(s.offers).find((o) => o.buildingId === r.buildingId);
    const n = machines(s).length;
    const res = offer
      ? F.signOffer(s, offer.id, (n % 10) * 220, Math.floor(n / 10) * 190)
      : place(s, r.buildingId, r.name);
    if (!res.ok) break;
    if (offer) buildLog.push(BUILDING_BY_ID[r.buildingId]?.name ?? r.buildingId);
    F.setRecipe(s, res.id, r.id);
  }
  const have = machinesOf(s, r.id);
  return have.length ? { recipe: r, machines: have } : null;
}

const CONTRACT_COPIES = 4;

/**
 * Buy throughput for whichever pool is short.
 *
 * `servesNodes` is the trap: a Free Tier covers exactly one node, so once a
 * second node draws on that provider the free allowance stops counting and
 * buying more free tiers achieves nothing at all.
 */
function buyCapacityFor(s, pool, extraDrawers = 0) {
  const p = s.compute.pools[pool];
  const drawers = (p?.drawers ?? 0) + extraDrawers;
  const cands = BUILDINGS.filter(
    (b) => b.kind === 'capacity' && s.unlockedBuildings.includes(b.id) &&
      !!b.vendorScoped === (pool !== 'shared') && (b.computeSupply ?? 0) > 0 &&
      !D.isWithdrawn(b, s.priceIndex) &&
      D.buildingCostAt(b, s.priceIndex) <= Math.max(0, s.credits - CASH_RESERVE) &&
      // A tier that covers fewer nodes than already draw here contributes nothing.
      (b.servesNodes == null || b.servesNodes >= drawers) &&
      !(b.servesNodes != null &&
        machines(s).some((m) => m.buildingId === b.id && (m.vendor ?? 'shared') === pool)),
  ).sort((a, b) => (b.computeSupply ?? 0) - (a.computeSupply ?? 0));
  if (!cands.length) return false;

  const res = place(s, cands[0].id, `capacity for ${pool}`);
  if (!res.ok) return false;
  const m = s.machines[res.id];
  if (cands[0].vendorScoped) F.setVendor(s, m.id, pool);
  if (!m.recipeId) {
    const r = (D.RECIPES_BY_BUILDING[cands[0].id] ?? []).find((x) => s.unlockedRecipes.includes(x.id));
    if (r) F.setRecipe(s, m.id, r.id);
  }
  if (p) p.supplyKtpm += cands[0].computeSupply ?? 0;   // provisional, resurveyed next tick
  return true;
}

function ensureCapacity(s) {
  for (const pool of s.compute.tight ?? []) {
    const p = s.compute.pools[pool];
    if (!p) continue;
    for (let i = 0; i < 4 && p.demandKtpm > p.supplyKtpm; i++) {
      if (!buyCapacityFor(s, pool)) break;
    }
  }
}

/** The tightest exposure ceiling among contracts we have actually signed. */
function tightestCeiling(s) {
  const ceilings = machines(s)
    .map((m) => RECIPE_BY_ID[m.recipeId ?? '']?.maxExposure)
    .filter((c) => c != null);
  return ceilings.length ? Math.min(...ceilings) : Infinity;
}

/**
 * Keep Exposure under the contracts we are counting on.
 *
 * Waiting until a contract reads `audited` is too late — breach probability is
 * quadratic, so by then the bank is already draining.
 */
function ensureControls(s) {
  if (s.breachFreeze > 0) return;
  const ceiling = tightestCeiling(s);
  const pressed = s.exposure > ceiling * 0.8 ||
    machines(s).some((m) => s.status[m.id] === 'audited');
  if (!pressed) return;

  const control = BUILDINGS.filter(
    (b) => (b.dataRisk ?? 0) < 0 && s.unlockedBuildings.includes(b.id) &&
      !D.isWithdrawn(b, s.priceIndex) &&
      D.buildingCostAt(b, s.priceIndex) <= Math.max(0, s.credits - CASH_RESERVE) &&
      !machines(s).some((m) => m.buildingId === b.id),
  ).sort((a, b) => (a.dataRisk ?? 0) - (b.dataRisk ?? 0))[0];

  if (control) {
    const res = place(s, control.id, 'exposure control');
    if (res.ok && !s.machines[res.id].recipeId) {
      const r = (D.RECIPES_BY_BUILDING[control.id] ?? []).find((x) => s.unlockedRecipes.includes(x.id));
      if (r) F.setRecipe(s, res.id, r.id);
    }
    return;
  }

  // No control we can afford: shed the riskiest node we hold more than one of.
  if (s.exposure <= ceiling) return;
  const counts = {};
  for (const m of machines(s)) counts[m.buildingId] = (counts[m.buildingId] ?? 0) + 1;
  const victim = machines(s)
    .filter((m) => counts[m.buildingId] > 1 && (BUILDING_BY_ID[m.buildingId]?.dataRisk ?? 0) > 0)
    .sort((a, b) => (BUILDING_BY_ID[b.buildingId]?.dataRisk ?? 0) - (BUILDING_BY_ID[a.buildingId]?.dataRisk ?? 0))[0];
  if (victim) {
    shedCount[victim.buildingId] = (shedCount[victim.buildingId] ?? 0) + 1;
    F.removeMachine(s, victim.id);
  }
}

const shedCount = {};   // buildingId -> times unplugged for Exposure

/** Demolish drawers we cannot power and will not be able to. */
function trimOverdraw(s) {
  for (const pool of s.compute.tight ?? []) {
    const p = s.compute.pools[pool];
    if (!p || p.drawers <= 1) continue;
    const affordable = BUILDINGS.some(
      (b) => b.kind === 'capacity' && s.unlockedBuildings.includes(b.id) &&
        !!b.vendorScoped === (pool !== 'shared') && (b.computeSupply ?? 0) > 0 &&
        !D.isWithdrawn(b, s.priceIndex) &&
        D.buildingCostAt(b, s.priceIndex) <= Math.max(0, s.credits - CASH_RESERVE) &&
        (b.servesNodes == null || b.servesNodes >= p.drawers),
    );
    if (affordable) continue;
    const drawers = machines(s).filter(
      (m) => (BUILDING_BY_ID[m.buildingId]?.computeDraw ?? 0) > 0 &&
        poolOfBuilding(BUILDING_BY_ID[m.buildingId]) === pool,
    );
    if (drawers.length > 1) F.removeMachine(s, drawers[drawers.length - 1].id);
  }
}

let lastPlanAt = -1e9;
const PLAN_INTERVAL = 20;   // sim-seconds between (re)sizing passes

/** One sizing pass for whatever the three tracks currently want. */
function plan(s, targets) {
  ensureCapacity(s);
  ensureControls(s);
  if (s.elapsed - lastPlanAt < PLAN_INTERVAL) return;
  lastPlanAt = s.elapsed;
  trimOverdraw(s);

  // Sign the buyers first — how many contract nodes we hold sets the rate the
  // whole graph behind them has to hit — then size every stage against the SUM
  // of what all three tracks are drawing, and build it in one pass.
  const need = {};

  // Start from what the factory ALREADY draws. Chains built for earlier
  // milestones keep consuming after those milestones are done, so sizing only
  // against the current targets under-counts every shared stage — which is how
  // ten Landing Pages ended up feeding a graph that wanted far more.
  for (const m of machines(s)) {
    const r = RECIPE_BY_ID[m.recipeId ?? ''];
    if (!r || !m.enabled) continue;
    for (const inp of inputsOf(r)) collect(s, inp.itemId, rateIn(r, inp.itemId), need);
    for (const cat of r.catalysts ?? []) collect(s, cat.itemId, CATALYST_RATE, need);
  }

  for (const ms of targets) {
    for (const [itemId, qty] of Object.entries(ms.requires)) {
      const left = qty - (s.delivered[itemId] ?? 0);
      if (left <= 0) continue;
      const c = ensureContractNodes(s, itemId, left / TARGET_MINUTES);
      if (!c) continue;
      for (const inp of inputsOf(c.recipe)) {
        collect(s, inp.itemId, c.machines.length * rateIn(c.recipe, inp.itemId), need);
      }
      for (const cat of c.recipe.catalysts ?? []) collect(s, cat.itemId, CATALYST_RATE, need);
    }
  }
  realize(s, need);
  lastNeed = need;
}

let lastNeed = {};

/** The next incomplete milestone on a track — each track advances on its own. */
const nextOf = (s, track) =>
  MILESTONES.find((m) => (m.track ?? 'main') === track && !s.completedMilestones.includes(m.id));

/** Total units delivered toward the current targets — the progress signal. */
const progressOf = (s, targets) =>
  targets.reduce((sum, m) =>
    sum + Object.keys(m.requires).reduce((a, id) => a + (s.delivered[id] ?? 0), 0), 0);

// --- diagnosis for a stuck milestone -------------------------------------
function diagnose(s, ms) {
  const short = Object.entries(ms.requires)
    .map(([id, q]) => `${id} ${Math.floor(s.delivered[id] ?? 0)}/${q}`).join(', ');
  const byStatus = {};
  for (const m of machines(s)) {
    const st = s.status[m.id] ?? 'unknown';
    (byStatus[st] ??= []).push(BUILDING_BY_ID[m.buildingId]?.name ?? m.buildingId);
  }
  const statuses = Object.entries(byStatus)
    .map(([st, ns]) => `${st}: ${ns.length > 4 ? `${ns.slice(0, 4).join(', ')} +${ns.length - 4}` : ns.join(', ')}`);
  const pools = Object.entries(s.compute.pools)
    .filter(([, p]) => p.satisfaction < 0.999)
    .map(([n, p]) => `${n} ${Math.round(p.satisfaction * 100)}% (${Math.round(p.supplyKtpm)}/${Math.round(p.demandKtpm)} kTPM)`);
  // Which ingredient is actually missing, and can anything unlocked make it?
  // "starved of an item nothing unlocked produces" is a content dead end;
  // "starved of an item we produce but not fast enough" is a ratio problem.
  const missing = {};
  for (const m of machines(s)) {
    if (s.status[m.id] !== 'starved' || !m.recipeId) continue;
    const r = RECIPE_BY_ID[m.recipeId];
    for (const inp of needs(r ?? {})) {
      if ((m.inputs[inp.itemId] ?? 0) >= inp.qty) continue;
      (missing[inp.itemId] ??= { count: 0, into: new Set() });
      missing[inp.itemId].count += 1;
      missing[inp.itemId].into.add(BUILDING_BY_ID[m.buildingId]?.name ?? m.buildingId);
    }
  }
  // Starved with NO incoming link is a wiring failure in the planner; starved
  // with a link is a throughput problem. They need completely different fixes,
  // so never report them as the same thing.
  const unwired = [];
  for (const m of machines(s)) {
    if (s.status[m.id] !== 'starved' || !m.recipeId) continue;
    const r = RECIPE_BY_ID[m.recipeId];
    for (const inp of needs(r ?? {})) {
      if (!feeds(s, m.id, inp.itemId)) {
        unwired.push(`${BUILDING_BY_ID[m.buildingId]?.name ?? m.buildingId} has no ${inp.itemId} link`);
      }
    }
  }

  const shortages = Object.entries(missing)
    .sort((a, b) => b[1].count - a[1].count).slice(0, 6)
    .map(([id, v]) => {
      const prod = bestProducer(s, id);
      const made = machines(s).filter((m) => RECIPE_BY_ID[m.recipeId ?? '']?.outputs
        ?.some((o) => o.itemId === id)).length;
      return `${id} → ${v.count} node(s) waiting (${[...v.into].slice(0, 3).join(', ')}); ` +
        (prod ? `${made} producer(s) placed` : 'NOTHING UNLOCKED PRODUCES IT');
    });

  const buyers = Object.keys(ms.requires).map((id) => {
    const any = RECIPES.filter((r) => isContract(r) && (r.inputs ?? []).some((i) => i.itemId === id));
    const un = any.filter((r) => s.unlockedRecipes.includes(r.id));
    return `${id}: ${any.length} buyer(s) in content, ${un.length} unlocked`;
  });
  return { short, statuses, pools, buyers, shortages, unwired: [...new Set(unwired)].slice(0, 6) };
}

// --- run -----------------------------------------------------------------
const problems = D.validateContent();
const unreachable = D.unreachableMilestones();
const s = F.createInitialState();
const rows = [];
let stuck = null;

console.log(`\nAIfor.study progression test — ${MILESTONES.length} milestones, ` +
  `${BUDGET_MIN} sim-min cap each, STUCK after ${STALL_MIN} sim-min with no delivery\n`);

while (!stuck) {
  const targets = TRACKS.map((t) => nextOf(s, t.id)).filter(Boolean);
  if (!targets.length) break;

  const before = { t: s.elapsed, credits: s.credits, done: s.completedMilestones.length };
  placed = [];
  let cleared = null;

  // Stop on a genuine jam, not on a slow grind: a milestone still counting up
  // is progressing, and calling that STUCK would just be measuring the budget.
  let best = progressOf(s, targets);
  let sinceGain = 0;
  for (let spent = 0; spent < BUDGET_SEC; spent += PLAN_EVERY) {
    plan(s, targets);
    S.advance(s, PLAN_EVERY);
    const got = targets.find((m) => s.completedMilestones.includes(m.id));
    if (got) { cleared = got; break; }
    const now = progressOf(s, targets);
    if (now > best + 1e-9) { best = now; sinceGain = 0; } else sinceGain += PLAN_EVERY;
    if (sinceGain >= STALL_SEC) break;
  }

  if (cleared) {
    // A big delivered stock can satisfy several milestones on the same tick, so
    // record every one that completed in this slice, not just the one we noticed.
    for (const id of s.completedMilestones) {
      if (rows.some((r) => r.id === id)) continue;
      const m = D.MILESTONE_BY_ID[id];
      rows.push({
        id, name: m?.name ?? id, track: m?.track ?? 'main',
        mins: (s.elapsed - before.t) / 60, at: s.elapsed / 60,
        credits: s.credits, nodes: machines(s).length, exposure: s.exposure,
        breaches: s.breaches, placed: [...placed],
      });
      if (VERBOSE) {
        console.log(`✓ ${m?.name ?? id} [${m?.track ?? 'main'}] +${((s.elapsed - before.t) / 60).toFixed(1)}m`);
        for (const pl of placed) console.log(`    built ${pl}`);
      }
    }
  } else {
    stuck = { ms: targets[0], targets, diag: targets.map((m) => [m, diagnose(s, m)]) };
  }
}

// --- report --------------------------------------------------------------
const w = (v, n) => String(v).padEnd(n);
console.log(w('#', 4) + w('milestone', 26) + w('track', 9) + w('took', 8) + w('at', 8) +
  w('cash', 12) + w('nodes', 7) + w('exp', 5) + 'breaches');
console.log('-'.repeat(88));
rows.forEach((r, i) => {
  console.log(
    w(i + 1, 4) + w(r.name.slice(0, 24), 26) + w(r.track, 9) +
    w(`${r.mins.toFixed(1)}m`, 8) + w(`${r.at.toFixed(0)}m`, 8) +
    w(money(r.credits), 12) + w(r.nodes, 7) + w(Math.round(r.exposure), 5) + r.breaches,
  );
});

console.log(`\n${rows.length}/${MILESTONES.length} milestones cleared in ${(s.elapsed / 60).toFixed(0)} sim-minutes.`);
for (const t of TRACKS) {
  const total = MILESTONES.filter((m) => (m.track ?? 'main') === t.id).length;
  const done = rows.filter((r) => r.track === t.id).length;
  console.log(`  ${w(t.name, 14)} ${done}/${total}`);
}

if (stuck) {
  console.log(`\nSTUCK — no delivery toward these for ${STALL_MIN} sim-minutes ` +
    `(cap ${BUDGET_MIN}m per milestone):`);
  for (const [m, d] of stuck.diag) {
    console.log(`\n  ${m.name} [${m.track ?? 'main'}] — requires ${JSON.stringify(m.requires)}`);
    console.log(`    delivered   ${d.short}`);
    for (const b of d.buyers) console.log(`    buyer       ${b}`);
    for (const sh of d.shortages) console.log(`    short of    ${sh}`);
    for (const u of d.unwired) console.log(`    NOT WIRED   ${u}`);
    if (d.pools.length) console.log(`    throttled   ${d.pools.join(', ')}`);
    for (const st of d.statuses) console.log(`    nodes       ${st}`);
  }
  const hist = {};
  for (const n of buildLog) hist[n] = (hist[n] ?? 0) + 1;
  const top = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`\n  auto-player built: ${top.map(([n, c]) => `${c}x ${n}`).join(' · ')}`);
  // Say so when the harness's own safety valves stopped it, rather than the game.
  const atCap = Object.entries(everPlaced).filter(([, n]) => n >= MAX_COPIES).map(([id]) => id);
  console.log(`  harness caps: ${machines(s).length}/${MAX_NODES} nodes` +
    (atCap.length ? `, at the ${MAX_COPIES}-copy cap: ${atCap.join(', ')}` : ''));
  console.log(`\n  cash ${money(s.credits)} · exposure ${Math.round(s.exposure)} · ` +
    `${machines(s).length} nodes · ${s.breaches} breaches · ${money(s.breachLosses)} lost to breaches`);
  console.log('\n  A STUCK line means the greedy auto-player jammed — read the diagnosis');
  console.log('  before concluding the content is unwinnable.');
}

if (problems.length) console.log(`\nvalidateContent(): ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
if (unreachable.length) console.log(`\nunreachableMilestones(): ${unreachable.length}\n  ${unreachable.join('\n  ')}`);

process.exit(stuck ? 1 : 0);
