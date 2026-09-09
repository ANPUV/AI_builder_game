import {
  ALL_VENDORS,
  BALANCE,
  BUILDING_BY_ID,
  LISTING_BY_BUILDING,
  RECIPE_BY_ID,
  STARTING_BUILDINGS,
  STARTING_RECIPES,
  building,
  buildingCostAt,
  contractTermSeconds,
  isWithdrawn,
  recipe,
  renewalCost,
  type FocusTarget,
  type Rarity,
} from '../data';
import { DEFAULT_ADDONS, buildingEnabled } from '../data/addons';
import { agentHeadcount, agentsPlaced, hasConsole } from './agentRules';
import { coolingOptions, freshEsgState, hasOfficer, hasPower, permitBlocked } from './esgRules';
import { nextId } from './ids';
import { seedMarket, takeOffer } from './market';
import type { CoolingMode, GameState, Link, Machine, LinkShape } from './types';

// 4 -> 5: GameState gained `vc` and `loans` (Venture Capital addon).
// 5 -> 6: GameState gained `agentDrift` / `agentLosses` and Machine gained
//         `focus` / `rarityFloor` / `servedFor` (Agentic Ops addon). Per
//         convention, a save from an older version is discarded on load rather
//         than merged — see save.ts.
// 6 -> 7: GameState gained `esg` and Machine gained `cooling` (ESG addon).
// Contract terms (`termEndsAt` / `renewals`) deliberately did NOT bump this.
// Both fields are optional and save.ts dates any contract missing one from the
// moment it loads, so an existing factory keeps every customer it had rather
// than being discarded for a field it could not have written.
export const STATE_VERSION = 7;

export function createInitialState(): GameState {
  const state: GameState = {
    version: STATE_VERSION,
    machines: {},
    links: {},
    credits: BALANCE.startingCredits,
    delivered: {},
    completedMilestones: [],
    unlockedBuildings: [...STARTING_BUILDINGS],
    unlockedRecipes: [...STARTING_RECIPES],
    elapsed: 0,
    offers: {},
    lastOffered: {},
    hotbar: Array<string | null>(HOTBAR_SLOTS).fill(null),
    addons: { ...DEFAULT_ADDONS },
    linkShape: 'curve',
    exposure: 0,
    breaches: 0,
    breachFreeze: 0,
    breachLosses: 0,
    priceIndex: 1,
    agentDrift: 0,
    agentLosses: 0,
    slop: 0,
    slopFines: 0,
    slopExposureSpike: 0,
    vc: { raises: [], totalSharePct: 0, declined: [] },
    loans: [],
    esg: freshEsgState(),
    compute: { pools: {}, demandKtpm: 0, supplyKtpm: 0, satisfaction: 1, tight: [] },
    finance: {
      burnPerMonth: 0,
      revenuePerMin: 0,
      cogsPerMin: 0,
      operatingPerMin: 0,
      financingPerMin: 0,
      netPerMin: 0,
    },
    status: {},
  };
  seedMarket(state);
  return state;
}

/** The item ids a machine currently exposes as output ports. */
export function outputPorts(m: Machine): string[] {
  const r = recipe(m.recipeId);
  return r ? r.outputs.map((s) => s.itemId) : [];
}

/** The item ids a machine currently exposes as input ports. */
export function inputPorts(m: Machine): string[] {
  const r = recipe(m.recipeId);
  if (!r) return [];
  // Catalysts get a port too: the weights have to arrive from somewhere, they
  // just never leave.
  return [...r.inputs, ...(r.catalysts ?? [])].map((s) => s.itemId);
}

export function acceptsItem(m: Machine, itemId: string): boolean {
  const r = recipe(m.recipeId);
  if (!r) return false;
  return [...r.inputs, ...(r.catalysts ?? [])].some((s) => s.itemId === itemId);
}

// --- mutations -----------------------------------------------------------
// These mutate `state` in place. The React layer bumps a revision counter
// after each call rather than cloning the world 20 times a second.

export type Outcome = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): Outcome => ({ ok: false, reason });
const OK: Outcome = { ok: true };

