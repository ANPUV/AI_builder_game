import type { AddonSettings } from '../data/addons';
/** A placed node on the canvas. */
export interface Machine {
  id: string;
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
}

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
  | 'broken';     // hardware failure — repair it or replace it

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
  /** revenuePerMin - cogsPerMin - rentPerMin. Gates the Venture Capital revenue share: investors collect nothing while this is <= 0. */
  netPerMin: number;
}

/** One accepted funding round, under the Venture Capital addon. */
export interface VentureRaise {
  milestoneId: string;
  capital: number;
  /** Share of revenuePerMin this round costs, permanently, while net income is positive. */
  sharePct: number;
}

/** Venture Capital addon state. Present even when the addon is off — cheap, and avoids nullable checks everywhere. */
export interface VentureState {
  raises: VentureRaise[];
  /** Sum of raises[].sharePct, cached for the per-tick charge. Never exceeds BALANCE.vcMaxTotalSharePct. */
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

  // --- Venture Capital addon ------------------------------------------------
  vc: VentureState;
  loans: Loan[];

  /** Per-tick derived values; not persisted meaningfully but harmless. */
  compute: ComputeReport;
  finance: FinanceReport;
  status: Record<string, MachineStatus>;
}
