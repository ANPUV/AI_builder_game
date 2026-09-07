# Venture Capital — rebalance plan

**Status:** plan only, nothing built. Written 7 Sep 2026.
Follows [VC-ADDON-PLAN.md](VC-ADDON-PLAN.md), which shipped the addon as built.

This plan exists because a real save exposed the shipped mechanic's core flaw,
and because the numbers in it were never checked against what venture capital
actually costs.

## 0. The bug that started this

A player's save (11 rounds taken, cap table maxed at 60%) showed **Net margin
+36% while cash fell steadily**. Both halves of that are the mechanic's fault:

| | Value |
| --- | --- |
| Capital raised, 11 rounds | $22,105,500 |
| `revenuePerMin` | $75,052 |
| Investor share | 60% of top-line, forever |
| Investor take | $45,031/min ($225,157/sim-month) |
| `netPerMin` as displayed | **+$27,150** |
| Actual cash change | **−$17,881/min** |
| Sim-minutes to repay the raise 1x | 491 — and it never stops |

Two separate defects:

1. **The obligation is uncapped.** `tickVenture` takes a share of revenue with
   no terminal condition. The player repays their $22.1M at minute 491, then
   keeps paying $45k/min until the heat death of the run. The effective
   repayment multiple is **∞x**.
2. **The readout lies.** `state.finance.netPerMin` is
   `revenue − cogs − burn`, computed in `simulate.ts` *before* `tickVenture`
   runs, and `TopBar.tsx` derives "Net margin" from it. Neither the revenue
   share nor loan payments appear in either figure, so the top bar reports a
   profitable company that is in fact losing money every tick.

## 1. What the mechanic actually models (and what it claims to)

The addon is called Venture Capital and the UI says *"Investors take X% of
revenue while the company is profitable."* That is not equity. Equity pays at
an exit, in one event, out of proceeds — it takes nothing from operating
revenue, ever.

What's implemented is **revenue-based financing** (RBF), a real instrument —
just with numbers no RBF provider has ever offered:

| Term | Real RBF (2026) | This game | Off by |
| --- | --- | --- | --- |
| Share of monthly revenue | 5–15% typical, 5–25% extreme | up to **60%** | 4–12x |
| Repayment cap | 1.3–2.5x capital (1.5–2.0x most common) | **none** | ∞ |
| Obligation ends | yes, at the cap | never | — |

So the naming is wrong *and* the terms are wrong, and the two compound: the
player is told they sold equity, and charged something harsher than any debt
instrument that exists.

## 2. Real-world anchors

Collected 7 Sep 2026, sources at the bottom.

**Equity dilution per round.** Seed averaged 19.5% in 2025 (modal outcome
20–24%); Series A ~18% (median 17.9% in Q1 2025). Cumulative dilution through
Series A is 40–50%, leaving founders 45–55%. The game's `vcBaseSharePct` of 8%
is *low* as dilution — but it isn't dilution, it's a revenue royalty, where 8%
is already at the top of the RBF band.

**Liquidation preference.** 96% of 2024–26 deals use 1x non-participating:
at exit the investor takes *either* their money back *or* their pro-rata
share, whichever is larger — never both. 2x preferences show up specifically
in **down rounds and bridges** — i.e. terms get worse when you're weak. That
asymmetry is a mechanic waiting to be used (§4.4).

**Venture debt.** Bank lenders price at prime + 1–2%; private credit at
prime + 5–6%; all-in roughly **8–13% APR**, plus a 1–2% upfront fee, a 3–6%
end-of-term fee, and 0.5–1.5% warrant coverage. The game's
`bankLoanRatePerMonth: 0.02` is ~27% APR — 2–3x reality, and it charges no
fees at all, so the *shape* is wrong in both directions at once.

**Investment strategy.** Funds target 15–20% ownership plus a board seat at
seed/A (8–12% signals a founder-friendly fund). They hold **40–60% of the fund
in reserve** for follow-ons and pro-rata. Returns are power-law distributed, so
a fund needs its winners to return the whole fund — which is *why* investors
push growth over profitability. Capital is released in **tranches against
milestones**, which the game already models correctly: one offer per milestone
completion is genuinely how staged financing works.

## 3. Decisions proposed

| Decision | Proposal |
| --- | --- |
| Keep the revenue-share shape? | **Yes** — a bill you feel every tick is the right shape for this game. Equity-at-exit has nothing to attach to (there is no exit event; `ms_takeoff` just ends) and would make the addon invisible during play |
| Fix the ∞x repayment | **Yes, headline change** — each round carries a repayment cap and *retires* when paid (§4.1) |
| Rename to match the instrument | **Yes** — the offer copy should say what it is; keep the addon name "Venture Capital" as the fiction, but the term sheet should show the cap and the multiple like a real RBF term sheet does |
| Cumulative share ceiling | 60% → **30%**, top of the real RBF band (§4.2) |
| `netPerMin` gate | Replace with **accrual**, not forgiveness (§4.3) — closes the exploit §8 of the original plan flagged and never resolved |
| Financing in the readout | **Yes** — the top bar must not report profit that isn't there (§4.5) |
| Loan rate | 2%/mo → **1%/mo** (~12.7% APR, inside the real 8–13% band), plus a real origination fee (§4.6) |
| Down-round terms | **Yes, new** — offers made while the company is weak cost more, mirroring 2x preferences in real down rounds (§4.4) |

