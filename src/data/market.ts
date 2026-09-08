/**
 * CONTRACT MARKETPLACE ---------------------------------------------------
 * You do not buy a customer off a shelf. A lead turns up, gives you a window
 * to sign, and walks if you miss it. The board is your pipeline, and the only
 * place a contract node can come from.
 *
 * Two knobs per listing:
 *
 *   weight  Relative chance of being drawn. Money is inversely proportional to
 *           how often the phone rings: a federal program lands far less often
 *           than a prosumer subscription, because there are far fewer of them.
 *   ttl     Seconds the offer stays signable. Big deals stay open LONGER, not
 *           shorter — the median B2B cycle is 84 days and rising — and that
 *           window is the only way you can save up for a $2M lead.
 *
 * A listing that has not been drawn in a while gets a pity multiplier
 * (MARKET.pitySeconds). Without it the last contract in the game, at 2.2
 * weight against a board total near 250, would essentially never appear.
 */
import { BALANCE } from './balance';
import { BUILDINGS } from './buildings';
import { RECIPES, type Recipe } from './recipes';

export interface MarketListing {
  buildingId: string;
  /** Relative draw weight. Higher = turns up more often. */
  weight: number;
  /** Seconds the offer stays on the board before the customer walks. */
  ttl: number;
  /** Who is calling. One is picked at random so repeat leads read distinctly. */
  leads: string[];
}

export const MARKET = {
  /**
   * Leads per game-minute, PER unlocked contract type. Your pipeline widens as
   * you unlock tiers, which is both true to life and the only way the rare
   * listings at the top of the ladder ever come around.
   */
  leadsPerMinutePerType: 0.8,
  /**
   * ...but never slower than this. With one tier unlocked the per-type rate is
   * below the rate at which a 100-second consumer lead expires, so the opening
   * board would sit empty for minutes while the game is telling the player to
   * go sell something.
   */
  leadsPerMinuteFloor: 1.5,
  /**
   * And when the board is actually empty, the phone rings quickly. Nothing in
   * this game should ever be waiting on a die roll with no work to do meanwhile.
   */
  dryBoardLeadsPerMinute: 6,

  /** Board size is this plus one slot per unlocked contract type... */
  baseSlots: 3,
  /** ...clamped here, so the dialog stays readable. */
  maxSlots: 9,

  /** Most copies of one listing that may sit on the board at once. */
  maxPerListing: 3,

  /** A listing's weight gains +1x per this many seconds since it last showed... */
  pitySeconds: 240,
  /** ...up to this multiple. */
  maxPity: 4,

  /** Offers seeded onto a brand-new save so the opening board is never empty. */
  openingOffers: 2,

  /**
   * Every listing's window is multiplied by this.
   *
   * The per-listing `ttl` values below are the authored ones and stay readable
   * as a ladder — 90s at the bottom, 700s at the top. They were too short in
   * play: a 90-second consumer lead at 4x speed is gone in 22 real seconds, and
   * common leads expire without a toast, so the board appeared to lose offers
   * at random. Doubling here keeps the ladder's shape and gives every rung
   * twice the time to be noticed.
   */
  ttlMultiplier: 2,
} as const;

// --- rarity ---------------------------------------------------------------

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const RARITY: Record<Rarity, { label: string; color: string }> = {
  common:    { label: 'Common',    color: '#7d8b9c' },
  uncommon:  { label: 'Uncommon',  color: '#4ce07a' },
  rare:      { label: 'Rare',      color: '#4aa3d8' },
  epic:      { label: 'Epic',      color: '#b07ce0' },
  legendary: { label: 'Legendary', color: '#ffb03d' },
};

/** Weakest to strongest. Lets callers say "uncommon or better" without magic numbers. */
export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** True if `r` is at least as rare as `floor`. */
export const atLeastRare = (r: Rarity, floor: Rarity): boolean =>
  RARITY_ORDER.indexOf(r) >= RARITY_ORDER.indexOf(floor);

/**
 * Rarity is read off the draw weight, so the label and the odds can never
 * disagree. The bands are cut to spread the eight contract tiers across all
 * five: one common at the bottom, one legendary at the top.
 */
