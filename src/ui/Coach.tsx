import {
  BALANCE,
  BUILDINGS,
  BUILDING_BY_ID,
  MILESTONES,
  building,
  consumersOf,
  item,
  recipe,
  renewalCost,
  poolName,
  unlockedProducersOf,
  type Pool,
} from '../data';
import { countOf } from '../engine/factory';
import { openOffers } from '../engine/market';
import type { GameState, Machine } from '../engine/types';
import { money, tpm } from './format';

export interface Step {
  tone: 'do' | 'warn' | 'ok';
  title: string;
  body: React.ReactNode;
}

/**
 * The onboarding brain. Looks at the live world and returns the ONE thing the
 * player should do next, in order of what would block them soonest.
 *
 * This exists because the tech tree states a goal ("80 Answer") without saying
 * which node produces it — the single biggest reason a new player stalls.
 */
/**
 * Name a node the way the player can find it. The building name alone is
 * ambiguous the moment there are two of the same chassis on different recipes
 * — which is the normal case for a draft/judge cascade.
 */
function nodeLabel(m: Machine): string {
  const b = building(m.buildingId);
  const r = recipe(m.recipeId);
  if (!b) return 'A node';
  return r ? `${b.name} · ${r.name}` : b.name;
}

/**
 * Why is this node starved, and what fixes it? Distinguishes "you never wired
 * it up" from "upstream is too slow", because the fix is different and a
 * player cannot tell them apart from the node alone.
 */
function diagnoseStarved(state: GameState, m: Machine) {
  const r = recipe(m.recipeId);
  if (!r) return null;
  const missing = r.inputs.find((i) => (m.inputs[i.itemId] ?? 0) < i.qty);
  if (!missing) return null;
  const fed = Object.values(state.links).some(
    (l) => l.toId === m.id && l.itemId === missing.itemId,
  );
  return { itemId: missing.itemId, fed };
}

/** Advice for a node that is starved of `itemId`. */
function starvedAdvice(state: GameState, itemId: string, fed: boolean): React.ReactNode {
  const it = item(itemId);
  const sources = unlockedProducersOf(itemId, state.unlockedBuildings, state.unlockedRecipes);
  if (fed) {
    return `It is waiting on ${it.name}. Whatever feeds it produces slower than it consumes — add another upstream node, or slow this one with the clock slider.`;
  }
  return (
    <>
      It needs {it.name} and nothing is feeding it. Place one of these and drag its output
      dot onto this node's input dot:
      <ul className="coach-list">
        {sources.slice(0, 4).map(({ building: b, recipe: r }) => (
          <li key={r.id}>
            <b style={{ color: b.color }}>{b.name}</b> → {r.name}
          </li>
        ))}
        {sources.length === 0 && <li>Nothing you have unlocked produces it yet.</li>}
      </ul>
    </>
  );
}

