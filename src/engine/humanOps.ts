/**
 * Human Ops.
 *
 * The Support Agent can re-sign a lapsed contract the tick its term ends, but
 * it arrives in Act II, needs a console, a headcount slot and a supply of agent
 * runs, and bills $1,400 a month. Before any of that exists a player watching
 * their first Consumer App freeze at five minutes has exactly one option, which
 * is to click the button themselves.
 *
 * This is the other option, and the older one: a desk with people at it. It
 * takes ninety seconds a renewal and does one at a time, where the agent does
 * every eligible account at once and instantly — that gap IS the automation
 * argument, and it should be felt rather than explained.
 *
 * Deliberately gated on NOTHING. No addon, no console, no drift. The base game
 * has a contract-term mechanic, so the base game needs an answer to it.
 *
 * The ESG connection is not decoration: the desk carries `laborLoad`, so it is
 * the first thing most players own that shows up on the Social pillar, and a
 * labour dispute freezes it — `simulate` stops any node with a labour load
 * while `disputeFreeze` runs. Your renewals stall and your agents do not, which
 * is a thing that happens.
 */
import { BUILDING_BY_ID, renewalCost } from '../data';
import { isExpired, renewContract } from './factory';
import type { GameState, Machine } from './types';

export interface HumanOpsEvents {
  /** Contracts a Human Ops Desk re-signed, and what each cost. */
  opsRenewed: { buildingName: string; cost: number }[];
}

/** True for a desk whose whole job is winning lapsed customers back. */
export const isRenewalDesk = (m: Machine): boolean =>
  BUILDING_BY_ID[m.buildingId]?.opsRole === 'renewals';

/**
 * The lapsed contract that has been sitting frozen the longest.
 *
 * Oldest-first rather than cheapest-first on purpose: a desk that quietly
 * prioritised the contracts it could afford would leave the expensive account
 * you actually care about frozen forever, and never say so.
 */
function longestFrozen(state: GameState): Machine | undefined {
  let best: Machine | undefined;
  for (const m of Object.values(state.machines)) {
    if (BUILDING_BY_ID[m.buildingId]?.kind !== 'contract') continue;
    if (!isExpired(state, m)) continue;
    if (!best || (m.termEndsAt ?? 0) < (best.termEndsAt ?? 0)) best = m;
  }
  return best;
}

/**
 * One completed work cycle. Called from the craft loop when a renewals desk
 * finishes, so the node's own progress bar is the ninety seconds — there is no
 * second clock to keep in sync.
 *
 * Does nothing if there is nothing lapsed, or if paying the fee would take the
 * account below zero. A desk with no work still bills; that is what a salary is.
 */
export function onOpsCraft(state: GameState, events: HumanOpsEvents): void {
  const target = longestFrozen(state);
  if (!target) return;

  const cost = renewalCost(target.buildingId, state.priceIndex);
  if (state.credits < cost) return;

  if (renewContract(state, target.id).ok) {
    events.opsRenewed.push({
      buildingName: BUILDING_BY_ID[target.buildingId]?.name ?? 'A customer',
      cost,
    });
  }
}