export function rarityOf(weight: number): Rarity {
  if (weight >= 80) return 'common';
  if (weight >= 30) return 'uncommon';
  if (weight >= 10) return 'rare';
  if (weight >= 3) return 'epic';
  return 'legendary';
}

// --- focus ----------------------------------------------------------------

/**
 * What an agent is pointed at (Agentic Ops addon).
 *
 * One control, three shapes: everything, a whole track, or one named contract
 * tier. Sales, Marketing and Support all read the same field, so the player
 * learns it once — and a `tier:` focus is what turns a generalist into a
 * specialist that idles, and bills, when its tier is dry.
 */
export type FocusTarget = 'all' | `track:${'main' | 'homelab' | 'slop'}` | `tier:${string}`;

/** The listing behind a `tier:` focus, or undefined for the group focuses. */
export const focusListing = (focus: FocusTarget | undefined): MarketListing | undefined =>
  focus?.startsWith('tier:') ? LISTING_BY_BUILDING[focus.slice(5)] : undefined;

// --- the board ------------------------------------------------------------

const L = (l: MarketListing): MarketListing => l;

export const MARKET_LISTINGS: MarketListing[] = [
  L({
    buildingId: 'consumer_app', weight: 100, ttl: 100,
    leads: [
      'A Discord server that wants its own bot',
      'Indie newsletter, 4k subscribers, pays monthly',
      'Two students with a credit card and a launch date',
      'Hobbyist forum tired of paying for three tools',
    ],
  }),
  L({
    buildingId: 'smb_pilot', weight: 62, ttl: 150,
    leads: [
      'Regional insurance broker, 40 seats',
      'Dental group wants intake summarised',
      'Freight forwarder drowning in email',
      'Property manager, 12 buildings, one overworked admin',
    ],
  }),
  L({
    buildingId: 'midmarket', weight: 38, ttl: 220,
    leads: [
      'Series B logistics SaaS — security review attached',
      'HR platform, 900 seats, renewal in 60 days',
      'E-commerce analytics vendor replacing an incumbent',
      'Field service SaaS, wants your subprocessor list first',
    ],
  }),
  L({
    buildingId: 'enterprise', weight: 22, ttl: 300,
    leads: [
      'Fortune 500 retailer, procurement already involved',
      'Global manufacturer — 6 stakeholders on the call',
      'Telco innovation group with real budget this time',
      'Airline ops, wants agents, not a chat box',
    ],
  }),
  L({
    buildingId: 'regulated', weight: 13, ttl: 380,
    leads: [
      'Hospital network — BAA before anything else',
      'Regional bank under SR 11-7 model governance',
      'Claims processor asking where inference runs',
      'Wealth manager, FINRA supervision requirements',
    ],
  }),
  L({
    buildingId: 'federal', weight: 7, ttl: 480,
    leads: [
      'Defence integrator holding a CDAO ceiling',
      'Civilian agency with a FedRAMP 20x fast lane slot',
      'Service branch pilot, IL5 enclave only',
      'Prime contractor needs a sub with authorisation',
    ],
  }),
  L({
    buildingId: 'hyperscaler', weight: 4, ttl: 560,
    leads: [
      'Cloud provider short on 2027 rack allocation',
      'Neocloud raising against signed supply',
      'Sovereign fund building a national cluster',
    ],
  }),
  L({
    buildingId: 'api_platform', weight: 2.2, ttl: 700,
    leads: [
      'An aggregator wants to resell your tokens',
      'Enterprise wants your models behind their gateway',
      'A rival lab wants capacity, quietly',
    ],
  }),

  // --- Home Lab: customers who will only buy a box -----------------------
  L({
    buildingId: 'sme_pilot', weight: 55, ttl: 160,
    leads: [
      'Two-partner law firm — privilege, and no cloud',
      'Physio clinic that read its own privacy policy',
      'Accountancy practice, 9 staff, January deadline',
      'Architecture studio with an NDA on every project',
    ],
  }),
  L({
    buildingId: 'sme_fleet', weight: 18, ttl: 260,
    leads: [
      'Notary group, four offices, one IT contractor',
      'Regional clinic network — GDPR audit last quarter',
      'Family manufacturer, drawings never leave the site',
      'Insurance adjuster wants it on their own hardware',
    ],
  }),
  L({
    buildingId: 'sme_msp', weight: 5, ttl: 420,
    leads: [
      'IT reseller wants to white-label your boxes',
      'Chamber of commerce, 200 member firms',
      'Managed service provider buying your whole practice',
    ],
  }),

  // --- Slop: the content buyers ------------------------------------------
  L({
    buildingId: 'feed_post', weight: 120, ttl: 90,
    leads: [
      'Your own feed, which owes you nothing',
      'A subreddit that has not banned you yet',
      'The company blog nobody reads',
      'An account with 40 followers and a posting schedule',
    ],
  }),
  L({
    buildingId: 'content_mill', weight: 70, ttl: 130,
    leads: [
      'Affiliate site needs 200 reviews by Friday',
      'SEO agency paying per piece, cash on delivery',
      '"News" network, 40 domains, one editor',
      'Dropshipper wants product copy, quality unspecified',
    ],
  }),
  L({
    buildingId: 'pseo_platform', weight: 26, ttl: 240,
    leads: [
      'Programmatic SEO shop with 90k target keywords',
      'Marketplace wants a landing page per city',
      'Comparison site scaling to every product category',
    ],
  }),
  L({
    buildingId: 'adult_platform', weight: 9, ttl: 320,
    leads: [
      'Subscription platform, offshore, pays weekly',
      'Studio wants volume and asks no questions',
      'Aggregator that has already lost two processors',
    ],
  }),
  // ESG addon. A long window and a low weight: the utility is in no hurry and
  // there is only ever one of them next door.
  L({
    buildingId: 'heat_offtake', weight: 20, ttl: 400,
    leads: [
      'Municipal heat network, two streets away',
      'District utility wants your reject water at 70C',
      'Council housing scheme costing its winter gas bill',
      'Greenhouse cooperative that would rather not burn anything',
    ],
  }),
];

