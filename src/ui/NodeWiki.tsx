import {
  BALANCE,
  MILESTONE_BY_BUILDING,
  MILESTONE_BY_RECIPE,
  RECIPES_BY_BUILDING,
  VENDORS,
  buildingCostAt,
  consumersOf,
  contractTermSeconds,
  item,
  producersOf,
  type Building,
  type Item,
  type Recipe,
} from '../data';
import { featureEnabled } from '../data/addons';
import type { GameState } from '../engine/types';
import { money, recipeFlow, tpm } from './format';
import { useContent, useLang } from '../i18n/useLang';

/**
 * The node wiki — everything true about one chassis, in one place.
 *
 * The inspector answers "what is this node doing right now". This answers
 * "what IS this", which is a different question and was previously only
 * answerable by reading docs/WIKI.md with the game paused. Every figure is
 * read out of `src/data` at render time, so it cannot drift from the sim the
 * way a hand-written panel would.
 *
 * Labels here are English, matching the machine inspector this opens from —
 * that panel's own labels ("Compute", "Subscription", "Data risk") are not
 * translated either, and the teaching notes never are. See src/i18n/index.ts
 * for why the content layer stays put.
 */

/** A mechanic this particular chassis is subject to, and why it matters. */
interface Rule {
  title: string;
  body: string;
}

/**
 * The rules that actually apply to this node, derived from its own fields
 * rather than from a hand-kept list per building. A node picks up the
 * explanation for a mechanic exactly when it participates in it.
 */
