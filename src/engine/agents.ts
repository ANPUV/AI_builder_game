/**
 * Agentic Ops addon.
 *
 * Agents are the first nodes in the game that produce nothing and pay nothing
 * (see docs/AGENTIC-ADDON-PLAN.md §0). They consume agent runs — the same units
 * an Enterprise contract buys at $1,050 a delivery — and spend them acting on
 * the game itself: signing leads off the board, skewing which listings the
 * board draws, wiring the producer chain for a contract you signed and never
 * built, and keeping customers who would otherwise walk.
 *
 * Everything here is gated on `featureEnabled('agentic', ...)`. With the addon
 * off, no agent acts, no drift accumulates and no contract churns — the base
 * game is exactly what it was.
 */
import {
  BALANCE,
  BUILDING_BY_ID,
  MARKET_LISTINGS,
  RECIPES,
  RECIPES_BY_BUILDING,
  addonOfBuilding,
  building,
  buildingCostAt,
  listingFor,
  rarityOf,
  recipe,
  renewalCost,
  type AgentRole,
  type FocusTarget,
  type Rarity,
  type Recipe,
} from '../data';
import { buildingEnabled, featureEnabled } from '../data/addons';
import { RARITY_ORDER } from '../data/market';
import { addLink, isExpired, placeMachine, renewContract, signOffer } from './factory';
import { agentRoleOf, isAgent } from './agentRules';
import type { ContractOffer, GameState, Machine } from './types';

export { agentHeadcount, agentRoleOf, agentsPlaced, hasConsole, isAgent } from './agentRules';

/**
 * Spacing for nodes an agent places on its own. The canvas has its own layout
 * constants in the UI layer; the engine cannot reach into those, and a rough
 * grid is all an auto-placed chain needs — the player will move it anyway.
 */
const NODE_GAP_X = 260;
const NODE_GAP_Y = 130;

export interface AgentEvents {
  /** Leads a Sales Agent closed on its own: what it bought and what it cost. */
  agentSigned: { buildingName: string; cost: number; offBrief: boolean }[];
  /** Chains a Coding Agent built: the contract, and how many nodes it placed. */
  agentBuilt: { buildingName: string; nodes: number; wasted: number }[];
  /** Signs a Reviewer Agent blocked before they emptied the account. */
  agentVetoed: { buildingName: string; cost: number }[];
  /** Customers whose contract lapsed because nobody was looking after them.
   *  The node freezes rather than vanishing; `cost` is what re-signing takes. */
  churned: { buildingName: string; cost: number }[];
  /** Contracts a Support Agent re-signed on its own, and what each cost. */
  agentRenewed: { buildingName: string; cost: number }[];
  /** Runaway agent spend: what a tick of nobody watching cost. */
  runaways: number[];
}

/** Agents that are enabled, unbroken and actually running their work cycle. */
function liveAgents(state: GameState, role: AgentRole): Machine[] {
  if (!featureEnabled('agentic', state.addons)) return [];
  const out: Machine[] = [];
  for (const m of Object.values(state.machines)) {
    if (agentRoleOf(m) !== role) continue;
    if (!m.enabled || m.broken) continue;
    // A passive agent only applies while its cycle is actually turning: an
    // agent starved of agent runs is an agent doing nothing, loudly.
    if (state.status[m.id] !== 'running') continue;
    out.push(m);
  }
  return out;
}

// --- focus -----------------------------------------------------------------

const trackOf = (buildingId: string): 'main' | 'homelab' | 'slop' =>
  addonOfBuilding(buildingId) ?? 'main';

const meetsFloor = (weight: number, floor: Rarity | undefined): boolean =>
  !floor || RARITY_ORDER.indexOf(rarityOf(weight)) >= RARITY_ORDER.indexOf(floor);

/**
 * Does this contract chassis match what the agent was pointed at?
 *
 * A named tier is exact and ignores the rarity floor — picking Federal Program
 * already implies its rarity, and offering a contradiction would be worse than
 * disabling the control.
 */
