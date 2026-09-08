/**
 * THE CONTRACT BOARD ------------------------------------------------------
 * Contract chassis are not stocked in the build bar. They arrive as leads on a
 * board, each with a window, and signing one is what puts it on the canvas.
 *
 * Everything here mutates `state` in place, like the rest of the engine.
 */
import {
  BUILDING_BY_ID,
  MARKET,
  MARKET_LISTINGS,
  listingFor,
  type MarketListing,
} from '../data';
import { buildingEnabled } from '../data/addons';
import { nextId } from './ids';
import type { ContractOffer, GameState } from './types';

/** How many offers may sit on the board at once, given what is unlocked. */
export function boardSlots(state: GameState): number {
  const types = unlockedListings(state).length;
  return Math.min(MARKET.maxSlots, MARKET.baseSlots + types);
}

/**
 * The listings that can currently be drawn — chassis the player has unlocked
 * and whose addon is switched on.
 *
 * The addon half matters for one node: the entry-level Slop contract is
 * unlocked on the main spine (its own track's first milestone would be
 * circular otherwise), so without this check it keeps ringing for a player who
 * turned Slop off.
 */
export function unlockedListings(state: GameState): MarketListing[] {
  return MARKET_LISTINGS.filter(
    (l) =>
      state.unlockedBuildings.includes(l.buildingId) &&
      buildingEnabled(l.buildingId, state.addons),
  );
}

/** Offers on the board, rarest and best-paying first. */
export function openOffers(state: GameState): ContractOffer[] {
  return Object.values(state.offers).sort((a, b) => {
    const wa = listingFor(a.buildingId)?.weight ?? 0;
    const wb = listingFor(b.buildingId)?.weight ?? 0;
    if (wa !== wb) return wa - wb; // lower weight = rarer = shown first
    return a.expiresAt - b.expiresAt;
  });
}

/** Seconds before this customer walks. Clamped at zero. */
export const timeLeft = (state: GameState, offer: ContractOffer): number =>
  Math.max(0, offer.expiresAt - state.elapsed);

/** 0..1 of the window still remaining, for the countdown bar. */
export function windowRemaining(state: GameState, offer: ContractOffer): number {
  const span = offer.expiresAt - offer.offeredAt;
  return span <= 0 ? 0 : Math.max(0, Math.min(1, timeLeft(state, offer) / span));
}

/** Any lead the player has not looked at yet. Drives the red dot. */
export const hasUnseenOffers = (state: GameState): boolean =>
  Object.values(state.offers).some((o) => !o.seen);

/** Called when the board is opened: the dot has done its job. */
export function markOffersSeen(state: GameState): void {
  for (const o of Object.values(state.offers)) o.seen = true;
}

/**
 * Draw weight including the pity multiplier. A listing that has not come up in
 * a while gets progressively likelier, which is what keeps the top of the
 * ladder reachable — at raw weights the $8M platform lead is a 0.9% draw.
 */
function effectiveWeight(
  state: GameState,
  l: MarketListing,
  boosts?: Record<string, number>,
): number {
  const since = state.elapsed - (state.lastOffered[l.buildingId] ?? 0);
  const pity = Math.min(MARKET.maxPity, 1 + since / MARKET.pitySeconds);
  // Marketing agents (Agentic Ops addon) push on the same lever pity does, so
  // the two are capped together — neither system was tuned against the other
  // multiplying it without limit.
  const boost = Math.min(MARKET.maxPity, boosts?.[l.buildingId] ?? 1);
  return l.weight * pity * boost;
}

function countOn(state: GameState, buildingId: string): number {
  return Object.values(state.offers).filter((o) => o.buildingId === buildingId).length;
}

const pick = <T,>(rows: T[]): T => rows[Math.floor(Math.random() * rows.length)];

/**
 * Put one lead on the board.
 *
 * `listing` forces a specific customer — used the moment a milestone unlocks a
 * new contract tier, so the unlock is immediately actionable instead of being
 * a name in a dialog the player waits minutes to see. A forced draw ignores
 * the slot cap; a random one respects it.
 */
export function spawnOffer(
  state: GameState,
  listing?: MarketListing,
  boosts?: Record<string, number>,
): ContractOffer | null {
  let chosen = listing;

  if (!chosen) {
    if (Object.keys(state.offers).length >= boardSlots(state)) return null;
    const pool = unlockedListings(state).filter(
      (l) => countOn(state, l.buildingId) < MARKET.maxPerListing,
    );
    if (!pool.length) return null;

    const total = pool.reduce((sum, l) => sum + effectiveWeight(state, l, boosts), 0);
    let roll = Math.random() * total;
    chosen = pool[pool.length - 1];
    for (const l of pool) {
      roll -= effectiveWeight(state, l, boosts);
      if (roll <= 0) {
        chosen = l;
        break;
      }
    }
  }

  if (!BUILDING_BY_ID[chosen.buildingId]) return null;

  const offer: ContractOffer = {
    id: nextId('o'),
    buildingId: chosen.buildingId,
    lead: pick(chosen.leads),
    offeredAt: state.elapsed,
    expiresAt: state.elapsed + chosen.ttl * MARKET.ttlMultiplier,
    seen: false,
  };
  state.offers[offer.id] = offer;
  state.lastOffered[chosen.buildingId] = state.elapsed;
  return offer;
}

/** Remove an offer from the board and hand it back. Null if it is already gone. */
export function takeOffer(state: GameState, offerId: string): ContractOffer | null {
  const offer = state.offers[offerId];
  if (!offer) return null;
  delete state.offers[offerId];
  return offer;
}

/** The opening board on a brand-new save, so the first minute has something in it. */
export function seedMarket(state: GameState): void {
  for (let n = 0; n < MARKET.openingOffers; n += 1) spawnOffer(state);
  // Seeded leads are not "new" — the player has not missed anything yet.
  markOffersSeen(state);
}

/**
 * The steady arrival rate — what the board settles at, and the figure the UI
 * quotes. One source of truth, so the number the player reads is the number the
 * simulation rolls against.
 */
export function steadyLeadRate(state: GameState): number {
  const types = unlockedListings(state).length;
  if (types === 0) return 0;
  return Math.max(MARKET.leadsPerMinuteFloor, MARKET.leadsPerMinutePerType * types);
}

/** What the tick actually rolls against: faster while the board is dry. */
export function leadRate(state: GameState): number {
  const steady = steadyLeadRate(state);
  if (steady <= 0) return 0;
  return Object.keys(state.offers).length === 0
    ? Math.max(steady, MARKET.dryBoardLeadsPerMinute)
    : steady;
}

export interface MarketEvents {
  offersArrived: ContractOffer[];
  offersExpired: ContractOffer[];
}

/**
 * One tick of the board: retire anything past its window, then roll for a new
 * lead. The arrival rate scales with how many contract tiers you have unlocked
 * — a wider pipeline rings more often.
 */
export function tickMarket(
  state: GameState,
  dt: number,
  events: MarketEvents,
  boosts?: Record<string, number>,
): void {
  for (const offer of Object.values(state.offers)) {
    if (state.elapsed >= offer.expiresAt) {
      delete state.offers[offer.id];
      events.offersExpired.push(offer);
    }
  }

  const perMinute = leadRate(state);
  if (perMinute <= 0) return;
  if (Math.random() < (perMinute / 60) * dt) {
    const offer = spawnOffer(state, undefined, boosts);
    if (offer) events.offersArrived.push(offer);
  }
}