export const LISTING_BY_BUILDING: Record<string, MarketListing> = Object.fromEntries(
  MARKET_LISTINGS.map((l) => [l.buildingId, l]),
);

export const listingFor = (buildingId: string): MarketListing | undefined =>
  LISTING_BY_BUILDING[buildingId];

/** Every contract chassis, whether or not the player has unlocked it. */
export const CONTRACT_BUILDINGS = BUILDINGS.filter((b) => b.kind === 'contract');

/**
 * The best-paying recipe this chassis can currently run. Drives the payout the
 * board advertises — quoting a number the player cannot yet earn would be a
 * lie, and quoting the worst one undersells the lead.
 */
export function bestRecipeFor(buildingId: string, unlockedRecipes: string[]): Recipe | undefined {
  return RECIPES.filter(
    (r) => r.buildingId === buildingId && r.payout !== undefined && unlockedRecipes.includes(r.id),
  ).sort((a, b) => (b.payout ?? 0) - (a.payout ?? 0))[0];
}

/**
 * The best a chassis could ever pay, ignoring what the player has unlocked.
 *
 * Contract terms read this rather than `bestRecipeFor`, because a term fixed
 * at signing must not depend on unlock state that can change underneath it —
 * an Enterprise signed before Agents In Production would otherwise get a
 * shorter term than the identical one signed after, for no reason the player
 * can see.
 */
export const topPayoutOf = (buildingId: string): number =>
  RECIPES.reduce(
    (best, r) => (r.buildingId === buildingId ? Math.max(best, r.payout ?? 0) : best),
    0,
  );

/**
 * How long a freshly signed contract of this chassis runs, in seconds.
 *
 * Zero means forever: a contract that pays nothing is not on a clock. See
 * BALANCE.contractTermMonthsPerDecade for why the scale is logarithmic.
 */
export function contractTermSeconds(buildingId: string): number {
  const payout = topPayoutOf(buildingId);
  if (payout <= 0) return 0;
  const months = Math.max(
    BALANCE.contractTermMinMonths,
    BALANCE.contractTermMonthsPerDecade * Math.log10(payout),
  );
  return months * BALANCE.monthSeconds;
}