export function matchesFocus(
  buildingId: string,
  focus: FocusTarget | undefined,
  rarityFloor?: Rarity,
): boolean {
  const listing = listingFor(buildingId);
  if (!listing) return false;
  const target = focus ?? 'all';
  if (target.startsWith('tier:')) return target.slice(5) === buildingId;
  if (target.startsWith('track:')) {
    return target.slice(6) === trackOf(buildingId) && meetsFloor(listing.weight, rarityFloor);
  }
  return meetsFloor(listing.weight, rarityFloor);
}

// --- drift -----------------------------------------------------------------

/**
 * Chance a Sales Agent ignores its own focus this cycle. Zero below the floor,
 * and this is the symptom the player set a dropdown specifically to prevent —
 * which is exactly why it is the one drift breaks first.
 */
export const driftIgnoresFocus = (drift: number): number =>
  Math.min(
    BALANCE.driftFocusMax,
    Math.max(0, (drift - BALANCE.driftFocusFloor) * BALANCE.driftFocusPerPoint),
  );

/** Chance a Coding Agent buys a node the chain never needed. */
export const driftWastesNode = (drift: number): number =>
  Math.min(
    BALANCE.driftWasteMax,
    Math.max(0, (drift - BALANCE.driftWasteFloor) * BALANCE.driftWastePerPoint),
  );

// --- marketing -------------------------------------------------------------

/**
 * Draw-weight multipliers for the board, one per targeted listing.
 *
 * Marketing changes WHICH customers call, never how often the phone rings:
 * `leadRate` is still a function of how many tiers you have unlocked. Pointed
 * at one legendary listing, this is how a lead you would wait ten minutes for
 * starts arriving instead.
 */
export function marketingBoosts(state: GameState): Record<string, number> {
  const boost: Record<string, number> = {};
  for (const agent of liveAgents(state, 'marketing')) {
    const strength = building(agent.buildingId)?.agentStrength ?? 0;
    if (strength <= 0) continue;
    for (const l of MARKET_LISTINGS) {
      if (!matchesFocus(l.buildingId, agent.focus, agent.rarityFloor)) continue;
      boost[l.buildingId] = (boost[l.buildingId] ?? 1) + strength;
    }
  }
  return boost;
}

// --- sales -----------------------------------------------------------------

/** What a Sales Agent must leave in the bank. A Reviewer holds far more back. */
export const cashFloor = (state: GameState): number =>
  liveAgents(state, 'review').length > 0
    ? BALANCE.agentReviewedCashFloor
    : BALANCE.agentCashFloor;

/** Offers this agent would consider right now, best-paying first. */
function targets(state: GameState, agent: Machine, ignoreFocus: boolean): ContractOffer[] {
  return Object.values(state.offers)
    .filter((o) =>
      ignoreFocus ? listingFor(o.buildingId) !== undefined : matchesFocus(o.buildingId, agent.focus, agent.rarityFloor),
    )
    .filter((o) => state.elapsed < o.expiresAt)
    .sort(
      (a, b) =>
        (listingFor(a.buildingId)?.weight ?? 0) - (listingFor(b.buildingId)?.weight ?? 0),
    );
}

/**
 * One close attempt, fired when the agent's work cycle completes.
 *
 * Nothing here stops it signing something you cannot service — that is the
 * addon's whole point in miniature. The only brake is a Reviewer Agent, whose
 * cash floor turns "it emptied the account overnight" from a certainty into
 * something you can insure against.
 */
function trySell(state: GameState, agent: Machine, events: AgentEvents): void {
  const b = building(agent.buildingId);
  if (!b) return;
  const offBrief = Math.random() < driftIgnoresFocus(state.agentDrift);
  const options = targets(state, agent, offBrief);
  if (!options.length) return;
  if (Math.random() >= (b.agentStrength ?? 0)) return;

  const offer = options[0];
  const chassis = BUILDING_BY_ID[offer.buildingId];
  if (!chassis) return;
  const price = buildingCostAt(chassis, state.priceIndex);
  const floor = cashFloor(state);
  if (state.credits - price < floor) {
    // A Reviewer is the only reason this branch is ever reached with money in
    // the bank: without one the floor is zero and the sign just happens.
    if (floor > 0) events.agentVetoed.push({ buildingName: chassis.name, cost: price });
    return;
  }

  const spot = freeSpot(state, agent.x + NODE_GAP_X, agent.y);
  const result = signOffer(state, offer.id, spot.x, spot.y);
  if (!result.ok) return;
  events.agentSigned.push({ buildingName: chassis.name, cost: price, offBrief });
}

