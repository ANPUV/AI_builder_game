/**
 * ESG addon.
 *
 * The game's other meters all measure something that lands on the player's own
 * invoice. This one measures what lands on somebody else's — the power, the
 * water, the land, the people and the provenance the factory has been
 * externalising since the first Gaming PC — and then charges for it.
 *
 * Three pillars, three different shapes of consequence (see docs/ESG-ADDON-PLAN.md):
 *
 * - **Environmental** is a bill and a restriction. Power is priced at a grid
 *   index that rises with the player's own buildout, exactly like the hardware
 *   index. Water is nearly free and gets rationed instead, which costs
 *   throughput rather than cash. Land is not billed at all: past a threshold it
 *   simply stops you building.
 * - **Social** feeds the quality system that already exists. A company running
 *   on unpaid annotation ships worse work and loses customers for it.
 * - **Governance** is provenance, and it is what the audit reads.
 *
 * The spine is the disclosure. The gate on the big contracts reads the number
 * you PUBLISHED, so understating it is available, cheap and profitable — until
 * the audit rolls on the gap, and every gated contract stops in the same tick.
 *
 * Every incident here is the breach roll from `simulate.ts` with a different
 * meter in it: quadratic, dt-scaled, and reported through `TickEvents`.
 */
import { BALANCE, BUILDING_BY_ID, RECIPE_BY_ID } from '../data';
import { featureEnabled } from '../data/addons';
import { coolingOf, disclosureGap, gridPricePerKwh, hasOfficer } from './esgRules';
import type { GameState } from './types';

export type Outcome = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): Outcome => ({ ok: false, reason });
const OK: Outcome = { ok: true };