/**
 * What this chassis costs to place RIGHT NOW.
 *
 * Every read of `building.cost` must come through here. A build bar that shows
 * one price and charges another is the worst bug the price index can produce.
 */
export const currentCost = (state: GameState, buildingId: string): number => {
  const b = BUILDING_BY_ID[buildingId];
  return b ? buildingCostAt(b, state.priceIndex) : 0;
};

/** How many of a building are on the canvas right now. */
export function countOf(state: GameState, buildingId: string): number {
  let n = 0;
  for (const m of Object.values(state.machines)) if (m.buildingId === buildingId) n++;
  return n;
}

/**
 * Why this building cannot be placed right now, or null when it can — every
 * rule except the price, which the build bar prices separately.
 *
 * Extracted so the bar and the engine cannot disagree. They did: the bar greyed
 * a card out only when it was unaffordable or at its cap, so an agent with no
 * Ops Console looked perfectly available, armed on click, and then failed on the
 * canvas. The comment below used to say "the build bar greys these out" about a
 * rule the build bar had never heard of.
 */
export function placementBlocker(state: GameState, buildingId: string): string | null {
  const b = BUILDING_BY_ID[buildingId];
  if (!b) return `No such building "${buildingId}"`;
  if (!state.unlockedBuildings.includes(buildingId)) return `${b.name} is not unlocked yet`;
  // Withdrawn from sale. Apple pulled the 512GB Mac Studio in March 2026
  // rather than reprice it; anyone who already owns one keeps theirs.
  if (isWithdrawn(b, state.priceIndex)) return `${b.name} is no longer sold`;
  if (!buildingEnabled(buildingId, state.addons)) return `${b.name} is switched off in settings`;
  if (b.maxCount !== undefined && countOf(state, buildingId) >= b.maxCount) {
    return b.maxCount === 1
      ? `You only get one ${b.name}`
      : `You may only have ${b.maxCount} of the ${b.name}`;
  }
  // A planning moratorium stops anything that takes up land. Cash does not fix
  // this one, which is the entire point of it: the expansion you had already
  // budgeted for simply cannot be built this minute.
  if (permitBlocked(state, buildingId)) {
    return `Planning moratorium — no new ${b.tier} sites until it lifts`;
  }
  // Somebody has to own the footprint before you can start managing it.
  if (b.tier === 'Sustainability' && b.id !== 'sustainability_officer' && !hasOfficer(state)) {
    return 'Place a Sustainability Officer first — somebody has to sign for this';
  }
  // Agents compound — marketing feeds sales feeds coding — so how many may run
  // at once is the addon's main brake, and it is the Console's to raise.
  if (b.kind === 'agent' && b.agentRole !== 'console') {
    if (!hasConsole(state)) return 'Hire an Agent Ops Console first — somebody has to manage the agents';
    const cap = agentHeadcount(state);
    if (agentsPlaced(state) >= cap) {
      return `Your Console manages ${cap} agents. Clear the next milestone to hire more.`;
    }
  }
  return null;
}

export function placeMachine(
  state: GameState,
  buildingId: string,
  x: number,
  y: number,
): Outcome & { id?: string } {
  const b = BUILDING_BY_ID[buildingId];
  if (!b) return fail(`No such building "${buildingId}"`);
  // One definition of the rules, shared with the build bar.
  const blocked = placementBlocker(state, buildingId);
  if (blocked) return fail(blocked);
  const price = buildingCostAt(b, state.priceIndex);
  // A free node stays free when you are underwater. `credits < price` was
  // refusing a $0 Free Tier at -$0.01 with the message "Need 0 credits for a
  // Free Tier", which took away the one thing that can restart a factory that
  // has run itself into the ground: capacity that costs nothing to place.
  if (price > 0 && state.credits < price) {
    return fail(`Need ${Math.ceil(price)} credits for a ${b.name}`);
  }

  const id = nextId('m');
  state.credits -= price;
  state.machines[id] = {
    id,
    buildingId,
    recipeId: defaultRecipeFor(state, buildingId),
    x,
    y,
    clock: 1,
    enabled: true,
    vendor: b.vendorScoped ? defaultVendorFor(state) : undefined,
    groupId: null,
    progress: 0,
    crafting: false,
    inputs: {},
    outputs: {},
    // When the customer signed, for the churn grace (Agentic Ops addon), and
    // when the term runs out. A zero term means this one never expires.
    ...(b.kind === 'contract'
      ? {
          signedAt: state.elapsed,
          ...(contractTermSeconds(buildingId) > 0
            ? { termEndsAt: state.elapsed + contractTermSeconds(buildingId) }
            : {}),
        }
      : {}),
  };
  return { ok: true, id };
}