// --- coding ----------------------------------------------------------------

/** Item ids this contract still has no belt delivering. */
function unfedInputs(state: GameState, contract: Machine): string[] {
  const r = recipe(contract.recipeId);
  if (!r) return [];
  const fed = new Set(
    Object.values(state.links)
      .filter((l) => l.toId === contract.id)
      .map((l) => l.itemId),
  );
  return [...r.inputs, ...(r.catalysts ?? [])]
    .map((s) => s.itemId)
    .filter((id) => !fed.has(id));
}

/** The best unlocked recipe a contract chassis can run, by payout. */
function bestContractRecipe(state: GameState, buildingId: string): Recipe | undefined {
  return (RECIPES_BY_BUILDING[buildingId] ?? [])
    .filter((r) => r.payout !== undefined && state.unlockedRecipes.includes(r.id))
    .sort((a, b) => (b.payout ?? 0) - (a.payout ?? 0))[0];
}

/**
 * The cheapest unlocked way to make `itemId`.
 *
 * Cheapest, not best — a Junior agent builds the chain that works, not the one
 * with the margin, which is a fair model of what a well-scoped ticket comes
 * back as. Agent and contract chassis are never candidates: an agent makes
 * nothing, and a customer is a lead you sign, not a node you buy.
 */
function cheapestProducer(
  state: GameState,
  itemId: string,
): { recipe: Recipe; cost: number } | undefined {
  const options: { recipe: Recipe; cost: number }[] = [];
  for (const r of RECIPES) {
    if (!r.outputs.some((o) => o.itemId === itemId)) continue;
    if (!state.unlockedRecipes.includes(r.id)) continue;
    const b = BUILDING_BY_ID[r.buildingId];
    if (!b || b.kind === 'contract' || b.kind === 'agent') continue;
    if (!state.unlockedBuildings.includes(b.id)) continue;
    // A node from a switched-off addon would be refused at placement and the
    // agent would abandon the whole chain over it. Never offer it one.
    if (!buildingEnabled(b.id, state.addons)) continue;
    options.push({ recipe: r, cost: buildingCostAt(b, state.priceIndex) + (r.cost ?? 0) * 10 });
  }
  return options.sort((a, b) => a.cost - b.cost)[0];
}

/** A node already on the canvas that emits `itemId` and is not itself an agent. */
function existingProducer(state: GameState, itemId: string): Machine | undefined {
  for (const m of Object.values(state.machines)) {
    if (isAgent(m) || m.broken) continue;
    const r = recipe(m.recipeId);
    if (r?.outputs.some((o) => o.itemId === itemId)) return m;
  }
  return undefined;
}

/** Somewhere to drop a node that is not already occupied. */
function freeSpot(state: GameState, x: number, y: number): { x: number; y: number } {
  let spot = { x, y };
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const clash = Object.values(state.machines).some(
      (m) => Math.abs(m.x - spot.x) < NODE_GAP_X - 40 && Math.abs(m.y - spot.y) < NODE_GAP_Y - 20,
    );
    if (!clash) return spot;
    spot = { x: spot.x, y: spot.y + NODE_GAP_Y };
  }
  return spot;
}

/**
 * Build the producer chain for one contract, breadth-first, paying full price
 * for every node exactly as the player would.
 *
 * Runs out of cash mid-chain and it simply stops: the contract stays unwired,
 * the agent picks it up again next cycle, and a half-built chain sitting in
 * plain sight is the tell that this addon needs supervision.
 */