export function nextStep(state: GameState): Step {
  const machines = Object.values(state.machines);
  const statuses = machines.map((m) => state.status[m.id]);

  // 1. Nothing placed at all.
  if (machines.length === 0) {
    return {
      tone: 'do',
      title: 'Place a Free Tier',
      body: 'Every node burns throughput. With no capacity node, everything runs at a 429. Free Tier is $0 and gives you 150k TPM.',
    };
  }

  // 2. No capacity at all, or over budget.
  const hasCapacity = machines.some((m) => building(m.buildingId)?.kind === 'capacity');
  if (!hasCapacity) {
    return {
      tone: 'warn',
      title: 'You have no capacity node',
      body: 'Place a Free Tier (or an API tier). Without one, supply is zero and every node throttles.',
    };
  }
  // A vendor-scoped tier with no provider chosen buys nothing.
  const unset = machines.find(
    (m) => m.enabled && building(m.buildingId)?.vendorScoped && !m.vendor,
  );
  if (unset) {
    return {
      tone: 'do',
      title: `${building(unset.buildingId)?.name} has no provider`,
      body: 'Rate limits are bought per provider. Pick one in the Inspector — until you do, this node supplies nothing to anybody.',
    };
  }

  // Ahead of both the throttling and the broke branches, on purpose.
  //
  // When contracts have lapsed, revenue is zero BECAUSE of that. Un-throttling
  // the pool earns nothing while every customer is frozen, and the broke branch
  // would tell the player to demolish their biggest subscription — which in a
  // factory built around renewals is the Human Ops Desk, the one node that can
  // dig them out. Both are right answers to a question that is not the one
  // being asked.
  if (statuses.includes('expired')) {
    const lapsed = machines.filter((m) => state.status[m.id] === 'expired');
    const cheapest = Math.min(
      ...lapsed.map((m) => renewalCost(m.buildingId, state.priceIndex)),
    );
    const short = cheapest - state.credits;
    return {
      tone: 'warn',
      title:
        lapsed.length === 1
          ? 'A contract has run out its term'
          : `${lapsed.length} contracts have run out their term`,
      body:
        short > 0 ? (
          <>
            They have stopped delivering and stopped paying, which is why revenue
            is {money(state.finance.revenuePerMin)}/min. Re-signing the cheapest
            costs {money(cheapest)} and you are short by {money(short)} — and an
            expired contract earns nothing, so this does not recover on its own.
            <b> Demolish</b> a node to raise the cash; you get back{' '}
            {Math.round(BALANCE.refundRate * 100)}% of what it costs today.
          </>
        ) : (
          <>
            They have stopped delivering and stopped paying, and they keep their
            wiring and their buffers while frozen. Select one and re-sign it —
            the cheapest is {money(cheapest)}.
          </>
        ),
    };
  }
  if (state.compute.satisfaction < 0.999) {
    const worstId = state.compute.tight[0];
    const worst = state.compute.pools[worstId];
    const over = worst.demandKtpm - worst.supplyKtpm;
    // Only suggest buying capacity if there is capacity left to buy. Telling a
    // player to "buy a bigger tier" they have not unlocked is a dead loop.
    // Only tiers that can serve THIS pool help. Suggesting a bigger tier the
    // player then points at the wrong provider is worse than saying nothing.
    const wantsVendor = worstId !== 'shared';
    const spare = BUILDINGS.filter(
      (b) =>
        b.kind === 'capacity' &&
        state.unlockedBuildings.includes(b.id) &&
        b.computeSupply > 0 &&
        (wantsVendor ? b.vendorScoped : !b.vendorScoped) &&
        b.computeSupply > worst.supplyKtpm &&
        // Never suggest one the player may not place, or one whose own
        // allowance would lapse the moment it arrived. A second Free Tier is
        // both at once: capped at one, and covering fewer nodes than this pool
        // already has. Suggesting it is the same dead loop the comment above
        // is about, wearing a different hat.
        (b.maxCount === undefined || countOf(state, b.id) < b.maxCount) &&
        (b.servesNodes === undefined || worst.drawers <= b.servesNodes),
    ).sort((a, b) => a.computeSupply - b.computeSupply);

    const freeOnly = machines.some(
      (m) =>
        m.vendor === worstId &&
        (building(m.buildingId)?.servesNodes ?? Infinity) < Infinity,
    );

    return {
      tone: 'warn',
      title: `${poolName(worstId as Pool)} is throttled`,
      body: spare.length ? (
        <>
          {poolName(worstId as Pool)} wants {tpm(worst.demandKtpm)} but you have{' '}
          {tpm(worst.supplyKtpm)} TPM there — short by {tpm(over)} across {worst.drawers} node
          {worst.drawers === 1 ? '' : 's'}.
          {freeOnly && ' A free tier only covers one node; a second one stops it counting.'}{' '}
          {wantsVendor
            ? `Place one of these and set its provider to ${poolName(worstId as Pool)}:`
            : 'Add hardware:'}
          <ul className="coach-list">
            {spare.slice(0, 3).map((b) => (
              <li key={b.id}>
                <b>{b.name}</b> — +{tpm(b.computeSupply)} TPM
              </li>
            ))}
          </ul>
        </>
      ) : (
        `${poolName(worstId as Pool)} wants ${tpm(worst.demandKtpm)} against ${tpm(worst.supplyKtpm)} TPM and you have no larger tier unlocked for it. Switch off or demolish one of its nodes.`
      ),
    };
  }

  // 3. Hard stops on individual nodes.
  if (statuses.includes('broke')) {
    // Rent is charged whether or not a node is WORKING, so an over-subscribed
    // factory bleeds even while everything sits idle — and because paid recipes
    // stop below their cost, revenue goes to zero while the rent does not.
    //
    // It is not charged on a node that is switched OFF: `machineBurn` returns 0
    // for a disabled node and the survey skips it before adding its monthlyCost.
    // This used to advise demolishing instead, which sent players to do the
    // irreversible thing when the reversible one is enough.
    const rentPerMin = (state.finance.burnPerMonth / BALANCE.monthSeconds) * 60;
    const revenuePerMin = state.finance.revenuePerMin;
    const worst = machines
      .filter((m) => (building(m.buildingId)?.monthlyCost ?? 0) > 0)
      .sort(
        (a, b) =>
          (building(b.buildingId)?.monthlyCost ?? 0) - (building(a.buildingId)?.monthlyCost ?? 0),
      );

    if (rentPerMin > revenuePerMin && worst.length) {
      return {
        tone: 'warn',
        title: 'Out of cash — subscriptions are outrunning revenue',
        body: (
          <>
            Rent is {money(rentPerMin)}/min against {money(revenuePerMin)}/min of revenue, and
            an idle node bills exactly like a busy one. <b>Switching one off</b> stops its rent
            at once and can be undone; demolishing also hands back{' '}
            {Math.round(BALANCE.refundRate * 100)}%. Biggest drains:
            <ul className="coach-list">
              {worst.slice(0, 3).map((m) => (
                <li key={m.id}>
                  <b>{nodeLabel(m)}</b> — {money(building(m.buildingId)?.monthlyCost ?? 0)}/mo
                  {state.status[m.id] !== 'running' ? ' (idle)' : ''}
                </li>
              ))}
            </ul>
          </>
        ),
      };
    }
    return {
      tone: 'warn',
      title: 'Out of cash',
      body: 'A node cannot afford its per-call API spend, so it has stopped. Sell what you have buffered, or switch off your most expensive model.',
    };
  }
  if (statuses.includes('audited')) {
    return {
      tone: 'warn',
      title: 'A contract is on a security hold',
      body: `Your Exposure is ${state.exposure}, above what that customer accepts. Remove a risky provider, or place Observability (−5) to buy the number down.`,
    };
  }
  const idle = machines.find((m) => state.status[m.id] === 'idle');
  if (idle) {
    const b = building(idle.buildingId);
    return {
      tone: 'do',
      title: `${b?.name ?? 'A node'} has no recipe`,
      body: 'Click it and pick a recipe in the Inspector. A node with no recipe has no inputs or outputs and does nothing.',
    };
  }

  // 4. The current milestone — can you even make and sell what it wants?
  // The main spine only. The Coach is the tutorial voice, and an optional
  // branch objective coming from it would read as something you must do.
  const mainTrack = MILESTONES.filter((m) => (m.track ?? 'main') === 'main');
  const nextIndex = mainTrack.findIndex((m) => !state.completedMilestones.includes(m.id));
  if (nextIndex === -1) {
    return { tone: 'ok', title: 'Tech tree complete', body: 'Nothing left to unlock. Optimise for margin.' };
  }
  const goal = mainTrack[nextIndex];

  for (const [itemId, need] of Object.entries(goal.requires)) {
    if ((state.delivered[itemId] ?? 0) >= need) continue;
    const it = item(itemId);

    // Which nodes are set up to make it, and are any of them actually running?
    const wouldMake = machines.filter((m) =>
      recipe(m.recipeId)?.outputs.some((o) => o.itemId === itemId),
    );
    // A node that is starved is NOT producing, however its recipe reads. Saying
    // "you make X" while nothing comes out is the fastest way to strand a player.
    const stalled = wouldMake.find((m) => state.status[m.id] === 'starved');
    if (stalled) {
      const d = diagnoseStarved(state, stalled);
      return {
        tone: 'do',
        title: `${nodeLabel(stalled)} is starved`,
        body: d
          ? starvedAdvice(state, d.itemId, d.fed)
          : `It is making no ${it.name} because it is missing inputs.`,
      };
    }
    if (wouldMake.length === 0) {
      const options = unlockedProducersOf(itemId, state.unlockedBuildings, state.unlockedRecipes);
      return {
        tone: 'do',
        title: `Nothing you own makes ${it.name}`,
        body: options.length ? (
          <>
            {goal.name} needs {need} {it.name}. Place one of these and set its recipe:
            <ul className="coach-list">
              {options.slice(0, 4).map(({ building: b, recipe: r }) => (
                <li key={r.id}>
                  <b style={{ color: b.color }}>{b.name}</b> → {r.name}
                </li>
              ))}
            </ul>
          </>
        ) : (
          `${goal.name} needs ${need} ${it.name}, and nothing unlocked produces it yet.`
        ),
      };
    }

    // Producing, but is a contract buying it? Milestones count sales only.
    const contracts = consumersOf(itemId).filter((r) => r.payout !== undefined);
    const selling = machines.some(
      (m) =>
        building(m.buildingId)?.kind === 'contract' &&
        recipe(m.recipeId)?.inputs.some((i) => i.itemId === itemId),
    );
    if (!selling) {
      // Contracts only come off the board, so the advice has to say whether a
      // customer who buys this is actually waiting — otherwise "place a
      // contract" points at a build bar that no longer has one.
      const buyers = new Set(contracts.map((r) => r.buildingId));
      const live = openOffers(state).filter((o) => buyers.has(o.buildingId));
      const placed = machines.some((m) => buyers.has(m.buildingId));

      return {
        tone: 'do',
        title: `You make ${it.name} but nothing sells it`,
        body: (
          <>
            Milestones count what you <b>sell</b>, not what you produce.{' '}
            {placed
              ? `Re-point a contract node you already own onto a recipe that buys ${it.name}:`
              : live.length
                ? `Open Contract offers in the build bar and sign one of these — ${live.length} ${
                    live.length === 1 ? 'is' : 'are'
                  } waiting right now:`
                : `No customer for ${it.name} is on the board yet. Leads arrive on their own — keep the clock running and watch the Contract offers button:`}
            <ul className="coach-list">
              {contracts.slice(0, 4).map((r) => (
                <li key={r.id}>
                  <b>{BUILDING_BY_ID[r.buildingId]?.name}</b> → {r.name}
                  {live.some((o) => o.buildingId === r.buildingId) && (
                    <span style={{ color: 'var(--good)' }}> · on the board</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        ),
      };
    }
  }

  // 5. Flowing, but something upstream is thin.
  const starved = machines.find((m) => state.status[m.id] === 'starved');
  if (starved) {
    const d = diagnoseStarved(state, starved);
    return {
      tone: 'warn',
      title: `${nodeLabel(starved)} is starved`,
      body: d ? starvedAdvice(state, d.itemId, d.fed) : 'It is waiting on inputs.',
    };
  }

  return {
    tone: 'ok',
    title: 'Chain is running',
    body: `Working toward ${goal.name}. Watch Net margin in the top bar — cash can rise while margin is negative.`,
  };
}

export default function Coach({ state }: { state: GameState }) {
  const step = nextStep(state);
  return (
    <div className={`coach ${step.tone}`}>
      <div className="coach-title">{step.title}</div>
      <div className="coach-body">{step.body}</div>
    </div>
  );
}
