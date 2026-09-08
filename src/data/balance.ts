/**
 * BALANCE ---------------------------------------------------------------
 * Global tuning knobs. Every number the simulation uses that is not tied to a
 * specific item / building / recipe lives here. Safe to edit freely.
 */
export const BALANCE = {
  /** Simulation resolution. Smaller = smoother & more accurate, more CPU. */
  tickSeconds: 1 / 20,

  /** Speed multipliers offered in the top bar. `0` is pause. */
  speeds: [0, 1, 2, 4] as const,

  /** Units per minute a single link can carry. */
  linkRatePerMin: 240,

  /** How many units of one item a node can hold per input/output slot. */
  bufferPerItem: 400,

  /** Cash you start with, in dollars. */
  startingCredits: 2_000,

  /** Fraction of place cost returned when you delete a node. */
  refundRate: 0.5,

  /** Clock speed slider bounds, as a multiplier of nominal rate. */
  minClock: 0.25,
  maxClock: 2.5,

  /**
   * Compute draw scales as `computeDraw * clock ** clockExponent`.
   * 1 = linear. >1 makes overclocking expensive.
   */
  clockExponent: 1.6,

  /**
   * Seconds of simulated time in one billing month. Every `monthlyCost` is
   * charged continuously at `monthlyCost / monthSeconds` per second, so a
   * $25/mo plan really does bill about 8 cents per game-second.
   */
  monthSeconds: 300,

  /**
   * Breach probability per minute is
   * `breachRatePerMinuteAt100 * (exposure / 100) ** 2`.
   * Quadratic on purpose: a little risk is survivable, a lot is not.
   */
  breachRatePerMinuteAt100: 2.4,
  /** A breach costs this fraction of cash on hand... */
  breachCostFraction: 0.12,
  /** ...but never less than this... */
  breachCostMin: 500,
  /** ...and never more than this. */
  breachCostMax: 5_000_000_000,
  /** Every contract is frozen this long while you respond to a breach. */
  breachFreezeSeconds: 20,

  /**
   * Throughput the shared pool always has, in kTPM — the ordinary servers you
   * run regardless. Retrieval, evals, agents and the silicon branch draw on it.
   * Without a baseline the whole non-model side of the factory would be dead
   * until you can afford rented GPUs, which is far too late.
   */
  ownServersKtpm: 600,


  // --- hardware price index (Home Lab) ------------------------------------
  /**
   * Between mid-2024 and September 2026 a 32GB DDR5 kit went from about $95 to
   * about $400, because manufacturers moved capacity to server DRAM and HBM.
   * Consumer NAND fell from 45% of the market to 32%; Micron discontinued its
   * consumer Crucial line outright. The AI buildout the player is part of is
   * what makes the player's own hardware expensive.
   *
   * `priceIndex` runs 1.0 -> priceIndexMax. Set priceIndexMax to 1 to switch
   * the whole system off for a playtest.
   */
  priceIndexMax: 4.2,
  /** Weight on tech-tree progress. Progress, not wall clock: thinking is free. */
  priceIndexProgressWeight: 0.7,
  /** Weight on the player's own provisioned throughput. Their share of blame. */
  priceIndexBuildoutWeight: 0.3,
  /** Milestones at which the progress term saturates. */
  priceIndexProgressMilestones: 12,
  /** Provisioned kTPM at which the buildout term saturates. */
  priceIndexSaturationKtpm: 200_000,

  // --- hardware failure (Home Lab) ----------------------------------------
  /** Fraction of a node's CURRENT cost charged to repair a blown one. */
  repairCostFraction: 0.6,
  /** Seconds a blown node stays down after you pay to repair it. */
  repairSeconds: 30,

  // --- AI slop ------------------------------------------------------------
  /**
   * Slop Index behaves like Exposure: summed from slopRisk across running
   * nodes. It raises the odds on every slop incident and it is the reason
   * a content mill eventually stops paying.
   */
  /** Per delivery to a slop contract: p = ipFineRateAt100 * (slop/100)^2. */
  ipFineRateAt100: 0.6,
  /** An IP fine costs this per unit delivered — ~$3,000 a work, scaled. */
  ipFinePerUnit: 220,
  /** Flat chance any slop craft simply produces nothing anyone wants... */
  distractionBase: 0.04,
  /** ...plus this much per point of Slop Index. */
  distractionPerSlop: 0.0025,
  /**
   * Per delivery: p = qualityMissRateAt100 * (slop/100)^2. Cuts the payout.
   *
   * Tuned against the decay below so that strikes drift UP once the miss rate
   * passes 1/7 — which happens around Slop 35, roughly what running the whole
   * content stack at once costs you. A modest setup sits safely under it.
   */
  qualityMissRateAt100: 1.2,
  /** Chance a clean delivery works off one strike. Reputation, not a tally. */
  strikeDecayChance: 1 / 6,
  /** What a contract pays when quality misses. */
  qualityMissPayoutFraction: 0.35,
  /** Quality misses on one contract node before the customer leaves for good. */
  strikesBeforeLoss: 3,
  /** Per NSFW delivery: p = legalFineRateAt100 * (slop/100)^2. */
  legalFineRateAt100: 0.5,
  /** A legal fine costs this fraction of cash on hand... */
  legalFineFraction: 0.08,
  /** ...but never less than this. */
  legalFineMin: 25_000,
  /** And spikes Exposure by this much, for this long. */
  legalFineExposure: 15,
  legalFineExposureSeconds: 60,

  /** Seconds between autosaves. */
  autosaveSeconds: 10,

  /**
   * Multiplier on every milestone's `reward` that is actually paid in cash on
   * completion. 0: tech-tree unlocks no longer hand you free money outright —
   * funding has to come from contracts, or (Venture Capital addon) be raised
   * against future revenue. Milestone `reward` values are kept in the data
   * either way, both for display and as the input to that addon's math.
   */
  milestoneRewardMultiplier: 0,

  // --- Venture Capital addon -----------------------------------------------
  /** Capital offered on a raise = milestone.reward * this. Bigger than the old flat reward — that's the pitch, funded by giving something up. */
  vcCapitalMultiplier: 3,
  /** Revenue share offered on the FIRST raise. Later raises offer less new share as the cap table fills — see vcMaxTotalSharePct. */
  vcBaseSharePct: 0.08,
  /**
   * Cumulative share across rounds still being repaid. Real revenue-based
   * financing takes 5-15% of monthly revenue, 25% at the extreme; 30% sits
   * just past that, high enough to hurt. Retired rounds do not count, so this
   * caps concurrent load, not a permanent tax.
   */
  vcMaxTotalSharePct: 0.3,
  /**
   * A round stops charging once it has taken this multiple of its capital.
   * Real RBF caps repayment at 1.3-2.5x (1.5-2.0x is the common band). Without
   * a cap the effective multiple is infinite, which is not a deal anyone signs.
   */
  vcRepaymentCap: 2.0,
  /**
   * Raising from a weak position costs more, the way a real down round does —
   * 96% of 2026 term sheets are 1x non-participating, but 2x shows up
   * precisely in down rounds and bridges. Multiplies the share offered.
   */
  vcDownRoundShareMult: 1.5,
  /** Repayment cap applied instead of vcRepaymentCap when raising while weak. */
  vcDownRoundRepaymentCap: 3.0,
  /** Exposure at or above this counts as weak when terms are set, alongside negative operating income. */
  vcDownRoundExposure: 30,
  /** Size of a raise the player asks for directly (not tied to a milestone) at milestone 0. Grows with progress like bankLoanCapBase does — see vcOnDemandCapitalGrowthPerMilestone. */
  vcOnDemandCapitalBase: 8_000,
  /** Per completed milestone, the on-demand raise size grows by this fraction of its base. Steeper than the loan's growth rate: equity is the option with no repayment SCHEDULE pressure, so it can afford to scale faster. */
  vcOnDemandCapitalGrowthPerMilestone: 0.5,

  /** Bank loan interest, per sim-month, locked in at draw time. ~12.7% APR — real venture debt runs prime+1-2% at a bank, 8-13% all-in. Cheap to carry; the cost is the fee below. */
  bankLoanRatePerMonth: 0.01,
  /** Deducted from the draw itself. Real venture debt charges 1-2% upfront, which is what makes debt costly to TAKE and cheap to HOLD — the opposite shape to the revenue share. */
  bankLoanOriginationPct: 0.015,
  /** Sim-months a loan amortizes over. Short enough that a careless draw is felt before the next milestone, typically. */
  bankLoanTermMonths: 6,
  /** Size of any one new draw at milestone 0. Grows with progress — see bankLoanCapGrowthPerMilestone. Not a lifetime cap: multiple loans can be outstanding at once. */
  bankLoanCapBase: 5_000,
  /** Per completed milestone, the draw cap grows by this fraction of its base. */
  bankLoanCapGrowthPerMilestone: 0.4,

  // --- Agentic Ops addon ---------------------------------------------------
  /**
   * How many 'agent'-kind nodes may run at once, given a Console. Agents
   * compound — marketing feeds sales feeds coding — so the cap is the main
   * brake on "place twenty and alt-tab". It grows with progress, the same
   * shape as the bank's draw cap.
   */
  agentHeadcountBase: 3,
  agentHeadcountPerMilestones: 2,

  /**
   * Agent Drift, 0-100: how much of your company is acting without you. Summed
   * from agentDrift across running agents exactly like Exposure, with the
   * Reviewer as the only negative term.
   */
  /** Above this, a Sales Agent starts ignoring its own focus... */
  driftFocusFloor: 20,
  /** ...with the chance rising this fast per point above it, capped below. */
  driftFocusPerPoint: 0.01,
  driftFocusMax: 0.35,
  /** Above this, a Coding Agent starts buying nodes the chain did not need. */
  driftWasteFloor: 50,
  driftWastePerPoint: 0.01,
  driftWasteMax: 0.3,
  /** Above this, a runaway agent can bill you outright. */
  driftRunawayFloor: 80,
  /** Runaway chance per minute at Drift 100, scaled quadratically like a breach. */
  driftRunawayRateAt100: 1.2,
  /** A runaway spend costs this fraction of cash on hand, at least the floor. */
  driftRunawayFraction: 0.06,
  driftRunawayMin: 2_000,

  /**
   * Contract churn. Only ever rolled while the Agentic Ops addon is on: the
   * base game has no churn and this must not change it. A customer served
   * cleanly for a while is nearly sticky; a neglected one is not.
   */
  churnRatePerMin: 0.04,
  /** Seconds of clean running after which a contract is as sticky as it gets. */
  churnLoyaltySeconds: 420,
  /** The most loyalty can cut the churn roll. Never zero — customers do leave. */
  churnLoyaltyMax: 0.85,
  /**
   * Onboarding grace: no customer walks inside this many seconds of signing.
   * Without it a lead can churn before the player has wired it, which taxes
   * signing rather than teaching anything about neglect.
   */
  churnGraceSeconds: 120,

  /** A Sales Agent will not sign if it would leave less than this in the bank. */
  agentCashFloor: 0,
  /** With a Reviewer running, it holds this much back instead. */
  agentReviewedCashFloor: 25_000,
  /** Nodes one Coding Agent will place in a single build cycle. */
  agentChainNodeCap: 6,

  // --- contract terms ------------------------------------------------------
  /**
   * A contract is a term, not a marriage. When it runs out the node freezes —
   * it stops delivering and stops paying, but keeps its wiring and its buffers
   * — until you re-sign it.
   *
   * Term length is set by what the deal pays, on a log scale, because payouts
   * span six orders of magnitude ($9 a delivery to $11M) and anything linear
   * would either make the consumer tier permanent or make the API Platform
   * expire before it had earned its own signing cost back. Months per decade
   * of payout, so each 10x on the cheque buys this much more runway:
   *
   *   $9  -> 0.8 months (~4 game-minutes)     $22k -> 3.7 months (~18 min)
   *   $270 -> 2.1 months (~10 min)            $11M -> 6.0 months (~30 min)
   *
   * A contract that pays nothing never expires. Post To Feed is the case: it
   * is not a customer, it is you posting into the void, and putting that on a
   * renewal clock would charge rent on a lesson.
   */
  contractTermMonthsPerDecade: 0.85,
  /** Nothing runs shorter than this, whatever the arithmetic says. */
  contractTermMinMonths: 0.8,
  /** Re-signing costs this fraction of what the chassis costs to place today. */
  contractRenewalFraction: 0.25,

  // --- ESG addon -----------------------------------------------------------
  /**
   * Real hours in one billing month. `monthSeconds` of simulated time stands for
   * a month of wall clock, so one sim-second is `hoursPerMonth / monthSeconds`
   * real hours — which is what turns a node's kW into a power bill.
   *
   * Sanity check on the whole scale: Own Datacenter draws 10MW, so it bills
   * 10,000 x 0.09 x 730 = about $657k a month against its $7.08M monthly cost.
   * That is 9%, and the node's own description says power is "only ~7%".
   */
  hoursPerMonth: 730,
  /** $/kWh at grid index 1.0. US industrial average sits near nine cents. */
  gridPriceBasePerKwh: 0.09,
  /** $/litre. Industrial water runs $1-3 per cubic metre — cheap, which is the point. */
  waterPricePerLitre: 0.0015,

  /**
   * The grid index, 1.0 -> gridIndexMax, built exactly like the hardware price
   * index: partly your progress, partly your own provisioned load. PJM's
   * capacity auction cleared near $28.92/MW-day for 2024/25 and about
   * $269.92/MW-day for 2025/26, and data centre demand is what everyone
   * involved blames. Set gridIndexMax to 1 to switch the escalation off.
   */
  gridIndexMax: 3.0,
  gridIndexProgressWeight: 0.45,
  gridIndexLoadWeight: 0.55,
  /** Own kW at which the load term saturates. One Own Datacenter is 10,000. */
  gridIndexSaturationKw: 24_000,

  /**
   * Cooling. PUE multiplies the node's draw; the litres figure is water
   * evaporated per kWh of IT load. Evaporative is the cheapest to run and it is
   * why a data centre turns up in a drought story; air pays for the same job in
   * electricity instead. 1.8 L/kWh is roughly the industry mean WUE.
   */
  coolingPue: { air: 1.55, evaporative: 1.15, closed_loop: 1.2, immersion: 1.03 },
  coolingLitresPerKwh: { air: 0, evaporative: 1.8, closed_loop: 0.1, immersion: 0 },

  /**
   * The Environmental score is logarithmic in carbon-bearing load, because the
   * ladder spans a Gaming PC at half a kilowatt and Own Datacenter at ten
   * megawatts. Linear, every home node rounds to zero and one datacenter pins
   * the meter.
   */
  esgPowerScaleKw: 5,
  esgPowerCeilKw: 20_000,
  esgWaterScaleLitres: 1_000,
  esgWaterCeilLitres: 15_000_000,
  /** Summed landUse at which the land term reads 100. */
  esgLandCeil: 20,
  /** Summed laborLoad / provenanceRisk at which those pillars read 100. */
  esgLaborCeil: 20,
  esgProvenanceCeil: 25,

  /** How the three physical terms make up the Environmental pillar. */
  esgPowerWeight: 0.55,
  esgWaterWeight: 0.25,
  esgLandWeight: 0.2,
  /** How the three pillars make up the headline Footprint. */
  esgEnvWeight: 0.5,
  esgSocialWeight: 0.2,
  esgGovernanceWeight: 0.3,

  /** Water restriction: p = rate * (environmental/100)^2 per minute. */
  waterRestrictionRateAt100: 1.2,
  waterRestrictionSeconds: 45,
  /** What a restricted capacity node still supplies while it runs. */
  waterCurtailmentFactor: 0.5,

  /** Permit freeze: p = rate * (land/landCeil)^2 per minute, once past the threshold. */
  landPermitThreshold: 8,
  landPermitRatePerMin: 0.9,
  permitFreezeSeconds: 90,

  /** Labour dispute: p = rate * (social/100)^2 per minute. Costs time, not cash. */
  disputeRatePerMin: 1.0,
  disputeSeconds: 40,

  /** Export-control shock: p = rate * (governance/100)^2 per minute. */
  exportShockRatePerMin: 0.5,
  /** Added to the hardware price index, decaying over exportShockSeconds. */
  exportShockIndex: 0.8,
  exportShockSeconds: 90,

  /**
   * The audit. p = rate * (gap/100)^2 per minute, where gap is the real
   * Footprint minus what you published. A commissioned audit is not immunity,
   * it is a much smaller multiplier — the number was true when it was signed.
   */
  esgAuditRateAt100: 3.0,
  auditedShield: 0.15,
  /** A caught understatement costs this fraction of cash, at least the floor. */
  esgFineFraction: 0.14,
  esgFineMin: 20_000,
  /** And spikes Exposure by this much, for this long. */
  esgFineExposure: 20,

  /** What a commissioned audit costs, and the observation window before it lands. */
  esgAuditCost: 45_000,
  esgAuditSeconds: 60,
  /** Self-certifying is cheap and instant. That is the entire temptation. */
  esgSelfCertifyCost: 2_000,

  /** One carbon credit purchase: what it costs and what it takes off the E score. */
  carbonCreditCost: 12_000,
  carbonCreditRelief: 6,
  /** Most relief credits may ever provide. Offsets are not a substitute for the estate. */
  carbonCreditMaxRelief: 24,
  /** Credits decay: a retired tonne does not keep working. Points per month. */
  carbonCreditDecayPerMonth: 1.5,
  /**
   * How much of your credit relief the auditor allows. A 2023 investigation into
   * one major registry's rainforest credits concluded the large majority
   * represented no real reduction, and the auditor has read it.
   */
  offsetAuditDiscount: 0.35,
} as const;

/** Convenience: a link's throughput in units per second. */
export const LINK_RATE_PER_SEC = BALANCE.linkRatePerMin / 60;
