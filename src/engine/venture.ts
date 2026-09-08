/**
 * Venture Capital addon.
 *
 * Two mechanisms, two different shapes of risk (see docs/VC-ADDON-PLAN.md §0):
 *
 * - A **raise** never has to be repaid, but it's permanent — a fixed slice of
 *   revenue, forever, taken on at whatever the cap table happened to cost at
 *   the time.
 * - A **loan** comes back to zero, but interest accrues on a clock that does
 *   not pause for a bad quarter the way the revenue share does.
 *
 * Both are gated on the `ventureCapital` feature addon and touch `state.credits`
 * directly, the same way the rest of the engine does — no separate ledger.
 */
import { BALANCE, MILESTONE_BY_ID } from '../data';
import { featureEnabled } from '../data/addons';
import type { GameState } from './types';
import { nextId } from './ids';

export type Outcome = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): Outcome => ({ ok: false, reason });
const OK: Outcome = { ok: true };

export interface RaiseOffer {
  milestoneId: string;
  capital: number;
  /** Share of revenuePerMin this round costs until it has repaid `owed`. */
  sharePct: number;
  /** Total this round will ever take — capital times the repayment cap in force. */
  owed: number;
  /** Terms were set while the company was weak. Display only; already priced into the two fields above. */
  downRound: boolean;
}

/** Share of revenue currently committed: rounds still repaying, retired ones excluded. */
export function activeSharePct(state: GameState): number {
  let total = 0;
  for (const r of state.vc.raises) if (r.paid < r.owed) total += r.sharePct;
  return total;
}

/**
 * Is the company raising from a position of weakness right now?
 *
 * Losing money on real revenue, or carrying the Exposure that already costs
 * contracts. Real 2026 term sheets are 1x non-participating almost
 * universally — except in down rounds and bridges, which is exactly when the
 * harsher terms appear.
 *
 * A company with no revenue at all is NOT weak, it is new: the very first
 * round would otherwise always price as a down round, which is both wrong and
 * a nasty surprise on milestone one.
 */
export function isDownRound(state: GameState): boolean {
  const losing = state.finance.revenuePerMin > 0 && state.finance.operatingPerMin <= 0;
  return losing || state.exposure >= BALANCE.vcDownRoundExposure;
}

/**
 * The raise offer for a completed milestone, or null when none should be
 * shown: the addon is off, this milestone pays no reward (the one deliberate
 * $0 Slop milestone), it was already decided one way or the other, or the
 * cap table has nothing left to sell (BALANCE.vcMaxTotalSharePct reached).
 *
 * Terms depend on the company's health at the moment they are drawn, so the
 * caller snapshots the returned offer and hands that same object back to
 * `acceptRaise` — a term sheet does not reprice itself while it is on the table.
 */
export function raiseOfferFor(state: GameState, milestoneId: string): RaiseOffer | null {
  if (!featureEnabled('ventureCapital', state.addons)) return null;
  const milestone = MILESTONE_BY_ID[milestoneId];
  if (!milestone || milestone.reward <= 0) return null;
  if (state.vc.declined.includes(milestoneId)) return null;
  if (state.vc.raises.some((r) => r.milestoneId === milestoneId)) return null;

  const committed = activeSharePct(state);
  const remaining = BALANCE.vcMaxTotalSharePct - committed;
  if (remaining <= 0) return null;

  const downRound = isDownRound(state);
  const capital = milestone.reward * BALANCE.vcCapitalMultiplier;
  // Later rounds cost more capital for less new share — the cap table is
  // running out — and no round ever pushes the total past the ceiling.
  const asked =
    BALANCE.vcBaseSharePct *
    (1 - committed) *
    (downRound ? BALANCE.vcDownRoundShareMult : 1);
  const sharePct = Math.min(asked, remaining);
  if (sharePct <= 0) return null;

  const cap = downRound ? BALANCE.vcDownRoundRepaymentCap : BALANCE.vcRepaymentCap;
  return { milestoneId, capital, sharePct, owed: capital * cap, downRound };
}

/**
 * Sign the term sheet that was actually shown. Capital lands now; the round
 * then takes `sharePct` of revenue until it has handed back `owed`, and stops.
 *
 * Takes the offer rather than re-deriving it so the player gets the terms they
 * read. It is still re-validated against the rules that cannot be allowed to
 * drift: the addon being on, the milestone being undecided, and the ceiling.
 */
export function acceptRaise(state: GameState, offer: RaiseOffer): Outcome {
  if (!featureEnabled('ventureCapital', state.addons)) {
    return fail('Venture Capital is switched off in settings');
  }
  const { milestoneId } = offer;
  if (state.vc.declined.includes(milestoneId)) return fail('That offer was already declined');
  if (state.vc.raises.some((r) => r.milestoneId === milestoneId)) {
    return fail('That round has already closed');
  }
  if (activeSharePct(state) + offer.sharePct > BALANCE.vcMaxTotalSharePct + 1e-9) {
    return fail('Your investors have no room left on the cap table');
  }

  state.credits += offer.capital;
  state.vc.raises.push({
    milestoneId,
    capital: offer.capital,
    sharePct: offer.sharePct,
    owed: offer.owed,
    paid: 0,
    downRound: offer.downRound,
  });
  state.vc.totalSharePct = activeSharePct(state);
  return OK;
}

/** Size of a raise the player asks for directly, growing with progress the same way `loanCap` does. */
export function onDemandRaiseCapital(state: GameState): number {
  return (
    BALANCE.vcOnDemandCapitalBase *
    (1 + state.completedMilestones.length * BALANCE.vcOnDemandCapitalGrowthPerMilestone)
  );
}