function rulesFor(b: Building): Rule[] {
  const rules: Rule[] = [];

  if (b.vendor) {
    rules.push({
      title: 'Rate limits do not pool',
      body: `This node draws on ${VENDORS[b.vendor].name}'s own rate limit. Capacity you bought from any other provider does nothing for it, so it needs a Free Tier, API Tier or Batch Lane registered with ${VENDORS[b.vendor].name}.`,
    });
  }

  if (b.vendorScoped) {
    rules.push({
      title: 'A developer account with one provider',
      body: 'This is a developer account, and it is registered with exactly one provider. It supplies nothing until you choose which, and it only ever serves model nodes on that provider.',
    });
  } else if (b.kind === 'capacity') {
    rules.push({
      title: 'Feeds the shared pool',
      body: `Hardware you rent or own is fungible across your own workloads, so this adds to the shared pool — retrieval, evals, agents, self-hosted serving and the silicon chain all draw on it. That pool starts at ${tpm(BALANCE.ownServersKtpm)} TPM of ordinary servers.`,
    });
  }

  if (b.servesNodes) {
    rules.push({
      title: `Covers ${b.servesNodes} node${b.servesNodes === 1 ? '' : 's'}`,
      body: `A free account covers ${b.servesNodes} node. Put more on this provider and the allowance stops counting entirely — not partially. That cliff is why the first paid tier is worth buying.`,
    });
  }

  if (b.kind !== 'capacity' && b.computeDraw > 0) {
    rules.push({
      title: 'Throttling degrades, it does not cliff',
      body: `If its pool is short, this runs at clock × satisfaction rather than stopping. Overclocking costs more than it looks: draw scales as clock ^ ${BALANCE.clockExponent}, so 2× speed is about ${(2 ** BALANCE.clockExponent).toFixed(1)}× the throughput.`,
    });
  }

  if (b.monthlyCost > 0) {
    rules.push({
      title: 'Billed whether or not you use it',
      body: `A billing month is ${BALANCE.monthSeconds} game-seconds, charged continuously — about ${money(b.monthlyCost / BALANCE.monthSeconds)} every game-second. An idle node still bills. Demolishing refunds ${Math.round(BALANCE.refundRate * 100)}% of the place cost.`,
    });
  }

  if (b.dataRisk > 0) {
    rules.push({
      title: 'Risk is architectural',
      body: `This adds ${b.dataRisk} to Exposure for as long as it is enabled with a recipe assigned — whether or not it is mid-craft. Breach chance is ${BALANCE.breachRatePerMinuteAt100} × (Exposure / 100)² per minute, and a breach takes ${Math.round(BALANCE.breachCostFraction * 100)}% of your cash and freezes every contract for ${BALANCE.breachFreezeSeconds}s.`,
    });
  } else if (b.dataRisk < 0) {
    rules.push({
      title: 'This is the counter-play',
      body: `Controls carry negative risk: ${b.dataRisk} Exposure while running. That is why lowering Exposure costs money and a monthly bill rather than being a toggle.`,
    });
  }

  if (b.slopRisk) {
    const s = b.slopRisk;
    rules.push({
      title: s > 0 ? 'Raises the Slop Index' : 'Lowers the Slop Index',
      body:
        s > 0
          ? `Adds ${s} to the Slop Index while running. That index drives four separate risks: a craft producing nothing at all (${(BALANCE.distractionBase * 100).toFixed(0)}% base, plus ${(BALANCE.distractionPerSlop * 100).toFixed(2)}% per point), IP fines at ${money(BALANCE.ipFinePerUnit)} a unit, quality misses that pay only ${Math.round(BALANCE.qualityMissPayoutFraction * 100)}% and lose the contract after ${BALANCE.strikesBeforeLoss} strikes, and legal action costing ${Math.round(BALANCE.legalFineFraction * 100)}% of cash plus +${BALANCE.legalFineExposure} Exposure for ${BALANCE.legalFineExposureSeconds}s.`
          : `Takes ${Math.abs(s)} off the Slop Index while running — one of the few things that does.`,
    });
  }

  if (b.kind === 'contract') {
    rules.push({
      title: 'Signed off the board, not built',
      body: 'Contract chassis are never stocked in the build bar. A lead turns up on the marketplace, stays signable for a window, and walks if you miss it. Bigger deals stay open longer, not shorter.',
    });
    const term = contractTermSeconds(b.id);
    rules.push({
      title: term > 0 ? `Runs a term of about ${Math.round(term)}s` : 'Runs forever',
      body:
        term > 0
          ? `A contract is a term, not a marriage. When it runs out the node freezes where it stands — it stops delivering and stops paying, but keeps its links and its buffers — and re-signing costs ${Math.round(BALANCE.contractRenewalFraction * 100)}% of what the chassis costs to place today. A frozen contract never disappears — it waits for you. Term length follows what the deal pays, on a log scale, so the cheap high-volume work comes back around far more often than the rare deals do. A Support Agent watching this account re-signs it for you.`
          : 'This one pays nothing, so it is not on a renewal clock. It is not a customer — it is you posting into the void, and charging rent on that lesson would be beside the point.',
    });
    rules.push({
      title: 'The ceiling is a hard stop',
      body: 'Above its Exposure ceiling a contract reads Security hold instead of Running, and pays nothing at all while held. It is not a penalty rate — it is off.',
    });
  }

  if (b.opsRole === 'renewals') {
    rules.push({
      title: 'Re-signs lapsed contracts, slowly',
      body: `Every completed cycle wins back whichever contract has been frozen longest, paying the same ${Math.round(BALANCE.contractRenewalFraction * 100)}% fee you would pay by hand. One at a time, and only when you can afford it. A Support Agent does the same job the tick a term ends and does every account at once — but it needs the Agentic Ops addon, a console, a headcount slot and a supply of agent runs. This needs a salary.`,
    });
  }

  if (b.laborLoad && b.laborLoad > 0) {
    rules.push({
      title: 'This is a hire, not a licence',
      body: `Placing this is hiring: the monthly cost is salary. It adds ${b.laborLoad} to the labour load behind the ESG addon's Social pillar, and a labour dispute stops this node dead while it runs — anything staffed by people does. With the addon off the number is still computed, so switching it on later shows you something that was already true.`,
    });
  }

  if (b.kind === 'agent') {
    rules.push({
      title: 'Produces nothing, pays nothing',
      body: `Agents spend agent runs acting on the game itself rather than making anything you can sell. Headcount is capped at ${BALANCE.agentHeadcountBase} plus one per ${BALANCE.agentHeadcountPerMilestones} milestones cleared, and a console must be placed before any of them run.`,
    });
    if (b.agentDrift) {
      const d = b.agentDrift;
      rules.push({
        title: d > 0 ? 'Adds Agent Drift' : 'Removes Agent Drift',
        body:
          d > 0
            ? `+${d} Drift while running. Past ${BALANCE.driftFocusFloor} effort starts going nowhere, past ${BALANCE.driftWasteFloor} spend stops producing, and past ${BALANCE.driftRunawayFloor} an agent will spend ${Math.round(BALANCE.driftRunawayFraction * 100)}% of your cash on something you did not ask for.`
            : `${d} Drift while running. The Reviewer is the only thing that brings the number back down.`,
      });
    }
    rules.push({
      title: 'Customers churn once agents are on',
      body: `With the addon enabled, contracts lapse at ${(BALANCE.churnRatePerMin * 100).toFixed(0)}% a minute, offset by loyalty that builds over ${Math.round(BALANCE.churnLoyaltySeconds / 60)} minutes and a ${Math.round(BALANCE.churnGraceSeconds / 60)}-minute grace on a new signing. Loyalty caps at ${Math.round(BALANCE.churnLoyaltyMax * 100)}%, never 100%, so a small residual chance survives however well you serve them — which is why a lapse freezes the node for re-signing rather than deleting it. That decay does not exist with the addon off.`,
    });
  }

  if (b.priceElasticity) {
    rules.push({
      title: 'Tracks the hardware price index',
      body: `Elasticity ${b.priceElasticity} against an index that climbs with your own progress and buildout, up to ${BALANCE.priceIndexMax}×. DRAM is 1.0 by definition. What you did not buy early gets more expensive.`,
    });
  }

  if (b.withdrawnAtIndex) {
    rules.push({
      title: 'Withdrawn from sale eventually',
      body: `Past a price index of ${b.withdrawnAtIndex} this leaves the build bar for good. Nodes already placed keep running — the people who bought one still have it.`,
    });
  }

  if (b.maxCount) {
    rules.push({
      title: `Limit: ${b.maxCount}`,
      body: `You may own ${b.maxCount} of these at once. The build bar greys out at the cap and the engine refuses beyond it, so the quick-build keys cannot go around it.`,
    });
  }

  return rules;
}

