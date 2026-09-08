import type { AddonSettings } from '../data/addons';
import type { FocusTarget, Rarity } from '../data/market';
/** A placed node on the canvas. */
export interface Machine {
  id: string;
  /** Actual contract payouts earned by this machine; older saves start at zero. */
  revenueEarned?: number;
  buildingId: string;
  /** null until the player assigns one. A node with no recipe is idle. */
  recipeId: string | null;
  x: number;
  y: number;
  /** Clock multiplier, BALANCE.minClock .. BALANCE.maxClock. */
  clock: number;
  /** Player toggle. Disabled nodes draw no compute, cost no rent, do nothing. */
  enabled: boolean;
  /**
   * For a vendor-scoped capacity node: which provider's rate limit it buys.
   * Null means unconfigured — it supplies nothing until you pick one.
   */
  vendor?: string | null;
  /**
   * Nodes that fail and repair together. A blown power supply takes out every
   * node sharing its group, which is the entire reason groups exist.
   */
  groupId?: string | null;

  // --- runtime ------------------------------------------------------------
  /** Seconds into the current craft cycle. */
  progress: number;
  crafting: boolean;
  /** itemId -> units waiting to be consumed. */
  inputs: Record<string, number>;
  /** itemId -> units waiting to be shipped out. */
  outputs: Record<string, number>;

  /** Blown. Supplies nothing, produces nothing, still bills rent. */
  broken?: boolean;
  /** Seconds of repair downtime remaining. */
  repairing?: number;
  /** A manual recipe crafts once per press of Generate. This is the press. */
  armed?: boolean;
  /** Quality misses on this contract. At BALANCE.strikesBeforeLoss it is lost. */
  strikes?: number;

  // --- Agentic Ops --------------------------------------------------------
  /** What this agent chases: everything, one track, or one named contract tier. */
  focus?: FocusTarget;
  /** Rarity floor, meaningful only for the group focuses. A named tier implies its own. */
  rarityFloor?: Rarity;
  /**
   * How long this contract has been running cleanly, in seconds. Loyalty is
   * earned, and it is the only thing besides a Support Agent standing between a
   * customer and the churn roll.
   */
  servedFor?: number;
  /** `elapsed` when this contract was signed. Buys it an onboarding grace. */
  signedAt?: number;

  // --- ESG addon ----------------------------------------------------------
  /** How this node rejects its heat. Only meaningful on a node with `powerKw`. */
  cooling?: CoolingMode;
}

/**
 * How a node rejects heat (ESG addon). The trade is the whole mechanic: air
 * pays in electricity and drinks nothing, evaporative is the cheapest to run
 * and is why a data centre turns up in a drought story, and buying your way out
 * of both costs capital.
 */
export type CoolingMode = 'air' | 'evaporative' | 'closed_loop' | 'immersion';

/**
 * How a belt is drawn. Cosmetic only — routing does not affect throughput —
 * but a dense factory is unreadable when forty curves cross each other, so
 * the player gets to pick per belt.
 */
export type LinkShape = 'curve' | 'straight' | 'elbow';

/** A link carrying one item type from a node's output to another's input. */
export interface Link {
  id: string;
  fromId: string;
  toId: string;
  itemId: string;
  /** Undefined on links saved before shapes existed; treated as 'curve'. */
  shape?: LinkShape;
}

/** Why a node is not currently producing. Recomputed every tick, for UI. */
export type MachineStatus =
  | 'running'
  | 'idle'        // no recipe assigned
  | 'disabled'    // player switched it off
  | 'starved'     // missing inputs
  | 'blocked'     // output buffer full
  | 'throttled'   // not enough compute capacity — a 429
  | 'broke'       // cannot afford this craft's API spend
  | 'audited'     // contract refuses: Exposure, breach freeze, or a failed site audit
  | 'awaiting'    // manual recipe, waiting for the player to press Generate
  | 'broken'      // hardware failure — repair it or replace it
  | 'unfocused'   // an agent whose focus has nothing to work on — still billing
  | 'unmanaged'   // an agent with no Agent Ops Console to report to
  | 'curtailed'   // capacity throttled by a water restriction (ESG addon)
  | 'disputed'    // stopped by a labour dispute (ESG addon)
  | 'disclosed';  // contract refuses: no disclosure on file, or Footprint over its ceiling

