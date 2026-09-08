import {
  BALANCE,
  BUILDING_BY_ID,
  ITEM_BY_ID,
  LINK_RATE_PER_SEC,
  MILESTONES,
  featureEnabled,
  trackEnabled,
  building,
  listingFor,
  priceAt,
  recipe,
} from '../data';
import type { Track } from '../data';
import type { Recipe } from '../data';
import { SHARED, type Pool } from '../data/vendors';
import { spawnOffer, tickMarket } from './market';
import { tickVenture } from './venture';
import {
  emptySurvey,
  esgBillPerMonth,
  surveyNode,
  tickEsg,
  writeEsg,
  type EsgEvents,
} from './esg';
import { coolingOf, effectiveFootprint } from './esgRules';
import {
  agentHasWork,
  agentHeadcount,
  agentRoleOf,
  agentsPlaced,
  hasConsole,
  marketingBoosts,
  onAgentCraft,
  tickAgents,
  type AgentEvents,
} from './agents';
import { onOpsCraft, type HumanOpsEvents } from './humanOps';
import type { ContractOffer, GameState, Machine, MachineStatus, PoolReport } from './types';

export interface TickEvents extends AgentEvents, EsgEvents, HumanOpsEvents {
  /** Milestone ids completed during this batch of ticks. */
  milestonesCompleted: string[];
  /** One entry per breach suffered: the $ lost. */
  breaches: number[];
  /** Contract leads that landed on the board. */
  offersArrived: ContractOffer[];
  /** Contract leads whose window closed unsigned. */
  offersExpired: ContractOffer[];
  /** One entry per node that blew up this batch. */
  blowouts: { machineId: string; buildingName: string; lostPartValue: number }[];
  /** IP and legal fines: what happened and what it cost. */
  fines: { kind: 'ip' | 'legal'; amount: number }[];
  /** Contract nodes lost to repeated quality misses. */
  contractsLost: { machineId: string; buildingName: string }[];
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Throughput this capacity node supplies, letting the recipe override the chassis. */
export function machineComputeSupply(m: Machine): number {
  const b = building(m.buildingId);
  if (!b || b.kind !== 'capacity') return 0;
  const r = recipe(m.recipeId);
  return (r?.computeSupply ?? b.computeSupply) * m.clock;
}

/**
 * How many working MACHINES of a tier are on the canvas.
 *
 * Capacity only: the customer is inspecting hardware that serves their model,
 * not the shop you bought the parts from. A Hugging Face account is not a
 * server, and counting it would let the audit pass with nothing running.
 *
 * A blown node does not count either — which is exactly how a $45 power supply
 * becomes a lost contract.
 */
export function onSiteCount(state: GameState, tier: string): number {
  let n = 0;
  for (const m of Object.values(state.machines)) {
    if (!m.enabled || m.broken) continue;
    const b = BUILDING_BY_ID[m.buildingId];
    if (b?.tier === tier && b.kind === 'capacity') n += 1;
  }
  return n;
}

/**
 * Which pool a node trades against.
 *
 * Model nodes call one provider's API, so they are limited by that provider's
 * rate limit and nothing else. Everything you run yourself — retrieval, evals,
 * agents, self-hosted serving, the silicon branch — draws on the shared pool
 * that your own and rented hardware feeds.
 *
 * A vendor-scoped capacity node with no provider chosen returns null: it is
 * paying for nothing and supplies nothing.
 */
export function poolOf(m: Machine): Pool | null {
  const b = building(m.buildingId);
  if (!b) return null;
  if (b.kind === 'capacity') {
    if (!b.vendorScoped) return SHARED;
    return (m.vendor as Pool | undefined) ?? null;
  }
  return (b.vendor as Pool | undefined) ?? SHARED;
}

/**
 * How much of `itemId` a node may hold on its input side.
 *
 * At least one craft's worth, always. A flat cap below a recipe's input
 * requirement makes that recipe impossible to start — the buffer fills, the
 * node reports "starved" forever, and nothing in the UI explains why. The
 * frontier pretraining run needs 3,000 training tokens against a default cap
 * of 400, which deadlocked the last milestone in the game.
 */
export function inputCap(r: Recipe | undefined, itemId: string): number {
  const need =
    (r?.inputs.find((i) => i.itemId === itemId)?.qty ?? 0) ||
    (r?.catalysts?.find((i) => i.itemId === itemId)?.qty ?? 0);
  return Math.max(BALANCE.bufferPerItem, need);
}

/**
 * Does the node hold everything one craft needs?
 *
 * Catalysts count toward this and are never spent. Serving a model does not
 * use the model up — the weights sit in the buffer and stay there.
 */
export function hasInputs(m: Machine, r: Recipe): boolean {
  return (
    r.inputs.every((s) => (m.inputs[s.itemId] ?? 0) >= s.qty - 1e-9) &&
    (r.catalysts ?? []).every((s) => (m.inputs[s.itemId] ?? 0) >= s.qty - 1e-9)
  );
}

/** Is there room in the output buffer for one craft's worth of product? */
export function hasOutputRoom(m: Machine, r: Recipe): boolean {
  return r.outputs.every(
    (s) => (m.outputs[s.itemId] ?? 0) + s.qty <= BALANCE.bufferPerItem + 1e-9,
  );
}

/** Units per minute this node produces of `itemId` at its current clock. */
export function machineRatePerMin(m: Machine, itemId: string): number {
  const r = recipe(m.recipeId);
  if (!r) return 0;
  const stack = r.outputs.find((s) => s.itemId === itemId);
  if (!stack) return 0;
  return (stack.qty / r.seconds) * 60 * m.clock;
}

/** Units per minute this node consumes of `itemId` at its current clock. */
export function machineDrawPerMin(m: Machine, itemId: string): number {
  const r = recipe(m.recipeId);
  if (!r) return 0;
  const stack = r.inputs.find((s) => s.itemId === itemId);
  if (!stack) return 0;
  return (stack.qty / r.seconds) * 60 * m.clock;
}

/** kTPM this node draws at its current clock, ignoring throttling. */
export function machineComputeDraw(m: Machine): number {
  const b = building(m.buildingId);
  if (!b) return 0;
  return b.computeDraw * m.clock ** BALANCE.clockExponent;
}

/** $ per game-minute this node burns in subscriptions and rent. */
export function machineBurn(m: Machine): number {
  const b = building(m.buildingId);
  if (!b || !m.enabled) return 0;
  return b.monthlyCost;
}

/** $ per minute of API spend at full tilt. */
export function machineCogsPerMin(m: Machine): number {
  const r = recipe(m.recipeId);
  if (!r?.cost) return 0;
  return (r.cost / r.seconds) * 60 * m.clock;
}

/** $ per minute of contract revenue at full tilt. */
export function machineRevenuePerMin(m: Machine): number {
  const r = recipe(m.recipeId);
  if (!r?.payout) return 0;
  return (r.payout / r.seconds) * 60 * m.clock;
}

/**
 * Blow up a node and everything grouped with it.
 *
 * A single node failing is an inconvenience. A hull of six nodes greying out at
 * once, having just destroyed a card worth more than the rest of the build, is
 * the reason groups exist.
 */
export function breakGroup(state: GameState, m: Machine): void {
  const victims = m.groupId
    ? Object.values(state.machines).filter((o) => o.groupId === m.groupId)
    : [m];
  for (const v of victims) {
    v.broken = true;
    v.crafting = false;
    v.progress = 0;
    v.armed = false;
    // Whatever the bay was holding is destroyed with it.
    if (v.id === m.id) v.inputs = {};
    state.status[v.id] = 'broken';
  }
}

/** Remove a node and its links. Used when a customer walks for good. */
function dropMachine(state: GameState, id: string): void {
  for (const link of Object.values(state.links)) {
    if (link.fromId === id || link.toId === id) delete state.links[link.id];
  }
  delete state.machines[id];
  delete state.status[id];
}

/**
 * Advance the world by one fixed timestep. Mutates `state`.
 *
 * Order of operations each tick:
 *   1. survey compute — capacity supplied vs. throughput demanded
 *   2. survey exposure — the sum of data risk across everything running
 *   3. charge rent, roll for a breach
 *   4. run every node at `clock * satisfaction` (capacity nodes are exempt)
 *   5. move items along links, splitting a contested output proportionally
 *   6. age the contract board — retire lapsed leads, roll for a new one
 *   7. check the next milestone
 */
export function step(state: GameState, dt: number, events: TickEvents): void {
  const machines = Object.values(state.machines);

  // 1 --- compute survey, per pool -----------------------------------------
  // Rate limits do not pool across providers, so each vendor is surveyed on its
  // own. One starved provider throttles that provider's nodes and nobody else's.
  const pools: Record<string, PoolReport> = {};
  const pool = (p: string): PoolReport =>
    (pools[p] ??= { demandKtpm: 0, supplyKtpm: 0, satisfaction: 1, drawers: 0 });

  // Free tiers are held back: they only count once we know how many nodes are
  // drawing on their pool.
  const freeTiers: { p: string; supply: number; serves: number }[] = [];
  let exposure = 0;
  let slop = 0;
  let drift = 0;
  let burnPerMonth = 0;
  // The ESG addon's physical survey rides along in this same pass: the power,
  // water, land, labour and provenance the factory has been externalising.
  const survey = emptySurvey();

  // The servers you already run. Only the shared pool gets this; a provider's
  // rate limit is not something you can self-provision.
  pool(SHARED).supplyKtpm += BALANCE.ownServersKtpm;

  for (const m of machines) {
    const b = building(m.buildingId);
    if (!b || !m.enabled) continue;
    // A blown node still bills. That is the whole point of it: the electricity
    // meter does not care that the machine is dead.
    burnPerMonth += b.monthlyCost;
    if (m.broken) continue;

    const r = recipe(m.recipeId);
    if (!r) continue;

    // Risk is architectural: wiring DeepSeek in exposes you whether or not it
    // happens to be mid-craft right now.
    exposure += b.dataRisk;
    slop += b.slopRisk ?? 0;
    // Drift is how much of the company is acting without you. The Reviewer is
    // the only negative term, which is what makes oversight a purchase.
    drift += b.agentDrift ?? 0;
    // Footprint is architectural too: a rack you own draws power whether or
    // not it happens to be mid-craft right now.
    surveyNode(survey, m.buildingId, m.recipeId, m.clock, coolingOf(m));

    const p = poolOf(m);
    if (p === null) continue; // capacity node with no provider chosen
    if (!wouldWork(m, r)) continue;

    if (b.kind === 'capacity') {
      // A water restriction rations cooling, and a rack you cannot cool is a
      // rack you cannot run flat out. This costs throughput, not cash, which is
      // what makes it the nastiest event in the ESG addon.
      const curtail = curtailFactor(state, b.powerKw);
      if (b.servesNodes !== undefined) {
        freeTiers.push({ p, supply: machineComputeSupply(m) * curtail, serves: b.servesNodes });
      } else {
        pool(p).supplyKtpm += machineComputeSupply(m) * curtail;
      }
    } else {
      const slot = pool(p);
      slot.demandKtpm += machineComputeDraw(m);
      slot.drawers += 1;
    }
  }

  // A free tier covers exactly `servesNodes` nodes. Put a second node on the
  // same provider and the allowance stops counting — that is the wall that
  // makes the first paid tier worth buying.
  for (const ft of freeTiers) {
    if (pool(ft.p).drawers <= ft.serves) pool(ft.p).supplyKtpm += ft.supply;
  }

  let demandKtpm = 0;
  let supplyKtpm = 0;
  let worst = 1;
  const tight: string[] = [];
  for (const [id, p] of Object.entries(pools)) {
    p.satisfaction = p.demandKtpm <= 0 ? 1 : Math.min(1, p.supplyKtpm / p.demandKtpm);
    demandKtpm += p.demandKtpm;
    supplyKtpm += p.supplyKtpm;
    if (p.satisfaction < 0.999) tight.push(id);
    worst = Math.min(worst, p.satisfaction);
  }
  tight.sort((a, b) => pools[a].satisfaction - pools[b].satisfaction);
  state.compute = { pools, demandKtpm, supplyKtpm, satisfaction: worst, tight };

  // A legal fine spikes Exposure for a minute, then it decays away.
  state.slopExposureSpike = Math.max(0, (state.slopExposureSpike ?? 0) - (BALANCE.legalFineExposure / BALANCE.legalFineExposureSeconds) * dt);
  state.exposure = Math.max(0, exposure + state.slopExposureSpike);
  state.slop = Math.max(0, slop);
  state.agentDrift = Math.max(0, Math.min(100, drift));
  // Written whether or not the addon is on, so switching it on mid-run shows a
  // number that was already true rather than one that starts at zero.
  writeEsg(state, survey);
  // Folded into the burn rather than debited separately, so the power bill
  // flows through operatingPerMin and the top bar cannot show a net figure that
  // quietly excludes the electricity.
  burnPerMonth += esgBillPerMonth(state);

  // 1b --- the hardware price index ----------------------------------------
  // Progress, not wall clock: a slow player is not punished for thinking. The
  // buildout term is the player's own share of the same DRAM, NAND and GDDR7
  // supply their home rig needs — which is what makes the tooltip land.
  const progress = state.completedMilestones.length / BALANCE.priceIndexProgressMilestones;
  const buildout = supplyKtpm / BALANCE.priceIndexSaturationKtpm;
  state.priceIndex =
    1 +
    (BALANCE.priceIndexMax - 1) *
      clamp01(
        BALANCE.priceIndexProgressWeight * clamp01(progress) +
          BALANCE.priceIndexBuildoutWeight * clamp01(buildout),
      ) +
    // An export-control shock (ESG addon) lands on top and decays away, the
    // same shape a legal fine's Exposure spike has.
    state.esg.shockSpike;

  // 2 --- rent --------------------------------------------------------------
  state.credits -= (burnPerMonth / BALANCE.monthSeconds) * dt;

  // 3 --- breach roll -------------------------------------------------------
  state.breachFreeze = Math.max(0, state.breachFreeze - dt);
  if (state.exposure > 0) {
    // Quadratic in exposure: a little risk is survivable, a lot is not.
    const perMinute =
      BALANCE.breachRatePerMinuteAt100 * (state.exposure / 100) ** 2;
    if (Math.random() < (perMinute / 60) * dt) {
      const loss = Math.min(
        BALANCE.breachCostMax,
        Math.max(BALANCE.breachCostMin, state.credits * BALANCE.breachCostFraction),
      );
      state.credits -= loss;
      state.breaches += 1;
      state.breachLosses += loss;
      state.breachFreeze = BALANCE.breachFreezeSeconds;
      events.breaches.push(loss);
    }
  }

  // 3b --- hardware failure ------------------------------------------------
  // A no-name supply with no ATX 3.1 excursion headroom, behind a card that
  // spikes past twice its rating for microseconds. The roll is on the build,
  // and a blowout takes the whole group with it.
  for (const m of machines) {
    if (m.repairing) {
      m.repairing = Math.max(0, m.repairing - dt);
      if (m.repairing === 0) m.broken = false;
      continue;
    }
    if (m.broken || !m.enabled) continue;
    const r = recipe(m.recipeId);
    if (!r?.failureRatePerMin) continue;
    if (Math.random() >= (r.failureRatePerMin / 60) * dt) continue;

    const b = building(m.buildingId);
    // Whatever the bay was holding is gone at today's replacement price.
    let lost = 0;
    for (const s of r.inputs) {
      const it = ITEM_BY_ID[s.itemId];
      if (it) lost += priceAt(it.value, it.priceElasticity, state.priceIndex) * s.qty;
    }
    breakGroup(state, m);
    events.blowouts.push({
      machineId: m.id,
      buildingName: b?.name ?? 'A node',
      lostPartValue: Math.round(lost),
    });
  }

  // 4 --- run nodes ---------------------------------------------------------
  let revenuePerMin = 0;
  let cogsPerMin = 0;
  const esgOn = featureEnabled('esg', state.addons);

  for (const m of machines) {
    const b = building(m.buildingId);
    if (!b) continue;

    if (!m.enabled) {
      state.status[m.id] = 'disabled';
      continue;
    }
    if (m.broken) {
      state.status[m.id] = 'broken';
      continue;
    }
    const r = recipe(m.recipeId);
    if (!r) {
      state.status[m.id] = 'idle';
      continue;
    }

    const isContract = b.kind === 'contract';

    // Customers walk away while you are over their Exposure ceiling, and
    // everyone stops answering the phone during an incident. Work already in
    // flight is honoured, but the node reports the hold either way — a frozen
    // contract must not sit there showing a green "Running".
    //
    // The third case is the site audit: a customer who bought a box on their
    // own premises sends someone to look at it, every tick, forever.
    const siteShort =
      r.requiresOnSite !== undefined &&
      onSiteCount(state, r.requiresOnSite.tier) < r.requiresOnSite.count;
    const onHold =
      siteShort ||
      (isContract &&
        (state.breachFreeze > 0 ||
          (r.maxExposure !== undefined && state.exposure > r.maxExposure)));

    // The ESG addon's own gate. It reads the number you PUBLISHED, falling back
    // to the truth when you have published nothing — so not disclosing is
    // honest by default and the lie has to be chosen. Reported separately from
    // `audited` so the inspector can say which of the two doors is shut.
    const esgHold =
      isContract &&
      esgOn &&
      ((r.requiresDisclosure === true && state.esg.disclosure === null) ||
        (r.maxFootprint !== undefined && effectiveFootprint(state) > r.maxFootprint));

    // A labour dispute stops the part of the factory that runs on people.
    const disputed = esgOn && state.esg.disputeFreeze > 0 && (b.laborLoad ?? 0) > 0;

    // The term ran out. Unlike an Exposure hold this is not a door that swings
    // back open on its own, so it is checked ahead of the craft loop rather
    // than inside `if (!m.crafting)`: the node freezes where it stands, keeps
    // its progress and its buffers, and stays there until somebody re-signs it.
    if (isContract && m.termEndsAt !== undefined && state.elapsed >= m.termEndsAt) {
      state.status[m.id] = 'expired';
      continue;
    }

    if (!m.crafting) {
      if (onHold) {
        state.status[m.id] = 'audited';
        continue;
      }
      if (esgHold) {
        state.status[m.id] = 'disclosed';
        continue;
      }
      if (disputed) {
        state.status[m.id] = 'disputed';
        continue;
      }
      // An agent with nobody to report to does nothing — and still bills. The
      // Console is the gate, and the reason the first thing you buy in this
      // addon is a manager rather than a worker.
      if (b.kind === 'agent' && agentRoleOf(m) !== 'console' && !hasConsole(state)) {
        state.status[m.id] = 'unmanaged';
        continue;
      }
      // A specialist whose tier is dry waits, spends no tokens, and bills the
      // full subscription. That is the cost the focus dropdown lets you take on.
      if (b.kind === 'agent' && !agentHasWork(state, m)) {
        state.status[m.id] = 'unfocused';
        continue;
      }
      // A manual recipe never starts on its own. This is the entire difference
      // between running a content mill and building one.
      if (r.manual && !m.armed) {
        state.status[m.id] = 'awaiting';
        continue;
      }
      if (!hasInputs(m, r)) {
        state.status[m.id] = 'starved';
        continue;
      }
      if (!hasOutputRoom(m, r)) {
        state.status[m.id] = 'blocked';
        continue;
      }
      if (r.cost && state.credits < r.cost) {
        state.status[m.id] = 'broke';
        continue;
      }
      if (r.cost) state.credits -= r.cost;
      for (const s of r.inputs) m.inputs[s.itemId] = (m.inputs[s.itemId] ?? 0) - s.qty;
      m.crafting = true;
      m.armed = false;
      m.progress = 0;
    }

    const isCapacity = b.kind === 'capacity';
    // A node is limited by ITS provider's rate limit, not by the worst one
    // anywhere on the canvas.
    const myPool = poolOf(m);
    const satisfaction = isCapacity || myPool === null
      ? 1
      : (state.compute.pools[myPool]?.satisfaction ?? 1);
    const rate = m.clock * (isCapacity ? 1 : satisfaction);
    if (rate <= 0) {
      state.status[m.id] = 'throttled';
      continue;
    }

    m.progress += dt * rate;
    if (m.progress >= r.seconds) {
      // Risk 2, distraction: the craft finishes, and it produced something
      // nobody wants. The tokens are spent either way.
      const distracted =
        r.slopGenerated &&
        Math.random() <
          BALANCE.distractionBase + BALANCE.distractionPerSlop * state.slop;

      if (!distracted) {
        for (const s of r.outputs) m.outputs[s.itemId] = (m.outputs[s.itemId] ?? 0) + s.qty;
      }

      // An agent's whole output is what it DOES. The completed cycle is the
      // close attempt, or the chain it just wired.
      if (b.kind === 'agent') onAgentCraft(state, m, events);
      // A desk of people finishing a ninety-second call. Ungated: no addon, no
      // console, no agent runs — see engine/humanOps.ts.
      if (b.opsRole === 'renewals') onOpsCraft(state, events);

      if (r.payout !== undefined) {
        let payout = r.payout;

        if (r.slopSale) {
          const units = r.inputs.reduce((n, s) => n + s.qty, 0);
          const slopSq = (state.slop / 100) ** 2;

          // Risk 3, quality: they pay a third and they remember it. Three
          // strikes and the customer is gone for good.
          //
          // A clean delivery works one off again. Strikes are a rolling
          // reputation, not a lifetime tally: without the decay every slop
          // contract in the game eventually dies to chance alone, however well
          // the player is running it, which teaches nothing.
          if (Math.random() < BALANCE.qualityMissRateAt100 * slopSq) {
            payout *= BALANCE.qualityMissPayoutFraction;
            m.strikes = (m.strikes ?? 0) + 1;
          } else if (m.strikes && Math.random() < BALANCE.strikeDecayChance) {
            m.strikes -= 1;
          }

          // Risk 1, IP: somebody recognises their work in your output. The
          // Legal Desk halves the odds, which is the only lever you get.
          const hasLegal = Object.values(state.machines).some(
            (o) => o.enabled && !o.broken && o.buildingId === 'legal_desk',
          );
          const ipOdds = BALANCE.ipFineRateAt100 * slopSq * (hasLegal ? 0.5 : 1);
          if (Math.random() < ipOdds) {
            const fine = Math.round(BALANCE.ipFinePerUnit * units);
            state.credits -= fine;
            state.slopFines += fine;
            m.outputs.dmca_notice = (m.outputs.dmca_notice ?? 0) + 1;
            events.fines.push({ kind: 'ip', amount: fine });
          }

          // Risk 4, legal: age assurance, and a payment processor that has
          // read the news. Only the NSFW ladder draws this one.
          if (r.slopSale === 'nsfw' && Math.random() < BALANCE.legalFineRateAt100 * slopSq) {
            const fine = Math.max(
              BALANCE.legalFineMin,
              Math.round(state.credits * BALANCE.legalFineFraction),
            );
            state.credits -= fine;
            state.slopFines += fine;
            state.slopExposureSpike = BALANCE.legalFineExposure;
            events.fines.push({ kind: 'legal', amount: fine });
          }
        }

        state.credits += payout;
        m.revenueEarned = (m.revenueEarned ?? 0) + payout;
        // Heat sold back to a district network. Tracked separately because it
        // is the only line in the ESG addon that runs the other way, and the
        // report's whole argument rests on being able to show it.
        if (b.addon === 'esg') state.esg.heatRevenue += payout;
        // Only work actually SOLD counts toward the tech tree. A zero-payout
        // contract still delivers — which is what makes Post To Feed work.
        for (const s of r.inputs) {
          state.delivered[s.itemId] = (state.delivered[s.itemId] ?? 0) + s.qty;
        }

        if ((m.strikes ?? 0) >= BALANCE.strikesBeforeLoss) {
          events.contractsLost.push({ machineId: m.id, buildingName: b.name });
          dropMachine(state, m.id);
          continue;
        }
      }
      m.crafting = false;
      m.progress = 0;
    }

    const eff = isCapacity ? 1 : satisfaction;
    revenuePerMin += machineRevenuePerMin(m) * eff;
    cogsPerMin += machineCogsPerMin(m) * eff;
    state.status[m.id] = onHold
      ? 'audited'
      : esgHold
        ? 'disclosed'
        : disputed
          ? 'disputed'
          : isCapacity && esgOn && state.esg.waterFreeze > 0 && (b.powerKw ?? 0) > 0
            ? 'curtailed'
            : !isCapacity && satisfaction < 0.999
              ? 'throttled'
              : 'running';
  }

  // Contracts pay in lumps, so the instantaneous rate swings wildly. Smooth it
  // with an EMA (~8s window) so the top bar reads as a trend, not a strobe.
  const k = Math.min(1, dt / 8);
  const prev = state.finance;
  const smoothedRevenue = prev.revenuePerMin + (revenuePerMin - prev.revenuePerMin) * k;
  const smoothedCogs = prev.cogsPerMin + (cogsPerMin - prev.cogsPerMin) * k;
  const operatingPerMin =
    smoothedRevenue - smoothedCogs - (burnPerMonth / BALANCE.monthSeconds) * 60;
  state.finance = {
    burnPerMonth,
    revenuePerMin: smoothedRevenue,
    cogsPerMin: smoothedCogs,
    operatingPerMin,
    // Both filled in by tickVenture immediately below, which is the only thing
    // that knows what financing actually took this tick.
    financingPerMin: 0,
    netPerMin: operatingPerMin,
  };

  // 4b --- Venture Capital addon: revenue-share charge, loan repayment ------
  // Reads state.finance, so it has to run after the block above.
  tickVenture(state, dt);

  // 4c --- Agentic Ops addon: churn, and the runaway roll -------------------
  // After the run loop, so `state.status` reflects this tick: loyalty is
  // earned by a contract that is actually running, not one merely placed.
  tickAgents(state, dt, events);

  // 4d --- ESG addon: the bill's bookkeeping, the incidents, the audit -------
  // After the run loop, so `state.status` is current, and after tickVenture so
  // nothing here can be mistaken for financing.
  tickEsg(state, dt, events);

  // 5 --- move items along links -------------------------------------------
  transfer(state, dt);

  // 6 --- the contract board ------------------------------------------------
  // Marketing agents skew WHICH listing is drawn, never how often one is.
  tickMarket(state, dt, events, marketingBoosts(state));

  // 7 --- milestones --------------------------------------------------------
  checkMilestones(state, events);

  state.elapsed += dt;
}

/**
 * What a capacity node still supplies while cooling water is rationed. 1 when
 * the ESG addon is off, when no restriction is running, or for a rate limit
 * bought from somebody else — you cannot ration a bill.
 */
function curtailFactor(state: GameState, powerKw: number | undefined): number {
  if (!featureEnabled('esg', state.addons)) return 1;
  if (state.esg.waterFreeze <= 0) return 1;
  if (!powerKw) return 1;
  return BALANCE.waterCurtailmentFactor;
}

function wouldWork(m: Machine, r: Recipe): boolean {
  return m.crafting || (hasInputs(m, r) && hasOutputRoom(m, r));
}

/**
 * Link transfer. Links sharing a source output port split it proportionally to
 * what each downstream node has room for, so a splitter behaves like one
 * instead of starving whichever link happens to be later in the map.
 */
function transfer(state: GameState, dt: number): void {
  const perLinkCap = LINK_RATE_PER_SEC * dt;
  const groups = new Map<string, { fromId: string; itemId: string; linkIds: string[] }>();

  for (const link of Object.values(state.links)) {
    const key = `${link.fromId}::${link.itemId}`;
    const group = groups.get(key);
    if (group) group.linkIds.push(link.id);
    else groups.set(key, { fromId: link.fromId, itemId: link.itemId, linkIds: [link.id] });
  }

  for (const group of groups.values()) {
    const from = state.machines[group.fromId];
    if (!from) continue;
    const available = from.outputs[group.itemId] ?? 0;
    if (available <= 0) continue;

    const wants: { linkId: string; want: number }[] = [];
    let totalWant = 0;
    for (const linkId of group.linkIds) {
      const link = state.links[linkId];
      const to = state.machines[link.toId];
      if (!to) continue;
      const room = inputCap(recipe(to.recipeId), group.itemId) - (to.inputs[group.itemId] ?? 0);
      const want = Math.max(0, Math.min(perLinkCap, room));
      if (want <= 0) continue;
      wants.push({ linkId, want });
      totalWant += want;
    }
    if (totalWant <= 0) continue;

    const scale = available >= totalWant ? 1 : available / totalWant;
    for (const { linkId, want } of wants) {
      const amount = want * scale;
      if (amount <= 0) continue;
      const link = state.links[linkId];
      const to = state.machines[link.toId];
      from.outputs[group.itemId] = (from.outputs[group.itemId] ?? 0) - amount;
      to.inputs[group.itemId] = (to.inputs[group.itemId] ?? 0) + amount;
    }
  }
}

/**
 * One active milestone PER TRACK. The main spine and the two branches advance
 * independently, so taking the home lab route never stalls the company and
 * ignoring it never blocks anything.
 */
function checkMilestones(state: GameState, events: TickEvents): void {
  const tracks: Track[] = ['main', 'homelab', 'slop'];
  for (const track of tracks) {
    // A switched-off addon stops advancing. Progress already made is kept, so
    // turning it back on resumes rather than restarts.
    if (!trackEnabled(track, state.addons)) continue;
    const next = MILESTONES.find(
      (m) => (m.track ?? 'main') === track && !state.completedMilestones.includes(m.id),
    );
    if (next) completeIfMet(state, next, events);
  }
}

function completeIfMet(
  state: GameState,
  next: (typeof MILESTONES)[number],
  events: TickEvents,
): void {
  const met = Object.entries(next.requires).every(
    ([itemId, qty]) => (state.delivered[itemId] ?? 0) >= qty,
  );
  if (!met) return;

  state.completedMilestones.push(next.id);
  state.credits += next.reward * BALANCE.milestoneRewardMultiplier;
  for (const id of next.unlocksBuildings) {
    if (!state.unlockedBuildings.includes(id)) state.unlockedBuildings.push(id);
    // A newly unlocked contract tier gets a lead immediately. Otherwise the
    // unlock panel names a customer the player then waits minutes to meet.
    const listing = listingFor(id);
    if (listing) {
      const offer = spawnOffer(state, listing);
      if (offer) events.offersArrived.push(offer);
    }
  }
  for (const id of next.unlocksRecipes) {
    if (!state.unlockedRecipes.includes(id)) state.unlockedRecipes.push(id);
  }
  events.milestonesCompleted.push(next.id);
}

/** Run `seconds` of simulated time in fixed steps. Returns what happened. */
export function advance(state: GameState, seconds: number): TickEvents {
  const events: TickEvents = {
    milestonesCompleted: [],
    breaches: [],
    offersArrived: [],
    offersExpired: [],
    blowouts: [],
    fines: [],
    contractsLost: [],
    agentSigned: [],
    agentBuilt: [],
    agentVetoed: [],
    agentRenewed: [],
    opsRenewed: [],
    churned: [],
    runaways: [],
    esgIncidents: [],
    esgFines: [],
    disclosuresPublished: [],
  };
  const dt = BALANCE.tickSeconds;
  // Cap catch-up so a backgrounded tab does not freeze on resume.
  let remaining = Math.min(seconds, 2);
  while (remaining > 1e-6) {
    const slice = Math.min(dt, remaining);
    step(state, slice, events);
    remaining -= slice;
  }
  return events;
}

export const statusLabel: Record<MachineStatus, string> = {
  running: 'Running',
  idle: 'No recipe',
  disabled: 'Off',
  starved: 'Starved',
  blocked: 'Output full',
  throttled: 'Throttled (429)',
  broke: 'Out of cash',
  audited: 'On hold',
  awaiting: 'Waiting for you',
  broken: 'Blown',
  unfocused: 'No matching work',
  unmanaged: 'No Ops Console',
  curtailed: 'Water restricted',
  disputed: 'Labour dispute',
  disclosed: 'Disclosure required',
  expired: 'Term ended',
};

/** Headcount right now, for the UI: placed against what the Console allows. */
export const agentCapacity = (state: GameState): { used: number; cap: number } => ({
  used: agentsPlaced(state),
  cap: agentHeadcount(state),
});
