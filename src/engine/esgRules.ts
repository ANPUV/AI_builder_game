/**
 * ESG predicates with no dependency on the rest of the engine.
 *
 * Same reason `agentRules.ts` exists: the behaviour in `esg.ts` reads and
 * writes the world, so `factory.ts` cannot import it without a cycle — but
 * `placeMachine` still has to know whether a permit freeze is on. Everything
 * both files need lives here, and neither has to import the other.
 */
import { BALANCE, BUILDING_BY_ID, type BuildingTier } from '../data';
import { featureEnabled } from '../data/addons';
import type { CoolingMode, GameState, Machine } from './types';

/** Tiers a permit freeze blocks. Nothing that occupies land gets built during one. */
const PERMIT_TIERS: BuildingTier[] = ['Capacity', 'Silicon', 'Sustainability'];

/** How this node rejects heat. Air is the default because it is what you get by not choosing. */
export const coolingOf = (m: Machine): CoolingMode => m.cooling ?? 'air';

/** Does this chassis have a physical draw at all? Only those get a cooling choice. */
export const hasPower = (buildingId: string): boolean =>
  (BUILDING_BY_ID[buildingId]?.powerKw ?? 0) > 0;

const running = (state: GameState, buildingId: string): boolean =>
  Object.values(state.machines).some(
    (m) => m.buildingId === buildingId && m.enabled && !m.broken,
  );

/** Somebody has to sign the disclosure. Nothing else in the tier works without one. */
export const hasOfficer = (state: GameState): boolean =>
  running(state, 'sustainability_officer');

/** The retrofit is what makes the sealed option selectable at all. */
export const hasClosedLoop = (state: GameState): boolean => running(state, 'closed_loop');

/** Immersion is Act III kit: it arrives with the fab, not with a retrofit. */
export const hasImmersion = (state: GameState): boolean =>
  state.unlockedBuildings.includes('cowos_pack');

/** Which cooling modes this save may actually select right now. */
export function coolingOptions(state: GameState): CoolingMode[] {
  const out: CoolingMode[] = ['air', 'evaporative'];
  if (hasClosedLoop(state)) out.push('closed_loop');
  if (hasImmersion(state)) out.push('immersion');
  return out;
}

/**
 * Is this placement blocked by a permit freeze right now?
 *
 * The build bar greys the cards, but the quick-build keys do not go through it,
 * so — like every other placement rule — this lives where every path passes.
 */
export function permitBlocked(state: GameState, buildingId: string): boolean {
  if (!featureEnabled('esg', state.addons)) return false;
  if (state.esg.permitFreeze <= 0) return false;
  const b = BUILDING_BY_ID[buildingId];
  return !!b && PERMIT_TIERS.includes(b.tier);
}

/**
 * The Footprint the outside world is working from: what you published, or the
 * truth when you have published nothing.
 *
 * Not disclosing is honest by default. That asymmetry is deliberate — the lie
 * has to be an action the player takes, not a state they drift into by
 * ignoring the dialog.
 */
export const effectiveFootprint = (state: GameState): number =>
  state.esg.disclosure?.claimed ?? state.esg.footprint;

/** How far the published number is from the real one. Zero when nothing is published. */
export const disclosureGap = (state: GameState): number =>
  state.esg.disclosure ? Math.max(0, state.esg.footprint - state.esg.disclosure.claimed) : 0;

/** $/kWh right now. The grid index is the player's own buildout coming back at them. */
export const gridPricePerKwh = (state: GameState): number =>
  BALANCE.gridPriceBasePerKwh * state.esg.gridIndex;

/** A brand-new, entirely unmeasured company. */
export const freshEsgState = (): GameState['esg'] => ({
  environmental: 0,
  social: 0,
  governance: 0,
  footprint: 0,
  powerKw: 0,
  waterLitresPerMonth: 0,
  landUse: 0,
  cleanFraction: 0,
  gridIndex: 1,
  carbonRelief: 0,
  disclosure: null,
  auditPending: 0,
  permitFreeze: 0,
  waterFreeze: 0,
  disputeFreeze: 0,
  shockSpike: 0,
  powerPaid: 0,
  waterPaid: 0,
  fines: 0,
  heatRevenue: 0,
});
