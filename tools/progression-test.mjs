/**
 * Headless progression test — can the tech tree actually be played through?
 *
 *   node tools/progression-test.mjs            (or: npm run progression)
 *   node tools/progression-test.mjs --verbose  per-milestone build log
 *   node tools/progression-test.mjs --budget 60  sim-minutes allowed per milestone
 *   node tools/progression-test.mjs --stall 20   sim-minutes of no delivery before STUCK
 *   node tools/progression-test.mjs --addons all  every addon on (or: none, or a,b,c list)
 *   node tools/progression-test.mjs --tune bankLoanTermMonths=18  try a BALANCE change
 *   node tools/progression-test.mjs --cost soc2_program=12000     try a price change
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
const TRACE = argv.includes('--trace');   // cash, rent and delivery every sim-minute
const BUDGET_MIN = Number(argv[argv.indexOf('--budget') + 1]) || 90;
const BUDGET_SEC = BUDGET_MIN * 60;
const STALL_MIN = Number(argv[argv.indexOf('--stall') + 1]) || 12;
const STALL_SEC = STALL_MIN * 60;
const PLAN_EVERY = 5; // sim-seconds between planning passes
// `--addons all` switches every addon on, `none` every one off, `a,b` a list.
// Absent, the game's own defaults apply (tracks on, feature addons off).
const ADDONS_ARG = argv.includes('--addons') ? argv[argv.indexOf('--addons') + 1] : null;

// --- bundle data + engine as ONE module graph ----------------------------
// They must share module instances (BALANCE, id counters), so one entry point.
const tmp = mkdtempSync(join(tmpdir(), 'aifor-study-prog-'));
const entry = join(tmp, 'entry.ts');
const bundle = join(tmp, 'game.mjs');
writeFileSync(
  entry,
  `export * as data from ${JSON.stringify(join(root, 'src/data/index.ts'))};\n` +
    `export * as factory from ${JSON.stringify(join(root, 'src/engine/factory.ts'))};\n` +
    `export * as simulate from ${JSON.stringify(join(root, 'src/engine/simulate.ts'))};\n` +
    `export * as venture from ${JSON.stringify(join(root, 'src/engine/venture.ts'))};\n` +
    `export * as agents from ${JSON.stringify(join(root, 'src/engine/agents.ts'))};\n` +
    `export * as esg from ${JSON.stringify(join(root, 'src/engine/esg.ts'))};\n` +
    `export * as addons from ${JSON.stringify(join(root, 'src/data/addons.ts'))};\n`,
);
await build({
  entryPoints: [entry],
  bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'warning',
});
const { data: D, factory: F, simulate: S, venture: V, agents: A, esg: E, addons: AD } =
  await import(pathToFileURL(bundle).href);
rmSync(tmp, { recursive: true, force: true });

const { BUILDINGS, RECIPES, MILESTONES, RECIPE_BY_ID, BUILDING_BY_ID, TRACKS } = D;

/**
 * Balance experiments without editing the data.
 *
 *   --tune bankLoanTermMonths=18,vcBaseSharePct=0.04   BALANCE keys
 *   --cost soc2_program=12000                          a building's base cost
 *
 * For asking "would this rebalance actually clear the wall" before committing
 * a number to `balance.ts`. Both are reported in the header so a pasted run can
 * never be mistaken for the shipped numbers.
 */
const tuned = [];
for (const [flag, apply] of [
  ['--tune', (k, v) => { if (!(k in D.BALANCE)) { console.error(`unknown BALANCE key "${k}"`); process.exit(2); } D.BALANCE[k] = Number(v); }],
  ['--cost', (k, v) => { const b = BUILDING_BY_ID[k]; if (!b) { console.error(`unknown building "${k}"`); process.exit(2); } b.cost = Number(v); }],
]) {
  if (!argv.includes(flag)) continue;
  for (const pair of (argv[argv.indexOf(flag) + 1] ?? '').split(',').filter(Boolean)) {
    const [k, v] = pair.split('=');
    apply(k, v);
    tuned.push(`${flag === '--cost' ? 'cost ' : ''}${k}=${v}`);
  }
}

