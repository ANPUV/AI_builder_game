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
  /** Share of revenuePerMin this round would cost, permanently, while net income is positive. */
  sharePct: number;
}

/**
 * The raise offer for a completed milestone, or null when none should be
 * shown: the addon is off, this milestone pays no reward (the one deliberate
 * $0 Slop milestone), it was already decided one way or the other, or the
 * cap table has nothing left to sell (BALANCE.vcMaxTotalSharePct reached).
 */
export function raiseOfferFor(state: GameState, milestoneId: string): RaiseOffer | null {
  if (!featureEnabled('ventureCapital', state.addons)) return null;
  const milestone = MILESTONE_BY_ID[milestoneId];
  if (!milestone || milestone.reward <= 0) return null;
  if (state.vc.declined.includes(milestoneId)) return null;
  if (state.vc.raises.some((r) => r.milestoneId === milestoneId)) return null;

  const remaining = BALANCE.vcMaxTotalSharePct - state.vc.totalSharePct;
  if (remaining <= 0) return null;

  const capital = milestone.reward * BALANCE.vcCapitalMultiplier;
  // Later rounds cost more capital for less new share — the cap table is
  // running out — and no round ever pushes the total past the ceiling.
  const sharePct = Math.min(BALANCE.vcBaseSharePct * (1 - state.vc.totalSharePct), remaining);
  if (sharePct <= 0) return null;
  return { milestoneId, capital, sharePct };
}

/** Take the offer: capital now, `sharePct` given up permanently. */
export function acceptRaise(state: GameState, milestoneId: string): Outcome {
  const offer = raiseOfferFor(state, milestoneId);
  if (!offer) return fail('That offer is no longer available');
  state.credits += offer.capital;
  state.vc.raises.push(offer);
  state.vc.totalSharePct += offer.sharePct;
  return OK;
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

  state.credits += amount;
  state.loans.push({
    id: nextId('loan'),
    principal: amount,
    ratePerMonth: BALANCE.bankLoanRatePerMonth,
    monthsRemaining: BALANCE.bankLoanTermMonths,
  });
  return OK;
}

/**
 * Called once per tick, after `state.finance` is smoothed for this tick.
 *
 * The revenue share is a straight port of the burn-charge idiom already in
 * `simulate.ts` — a continuous, dt-scaled deduction — gated on net income:
 * investors collect nothing while the company is running at a loss.
 *
 * Loan repayment amortizes straight-line against time remaining, recomputed
 * every tick from the current principal and the current time left. That
 * makes it self-correcting under a variable dt or a speed change: whatever
 * the schedule drifts to, it always finishes paying off exactly at term end.
 */
export function tickVenture(state: GameState, dt: number): void {
  if (state.vc.totalSharePct > 0 && state.finance.netPerMin > 0) {
    state.credits -= state.finance.revenuePerMin * state.vc.totalSharePct * (dt / 60);
  }

  if (state.loans.length === 0) return;
  for (const loan of state.loans) {
    const secondsLeft = Math.max(loan.monthsRemaining * BALANCE.monthSeconds, dt);
    const interest = loan.principal * loan.ratePerMonth * (dt / BALANCE.monthSeconds);
    const principalDue = loan.principal * (dt / secondsLeft);
    state.credits -= interest + principalDue;
    loan.principal = Math.max(0, loan.principal - principalDue);
    loan.monthsRemaining = Math.max(0, loan.monthsRemaining - dt / BALANCE.monthSeconds);
  }
  state.loans = state.loans.filter((l) => l.principal > 0.01);
}
