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
  /** Cumulative revenue share can never exceed this, however many rounds are taken. The player always keeps at least this much of revenue. */
  vcMaxTotalSharePct: 0.6,

  /** Bank loan interest, per sim-month, locked in at draw time. ~27% APR — venture debt in reality runs well above prime; steep enough to be a bridge, not a subsidy. */
  bankLoanRatePerMonth: 0.02,
  /** Sim-months a loan amortizes over. Short enough that a careless draw is felt before the next milestone, typically. */
  bankLoanTermMonths: 6,
  /** Size of any one new draw at milestone 0. Grows with progress — see bankLoanCapGrowthPerMilestone. Not a lifetime cap: multiple loans can be outstanding at once. */
  bankLoanCapBase: 5_000,
  /** Per completed milestone, the draw cap grows by this fraction of its base. */
  bankLoanCapGrowthPerMilestone: 0.4,
} as const;

/** Convenience: a link's throughput in units per second. */
export const LINK_RATE_PER_SEC = BALANCE.linkRatePerMin / 60;