export interface EsgEvents {
  /** Something stopped, and why. The player gets a toast per entry. */
  esgIncidents: { kind: 'water' | 'permit' | 'dispute' | 'shock'; detail: string }[];
  /** A caught understatement: what it cost and how big the gap was. */
  esgFines: { amount: number; gap: number }[];
  /** A commissioned audit finished its observation window. */
  disclosuresPublished: { claimed: number; audited: boolean }[];
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const clamp01 = (n: number): number => clamp(n, 0, 1);

/**
 * Logarithmic, because the ladder spans a Gaming PC at half a kilowatt and Own
 * Datacenter at ten megawatts. Linear, every home node rounds to zero and one
 * datacenter pins the meter at 100 forever.
 */
function logScore(value: number, scale: number, ceiling: number): number {
  if (value <= 0) return 0;
  const top = Math.log10(1 + ceiling / scale);
  if (top <= 0) return 0;
  return clamp((Math.log10(1 + value / scale) / top) * 100, 0, 100);
}

/** The raw physical sums one pass over the machines produces. */
export interface EsgSurvey {
  /** kW after the cooling PUE multiplier. */
  powerKw: number;
  /** Litres per billing month, from the cooling mode each node runs. */
  waterLitresPerMonth: number;
  landUse: number;
  laborLoad: number;
  provenanceRisk: number;
  /** Best clean supply contracted. A PPA is signed for a company, not a rack. */
  cleanFraction: number;
}

export const emptySurvey = (): EsgSurvey => ({
  powerKw: 0,
  waterLitresPerMonth: 0,
  landUse: 0,
  laborLoad: 0,
  provenanceRisk: 0,
  cleanFraction: 0,
});

/**
 * Fold one running node into the survey. Called from the phase-1 loop in
 * `simulate.ts`, next to the exposure and slop sums, so the addon costs one
 * extra function call per machine and no extra pass.
 *
 * Like Exposure, this is architectural rather than momentary: a rack you own
 * draws power whether or not it happens to be mid-craft.
 */
export function surveyNode(
  survey: EsgSurvey,
  buildingId: string,
  recipeId: string | null,
  clock: number,
  cooling: ReturnType<typeof coolingOf>,
): void {
  const b = BUILDING_BY_ID[buildingId];
  if (!b) return;

  const kw = (b.powerKw ?? 0) * clock;
  if (kw > 0) {
    const pue = BALANCE.coolingPue[cooling];
    const litres = BALANCE.coolingLitresPerKwh[cooling];
    survey.powerKw += kw * pue;
    // Water tracks IT load, not the cooling overhead: WUE is quoted per kWh of
    // the work, which is the convention every published figure uses.
    survey.waterLitresPerMonth += kw * BALANCE.hoursPerMonth * litres;
  }

  survey.landUse += b.landUse ?? 0;
  survey.laborLoad += b.laborLoad ?? 0;
  survey.provenanceRisk += b.provenanceRisk ?? 0;
  if (b.cleanFraction) survey.cleanFraction = Math.max(survey.cleanFraction, b.cleanFraction);

  // Where the training corpus came from is a per-craft choice, so the recipe
  // carries its own governance term on top of the chassis's.
  const r = recipeId ? RECIPE_BY_ID[recipeId] : undefined;
  if (r) {
    survey.provenanceRisk += r.provenanceRisk ?? 0;
    if (r.waterLitres) {
      // Water that is not a function of how a building is cooled — the fab uses
      // ultrapure water regardless. Quoted per craft, so scale to a month.
      survey.waterLitresPerMonth += (r.waterLitres / r.seconds) * BALANCE.hoursPerMonth * 3600;
    }
  }
}

/**
 * Turn the survey into the three pillar scores and the headline. Written next
 * to `state.exposure` / `state.slop` / `state.agentDrift` every tick, and — like
 * them — computed whether or not the addon is on, so switching it on mid-run
 * shows a number that was already true.
 */
export function writeEsg(state: GameState, survey: EsgSurvey): void {
  const esg = state.esg;

  esg.powerKw = survey.powerKw;
  esg.waterLitresPerMonth = survey.waterLitresPerMonth;
  esg.landUse = Math.max(0, survey.landUse);
  esg.cleanFraction = clamp01(survey.cleanFraction);

  // A PPA takes the carbon off the score and not one cent off the bill. That
  // asymmetry is the node's whole lesson, and it lives in this one line.
  const carbonKw = survey.powerKw * (1 - esg.cleanFraction);

  const power = logScore(carbonKw, BALANCE.esgPowerScaleKw, BALANCE.esgPowerCeilKw);
  const water = logScore(
    survey.waterLitresPerMonth,
    BALANCE.esgWaterScaleLitres,
    BALANCE.esgWaterCeilLitres,
  );
  const land = clamp((esg.landUse / BALANCE.esgLandCeil) * 100, 0, 100);

  const environmental =
    BALANCE.esgPowerWeight * power +
    BALANCE.esgWaterWeight * water +
    BALANCE.esgLandWeight * land;

  // Credits buy the number down, never below zero, and they are the cheapest
  // lever in the addon by a wide margin — which is the first thing worth
  // noticing about them.
  esg.environmental = clamp(environmental - esg.carbonRelief, 0, 100);
  esg.social = clamp((Math.max(0, survey.laborLoad) / BALANCE.esgLaborCeil) * 100, 0, 100);
  esg.governance = clamp(
    (Math.max(0, survey.provenanceRisk) / BALANCE.esgProvenanceCeil) * 100,
    0,
    100,
  );

  esg.footprint = clamp(
    BALANCE.esgEnvWeight * esg.environmental +
      BALANCE.esgSocialWeight * esg.social +
      BALANCE.esgGovernanceWeight * esg.governance,
    0,
    100,
  );

  // The grid index, built exactly like the hardware price index: partly your
  // progress, partly your own provisioned load. Progress, not wall clock — a
  // slow player is not punished for thinking.
  const progress = clamp01(state.completedMilestones.length / BALANCE.priceIndexProgressMilestones);
  const load = clamp01(survey.powerKw / BALANCE.gridIndexSaturationKw);
  esg.gridIndex =
    1 +
    (BALANCE.gridIndexMax - 1) *
      clamp01(BALANCE.gridIndexProgressWeight * progress + BALANCE.gridIndexLoadWeight * load);
}

/**
 * What the meters cost per billing month, in dollars.
 *
 * Folded into `burnPerMonth` by `simulate.ts` rather than debited separately,
 * so the power bill flows through the whole finance report — a top bar showing
 * a net figure that quietly excluded the electricity would be the same bug the
 * addon exists to be about.
 */
export function esgBillPerMonth(state: GameState): number {
  if (!featureEnabled('esg', state.addons)) return 0;
  const kwh = state.esg.powerKw * BALANCE.hoursPerMonth;
  const power = kwh * gridPricePerKwh(state) * (demandResponseRunning(state) ? 0.88 : 1);
  const water = state.esg.waterLitresPerMonth * BALANCE.waterPricePerLitre;
  return power + water;
}

/** Shedding load when the grid is tight cuts the bill and not the carbon. */
function demandResponseRunning(state: GameState): boolean {
  return Object.values(state.machines).some(
    (m) => m.buildingId === 'demand_response' && m.enabled && !m.broken,
  );
}

/** Split of the bill, for the report. Same arithmetic, reported rather than charged. */
export function esgBillSplit(state: GameState): { power: number; water: number } {
  const kwh = state.esg.powerKw * BALANCE.hoursPerMonth;
  return {
    power: kwh * gridPricePerKwh(state) * (demandResponseRunning(state) ? 0.88 : 1),
    water: state.esg.waterLitresPerMonth * BALANCE.waterPricePerLitre,
  };
}

// --- the disclosure -------------------------------------------------------

/**
 * Publish a number.
 *
 * `claimed` is only honoured when self-certifying: an assurance firm reports
 * what it found, which is the entire difference between the two routes and the
 * reason the honest one costs twenty times more.
 *
 * Self-certification lands immediately. A commissioned audit starts an
 * observation window — the SOC 2 lesson, reused: you cannot pay to skip time.
 */
export function publishDisclosure(
  state: GameState,
  mode: 'audit' | 'self',
  claimed?: number,
): Outcome {
  if (!featureEnabled('esg', state.addons)) return fail('ESG is switched off in settings');
  if (!hasOfficer(state)) {
    return fail('Place a Sustainability Officer first — somebody has to sign it');
  }
  if (state.esg.auditPending > 0) return fail('An audit is already in its observation window');

  if (mode === 'audit') {
    if (state.credits < BALANCE.esgAuditCost) {
      return fail(`An assurance engagement costs ${Math.round(BALANCE.esgAuditCost)}`);
    }
    state.credits -= BALANCE.esgAuditCost;
    state.esg.auditPending = BALANCE.esgAuditSeconds;
    return OK;
  }

  if (state.credits < BALANCE.esgSelfCertifyCost) {
    return fail(`Filing costs ${Math.round(BALANCE.esgSelfCertifyCost)}`);
  }
  // You may publish anything at or below the truth. Claiming a WORSE number
  // than you run is allowed and pointless, which is exactly how it should read.
  const value = clamp(claimed ?? state.esg.footprint, 0, 100);
  state.credits -= BALANCE.esgSelfCertifyCost;
  state.esg.disclosure = {
    claimed: value,
    actual: state.esg.footprint,
    publishedAt: state.elapsed,
    audited: false,
  };
  return OK;
}

/** Buy a block of credits. Relief decays, so this is a subscription wearing a costume. */
export function buyCarbonCredits(state: GameState): Outcome {
  if (!featureEnabled('esg', state.addons)) return fail('ESG is switched off in settings');
  if (!Object.values(state.machines).some((m) => m.buildingId === 'carbon_desk' && m.enabled)) {
    return fail('Place a Carbon Credits Desk first');
  }
  if (state.esg.carbonRelief >= BALANCE.carbonCreditMaxRelief) {
    return fail('Offsets will not carry any more of this than they already do');
  }
  if (state.credits < BALANCE.carbonCreditCost) {
    return fail(`A block of credits costs ${Math.round(BALANCE.carbonCreditCost)}`);
  }
  state.credits -= BALANCE.carbonCreditCost;
  state.esg.carbonRelief = Math.min(
    BALANCE.carbonCreditMaxRelief,
    state.esg.carbonRelief + BALANCE.carbonCreditRelief,
  );
  return OK;
}

// --- the tick -------------------------------------------------------------

/** Quadratic in the meter, dt-scaled: the breach roll, with a different number in it. */
const rolls = (ratePerMinute: number, dt: number): boolean =>
  Math.random() < (ratePerMinute / 60) * dt;

/**
 * One tick of the addon. Runs after the node loop, so `state.status` is current,
 * and after `tickVenture`, so nothing here can be mistaken for financing.
 *
 * Gated internally rather than at the call site, because the freezes and the
 * carbon relief have to keep decaying for a player who switches the addon off
 * mid-incident — otherwise a permit freeze outlives the addon that caused it.
 */
export function tickEsg(state: GameState, dt: number, events: EsgEvents): void {
  const esg = state.esg;

  // Decay everything with a clock on it, addon on or off.
  esg.permitFreeze = Math.max(0, esg.permitFreeze - dt);
  esg.waterFreeze = Math.max(0, esg.waterFreeze - dt);
  esg.disputeFreeze = Math.max(0, esg.disputeFreeze - dt);
  esg.shockSpike = Math.max(0, esg.shockSpike - (BALANCE.exportShockIndex / BALANCE.exportShockSeconds) * dt);
  esg.carbonRelief = Math.max(
    0,
    esg.carbonRelief - BALANCE.carbonCreditDecayPerMonth * (dt / BALANCE.monthSeconds),
  );

  if (!featureEnabled('esg', state.addons)) return;

  // Record what the bill actually took. The charge itself rides on
  // `burnPerMonth` in simulate.ts — this is bookkeeping for the report, not a
  // second debit.
  const split = esgBillSplit(state);
  esg.powerPaid += (split.power / BALANCE.monthSeconds) * dt;
  esg.waterPaid += (split.water / BALANCE.monthSeconds) * dt;

  // An audit's observation window. You cannot pay to skip time.
  if (esg.auditPending > 0) {
    esg.auditPending = Math.max(0, esg.auditPending - dt);
    if (esg.auditPending === 0) {
      esg.disclosure = {
        claimed: esg.footprint,
        actual: esg.footprint,
        publishedAt: state.elapsed,
        audited: true,
      };
      events.disclosuresPublished.push({ claimed: esg.footprint, audited: true });
    }
  }

  // --- water: costs throughput, not cash ---------------------------------
  if (esg.waterFreeze <= 0 && esg.environmental > 0 && esg.waterLitresPerMonth > 0) {
    const p = BALANCE.waterRestrictionRateAt100 * (esg.environmental / 100) ** 2;
    if (rolls(p, dt)) {
      esg.waterFreeze = BALANCE.waterRestrictionSeconds;
      events.esgIncidents.push({
        kind: 'water',
        detail: 'Water restriction: cooling is rationed and every rack you own is running at half.',
      });
    }
  }

  // --- land: costs the expansion you had already budgeted ----------------
  if (esg.permitFreeze <= 0 && esg.landUse > BALANCE.landPermitThreshold) {
    const p = BALANCE.landPermitRatePerMin * (esg.landUse / BALANCE.esgLandCeil) ** 2;
    if (rolls(p, dt)) {
      esg.permitFreeze = BALANCE.permitFreezeSeconds;
      events.esgIncidents.push({
        kind: 'permit',
        detail: 'Planning moratorium: no new capacity, silicon or sustainability sites for now.',
      });
    }
  }

  // --- people: costs time ------------------------------------------------
  if (esg.disputeFreeze <= 0 && esg.social > 0) {
    const p = BALANCE.disputeRatePerMin * (esg.social / 100) ** 2;
    if (rolls(p, dt)) {
      esg.disputeFreeze = BALANCE.disputeSeconds;
      events.esgIncidents.push({
        kind: 'dispute',
        detail: 'Labour dispute: the annotation and moderation queues have stopped.',
      });
    }
  }

  // --- supply chain: costs the hardware price ----------------------------
  if (esg.shockSpike <= 0 && esg.governance > 0) {
    const p = BALANCE.exportShockRatePerMin * (esg.governance / 100) ** 2;
    if (rolls(p, dt)) {
      esg.shockSpike = BALANCE.exportShockIndex;
      events.esgIncidents.push({
        kind: 'shock',
        detail: 'Export controls: the parts you cannot trace just got more expensive.',
      });
    }
  }

  // --- the audit ---------------------------------------------------------
  // Rolls on the GAP, not on the footprint. An honest player is never at risk
  // here however large their number is — and an honest player who published at
  // 30 and then built a datacenter is, which is the failure this models.
  const d = esg.disclosure;
  if (d) {
    const gap = disclosureGap(state);
    if (gap > 0) {
      const p =
        BALANCE.esgAuditRateAt100 * (gap / 100) ** 2 * (d.audited ? BALANCE.auditedShield : 1);
      if (rolls(p, dt)) {
        const loss = Math.max(BALANCE.esgFineMin, state.credits * BALANCE.esgFineFraction);
        state.credits -= loss;
        esg.fines += loss;
        // Voided, not corrected. Every contract that needed one stops in this
        // same tick, which is the part that actually hurts.
        esg.disclosure = null;
        state.slopExposureSpike = Math.max(state.slopExposureSpike, BALANCE.esgFineExposure);
        events.esgFines.push({ amount: loss, gap });
      }
    }
  }
}