/** The addon switches this run plays under. */
function addonSettings() {
  const base = { ...AD.DEFAULT_ADDONS };
  if (ADDONS_ARG === null) return base;
  const ids = AD.ADDONS.map((a) => a.id);
  if (ADDONS_ARG === 'all') for (const id of ids) base[id] = true;
  else if (ADDONS_ARG === 'none') for (const id of ids) base[id] = false;
  else {
    for (const id of ids) base[id] = false;
    for (const id of ADDONS_ARG.split(',')) {
      if (!ids.includes(id)) { console.error(`unknown addon "${id}" — have ${ids.join(', ')}`); process.exit(2); }
      base[id] = true;
    }
  }
  return base;
}

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
/**
 * Capex the current planning pass may still spend. Set by `plan()` to a slice
 * of free cash once the bank is big enough for that to matter: a funding round
 * converted into two hundred rent-bearing nodes in a single pass is how the
 * first all-addons run went from $180k to bankrupt inside two milestones.
 */
let capexLeft = Infinity;
const CAPEX_FRACTION = 0.2;
const CAPEX_BUDGET_FROM = 20_000;   // below this, spend freely: the early game has no slack to ration
/**
 * A producer the main track needs, has none of, and cannot afford yet — the
 * SOC 2 Program at $30k is the first. While one is set, nothing else is bought:
 * a greedy planner that keeps feeding the side tracks never accumulates the
 * lump, and the real game is the main spine.
 */
let savingFor = null;
/**
 * While saving, small purchases still go through.
 *
 * Freezing the whole factory to accumulate a lump is what a spreadsheet would
 * do, not a player: the $150 node that widens the chain pays for itself long
 * before the $30,000 one is affordable, and refusing it makes the save take
 * longer, not shorter. Only purchases big enough to actually push the target
 * out of reach are held.
 */
const SAVING_LETS_THROUGH = 0.12;   // of the target's price
function place(s, buildingId, note, priority = false) {
  const cost = D.buildingCostAt(BUILDING_BY_ID[buildingId], s.priceIndex);
  if (
    !priority && savingFor && buildingId !== savingFor.buildingId &&
    cost > savingFor.cost * SAVING_LETS_THROUGH
  ) {
    return { ok: false, reason: `saving for ${savingFor.name}` };
  }
  if (!priority && cost > capexLeft) return { ok: false, reason: 'capex budget for this pass is spent' };
  const n = machines(s).length;
  const res = F.placeMachine(s, buildingId, (n % 10) * 220, Math.floor(n / 10) * 190);
  if (res.ok) {
    capexLeft -= cost;
    buildLog.push(BUILDING_BY_ID[buildingId]?.name ?? buildingId);
    placed.push(`${BUILDING_BY_ID[buildingId]?.name ?? buildingId}${note ? ` (${note})` : ''}`);
  }
  return res;
}

const MAX_COPIES = 40;        // per recipe — a safety valve, reported when it binds
const MAX_NODES = 500;
const CASH_RESERVE = 400;     // keep at least this much banked for API spend
const RENT_MIN = 3;           // plus this many minutes of rent...
const RUNWAY_MIN = 8;         // ...and never build past this many minutes of net burn
const TARGET_MINUTES = Number(argv[argv.indexOf('--target') + 1]) || 6;   // aim to finish each milestone in about this long; --target N

/**
 * Cash the auto-player refuses to spend on capex. Milestones pay nothing, so
 * with $2,000 to start a flat floor of a few hundred is all the early game can
 * afford — while at $200k of venture money a flat floor is useless: a round
 * spent to the last dollar on nodes that each bill monthly is exactly how a
 * run goes from six figures to bankrupt in one milestone. So the floor scales
 * with the rent and with what the factory is losing per minute.
 */