/** One provider's rate limit, or your own hardware. */
export interface PoolReport {
  /** Thousands of tokens per minute demanded by nodes on this pool. */
  demandKtpm: number;
  /** Thousands of tokens per minute supplied to this pool. */
  supplyKtpm: number;
  /** 0..1. Nodes on this pool run at this fraction of their clock. */
  satisfaction: number;
  /** How many enabled nodes draw on it. Free tiers only cover `servesNodes`. */
  drawers: number;
}

export interface ComputeReport {
  /** Per-pool detail, keyed by vendor id or 'shared'. */
  pools: Record<string, PoolReport>;
  /** Sum across pools — the headline figure. */
  demandKtpm: number;
  supplyKtpm: number;
  /** The WORST pool. One starved provider throttles that provider only. */
  satisfaction: number;
  /** Pools running short, worst first. */
  tight: string[];
}

/**
 * One customer currently on the contract board.
 *
 * An offer is the only way a contract node gets onto the canvas. It is drawn
 * from MARKET_LISTINGS, sits for its listing's `ttl`, and then the customer
 * walks. Signing one spends the chassis cost and consumes the offer.
 */
export interface ContractOffer {
  id: string;
  buildingId: string;
  /** Flavour line naming which customer this particular lead is. */
  lead: string;
  /** `state.elapsed` when it landed. */
  offeredAt: number;
  /** `state.elapsed` at which the customer walks. */
  expiresAt: number;
  /** False until the player has opened the board since it arrived. Drives the dot. */
  seen: boolean;
}

export interface FinanceReport {
  /** $ per game-minute of subscription and rent. */
  burnPerMonth: number;
  /** Rolling $ per minute earned from contracts. */
  revenuePerMin: number;
  /** Rolling $ per minute spent on per-token API costs. */
  cogsPerMin: number;
  /**
   * revenuePerMin - cogsPerMin - rentPerMin: what the factory itself earns,
   * BEFORE anything owed to investors or the bank. This is the number the
   * player can move with build decisions, and it gates the Venture Capital
   * revenue share — investors collect nothing while it is <= 0.
   */
  operatingPerMin: number;
  /** $ per minute leaving as investor revenue share, loan interest and principal. */
  financingPerMin: number;
  /** operatingPerMin - financingPerMin. What actually lands in credits. */
  netPerMin: number;
}

/**
 * One accepted funding round, under the Venture Capital addon.
 *
 * A round is a FINITE obligation: it takes `sharePct` of revenue until it has
 * handed over `owed`, then it retires and charges nothing ever again. Real
 * revenue-based financing caps repayment at 1.3-2.5x the capital advanced;
 * an uncapped share of revenue is not an instrument anybody sells.
 */
export interface VentureRaise {
  milestoneId: string;
  capital: number;
  /** Share of revenuePerMin this round costs while it is still being repaid. */
  sharePct: number;
  /** Total this round will ever take. Set at signing from BALANCE.vcRepaymentCap. */
  owed: number;
  /** Handed over so far. The round retires the moment this reaches `owed`. */
  paid: number;
  /** Signed while the company was weak: worse share, higher cap. Display only. */
  downRound?: boolean;
}

/** Venture Capital addon state. Present even when the addon is off — cheap, and avoids nullable checks everywhere. */
export interface VentureState {
  /** Every round ever signed. Retired rounds stay for the record and charge nothing. */
  raises: VentureRaise[];
  /** Sum of sharePct across rounds STILL being repaid, cached for the per-tick charge. Falls as rounds retire. */
  totalSharePct: number;
  /** Milestone ids whose raise offer was declined — permanent, so it is never re-offered. */
  declined: string[];
}

/** One outstanding bank loan, under the Venture Capital addon. Multiple can be open at once, each at the rate it was drawn at. */
export interface Loan {
  id: string;
  principal: number;
  ratePerMonth: number;
  monthsRemaining: number;
}

/**
 * What the company last told the world about its footprint (ESG addon).
 *
 * The gate on the big contracts reads `claimed`, not the live number. That is
 * the entire mechanic: publishing an understatement is available, cheap and
 * profitable, and the audit rolls on the gap between the two.
 */
export interface Disclosure {
  /** The number published. May be lower than the truth — that is the choice. */
  claimed: number;
  /** True Footprint at the moment of publication, so the audit has a baseline. */
  actual: number;
  /** `state.elapsed` when it was published. Disclosures go stale on their own. */
  publishedAt: number;
  /** Commissioned from an assurance firm rather than self-certified. */
  audited: boolean;
}