/** True once a contract's term has run out. Anything else is never expired. */
export const isExpired = (state: GameState, m: Machine): boolean =>
  m.termEndsAt !== undefined && state.elapsed >= m.termEndsAt;

/**
 * Re-sign an expired contract for another full term.
 *
 * The customer has not gone anywhere and neither has your wiring — this is a
 * renewal, not a new deal, so the node keeps its position, its links and its
 * buffers and simply starts its clock again. Strikes are forgiven with it:
 * a renegotiated contract does not carry last term's complaints.
 */
export function renewContract(state: GameState, machineId: string): Outcome {
  const m = state.machines[machineId];
  if (!m) return fail('That node is gone');
  const b = BUILDING_BY_ID[m.buildingId];
  if (!b || b.kind !== 'contract') return fail('Only a contract can be re-signed');
  const term = contractTermSeconds(m.buildingId);
  if (term <= 0) return fail(`${b.name} has no term to renew`);
  if (!isExpired(state, m)) return fail(`${b.name} is still running`);

  const price = renewalCost(m.buildingId, state.priceIndex);
  if (state.credits < price) return fail(`Re-signing ${b.name} costs ${Math.round(price)}`);

  state.credits -= price;
  m.termEndsAt = state.elapsed + term;
  m.signedAt = state.elapsed;
  m.servedFor = 0;
  m.strikes = 0;
  m.renewals = (m.renewals ?? 0) + 1;
  return { ok: true };
}

/**
 * Place a contract node against a lead on the board, consuming the offer.
 *
 * Contract chassis have no other route onto the canvas: the build bar shows the
 * board instead of the buildings. The offer is only spent once the node is
 * actually placed, so a failed placement leaves the customer waiting.
 */
export function signOffer(
  state: GameState,
  offerId: string,
  x: number,
  y: number,
): Outcome & { id?: string } {
  const offer = state.offers[offerId];
  if (!offer) return fail('That offer is no longer on the board');
  if (state.elapsed >= offer.expiresAt) {
    takeOffer(state, offerId);
    return fail(`${building(offer.buildingId)?.name ?? 'That customer'} has walked away`);
  }
  const result = placeMachine(state, offer.buildingId, x, y);
  if (result.ok) takeOffer(state, offerId);
  return result;
}

/** If exactly one unlocked recipe fits the chassis, pre-select it. */
function defaultRecipeFor(state: GameState, buildingId: string): string | null {
  const options = state.unlockedRecipes
    .map((id) => RECIPE_BY_ID[id])
    .filter((r) => r && r.buildingId === buildingId);
  return options.length === 1 ? options[0].id : null;
}

/**
 * Which provider a newly placed rate-limit node should buy for.
 *
 * The provider you are most short on, so placing a tier while throttled does
 * the obviously-intended thing. Falls back to whichever vendor you already have
 * model nodes for, then to nothing — an unconfigured tier supplies no one.
 */