function reserve(s) {
  const f = s.finance ?? {};
  const rentPerMin = ((f.burnPerMonth ?? 0) / D.BALANCE.monthSeconds) * 60;
  return Math.max(CASH_RESERVE, rentPerMin * RENT_MIN, -Math.min(0, f.netPerMin ?? 0) * RUNWAY_MIN);
}

// Seeded, so a run either reproduces or has found a real change. `--seed N`.
{
  let a = (Number(argv[argv.indexOf('--seed') + 1]) || 1) >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
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
    if (s.credits < reserve(s) + D.buildingCostAt(BUILDING_BY_ID[recipe.buildingId], s.priceIndex)) break;
    // Buy the rate limit BEFORE the node that will draw on it. A pool sitting at
    // exactly 100% is not reported `tight` — nothing is being throttled yet — so
    // waiting for that signal deadlocks: no headroom, so no node; no node, so no
    // throttle; no throttle, so no tier ever gets bought.
    if (!fitsOnPool(s, BUILDING_BY_ID[recipe.buildingId])) {
      buyCapacityFor(s, poolOfBuilding(BUILDING_BY_ID[recipe.buildingId]), 1);
      if (!fitsOnPool(s, BUILDING_BY_ID[recipe.buildingId])) break;
    }
    const res = place(s, recipe.buildingId, `${recipe.name} x${i + 1} — ${why}`,
      savingFor?.buildingId === recipe.buildingId);
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

/** The contract recipe we would rather sell `itemId` through, or null. */
function buyerFor(s, itemId) {
  const cands = RECIPES.filter(
    (r) => isContract(r) && (r.inputs ?? []).some((i) => i.itemId === itemId) &&
      s.unlockedRecipes.includes(r.id),
  ).sort((a, b) => (b.maxExposure ?? 999) - (a.maxExposure ?? 999));
  return cands[0] ?? null;
}

/** Put buyers on the board for `itemId`; returns the contract and its nodes. */
function ensureContractNodes(s, itemId, wantRate) {
  const r = buyerFor(s, itemId);
  if (!r) return null;
  const per = rateIn(r, itemId);
  const want = per > 0 ? Math.min(CONTRACT_COPIES, Math.max(1, Math.ceil(wantRate / per))) : 1;

  for (let i = machinesOf(s, r.id).length; i < want; i++) {
    // Contract chassis normally arrive as offers; sign one if it is on the board.
    // Signing an offer costs the chassis price too, so it goes through the same
    // saving gate as a placement.
    const offer = Object.values(s.offers).find((o) => o.buildingId === r.buildingId);
    const n = machines(s).length;
    const priority = savingFor?.buildingId === r.buildingId;
    const chassis = D.buildingCostAt(BUILDING_BY_ID[r.buildingId], s.priceIndex);
    if (offer && !priority && savingFor && chassis > savingFor.cost * SAVING_LETS_THROUGH) break;
    if (offer && !priority && D.buildingCostAt(BUILDING_BY_ID[r.buildingId], s.priceIndex) > capexLeft) break;
    const res = offer
      ? F.signOffer(s, offer.id, (n % 10) * 220, Math.floor(n / 10) * 190)
      : place(s, r.buildingId, r.name, priority);
    if (!res.ok) break;
    if (offer) capexLeft -= D.buildingCostAt(BUILDING_BY_ID[r.buildingId], s.priceIndex);
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
      D.buildingCostAt(b, s.priceIndex) <= Math.max(0, s.credits - reserve(s)) &&
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
      D.buildingCostAt(b, s.priceIndex) <= Math.max(0, s.credits - reserve(s)) &&
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
        D.buildingCostAt(b, s.priceIndex) <= Math.max(0, s.credits - reserve(s)) &&
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

// --- contracts on a term ---------------------------------------------------
/**
 * Re-sign every contract whose term ran out. An expired node freezes with its
 * wiring intact, so the cheapest way back to delivering is always the renewal,
 * never a fresh chassis — and `machinesOf` still counts the frozen node, so
 * the sizing pass would not buy a replacement anyway.
 */
function renewContracts(s) {
  for (const m of machines(s)) {
    if (!F.isExpired(s, m)) continue;
    const price = D.renewalCost(m.buildingId, s.priceIndex);
    if (s.credits < price) { tally.renewalsUnaffordable += 1; continue; }
    if (F.renewContract(s, m.id).ok) tally.renewals += 1;
  }
}

// --- the feature addons ----------------------------------------------------
/** What the addons did to this run, for the report. */
const tally = {
  renewals: 0, renewalsUnaffordable: 0,
  raises: 0, raised: 0, loans: 0, borrowed: 0, loansRefused: 0,
  churned: 0, agentRenewed: 0, runaways: 0, runawayLost: 0,
  disclosures: 0, esgIncidents: {}, esgFines: 0, esgFined: 0, creditsBought: 0,
  fines: 0, contractsLost: 0, breaches: 0, savedFor: [],
};

/** Bank what happened in one `advance()` batch. */
function record(ev) {
  tally.churned += ev.churned?.length ?? 0;
  tally.agentRenewed += ev.agentRenewed?.length ?? 0;
  tally.runaways += ev.runaways?.length ?? 0;
  tally.runawayLost += (ev.runaways ?? []).reduce((a, n) => a + n, 0);
  for (const i of ev.esgIncidents ?? []) tally.esgIncidents[i.kind] = (tally.esgIncidents[i.kind] ?? 0) + 1;
  tally.esgFines += ev.esgFines?.length ?? 0;
  tally.esgFined += (ev.esgFines ?? []).reduce((a, f) => a + f.amount, 0);
  tally.fines += ev.fines?.length ?? 0;
  tally.contractsLost += ev.contractsLost?.length ?? 0;
  tally.breaches += ev.breaches?.length ?? 0;
}

/**
 * Venture Capital: milestones pay nothing, so a round against each one is the
 * only lump sum on offer. Take every milestone raise, fall back to an on-demand
 * raise when the bank runs dry, and borrow only when equity is exhausted —
 * a loan amortises on a clock the revenue share does not.
 */
function ensureFinance(s, completedIds) {
  if (!AD.featureEnabled('ventureCapital', s.addons)) return;
  for (const id of completedIds) {
    const offer = V.raiseOfferFor(s, id);
    if (offer && V.acceptRaise(s, offer).ok) { tally.raises += 1; tally.raised += offer.capital; }
  }
  if (s.credits >= reserve(s)) return;
  const onDemand = V.onDemandRaiseOffer(s);
  if (onDemand && V.acceptRaise(s, onDemand).ok) {
    tally.raises += 1; tally.raised += onDemand.capital;
    return;
  }
  if (s.loans.length) return;   // one at a time: stacking draws is how a run spirals
  // A loan amortises over six sim-months whether or not the factory earns. Only
  // borrow what operating income can service: the first all-addons run drew
  // $23k at $0/min operating and paid $800/min for it into a bank at -$4k.
  const cap = V.loanCap(s);
  const perMin = (amount) =>
    (amount / (D.BALANCE.bankLoanTermMonths * D.BALANCE.monthSeconds)) * 60 +
    (amount * D.BALANCE.bankLoanRatePerMonth / D.BALANCE.monthSeconds) * 60;
  const op = s.finance?.operatingPerMin ?? 0;
  if (op <= 0) { tally.loansRefused += 1; return; }
  const amount = Math.min(cap, Math.max(0, (op * 0.5) / perMin(1)));
  if (amount < 500) { tally.loansRefused += 1; return; }
  if (V.drawLoan(s, amount).ok) { tally.loans += 1; tally.borrowed += amount; }
}

/** Place one of `buildingId` if unlocked, absent, affordable and powerable. */
function placeOnce(s, buildingId, note) {
  const b = BUILDING_BY_ID[buildingId];
  if (!b || !s.unlockedBuildings.includes(buildingId)) return false;
  if (machines(s).some((m) => m.buildingId === buildingId)) return false;
  if (s.credits < reserve(s) + D.buildingCostAt(b, s.priceIndex)) return false;
  if (!fitsOnPool(s, b)) {
    buyCapacityFor(s, poolOfBuilding(b), 1);
    if (!fitsOnPool(s, b)) return false;
  }
  const res = place(s, buildingId, note);
  if (!res.ok) return false;
  if (!s.machines[res.id].recipeId) {
    const r = (D.RECIPES_BY_BUILDING[buildingId] ?? []).find((x) => s.unlockedRecipes.includes(x.id));
    if (r) F.setRecipe(s, res.id, r.id);
  }
  return true;
}

/**
 * Agentic Ops: customers churn unless somebody watches them, so the sane
 * hire is a Console, a Support Agent to hold the accounts, and a Reviewer to
 * keep Drift down. The selling and building agents are left alone — this
 * harness already does those jobs, and a Coding Agent laying cheapest-legal
 * chains over the top of it would only muddy the diagnosis.
 */
function ensureAgents(s) {
  if (!AD.featureEnabled('agentic', s.addons)) return;
  if (!A.hasConsole(s)) { placeOnce(s, 'agent_console', 'agentic'); return; }
  if (A.agentsPlaced(s) >= A.agentHeadcount(s)) return;
  placeOnce(s, 'support_agent', 'agentic: hold customers');
  if (A.agentsPlaced(s) < A.agentHeadcount(s)) placeOnce(s, 'review_agent', 'agentic: drift');
}

const DISCLOSURE_REFRESH = 600;   // re-file every 10 sim-minutes, so the number stays near the truth

/**
 * ESG: the big contracts will not run without a published Footprint, and some
 * will not run above a ceiling. Hire the officer, self-certify the honest
 * number, and when a signed contract's ceiling is still out of reach buy
 * offsets — the cheapest lever, exactly as the tab says.
 */
function ensureEsg(s) {
  if (!AD.featureEnabled('esg', s.addons)) return;
  const signed = machines(s).map((m) => RECIPE_BY_ID[m.recipeId ?? '']).filter(Boolean);
  const needsDisclosure = signed.some((r) => r.requiresDisclosure || r.maxFootprint !== undefined);
  if (!needsDisclosure) return;
  if (!placeOnce(s, 'sustainability_officer', 'esg: sign the disclosure') &&
      !machines(s).some((m) => m.buildingId === 'sustainability_officer')) return;

  const d = s.esg.disclosure;
  const stale = !d || s.elapsed - d.publishedAt >= DISCLOSURE_REFRESH ||
    s.esg.footprint < d.claimed - 2;    // the truth improved: publish it
  if (stale && s.credits >= reserve(s) + D.BALANCE.esgSelfCertifyCost) {
    if (E.publishDisclosure(s, 'self', s.esg.footprint).ok) tally.disclosures += 1;
  }

  const ceilings = signed.map((r) => r.maxFootprint).filter((c) => c != null);
  if (!ceilings.length) return;
  if (s.esg.footprint <= Math.min(...ceilings)) return;
  placeOnce(s, 'carbon_desk', 'esg: offsets');
  if (s.credits >= reserve(s) + D.BALANCE.carbonCreditCost && E.buyCarbonCredits(s).ok) {
    tally.creditsBought += 1;
  }
}

let lastPlanAt = -1e9;
const PLAN_INTERVAL = 20;   // sim-seconds between (re)sizing passes

/** One sizing pass for whatever the three tracks currently want. */
function plan(s, targets) {
  const free = Math.max(0, s.credits - reserve(s));
  capexLeft = s.credits >= CAPEX_BUDGET_FROM ? free * CAPEX_FRACTION : Infinity;
  renewContracts(s);
  ensureFinance(s, []);
  ensureAgents(s);
  ensureEsg(s);
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

  const needMain = {};
  const unsignedMain = [];
  for (const ms of targets) {
    for (const [itemId, qty] of Object.entries(ms.requires)) {
      const left = qty - (s.delivered[itemId] ?? 0);
      if (left <= 0) continue;
      const c = ensureContractNodes(s, itemId, left / TARGET_MINUTES);
      if (!c) {
        // No buyer signed. If that is because the chassis is out of reach, it is
        // the main track's blocker as much as any producer behind it would be.
        const r = (ms.track ?? 'main') === 'main' ? buyerFor(s, itemId) : null;
        if (r) unsignedMain.push(r);
        continue;
      }
      for (const inp of inputsOf(c.recipe)) {
        collect(s, inp.itemId, c.machines.length * rateIn(c.recipe, inp.itemId), need);
        if ((ms.track ?? 'main') === 'main') collect(s, inp.itemId, 1, needMain);
      }
      for (const cat of c.recipe.catalysts ?? []) collect(s, cat.itemId, CATALYST_RATE, need);
    }
  }
  savingFor = blockerOf(s, needMain, unsignedMain);
  realize(s, need);
  lastNeed = need;
}

/** The dearest node the main track needs, has none of, and cannot afford right now. */
function blockerOf(s, needMain, unsignedMain) {
  let worst = null;
  const consider = (b) => {
    const cost = D.buildingCostAt(b, s.priceIndex);
    if (cost <= Math.max(0, s.credits - reserve(s))) return;
    if (!worst || cost > worst.cost) worst = { buildingId: b.id, name: b.name, cost };
  };
  for (const itemId of Object.keys(needMain)) {
    const prod = bestProducer(s, itemId);
    if (!prod || machinesOf(s, prod.id).length) continue;
    consider(BUILDING_BY_ID[prod.buildingId]);
  }
  for (const r of unsignedMain) {
    if (machinesOf(s, r.id).length) continue;
    consider(BUILDING_BY_ID[r.buildingId]);
  }
  if (worst && (!savingFor || savingFor.buildingId !== worst.buildingId)) {
    tally.savedFor.push(`${worst.name} (${money(worst.cost)}) at ${(s.elapsed / 60).toFixed(0)}m`);
  }
  return worst;
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
s.addons = addonSettings();
const rows = [];
let stuck = null;

const onAddons = AD.ADDONS.filter((a) => s.addons[a.id]).map((a) => a.name);
console.log(`\nAIfor.study progression test — ${MILESTONES.length} milestones, ` +
  `${BUDGET_MIN} sim-min cap each, STUCK after ${STALL_MIN} sim-min with no delivery`);
console.log(`addons on: ${onAddons.length ? onAddons.join(', ') : 'none'}`);
if (tuned.length) console.log(`TUNED (not the shipped numbers): ${tuned.join(', ')}`);
console.log('');

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
    const ev = S.advance(s, PLAN_EVERY);
    record(ev);
    if (TRACE && Math.round(s.elapsed) % 60 === 0) {
      const f = s.finance;
      console.log(`  t=${(s.elapsed / 60).toFixed(0)}m cash ${money(s.credits)} nodes ${machines(s).length} ` +
        `rev ${money(f.revenuePerMin)} cogs ${money(f.cogsPerMin)} rent ${money((f.burnPerMonth / D.BALANCE.monthSeconds) * 60)} ` +
        `net ${money(f.netPerMin)} · delivered ${targets.map((m) => Object.keys(m.requires).map((id) => `${id} ${Math.floor(s.delivered[id] ?? 0)}`).join(' ')).join(' | ')}`);
    }
    // A round is offered against the milestone that just landed; take it now,
    // before rent and the next sizing pass see a bank that has nothing in it.
    if (ev.milestonesCompleted.length) ensureFinance(s, ev.milestonesCompleted);
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
  const f = s.finance;
  console.log(`  per minute: revenue ${money(f.revenuePerMin)} · api spend ${money(f.cogsPerMin)} · ` +
    `rent ${money((f.burnPerMonth / D.BALANCE.monthSeconds) * 60)} · operating ${money(f.operatingPerMin)} · ` +
    `financing ${money(f.financingPerMin)} · net ${money(f.netPerMin)}`);
  console.log('\n  A STUCK line means the greedy auto-player jammed — read the diagnosis');
  console.log('  before concluding the content is unwinnable.');
}

// --- what the addons did -------------------------------------------------
{
  const lines = [];
  lines.push(`contract terms: ${tally.renewals} renewal(s)` +
    (tally.renewalsUnaffordable ? `, ${tally.renewalsUnaffordable} pass(es) too broke to re-sign` : ''));
  if (tally.savedFor.length) lines.push(`saved up for: ${tally.savedFor.join(' · ')}`);
  if (savingFor) lines.push(`still saving for: ${savingFor.name} (${money(savingFor.cost)}) with ${money(s.credits)} in the bank`);
  if (AD.featureEnabled('ventureCapital', s.addons)) {
    const owed = s.vc.raises.reduce((a, r) => a + Math.max(0, r.owed - r.paid), 0);
    lines.push(`venture capital: ${tally.raises} round(s) for ${money(tally.raised)}, ` +
      `${Math.round(V.activeSharePct(s) * 100)}% of revenue committed, ${money(owed)} still owed; ` +
      `${tally.loans} loan(s) for ${money(tally.borrowed)} (${tally.loansRefused} refused as unserviceable), ${s.loans.length} open ` +
      `(${money(s.loans.reduce((a, l) => a + l.principal, 0))} principal); ` +
      `financing ${money(s.finance.financingPerMin)}/min against revenue ${money(s.finance.revenuePerMin)}/min`);
  }
  if (AD.featureEnabled('agentic', s.addons)) {
    const agents = machines(s).filter((m) => A.isAgent(m)).map((m) => BUILDING_BY_ID[m.buildingId]?.name);
    lines.push(`agentic ops: ${agents.length ? agents.join(', ') : 'no agents hired'}; drift ${Math.round(s.agentDrift)}; ` +
      `${tally.churned} customer(s) churned, ${tally.agentRenewed} re-signed by the Support Agent, ` +
      `${tally.runaways} runaway(s) costing ${money(tally.runawayLost)}`);
  }
  if (AD.featureEnabled('esg', s.addons)) {
    const d = s.esg.disclosure;
    const inc = Object.entries(tally.esgIncidents).map(([k, n]) => `${n} ${k}`).join(', ') || 'none';
    lines.push(`esg: footprint ${Math.round(s.esg.footprint)} (E ${Math.round(s.esg.environmental)} ` +
      `S ${Math.round(s.esg.social)} G ${Math.round(s.esg.governance)}), ` +
      `${Math.round(s.esg.powerKw)} kW, bill ${money(E.esgBillPerMonth(s))}/mo; ` +
      `disclosure ${d ? `claimed ${Math.round(d.claimed)}${d.audited ? ' (audited)' : ''}` : 'none'} ` +
      `after ${tally.disclosures} filing(s); incidents ${inc}; ${tally.esgFines} fine(s) for ${money(tally.esgFined)}; ` +
      `${tally.creditsBought} credit block(s)`);
  }
  if (tally.fines || tally.contractsLost) {
    lines.push(`also: ${tally.fines} IP/legal fine(s), ${tally.contractsLost} contract(s) lost to quality`);
  }
  console.log(`\naddons:\n  ${lines.join('\n  ')}`);
}

if (problems.length) console.log(`\nvalidateContent(): ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
if (unreachable.length) console.log(`\nunreachableMilestones(): ${unreachable.length}\n  ${unreachable.join('\n  ')}`);

process.exit(stuck ? 1 : 0);