/**
 * The term sheet on offer right now, for a raise the player asks for
 * directly from the Venture Capital tooltip rather than one tied to a
 * milestone landing. Same down-round and repayment-cap math as a milestone
 * raise — `acceptRaise` doesn't care which produced the offer, it just needs
 * a `milestoneId`-shaped key that can't collide with a real milestone, so
 * this mints one instead of reusing an id from `MILESTONES`.
 *
 * Null only when the cap table has nothing left to sell — there is no
 * "already decided" state for an on-demand raise the way there is for a
 * milestone's one-time offer, so closing this one without accepting has no
 * side effect and the player can just ask again later.
 */
export function onDemandRaiseOffer(state: GameState): RaiseOffer | null {
  if (!featureEnabled('ventureCapital', state.addons)) return null;

  const committed = activeSharePct(state);
  const remaining = BALANCE.vcMaxTotalSharePct - committed;
  if (remaining <= 0) return null;

  const downRound = isDownRound(state);
  const capital = onDemandRaiseCapital(state);
  const asked =
    BALANCE.vcBaseSharePct * (1 - committed) * (downRound ? BALANCE.vcDownRoundShareMult : 1);
  const sharePct = Math.min(asked, remaining);
  if (sharePct <= 0) return null;

  const cap = downRound ? BALANCE.vcDownRoundRepaymentCap : BALANCE.vcRepaymentCap;
  return { milestoneId: nextId('ondemand'), capital, sharePct, owed: capital * cap, downRound };
}

/** Turn the offer down. Permanent — mirrors a milestone itself only firing once. */
export function declineRaise(state: GameState, milestoneId: string): void {
  if (!state.vc.declined.includes(milestoneId)) state.vc.declined.push(milestoneId);
}

/** The largest single draw the bank will make right now. Not a lifetime ceiling — multiple loans can be outstanding at once. */
export function loanCap(state: GameState): number {
  return (
    BALANCE.bankLoanCapBase *
    (1 + state.completedMilestones.length * BALANCE.bankLoanCapGrowthPerMilestone)
  );
}

/** Draw a new loan, at the rate in force right now — locked in for that loan's life. */
export function drawLoan(state: GameState, amount: number): Outcome {
  if (!featureEnabled('ventureCapital', state.addons)) {
    return fail('Venture Capital is switched off in settings');
  }
  if (!(amount > 0)) return fail('Enter an amount to borrow');
  const cap = loanCap(state);
  if (amount > cap) return fail(`The bank will not lend more than ${Math.round(cap)} right now`);

  // The origination fee comes out of the draw, so you borrow $100k and bank
  // $98.5k while owing the full $100k. Real venture debt charges 1-2% upfront.
  state.credits += amount * (1 - BALANCE.bankLoanOriginationPct);
  state.loans.push({
    id: nextId('loan'),
    principal: amount,
    ratePerMonth: BALANCE.bankLoanRatePerMonth,
    monthsRemaining: BALANCE.bankLoanTermMonths,
  });
  return OK;
}

/** What a draw of `amount` actually puts in the bank, after the origination fee. */
export const loanProceeds = (amount: number): number =>
  amount * (1 - BALANCE.bankLoanOriginationPct);

/**
 * Called once per tick, after `state.finance` is smoothed for this tick, and
 * unconditionally — it is what fills in `financingPerMin` and `netPerMin`,
 * which must read zero and "same as operating" when nothing is owed.
 *
 * The revenue share is a straight port of the burn-charge idiom already in
 * `simulate.ts` — a continuous, dt-scaled deduction — charged per round, and
 * only until that round has repaid its cap.
 *
 * A loss-making tick still pays investors nothing, but that is now a
 * DEFERRAL rather than forgiveness: `paid` does not move, so the round simply
 * takes longer to retire. That closes the old exploit (inflate burn, stay
 * unprofitable on paper, escape the obligation entirely) without taking away
 * the cash-flow relief, and it is how real revenue-based financing behaves —
 * a bad month stretches the term, it does not cancel the debt.
 *
 * Loan repayment amortizes straight-line against time remaining, recomputed
 * every tick from the current principal and the current time left. That
 * makes it self-correcting under a variable dt or a speed change: whatever
 * the schedule drifts to, it always finishes paying off exactly at term end.
 */
export function tickVenture(state: GameState, dt: number): void {
  let charged = 0;

  if (state.finance.operatingPerMin > 0) {
    for (const r of state.vc.raises) {
      const outstanding = r.owed - r.paid;
      if (outstanding <= 0) continue; // retired: this round is done, forever
      const due = Math.min(outstanding, state.finance.revenuePerMin * r.sharePct * (dt / 60));
      if (due <= 0) continue;
      r.paid += due;
      charged += due;
    }
  }
  // Retired rounds stay in the array for the record; they just stop counting.
  state.vc.totalSharePct = activeSharePct(state);

  for (const loan of state.loans) {
    const secondsLeft = Math.max(loan.monthsRemaining * BALANCE.monthSeconds, dt);
    const interest = loan.principal * loan.ratePerMonth * (dt / BALANCE.monthSeconds);
    const principalDue = loan.principal * (dt / secondsLeft);
    charged += interest + principalDue;
    loan.principal = Math.max(0, loan.principal - principalDue);
    loan.monthsRemaining = Math.max(0, loan.monthsRemaining - dt / BALANCE.monthSeconds);
  }
  state.loans = state.loans.filter((l) => l.principal > 0.01);

  state.credits -= charged;
  // Report what financing actually cost, so the top bar cannot show a profit
  // that never reaches the bank.
  state.finance.financingPerMin = dt > 0 ? charged / (dt / 60) : 0;
  state.finance.netPerMin = state.finance.operatingPerMin - state.finance.financingPerMin;
}