function defaultVendorFor(state: GameState): string | null {
  const tight = state.compute.tight.filter((p) => p !== 'shared');
  if (tight.length) return tight[0];

  const counts: Record<string, number> = {};
  for (const m of Object.values(state.machines)) {
    const v = BUILDING_BY_ID[m.buildingId]?.vendor;
    if (v) counts[v] = (counts[v] ?? 0) + 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return ranked.length ? ranked[0][0] : null;
}

/** Point a rate-limit node at a different provider. */
export function setVendor(state: GameState, id: string, vendor: string | null): Outcome {
  const m = state.machines[id];
  if (!m) return fail('Node not found');
  const b = building(m.buildingId);
  if (!b?.vendorScoped) return fail('That node is not tied to a provider');
  if (vendor !== null && !ALL_VENDORS.includes(vendor as never)) return fail('Unknown provider');
  m.vendor = vendor;
  return OK;
}

/**
 * Strip a node for parts.
 *
 * The refund is at TODAY's price, not what you paid. Used 3090s genuinely
 * appreciated between 2024 and 2026, so a player who bought hardware early is
 * rewarded for it — and a player tempted to cash out late discovers that
 * selling the rig fails every on-site audit it was counting toward.
 */
/** Keys 1-9 then 0, in the order they appear on a keyboard. */
export const HOTBAR_SLOTS = 10;
export const HOTBAR_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

/**
 * Put a building on a quick-build slot, or clear it with null.
 * A building may only occupy one slot, so assigning it again moves it rather
 * than leaving a stale duplicate behind.
 */
export function setHotkey(state: GameState, slot: number, buildingId: string | null): Outcome {
  if (slot < 0 || slot >= HOTBAR_SLOTS) return fail('No such slot');
  if (buildingId !== null && !BUILDING_BY_ID[buildingId]) return fail('No such building');
  if (buildingId !== null) {
    const existing = state.hotbar.indexOf(buildingId);
    if (existing >= 0) state.hotbar[existing] = null;
  }
  state.hotbar[slot] = buildingId;
  return OK;
}

/** Assign to the first free slot; returns the slot used, or -1 if the bar is full. */
export function assignFirstFreeHotkey(state: GameState, buildingId: string): number {
  const already = state.hotbar.indexOf(buildingId);
  if (already >= 0) return already;
  const free = state.hotbar.indexOf(null);
  if (free < 0) return -1;
  setHotkey(state, free, buildingId);
  return free;
}

export function removeMachine(state: GameState, id: string): Outcome {
  const m = state.machines[id];
  if (!m) return fail('Machine not found');
  state.credits += Math.floor(currentCost(state, m.buildingId) * BALANCE.refundRate);
  for (const link of Object.values(state.links)) {
    if (link.fromId === id || link.toId === id) delete state.links[link.id];
  }
  delete state.machines[id];
  delete state.status[id];
  return OK;
}

export function moveMachine(state: GameState, id: string, x: number, y: number): void {
  const m = state.machines[id];
  if (m) {
    m.x = x;
    m.y = y;
  }
}

export function setRecipe(state: GameState, id: string, recipeId: string | null): Outcome {
  const m = state.machines[id];
  if (!m) return fail('Machine not found');
  if (recipeId) {
    const r = RECIPE_BY_ID[recipeId];
    if (!r) return fail('Unknown recipe');
    if (r.buildingId !== m.buildingId) return fail('That recipe needs a different building');
    if (!state.unlockedRecipes.includes(recipeId)) return fail('Recipe not unlocked');
  }
  m.recipeId = recipeId;
  // A part-finished craft of the old recipe is abandoned; its held inputs are
  // returned to the input buffer's books by simply clearing progress.
  m.crafting = false;
  m.progress = 0;
  // Drop links whose item no longer has a matching port.
  for (const link of Object.values(state.links)) {
    if (link.fromId === id && !outputPorts(m).includes(link.itemId)) delete state.links[link.id];
    if (link.toId === id && !acceptsItem(m, link.itemId)) delete state.links[link.id];
  }
  return OK;
}

// --- Agentic Ops ---------------------------------------------------------

/**
 * Point an agent at a segment of the market: everything, one track, or one
 * named contract tier. A `tier:` focus is what turns a generalist into a
 * specialist — including the part where a specialist with a dry tier sits
 * there billing its subscription.
 */
/**
 * Pick how a node rejects its heat (ESG addon).
 *
 * Chosen after placement, the same way a vendor-scoped capacity node picks its
 * provider: the chassis is the same box either way, and what you do with the
 * heat is an operating decision rather than a purchase.
 */
export function setCooling(state: GameState, id: string, cooling: CoolingMode): Outcome {
  const m = state.machines[id];
  if (!m) return fail('No such node');
  if (!hasPower(m.buildingId)) return fail('That node has nothing to cool');
  if (!coolingOptions(state).includes(cooling)) {
    return fail(
      cooling === 'closed_loop'
        ? 'Build a Closed-Loop Retrofit first'
        : 'That cooling design is not available yet',
    );
  }
  m.cooling = cooling;
  return OK;
}

export function setFocus(state: GameState, id: string, focus: FocusTarget): Outcome {
  const m = state.machines[id];
  if (!m) return fail('Node not found');
  if (building(m.buildingId)?.kind !== 'agent') return fail('That node has nothing to focus');
  if (focus.startsWith('tier:') && !LISTING_BY_BUILDING[focus.slice(5)]) {
    return fail('No such contract tier');
  }
  m.focus = focus;
  return OK;
}

/**
 * The rarity floor under a group focus. Meaningless against a named tier —
 * picking Federal Program already implies its rarity — so the UI disables it
 * there rather than offering a contradiction.
 */
export function setRarityFloor(state: GameState, id: string, floor: Rarity | null): Outcome {
  const m = state.machines[id];
  if (!m) return fail('Node not found');
  if (building(m.buildingId)?.kind !== 'agent') return fail('That node has nothing to focus');
  if (floor === null) delete m.rarityFloor;
  else m.rarityFloor = floor;
  return OK;
}

export function setClock(state: GameState, id: string, clock: number): void {
  const m = state.machines[id];
  if (m) m.clock = Math.min(BALANCE.maxClock, Math.max(BALANCE.minClock, clock));
}

export function setEnabled(state: GameState, id: string, enabled: boolean): void {
  const m = state.machines[id];
  if (m) m.enabled = enabled;
}

// --- Home Lab ------------------------------------------------------------

/**
 * Pay to bring a blown rig back, priced at today's replacement cost.
 *
 * The whole group is repaired at once. It failed as one unit — making the
 * player click through six collateral nodes individually would be busywork,
 * not a decision.
 */
export function repairMachine(state: GameState, id: string): Outcome {
  const m = state.machines[id];
  if (!m) return fail('Node not found');
  if (!m.broken) return fail('That node is not broken');
  if (m.repairing) return fail('Already being repaired');
  const price = repairCost(state, id);
  if (state.credits < price) return fail(`Repair costs ${price} — you cannot cover it`);
  state.credits -= price;
  for (const other of groupOf(state, id).map((gid) => state.machines[gid])) {
    if (other?.broken) other.repairing = BALANCE.repairSeconds;
  }
  return OK;
}

/** What repairing this rig costs right now. Drives the button label. */
export const repairCost = (state: GameState, id: string): number =>
  groupOf(state, id)
    .map((gid) => state.machines[gid])
    .filter((m) => m?.broken)
    .reduce(
      (sum, m) =>
        sum + Math.round(currentCost(state, m.buildingId) * BALANCE.repairCostFraction),
      0,
    );

/**
 * Wire a set of nodes together so they fail together.
 *
 * Grouping is what turns a power supply into a decision: a blowout in the bay
 * takes every model node pinned to it down at the same moment.
 */
export function groupMachines(state: GameState, ids: string[]): Outcome {
  const members = ids.map((id) => state.machines[id]).filter(Boolean);
  if (members.length < 2) return fail('Select at least two nodes to group');
  const groupId = members.find((m) => m.groupId)?.groupId ?? nextId('g');
  for (const m of members) m.groupId = groupId;
  return OK;
}

export function ungroup(state: GameState, groupId: string): void {
  for (const m of Object.values(state.machines)) {
    if (m.groupId === groupId) m.groupId = null;
  }
}

/** Every node sharing a group with this one, including itself. */
export function groupOf(state: GameState, id: string): string[] {
  const m = state.machines[id];
  if (!m?.groupId) return m ? [m.id] : [];
  return Object.values(state.machines)
    .filter((o) => o.groupId === m.groupId)
    .map((o) => o.id);
}

// --- AI Slop --------------------------------------------------------------

/**
 * Press Generate on a manual node.
 *
 * A manual recipe crafts exactly once per press and there is no way to automate
 * it. That is the whole argument for building the pipeline instead.
 */
export function triggerCraft(state: GameState, id: string): Outcome {
  const m = state.machines[id];
  if (!m) return fail('Node not found');
  if (m.broken) return fail('That node is blown');
  if (!m.enabled) return fail('That node is switched off');
  const r = recipe(m.recipeId);
  if (!r) return fail('No recipe assigned');
  if (!r.manual) return fail('That node runs on its own');
  if (m.crafting) return fail('Already running');
  m.armed = true;
  return OK;
}

export function canLink(
  state: GameState,
  fromId: string,
  itemId: string,
  toId: string,
): Outcome {
  if (fromId === toId) return fail('A machine cannot feed itself');
  const from = state.machines[fromId];
  const to = state.machines[toId];
  if (!from || !to) return fail('Machine not found');
  if (!outputPorts(from).includes(itemId)) return fail('Source does not produce that');
  if (!acceptsItem(to, itemId)) return fail('Target does not accept that');
  const duplicate = Object.values(state.links).some(
    (l) => l.fromId === fromId && l.toId === toId && l.itemId === itemId,
  );
  if (duplicate) return fail('That link already exists');
  return OK;
}

export function addLink(
  state: GameState,
  fromId: string,
  itemId: string,
  toId: string,
): Outcome {
  const check = canLink(state, fromId, itemId, toId);
  if (!check.ok) return check;
  const link: Link = { id: nextId('l'), fromId, toId, itemId };
  state.links[link.id] = link;
  return OK;
}

/** Change how one belt is drawn. Cosmetic; nothing in the sim reads it. */
export function setLinkShape(state: GameState, id: string, shape: LinkShape): void {
  const link = state.links[id];
  if (link) link.shape = shape;
}

export function removeLink(state: GameState, id: string): void {
  delete state.links[id];
}

// --- clipboard ------------------------------------------------------------

/**
 * A copied node, stored by shape rather than by id: which chassis it is, how it
 * was configured, and where it sat relative to the top-left of the copied block.
 *
 * Nothing runtime comes along. A paste is a fresh purchase at today's price, not
 * a clone of a warm machine — buffers, progress, strikes and damage stay behind.
 */
export interface ClipboardNode {
  buildingId: string;
  recipeId: string | null;
  clock: number;
  enabled: boolean;
  vendor?: string | null;
  /** Offset from the top-left of the copied block. */
  dx: number;
  dy: number;
  /** The source group id, used only to re-form the same groups on paste. */
  groupKey: string | null;
}

/** A belt between two copied nodes, by their index in `Clipboard.nodes`. */
export interface ClipboardLink {
  from: number;
  to: number;
  itemId: string;
}

export interface Clipboard {
  nodes: ClipboardNode[];
  links: ClipboardLink[];
}

/**
 * Snapshot a set of nodes and the belts strictly between them.
 *
 * Contract nodes are dropped. A customer is a lead you signed off the board and
 * there is exactly one of them; letting Ctrl+C mint a second would turn the
 * whole market into a copy button.
 */
export function copyMachines(
  state: GameState,
  ids: string[],
): { clipboard: Clipboard | null; skippedContracts: number } {
  const picked = ids.map((id) => state.machines[id]).filter(Boolean);
  const nodes = picked.filter((m) => building(m.buildingId)?.kind !== 'contract');
  const skippedContracts = picked.length - nodes.length;
  if (!nodes.length) return { clipboard: null, skippedContracts };

  const originX = Math.min(...nodes.map((m) => m.x));
  const originY = Math.min(...nodes.map((m) => m.y));
  const index = new Map(nodes.map((m, i) => [m.id, i]));

  const links: ClipboardLink[] = [];
  for (const l of Object.values(state.links)) {
    const from = index.get(l.fromId);
    const to = index.get(l.toId);
    if (from === undefined || to === undefined) continue;
    links.push({ from, to, itemId: l.itemId });
  }

  return {
    clipboard: {
      nodes: nodes.map((m) => ({
        buildingId: m.buildingId,
        recipeId: m.recipeId,
        clock: m.clock,
        enabled: m.enabled,
        vendor: m.vendor ?? null,
        dx: m.x - originX,
        dy: m.y - originY,
        groupKey: m.groupId ?? null,
      })),
      links,
    },
    skippedContracts,
  };
}

/**
 * Paste the clipboard with its top-left corner at (x, y).
 *
 * All-or-nothing: the whole block is priced and validated before a single node
 * is placed, so a paste can never leave half a pipeline on the canvas and an
 * empty balance. Belts internal to the copied block come back; belts that
 * crossed its boundary do not.
 */
export function pasteClipboard(
  state: GameState,
  clip: Clipboard,
  x: number,
  y: number,
): Outcome & { ids?: string[] } {
  if (!clip.nodes.length) return fail('Nothing to paste');

  let total = 0;
  // Capped chassis are counted across the clipboard as well as the canvas:
  // pasting two free tiers onto an empty board has to fail as a whole, not
  // place the first and strand the second.
  const wouldAdd = new Map<string, number>();
  for (const n of clip.nodes) {
    const b = BUILDING_BY_ID[n.buildingId];
    if (!b) return fail('That chassis no longer exists');
    if (!state.unlockedBuildings.includes(n.buildingId)) return fail(`${b.name} is not unlocked yet`);
    if (isWithdrawn(b, state.priceIndex)) return fail(`${b.name} is no longer sold`);
    if (permitBlocked(state, n.buildingId)) continue;
    if (!buildingEnabled(n.buildingId, state.addons)) {
      return fail(`${b.name} is switched off in settings`);
    }
    if (b.maxCount !== undefined) {
      const pending = (wouldAdd.get(n.buildingId) ?? 0) + 1;
      wouldAdd.set(n.buildingId, pending);
      if (countOf(state, n.buildingId) + pending > b.maxCount) {
        return fail(
          b.maxCount === 1
            ? `You only get one ${b.name}`
            : `You may only have ${b.maxCount} of the ${b.name}`,
        );
      }
    }
    total += buildingCostAt(b, state.priceIndex);
  }
  if (state.credits < total) {
    return fail(
      `Need ${total} credits to paste ${clip.nodes.length} node${clip.nodes.length === 1 ? '' : 's'}`,
    );
  }

  const ids: string[] = [];
  for (const n of clip.nodes) {
    const placed = placeMachine(state, n.buildingId, Math.round(x + n.dx), Math.round(y + n.dy));
    if (!placed.ok || !placed.id) return placed.ok ? fail('Paste failed') : placed;
    const m = state.machines[placed.id];
    const r = n.recipeId ? RECIPE_BY_ID[n.recipeId] : null;
    if (r && r.buildingId === n.buildingId && state.unlockedRecipes.includes(r.id)) {
      m.recipeId = r.id;
    }
    m.clock = n.clock;
    m.enabled = n.enabled;
    if (BUILDING_BY_ID[n.buildingId]?.vendorScoped) m.vendor = n.vendor ?? null;
    ids.push(placed.id);
  }

  // Groups are membership, not identity: same partners, fresh group id.
  const byKey = new Map<string, string[]>();
  clip.nodes.forEach((n, i) => {
    if (!n.groupKey) return;
    const list = byKey.get(n.groupKey);
    if (list) list.push(ids[i]);
    else byKey.set(n.groupKey, [ids[i]]);
  });
  for (const members of byKey.values()) {
    if (members.length > 1) groupMachines(state, members);
  }

  for (const l of clip.links) {
    const from = ids[l.from];
    const to = ids[l.to];
    if (from && to) addLink(state, from, l.itemId, to);
  }

  return { ok: true, ids };
}

/** Strip several nodes at once. Returns the total refunded, for the toast. */
export function removeMachines(state: GameState, ids: string[]): { removed: number; refund: number } {
  let removed = 0;
  let refund = 0;
  for (const id of ids) {
    const m = state.machines[id];
    if (!m) continue;
    refund += Math.floor(currentCost(state, m.buildingId) * BALANCE.refundRate);
    if (removeMachine(state, id).ok) removed += 1;
  }
  return { removed, refund };
}
