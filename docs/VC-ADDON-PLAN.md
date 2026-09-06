# Venture Capital addon — plan

**Status:** plan only, nothing built yet. Written 6 Sep 2026.

Depends on a change that **has** shipped: `BALANCE.milestoneRewardMultiplier`
is now `0` ([src/data/balance.ts](../src/data/balance.ts)) — milestone
completion no longer hands the player free cash. `Milestone.reward` values
stay in the data (`docs/CONTENT-SPEC.md` progression is unaffected) because
this addon reuses them as the input to its own funding math. Without Venture
Capital enabled, tech-tree unlocks are simply unfunded now — the player earns
everything through contracts. This is a real balance shift (a headless
progression run dropped from $2.45M/267 nodes to $1.6k/13 nodes over the same
9 sim-minutes) and is the gap this addon exists to fill back in, differently.

## Decisions taken

| Decision | Choice |
| --- | --- |
| Scope | New addon, off by default — does not change the base game for players who leave it off |
| Fundraise trigger | Player choice, once per milestone unlock — accept or decline a single offered term |
| Payout shape | One lump sum of capital, against a permanent % of future revenue (not equity in any deeper sense than that) |
| Term sheet shape | A single take-it-or-leave-it offer per milestone, not a menu of sizes |
| Declined offers | Permanent — mirrors a milestone itself only firing once. No re-offer, no persistent "raise anytime" option |
| Which tracks trigger an offer | All three (main, Home Lab, AI Slop) — money is money regardless of which track earned the tech. The Slop milestone with a deliberate $0 reward is special-cased to offer no raise at all (see §3) |
| Negative net income | The revenue-share payment to investors is suppressed to $0 for any tick where net income ≤ 0 — investors don't collect while the company is upside down |
| Bank loan availability | Always available once the addon is on, independent of milestone timing or pending raise offers |
| Bank loan concurrency | Multiple loans allowed, each keeping the interest rate it was drawn at — `state.loan` is an array, not a single facility |
| Missed loan payment | Credits simply go negative, same as every other shortfall this game already allows (breach costs, fines) — no new penalty mechanic |
| Addon architecture | Requires generalizing the addon system — see §1 |

## 0. The lesson

The main game already teaches "rate limits are the constraint" and "compliance
costs money." Venture Capital teaches the thing every startup carrying outside
money learns: **capital isn't free, it's just a different bill, and it comes
due whether or not the company is doing well.**

Two mechanisms, two different failure modes:

- **Equity/revenue-share** (the fundraise) never has to be repaid — but it's
  permanent. A round taken at Milestone 3 is still taking its cut at
  Milestone 20. Overselling the cap table early to survive Act I means every
  dollar of Act III revenue arrives lighter.
- **Debt** (the bank loan) is temporary and comes back to zero — but interest
  accrues on a clock the player doesn't control, and unlike the revenue share
  it does **not** pause when the company is unprofitable. A loan taken to
  cover one bad stretch can compound into a worse one.

The two exist specifically to be different shapes of risk, so "take the VC
money" and "take the loan" are not the same decision with different numbers.

## 1. Addon architecture change (needed regardless of the numbers below)

Today's addon system (`src/data/addons.ts`) is exclusively **track-based**:
an addon *is* a milestone `Track` (`homelab`, `slop`) that can be switched off,
and `AddonSettings = Record<AddonTrack, boolean>` derives its whole membership
from which buildings/recipes a track's milestones unlock. Venture Capital
doesn't unlock buildings or recipes and doesn't gate a content branch — it's a
financial mechanic that reacts to **every** track's milestone completions
(main included) and touches `state.credits` directly. It does not fit the
current shape and the type needs widening, not reuse-by-analogy.

Proposed minimal generalization:

```ts
// addons.ts
export const ADDONS = [
  { id: 'homelab', kind: 'track', name: 'Home Lab', blurb: '...', defaultOn: true },
  { id: 'slop', kind: 'track', name: 'AI Slop', blurb: '...', defaultOn: true },
  { id: 'ventureCapital', kind: 'feature', name: 'Venture Capital', blurb: '...', defaultOn: false },
] as const;

export type AddonId = (typeof ADDONS)[number]['id'];
export type AddonTrack = Extract<(typeof ADDONS)[number], { kind: 'track' }>['id']; // unchanged: 'homelab' | 'slop'
export type AddonSettings = Record<AddonId, boolean>;

export const DEFAULT_ADDONS: AddonSettings = Object.fromEntries(
  ADDONS.map((a) => [a.id, a.defaultOn]),
) as AddonSettings;
```