function buildChain(
  state: GameState,
  agent: Machine,
  contract: Machine,
  events: AgentEvents,
): void {
  const senior = agent.buildingId === 'coding_agent_sr';
  let placed = 0;
  let wasted = 0;

  if (!contract.recipeId) {
    const best = bestContractRecipe(state, contract.buildingId);
    if (best) contract.recipeId = best.id;
  }

  const queue: { machine: Machine; depth: number }[] = [{ machine: contract, depth: 1 }];
  while (queue.length && placed < BALANCE.agentChainNodeCap) {
    const { machine, depth } = queue.shift()!;
    if (depth > 5) continue;

    for (const itemId of unfedInputs(state, machine)) {
      if (placed >= BALANCE.agentChainNodeCap) break;

      // A senior agent looks for spare capacity it already owns first, which is
      // most of what separates a senior engineer from a fast one.
      const reuse = senior ? existingProducer(state, itemId) : undefined;
      if (reuse) {
        addLink(state, reuse.id, itemId, machine.id);
        continue;
      }

      const pick = cheapestProducer(state, itemId);
      if (!pick) continue;
      const spot = freeSpot(state, machine.x - NODE_GAP_X, machine.y);
      const result = placeMachine(state, pick.recipe.buildingId, spot.x, spot.y);
      if (!result.ok || !result.id) return; // out of cash: leave it half-built

      const node = state.machines[result.id];
      node.recipeId = pick.recipe.id;
      placed += 1;
      addLink(state, node.id, itemId, machine.id);
      queue.push({ machine: node, depth: depth + 1 });

      // Drift: the agent buys something the chain never asked for and wires it
      // to nothing. The cash is gone and the node sits there as evidence.
      if (Math.random() < driftWastesNode(state.agentDrift)) {
        const spare = freeSpot(state, node.x, node.y + NODE_GAP_Y);
        const junk = placeMachine(state, pick.recipe.buildingId, spare.x, spare.y);
        if (junk.ok) wasted += 1;
      }
    }
  }

  if (placed > 0 || wasted > 0) {
    events.agentBuilt.push({
      buildingName: building(contract.buildingId)?.name ?? 'A contract',
      nodes: placed,
      wasted,
    });
  }
}

/** A signed contract this agent would work on: matching focus, missing a feed. */
function nextProject(state: GameState, agent: Machine): Machine | undefined {
  for (const m of Object.values(state.machines)) {
    if (building(m.buildingId)?.kind !== 'contract' || m.broken) continue;
    if (!matchesFocus(m.buildingId, agent.focus, agent.rarityFloor)) continue;
    if (!m.recipeId) return m;
    if (unfedInputs(state, m).length > 0) return m;
  }
  return undefined;
}

// --- the tick hooks --------------------------------------------------------

/**
 * Is this agent able to do anything right now?
 *
 * A Sales Agent with no matching lead and a Coding Agent with nothing to wire
 * both sit there — reported as `unfocused`, spending no tokens and billing the
 * full subscription. A specialist you are paying to wait is a real cost, and
 * it is the specific cost the focus dropdown lets the player take on.
 */
export function agentHasWork(state: GameState, m: Machine): boolean {
  const role = agentRoleOf(m);
  if (role === 'sales') return targets(state, m, false).length > 0;
  if (role === 'coding') return nextProject(state, m) !== undefined;
  return true;
}

/** Called when an agent's work cycle completes. This is the action. */
export function onAgentCraft(state: GameState, m: Machine, events: AgentEvents): void {
  if (!featureEnabled('agentic', state.addons)) return;
  const role = agentRoleOf(m);
  if (role === 'sales') trySell(state, m, events);
  if (role === 'coding') {
    const project = nextProject(state, m);
    if (project) buildChain(state, m, project, events);
  }
}

/**
 * Churn, and the runaway roll. Only ever called with the addon on.
 *
 * Churn is the open question `docs/CONTENT-SPEC.md` §12 left standing: without
 * it the late game is pure accumulation, because a signed contract is signed
 * forever. A customer served cleanly for a while is nearly sticky; a neglected
 * one is not; a Support Agent is the difference for the tier it watches.
 */