/**
 * ESG addon state. Present even when the addon is off — cheap, and it avoids a
 * nullable check in every consumer, exactly like `vc`.
 */
export interface EsgState {
  /** The three pillars, each 0-100, recomputed every tick from running nodes. */
  environmental: number;
  social: number;
  governance: number;
  /** The headline, 0-100. A weighted blend of the three. High is bad. */
  footprint: number;

  /** Live physical totals, for the report and the tooltips. */
  powerKw: number;
  waterLitresPerMonth: number;
  landUse: number;
  /** Best `cleanFraction` running: a PPA is signed for a company, not a rack. */
  cleanFraction: number;

  /** 1.0 -> BALANCE.gridIndexMax. Your own buildout is half of it. */
  gridIndex: number;

  /** Relief bought from the credits desk, decaying. Discounted by the auditor. */
  carbonRelief: number;

  disclosure: Disclosure | null;
  /** Seconds left on a commissioned audit's observation window. */
  auditPending: number;

  /** Seconds remaining: no new Capacity / Silicon / Sustainability placements. */
  permitFreeze: number;
  /** Seconds remaining: capacity nodes supply BALANCE.waterCurtailmentFactor. */
  waterFreeze: number;
  /** Seconds remaining: every node leaning on human labour is stopped. */
  disputeFreeze: number;
  /** Added to the hardware price index by an export-control shock, decaying. */
  shockSpike: number;

  /** Cumulative $, for the report. */
  powerPaid: number;
  waterPaid: number;
  fines: number;
  heatRevenue: number;
}

export interface GameState {
  version: number;
  machines: Record<string, Machine>;
  links: Record<string, Link>;
  credits: number;
  /** Cumulative units sold into contracts, itemId -> units. Drives milestones. */
  delivered: Record<string, number>;
  /** Milestone ids already completed, in completion order. */
  completedMilestones: string[];
  unlockedBuildings: string[];
  unlockedRecipes: string[];
  /** Seconds of simulated time. */
  elapsed: number;

  // --- contract board -----------------------------------------------------
  /** Offers currently signable, keyed by offer id. */
  offers: Record<string, ContractOffer>;
  /** buildingId -> `elapsed` when it was last drawn. Feeds the pity multiplier. */
  lastOffered: Record<string, number>;

  // --- risk ---------------------------------------------------------------
  /** Sum of dataRisk across running nodes, floored at 0. */
  exposure: number;
  /** Total breaches suffered. */
  breaches: number;
  /** Seconds remaining on the current incident freeze. */
  breachFreeze: number;
  /** Cumulative $ lost to breaches. */
  breachLosses: number;

  // --- hardware market ----------------------------------------------------
  /**
   * 1.0 at the start of the run, climbing toward BALANCE.priceIndexMax. Every
   * hardware price is multiplied through it by the item's own elasticity.
   */
  priceIndex: number;

  // --- slop ---------------------------------------------------------------
  /**
   * Agent Drift, 0-100 (Agentic Ops addon). Summed from agentDrift across
   * running agents, exactly like Exposure. High drift is agents acting further
   * and further outside the brief you set them.
   */
  agentDrift: number;
  /** Cumulative $ lost to runaway agents. */
  agentLosses: number;

  /** Sum of slopRisk across running nodes. Drives every slop incident. */
  slop: number;
  /** Cumulative $ lost to IP and legal fines. */
  slopFines: number;
  /** Exposure added by a legal fine, decaying over legalFineExposureSeconds. */
  slopExposureSpike: number;

  /**
   * Quick-build slots for keys 1-9 then 0. Each holds a buildingId or null.
   * Persisted, so a player's bar survives a reload.
   */
  hotbar: (string | null)[];

  /**
   * Which optional content tracks are switched on. Absent from an older save,
   * where the spread in loadState leaves the default (everything on) in place.
   */
  addons: AddonSettings;

  /**
   * How belts are drawn when the player has not styled one individually.
   * A link's own `shape` still wins, so a per-belt choice made in the
   * inspector survives changing this.
   */
  linkShape: LinkShape;

  // --- Venture Capital addon ------------------------------------------------
  vc: VentureState;
  loans: Loan[];

  // --- ESG addon ------------------------------------------------------------
  esg: EsgState;

  /** Per-tick derived values; not persisted meaningfully but harmless. */
  compute: ComputeReport;
  finance: FinanceReport;
  status: Record<string, MachineStatus>;
}