- `trackEnabled` / `buildingEnabled` are unchanged — they only ever index
  `addons[track]` with a value from `AddonTrack`, which is still a subset of
  `AddonId`.
- **The "absent means on" comment on `AddonSettings` (`addons.ts:29`) stops
  being universally true.** It's the right default for the two existing track
  addons (an old save shouldn't suddenly lose Home Lab progress) and the wrong
  default for a brand-new financial mechanic (an old save shouldn't suddenly
  start owing investors money it never agreed to). `defaultOn` per entry
  should replace the blanket assumption, and every place that currently reads
  `addons[x] !== false` (treating absent as true) needs to become
  addon-aware — either read `DEFAULT_ADDONS[x]` as the fallback instead of a
  literal `false`, or backfill `state.addons` from `DEFAULT_ADDONS` once on
  load. **I didn't find where (or whether) a loaded save currently gets
  missing keys backfilled** — `save.ts` has no addon-merge logic I could find;
  worth confirming before this ships, since it's exactly the kind of gap that
  only bites existing players.
- `SettingsDialog.tsx` and `useGame.ts`'s `setAddon` both currently type on
  `AddonTrack`; both widen to `AddonId` with no behavior change for the
  existing two toggles.

## 2. Data model

```ts
// types.ts, on GameState
vc: {
  raises: { milestoneId: string; capital: number; sharePct: number }[];
  totalSharePct: number; // sum of raises[].sharePct, cached for the hot path
} | null; // null / absent when the addon has never been used this run

loans: {
  id: string;
  principal: number;       // remaining balance
  ratePerMonth: number;    // locked in at draw time, so a mid-game rate change doesn't retroactively reprice old debt
  monthsRemaining: number; // amortization term left
}[]; // multiple facilities allowed, each at the rate it was drawn at
```

`FinanceReport` (`types.ts:118`) gains a stored `netPerMin`, promoting the
calculation that currently only lives in `TopBar.tsx:44-47`
(`revenuePerMin - cogsPerMin - burnPerMin`) into the engine, alongside the
other two fields, in the same smoothing pass. Two consumers need it: the new
investor-payment gate below, and the existing UI (`TopBar`, `Coach`) can
switch to reading it instead of recomputing it, which removes a duplicated
formula.

## 3. Mechanic A — the fundraise offer

Hooks into the same event `useGame.ts:142-148` already produces
(`events.milestonesCompleted`), the same tick the (now $0) milestone-reward
popup fires. When `addons.ventureCapital` is on, a second modal —
`VentureCapitalOffer.tsx`, sibling to `UnlockPanel.tsx` — offers **one** term
sheet for that milestone:

```
capital  = milestone.reward * BALANCE.vcCapitalMultiplier         // reward, repurposed
sharePct = BALANCE.vcBaseSharePct * (1 - state.vc.totalSharePct)  // later rounds cost more capital for less new share — the cap table is running out
sharePct = min(sharePct, BALANCE.vcMaxTotalSharePct - state.vc.totalSharePct) // never exceed the cumulative cap
```

Suggested starting constants (all new, all in `balance.ts`, all tunable):

| Constant | Default | Reasoning |
| --- | --- | --- |
| `vcCapitalMultiplier` | 3 | The lump sum is meaningfully bigger than the old flat reward — that's the pitch — funded by giving something up |
| `vcBaseSharePct` | 0.08 (8%) | First round costs 8% of top-line revenue, forever |
| `vcMaxTotalSharePct` | 0.60 (60%) | The player always keeps at least 40% of revenue no matter how many rounds they take — an all-VC run stays theoretically winnable |

Player **accepts** (credits += capital immediately, `sharePct` is added to
`state.vc.totalSharePct` permanently) or **declines** (nothing happens; that
round's offer is gone permanently — no re-offer, same as a milestone only
firing once). This reuses the modal-decision pattern the game already has
nowhere else (`UnlockPanel` only has a "Continue" button) — it's the one
genuinely new UI interaction in the plan.

Offers fire on **every** track's milestone completions (main, Home Lab, AI
Slop alike) — money is money regardless of which track earned the tech. One
special case: `docs/ADDONS-SPEC.md` §B6's Slop milestone 1 ("Content Is
Free") has a deliberate `reward: 0`, and `capital = 0 * vcCapitalMultiplier`
would otherwise offer real permanent dilution for zero cash. The offer is
skipped entirely (no modal at all, not a $0 offer to decline) whenever
`milestone.reward === 0`.

## 4. Mechanic B — the revenue share, ongoing

Every tick, alongside the existing burn charge (`simulate.ts:307`):