export function tickAgents(state: GameState, dt: number, events: AgentEvents): void {
  if (!featureEnabled('agentic', state.addons)) return;

  const supported = new Set<string>();
  let supportCut = 0;
  for (const agent of liveAgents(state, 'support')) {
    const strength = building(agent.buildingId)?.agentStrength ?? 0;
    supportCut = Math.max(supportCut, strength);
    for (const m of Object.values(state.machines)) {
      if (building(m.buildingId)?.kind !== 'contract') continue;
      if (matchesFocus(m.buildingId, agent.focus, agent.rarityFloor)) supported.add(m.id);
    }
  }

  for (const m of Object.values(state.machines)) {
    if (building(m.buildingId)?.kind !== 'contract') continue;

    // Renewals. A Support Agent's job is keeping customers, and a term running
    // out is the most ordinary way to lose one — so it re-signs the contracts
    // it is watching without being asked, out of your cash, and holds the same
    // floor back that a Sales Agent does.
    if (isExpired(state, m)) {
      const price = renewalCost(m.buildingId, state.priceIndex);
      if (
        supported.has(m.id) &&
        state.credits - price >= cashFloor(state) &&
        renewContract(state, m.id).ok
      ) {
        events.agentRenewed.push({
          buildingName: building(m.buildingId)?.name ?? 'A customer',
          cost: price,
        });
      }
      // Frozen means frozen, renewed or not. An expired contract never reaches
      // the churn roll: a term ending is not the same event as a customer
      // walking out, and the node has to still be on the canvas for the player
      // to re-sign it. Not renewing already costs you everything the contract
      // was earning — it does not also need to delete your wiring.
      continue;
    }

    // Loyalty is earned by running, not by existing: a contract sitting on
    // hold or starved is exactly the neglected customer this models.
    const healthy = state.status[m.id] === 'running';
    m.servedFor = healthy ? (m.servedFor ?? 0) + dt : Math.max(0, (m.servedFor ?? 0) - dt);

    // Onboarding. A customer who signed ninety seconds ago has not been let
    // down yet, and losing a chassis before the player could plausibly wire it
    // would be a tax on signing rather than a lesson about neglect.
    if (state.elapsed - (m.signedAt ?? state.elapsed) < BALANCE.churnGraceSeconds) continue;

    const loyalty =
      Math.min(1, (m.servedFor ?? 0) / BALANCE.churnLoyaltySeconds) * BALANCE.churnLoyaltyMax;
    const cut = supported.has(m.id) ? supportCut : 0;
    const perMinute = BALANCE.churnRatePerMin * (1 - loyalty) * (1 - cut);
    if (perMinute <= 0) continue;
    if (Math.random() >= (perMinute / 60) * dt) continue;

    // Churn ENDS the contract; it does not delete your factory.
    //
    // This used to remove the node and every belt running into it, which made
    // losing a customer indistinguishable from vandalism: loyalty caps at
    // churnLoyaltyMax rather than 1, so a contract you were serving perfectly
    // still carried a residual roll, and the reward for playing well was
    // occasionally finding a hole in your graph with no idea what made it.
    //
    // Freezing it instead reuses the term machinery: the customer stops paying,
    // the wiring stays put, and you win them back for the same quarter-price
    // re-signing fee — which is also what lets a Support Agent recover an
    // account it failed to hold.
    events.churned.push({
      buildingName: building(m.buildingId)?.name ?? 'A customer',
      cost: renewalCost(m.buildingId, state.priceIndex),
    });
    m.termEndsAt = state.elapsed;
    m.servedFor = 0;
  }

  // Nobody watching, and it bills you outright.
  if (state.agentDrift > BALANCE.driftRunawayFloor) {
    const perMinute = BALANCE.driftRunawayRateAt100 * (state.agentDrift / 100) ** 2;
    if (Math.random() < (perMinute / 60) * dt) {
      const loss = Math.max(
        BALANCE.driftRunawayMin,
        Math.round(state.credits * BALANCE.driftRunawayFraction),
      );
      state.credits -= loss;
      state.agentLosses += loss;
      events.runaways.push(loss);
    }
  }
}