## 4. The changes

### 4.1 Each raise repays a capped multiple, then retires

The one change that matters. A round becomes a finite obligation:

```ts
// GameState.vc.raises[] gains two fields
{ milestoneId, capital, sharePct,
  owed: capital * BALANCE.vcRepaymentCap,  // total this round will ever take
  paid: 0 }                                // running total
```

`tickVenture` charges each *active* round its own share, credits `paid`, and
drops the round when `paid >= owed`. `totalSharePct` becomes a derived sum over
active rounds only — so it goes **down** as rounds retire, which is the feedback
the current mechanic completely lacks.

New constant `vcRepaymentCap: 2.0` (real range 1.3–2.5x, 1.5–2.0x most common).

What this does to the save above: round 1 took $4,500 at 8%. Capped at 2x, it
owes $9,000 and — at that save's current revenue — retires in **1.5 sim-minutes**.
Early cheap money gets paid off and goes away, exactly as it should. The player's
live share falls as the company outgrows its early rounds, instead of being
permanently anchored to a decision made in Act I.

### 4.2 Cumulative ceiling 60% → 30%

Even capped, 60% of top-line is outside anything real. 30% sits just above the
top of the RBF band (5–25%) — high enough to hurt, low enough that "raise every
round" isn't automatically fatal. With the §4.1 cap in place the ceiling matters
much less anyway, because it's now a ceiling on *concurrent* share, not on a
permanent tax.

Under the new numbers, that save's live share would be well under 30% (most of
its 11 rounds retired long ago), and its true net would be **positive**.

### 4.3 The `netPerMin` gate becomes an accrual

Today: `if (netPerMin > 0)` — investors collect nothing in a loss-making tick,
and that money is simply forgiven. §8 of the original plan flagged the exploit
(inflate burn, keep revenue, pay nothing) and shipped anyway; it's still open.

Proposed: unpaid share **accrues to the round's balance** rather than vanishing.
The player still gets relief on cash flow during a bad stretch — which is the
humane part, and the part worth keeping — but the obligation doesn't shrink, so
running deliberately unprofitable stops being free. This also matches real RBF,
where a bad month stretches the term rather than cancelling the debt.

### 4.4 Terms track company health (down rounds)

Real 2026 term sheets are 1x non-participating in 96% of deals — *except* in
down rounds and bridges, where 2x shows up. The game can model that in one line
in `raiseOfferFor`: if the company is weak when the offer fires (negative real
net income, or Exposure over some threshold), the same capital costs a worse
`sharePct` and/or a higher `vcRepaymentCap` for that round.

This makes *when* you raise a real decision, which is the single biggest thing
missing from the mechanic today — right now every offer is identical and the
only choice is yes/no.

### 4.5 The top bar stops lying

`FinanceReport` gains `financingPerMin` (revenue share + loan interest +
principal due) and `netPerMin` becomes net **after** it. If the existing
pre-financing figure is worth keeping — it is, it's the operating margin and
it's the number the player can actually act on with build decisions — show
both, labelled honestly:

- **Operating** — `revenue − cogs − burn` (today's `netPerMin`)
- **Net** — operating − financing

`TopBar.tsx:47` derives "Net margin" from whichever of those is the headline;
the VC tooltip should show the round-by-round `paid / owed` progress, which is
the information the player most needs and cannot currently get anywhere.

### 4.6 Loan terms move toward reality

`bankLoanRatePerMonth: 0.02` (~27% APR) → `0.01` (~12.7% APR), inside the real
8–13% band. Add `bankLoanOriginationPct: 0.015` (real: 1–2% upfront) deducted at
draw, so debt has the right *texture* — cheap to carry, costly to take out —
against the revenue share's opposite shape. That contrast is what §0 of the
original plan said the two instruments existed to teach, and right now both are
just "expensive."

## 5. Build order

1. `vc.raises[]` gains `owed`/`paid`; `totalSharePct` becomes derived over
   active rounds. **Save-shape change — `STATE_VERSION` bump.**
2. `tickVenture` charges per-round, retires paid rounds, accrues on loss ticks (§4.1, §4.3).
3. `BALANCE` constants: `vcRepaymentCap`, ceiling 0.6 → 0.3, loan rate, origination fee (§4.2, §4.6).
4. `FinanceReport.financingPerMin` + `netPerMin` after financing; TopBar two-line readout (§4.5).
5. Health-sensitive offer terms in `raiseOfferFor` (§4.4).
6. VC tooltip shows per-round `paid / owed`.
7. `npm run check:i18n` — new strings; `npm run card` if the reference card lists any of this.

## 6. Balance risks

**Retiring rounds may make raising strictly correct.** If early rounds retire in
1.5 sim-minutes, "take every offer" could become free money with a brief tax.
The counter is §4.4: raise while weak and the terms are genuinely bad. Needs a
headless run comparing raise-everything vs raise-never vs raise-only-when-strong.

**A `STATE_VERSION` bump discards existing saves.** The save that motivated this
plan would be destroyed by the fix for it. Worth considering a migration that
backfills `owed = capital * cap` and `paid = 0` on old raises instead — generous
to the player (their historical payments are forgiven) but it keeps their run,
and the load-time backfill machinery now exists in `reviveState`.

**Dropping 60% → 30% is a large mid-run buff** to anyone currently maxed out.
That's the intent — the current number is indefensible — but it should be a
deliberate, announced change rather than a silent retune.

## 7. What changed during the build

Built per §5's order, keeping the save (no `STATE_VERSION` bump). Three things
the plan got wrong, all found by the verification harness rather than by
reading:

1. **`paid = capital` alone does not fix an existing save.** §6 assumed most of
   a long save's rounds would already be retired by the migration. They are
   not: crediting each round with its capital back leaves every round exactly
   half-repaid against a 2x cap, so all 11 stay active and the share stays at
   60% — the migrated save still bled cash, which was the entire point of the
   exercise. The ceiling has to apply to migrated rounds too, so the migration
   now also retires rounds **oldest-first** until the live share is inside
   `vcMaxTotalSharePct`. On the save that motivated this: 5 rounds retire, 6
   remain, **share 60% → 25.9%**, **financing $45,031/min → $19,445/min**,
   **net −$17,881/min → +$7,705/min**.
2. **A brand-new company priced as a down round.** `isDownRound` tested
   `operatingPerMin <= 0`, which is true at minute zero of every run, so the
   very first offer in a fresh game came with down-round terms (3x cap, 1.5x
   share). Weakness now requires *revenue* to be losing money —
   `revenuePerMin > 0 && operatingPerMin <= 0` — because a company with no
   revenue is new, not distressed.
3. **§4.3's accrual needed no new machinery.** The plan proposed an accrual
   balance so loss ticks stop forgiving the obligation. With per-round caps
   that falls out for free: a skipped tick simply doesn't advance `paid`, so
   the round takes longer to retire and nothing is written off. The gate stays
   as cash-flow relief, and the exploit closes on its own.

Also, unplanned but necessary: `acceptRaise` now takes the **offer object**
rather than re-deriving it from the milestone id. Terms depend on company
health, and the old signature re-derived them at click time — so a company that
dipped while the modal sat open would silently sign worse terms than the ones
on screen. The UI snapshots the offer when the milestone lands and hands that
same object back; the engine re-validates only the rules that must not drift
(addon on, milestone undecided, ceiling not breached).

Verified: `tsc --noEmit`, `npm run build`, `npm run check:i18n` (282 figures, 0
missing) and `npm run progression` all clean. A 39-check harness exercising
`venture.ts` and the migration directly passes in full, covering round
retirement, deferral-not-forgiveness on loss ticks, down-round pricing, terms
not drifting between showing and signing, the concurrent-share ceiling, loan
origination and full amortization, and the real save's migration. Verified in
the browser with that save loaded: top bar reads **Investors 26%**,
**Net / min · after financing +$4,562**, its tooltip splits Operating +$23k /
Financing −$19k / Net +$4,562, and the investor tooltip lists all six live
rounds with `paid / owed` plus "5 round(s) repaid in full and no longer
charging."

## Sources

- [Startup Equity & Dilution: What's Normal in 2025?](https://serebrisky.com/2025/12/10/startup-equity-dilution-whats-normal-in-2025/)
- [Seed Hits $4.1M, Series A $19.4M — 2026 Round Benchmarks](https://valueaddvc.com/blog/startup-funding-rounds-in-2025-whats-normal-at-pre-seed-seed-a-and-b)
- [How Much Equity to Give Investors (2026 Stage Benchmarks)](https://www.sheetventure.com/blog/how-much-equity-should-you-give-to-investors)
- [Revenue-Based Financing (RBF): Terms, Cost & Guide (2026)](https://www.re-cap.com/financing-instruments/revenue-based-financing)
- [Revenue-Based Financing: Rates, Requirements and How to Qualify (2026)](https://startupowl.com/fund/revenue-based-financing)
- [Venture Debt Guide (2026): Costs, Terms & Eligibility](https://www.re-cap.com/financing-instruments/venture-debt)
- [Venture Debt and Recurring Revenue Loans in 2026](https://beancount.io/blog/2026/05/14/venture-debt-recurring-revenue-loans-series-a-b-startups-runway-extension-warrant-coverage-mrr-financing-non-dilutive-growth-capital-guide)
- [Liquidation preference, explained (2026)](https://www.vcboom.com/guides/liquidation-preference-explained-2026)
- [Liquidation Preferences: 1x Non-Participating](https://startupfundraising.com/liquidation-preference-stack)
- [VC Reserve Ratios — Follow-On Strategy (2026)](https://valueaddvc.com/blog/reserve-ratios-in-vc-funds-how-much-to-hold-back-for-follow-ons-in-2026)
- [The Ultimate Guide to VC Portfolio Construction](https://thevcfactory.com/vc-portfolio-construction/)