```ts
if (state.vc && state.vc.totalSharePct > 0) {
  const netPerMin = state.finance.netPerMin; // now computed in-engine, see §2
  if (netPerMin > 0) {
    state.credits -= state.finance.revenuePerMin * state.vc.totalSharePct * (dt / 60);
  }
  // netPerMin <= 0: investors collect nothing this tick, by design
}
```

This is a straight port of the burn-charge idiom already in the file — same
`dt`-scaled continuous deduction, same place in the tick. The gate on
`netPerMin` is the one substantive rule from the brief: a company running at
a loss doesn't also bleed an investor's cut on top of the loss.

## 5. Mechanic C — the bank loan

Available whenever `addons.ventureCapital` is on, independent of milestone
timing or a pending raise offer — the player can open the bank dialog and
draw at any time. A new small dialog offers to draw against a cap:

```
cap = BALANCE.bankLoanCapBase * (1 + state.completedMilestones.length * BALANCE.bankLoanCapGrowthPerMilestone)
```

so the facility grows as the company grows, the same shape as the price index
in the Home Lab addon (`docs/ADDONS-SPEC.md` §A4) growing off milestone
progress rather than wall-clock. `cap` is the size of any *one* new draw, not
a lifetime ceiling — the player can hold several loans at once, each locked
into the rate in force when it was drawn (so a later balance change to
`bankLoanRatePerMonth` doesn't retroactively reprice a loan taken earlier).
On draw: `state.credits += amount`,
`state.loans.push({ id, principal: amount, ratePerMonth, monthsRemaining: term })`.

Repayment, auto-deducted every tick exactly like `machineBurn` already is,
summed across every open loan:

```ts
for (const loan of state.loans) {
  const interest = loan.principal * loan.ratePerMonth * (dt / BALANCE.monthSeconds);
  const principalDue = loan.principal / (loan.monthsRemaining * BALANCE.monthSeconds / dt);
  state.credits -= interest + principalDue;
  loan.principal -= principalDue;
}
state.loans = state.loans.filter((l) => l.principal > 0);
```

If `credits` can't cover the sum due on a given tick, it simply goes negative
— every loan still amortizes on its own schedule regardless of balance,
consistent with how breach costs and fines already work in this game (no
penalty rate, no late fee, no build-blocking; see §8's balance-risk note on
this exact asymmetry with the revenue share).

Suggested constants:

| Constant | Default | Reasoning |
| --- | --- | --- |
| `bankLoanRatePerMonth` | 0.02 (2%/mo, ~27% APR) | Venture debt in reality runs well above prime; steep enough that it's a bridge, not a subsidy |
| `bankLoanTermMonths` | 6 | Amortized over 6 sim-months — short enough that a loan taken carelessly is felt before the next milestone, typically |
| `bankLoanCapBase` | 5,000 | Scaled by milestone count so it stays relevant across the run |
| `bankLoanCapGrowthPerMilestone` | 0.4 | Cap roughly doubles by milestone 3, ~5x by milestone 10 |

**No bankruptcy mechanic exists in this game today** (`state.credits` already
goes negative on a bad breach or fine with no floor — confirmed in
`simulate.ts`, nothing checks `credits < 0` except a red readout in
`TopBar.tsx:61`). The loan's auto-repayment following the player into negative
credits if they can't cover it is therefore *consistent with the existing
game*, not a new failure mode this addon has to invent — confirmed as the
intended behavior rather than adding a penalty-rate or build-blocking system
that would exist nowhere else in the game.

## 6. UI additions

- `VentureCapitalOffer.tsx` — the accept/decline modal, fired alongside
  `UnlockPanel` (§3).
- A small persistent readout, likely in `TopBar.tsx` next to `finance`:
  investor share % and (if present) loan balance + monthly payment — the
  player should never have to open a dialog to remember they owe someone.
- A `BankDialog.tsx` (or a tab inside `SettingsDialog`) to draw a loan and see
  its terms before committing.
- `SettingsDialog.tsx` gains the third addon toggle for free once §1 lands —
  no bespoke UI needed there.

## 7. Engine changes, in build order

1. **Addon system generalization** (§1) — nothing else can be gated correctly without it.
2. **`FinanceReport.netPerMin`** (§2) — needed before either money mechanic can read it.
3. **`GameState.vc` / `GameState.loans`**, `STATE_VERSION` bump — this is a save-shape change; per the existing convention (`docs/ADDONS-SPEC.md` §C12) that means old saves are discarded on load, which should be a deliberate call here too.
4. **Fundraise offer modal + accept/decline wiring** (§3).
5. **Revenue-share tick charge** (§4).
6. **Bank loan draw + amortized auto-repayment** (§5).
7. **UI readouts** (§6).
8. `npm run card` — regenerate the reference card if it lists addons.

## 8. Balance risks

**The revenue-share gate on `netPerMin` can be gamed by staying unprofitable
on paper.** A player who keeps `burnPerMonth` deliberately inflated (idle
capacity, unrepaired broken nodes) suppresses `netPerMin` to zero and pays
investors nothing while still banking `revenuePerMin` elsewhere in the loop.
Needs a headless run specifically hunting this before it ships.

**Loan interest, unlike the revenue share, never pauses.** That asymmetry is
the point (§0) but it also means a loan taken right before a bad stretch (a
breach, a fine, a stalled contract) can spiral while the revenue-share
obligation from the same period goes quiet. Worth confirming that's the
intended lesson and not just a trap with no lever to pull.

**Interaction with the milestone-reward-to-zero change is the whole premise
and needs a headless comparison run**, same shape as the one already used to
validate `milestoneRewardMultiplier: 0` (§ intro): base game (addon off) vs.
addon on, same auto-player, same milestones — confirming the addon actually
closes the funding gap rather than under- or over-correcting it.

**Cumulative share cap (60%) still lets a maxed-out early-rush strategy
dominate.** If a player takes every offer starting Milestone 1, they hit the
cap by roughly milestone 6–8 at the suggested `vcBaseSharePct`, and every
milestone after that is capital with no further dilution cost — which may
make "raise every round" a dominant strategy with no real tension. Worth
tuning `vcBaseSharePct`'s decay so the cap isn't reachable quite that early,
or accepting that as the intended "sell out fast" playstyle.

## 9. Decisions locked in

All six open questions from the first pass of this plan have been settled and
folded into the sections above and the decisions table at the top:

1. **Single term sheet**, not a menu of sizes (§3).
2. **Bank loan is always available**, independent of milestone timing or a
   pending raise offer (§5).
3. **Multiple loans allowed** — `state.loans` is an array, each entry locked
   into the rate it was drawn at (§2, §5).
4. **Missed payments just go negative** — no penalty rate, no build-blocking,
   consistent with how the rest of the game already treats a shortfall (§5).
5. **Declining a raise is permanent** for that milestone — no re-offer, no
   persistent "raise anytime" option (§3).
6. **Fundraise offers fire on every track**, main/Home Lab/Slop alike, with
   the Slop track's deliberate `reward: 0` milestone special-cased to skip
   the offer entirely rather than dilute for $0 (§3).

Nothing is open pending further input; §8's balance risks are implementation-
time tuning concerns, not open design decisions. Ready to build in the order
given in §7.

## 10. What changed during the build

Built per §7's order. Three things the plan got slightly wrong, found while
implementing:

1. **`state.vc` and `state.loans` are not nullable.** §2 specced `vc: {...} |
   null`. Every other addon-adjacent stat (`state.slop`, `state.priceIndex`)
   is an unconditional field defaulting to zero regardless of whether its
   addon is on, and `state.vc`/`state.loans` now follow that convention —
   `{ raises: [], totalSharePct: 0, declined: [] }` and `[]` respectively.
   Simpler than nullable checks everywhere, and the offer/tick functions
   already gate on `featureEnabled('ventureCapital', ...)` regardless.
2. **The loan amortization formula in §5 had a bug.** Dividing principal by a
   fixed `monthsRemaining` every tick without ever decrementing it would
   never fully pay off the loan. The shipped version recomputes straight-line
   against time actually remaining each tick (`monthsRemaining` counts down
   with `dt`), which is self-correcting under a variable dt or a speed change
   and reaches exactly zero at term end. Verified with a script that ran a
   drawn loan tick-by-tick to its full term and confirmed `state.loans` empties.
3. **`state.vc.declined` was missing from §2's data model.** A permanent
   decline (per the resolved open question) needs *something* persisted to
   check against, and "already raised" (`state.vc.raises`) doesn't cover a
   milestone that was offered and turned down. Added `declined: string[]`.

Verified: `tsc --noEmit` clean, `npm run build` clean, `npm run check:i18n`
clean (0 missing figures), `npm run progression` unaffected with the addon at
its default off (still 2/24 milestones, same auto-player run as before this
addon existed — confirming it changes nothing for a player who leaves it
off). A 22-check script exercising `src/engine/venture.ts` directly (offer
math, the cumulative share cap, the $0-reward special case, decline
permanence, the net-income gate on the revenue share, loan cap/draw/
concurrent loans/full amortization) passes in full. Not verified: the actual
modals and dialogs in a running browser — the app is behind a closed-beta
login wall this session had no credentials for, and entering credentials on
the user's behalf is out of scope regardless. Worth a manual pass before
calling this shipped.