/** Every distinct item this chassis touches, in the order it meets them. */
function itemsOf(recipes: Recipe[]): Item[] {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const r of recipes) {
    for (const s of [...r.inputs, ...(r.catalysts ?? []), ...r.outputs]) {
      if (seen.has(s.itemId)) continue;
      seen.add(s.itemId);
      out.push(item(s.itemId));
    }
  }
  return out;
}

export default function NodeWiki({
  b,
  state,
  onClose,
}: {
  b: Building;
  state: GameState;
  onClose: () => void;
}) {
  const { t } = useLang();
  const { bName, bDesc, iName, rName } = useContent();

  const esgOn = featureEnabled('esg', state.addons);
  const recipes = RECIPES_BY_BUILDING[b.id] ?? [];
  const cost = buildingCostAt(b, state.priceIndex);
  const opener = MILESTONE_BY_BUILDING[b.id];
  const rules = rulesFor(b);
  const items = itemsOf(recipes);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>
            <span style={{ color: b.color, marginRight: 8 }}>{b.icon}</span>
            {bName(b)}
          </h2>
          <p>
            {/* "Capacity · capacity" says nothing twice — several tiers are
                named after the kind they hold. */}
            {[
              b.tier,
              b.kind === b.tier.toLowerCase() ? null : b.kind,
              b.vendor ? VENDORS[b.vendor].name : null,
              opener ? `opens at ${opener.name}` : 'starting kit',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p>{bDesc(b)}</p>
        </div>

        <div className="section-title">Numbers</div>
        <div className="kv">
          <span className="k">Place cost</span>
          <span className="mono">
            {money(cost)}
            {cost !== b.cost ? ` (base ${money(b.cost)})` : ''}
          </span>
        </div>
        <div className="kv">
          <span className="k">Refund on demolish</span>
          <span className="mono">{money(cost * BALANCE.refundRate)}</span>
        </div>
        {b.monthlyCost > 0 && (
          <div className="kv">
            <span className="k">Subscription</span>
            <span className="mono">{money(b.monthlyCost)}/mo</span>
          </div>
        )}
        <div className="kv">
          <span className="k">{b.kind === 'capacity' ? 'Supplies' : 'Compute draw'}</span>
          <span className="mono">
            {b.kind === 'capacity'
              ? `+${tpm(b.computeSupply)} TPM`
              : `−${tpm(b.computeDraw)} TPM`}
          </span>
        </div>
        {b.dataRisk !== 0 && (
          <div className="kv">
            <span className="k">Data risk</span>
            <span
              className="mono"
              style={{ color: b.dataRisk > 0 ? 'var(--bad)' : 'var(--good)' }}
            >
              {b.dataRisk > 0 ? '+' : ''}
              {b.dataRisk}
            </span>
          </div>
        )}
        {b.slopRisk ? (
          <div className="kv">
            <span className="k">Slop risk</span>
            <span
              className="mono"
              style={{ color: b.slopRisk > 0 ? 'var(--bad)' : 'var(--good)' }}
            >
              {b.slopRisk > 0 ? '+' : ''}
              {b.slopRisk}
            </span>
          </div>
        ) : null}
        {b.agentDrift ? (
          <div className="kv">
            <span className="k">Agent drift</span>
            <span
              className="mono"
              style={{ color: b.agentDrift > 0 ? 'var(--bad)' : 'var(--good)' }}
            >
              {b.agentDrift > 0 ? '+' : ''}
              {b.agentDrift}
            </span>
          </div>
        ) : null}

        <div className="section-title">
          Recipes {recipes.length > 1 ? `(${recipes.length})` : ''}
        </div>
        {recipes.length === 0 && <p className="empty">This chassis runs nothing on its own.</p>}
        {recipes.map((r) => {
          const unlocked = state.unlockedRecipes.includes(r.id);
          const gate = MILESTONE_BY_RECIPE[r.id];
          return (
            <div className={`card${unlocked ? '' : ' locked'}`} key={r.id}>
              <div className="head">
                <b>{rName(r)}</b>
                <span className="badge" style={unlocked ? undefined : { opacity: 0.7 }}>
                  {unlocked ? `${r.seconds}s` : gate ? `needs ${gate.name}` : 'locked'}
                </span>
              </div>
              <div className="blurb mono">{recipeFlow(r)}</div>
              <div className="kv">
                <span className="k">Cycle</span>
                <span className="mono">{r.seconds}s</span>
              </div>
              {r.cost ? (
                <div className="kv">
                  <span className="k">API spend per craft</span>
                  <span className="mono" style={{ color: 'var(--bad)' }}>
                    {money(r.cost)}
                  </span>
                </div>
              ) : null}
              {r.payout !== undefined && (
                <div className="kv">
                  <span className="k">Payout</span>
                  <span className="mono" style={{ color: r.payout > 0 ? 'var(--good)' : undefined }}>
                    {money(r.payout)}
                  </span>
                </div>
              )}
              {r.maxExposure !== undefined && (
                <div className="kv">
                  <span className="k">Refuses above Exposure</span>
                  <span className="mono">{r.maxExposure}</span>
                </div>
              )}
              {/* Footprint and disclosure are ESG-addon rules. With the addon
                  off they are not in force at all — `simulate` gates the whole
                  check on it — so stating them flat would send a player hunting
                  for a requirement their game does not have. Shown either way,
                  because a wiki should explain what the addon would add, but
                  never as though it applied. */}
              {r.maxFootprint !== undefined && (
                <div className="kv">
                  <span className="k">Refuses above Footprint</span>
                  <span className="mono" style={esgOn ? undefined : { opacity: 0.55 }}>
                    {r.maxFootprint}
                    {esgOn ? '' : ' · ESG addon off'}
                  </span>
                </div>
              )}
              {r.requiresDisclosure && (
                <div className="kv">
                  <span className="k">Needs a valid ESG disclosure</span>
                  <span className="mono" style={esgOn ? undefined : { opacity: 0.55 }}>
                    {esgOn ? 'yes' : 'only with the ESG addon on'}
                  </span>
                </div>
              )}
              {r.requiresOnSite && (
                <div className="kv">
                  <span className="k">On-site audit</span>
                  <span className="mono">
                    {r.requiresOnSite.count} working {r.requiresOnSite.tier}
                  </span>
                </div>
              )}
              {r.failureRatePerMin ? (
                <div className="kv">
                  <span className="k">Failure rate</span>
                  <span className="mono" style={{ color: 'var(--bad)' }}>
                    {(r.failureRatePerMin * 100).toFixed(1)}%/min
                  </span>
                </div>
              ) : null}
              {r.manual && (
                <div className="kv">
                  <span className="k">Manual only</span>
                  <span className="mono">one craft per press</span>
                </div>
              )}
              {r.provenanceRisk ? (
                <div className="kv">
                  <span className="k">Provenance risk</span>
                  <span className="mono" style={{ color: 'var(--bad)' }}>
                    +{r.provenanceRisk}
                  </span>
                </div>
              ) : null}
              {r.note && (
                <div className="blurb" style={{ marginTop: 7, marginBottom: 0, opacity: 0.75 }}>
                  {r.note}
                </div>
              )}
            </div>
          );
        })}

        {items.length > 0 && (
          <>
            <div className="section-title">Items it handles</div>
            {items.map((it) => {
              const makers = producersOf(it.id).filter((r) => r.buildingId !== b.id);
              const takers = consumersOf(it.id).filter((r) => r.buildingId !== b.id);
              return (
                <div className="card" key={it.id}>
                  <div className="head">
                    <b>
                      <span style={{ color: it.color, marginRight: 6 }}>{it.icon}</span>
                      {iName(it)}
                    </b>
                    <span className="badge">{it.form}</span>
                  </div>
                  <div className="blurb" style={{ marginBottom: 0 }}>
                    {it.note}
                  </div>
                  {it.value > 0 && (
                    <div className="kv" style={{ marginTop: 6 }}>
                      <span className="k">Reference price</span>
                      <span className="mono">{money(it.value)}</span>
                    </div>
                  )}
                  {makers.length > 0 && (
                    <div className="kv">
                      <span className="k">Also made by</span>
                      <span className="mono">{makers.length} other recipe{makers.length === 1 ? '' : 's'}</span>
                    </div>
                  )}
                  {takers.length > 0 && (
                    <div className="kv">
                      <span className="k">Also used by</span>
                      <span className="mono">{takers.length} other recipe{takers.length === 1 ? '' : 's'}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {rules.length > 0 && (
          <>
            <div className="section-title">How this works</div>
            {rules.map((rule) => (
              <div className="card" key={rule.title}>
                <div className="head">
                  <b>{rule.title}</b>
                </div>
                <div className="blurb" style={{ marginBottom: 0 }}>
                  {rule.body}
                </div>
              </div>
            ))}
          </>
        )}

        <button style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
          {t('build.close')}
        </button>
      </div>
    </div>
  );
}
