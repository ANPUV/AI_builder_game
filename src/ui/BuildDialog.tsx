import { useMemo, useState } from 'react';
import {
  BUILDINGS,
  RECIPES_BY_BUILDING,
  VENDORS,
  buildingCostAt,
  buildingEnabled,
  isWithdrawn,
  item,
  makesItems,
  poolColor,
  takesItems,
  type Building,
  type BuildingTier,
  type Pool,
  type Vendor,
} from '../data';
import { HOTBAR_KEYS, countOf } from '../engine/factory';
import { hasUnseenOffers } from '../engine/market';
import type { GameState } from '../engine/types';
import type { Pending } from './Canvas';
import { inkOn, money, recipeFlow, tpm } from './format';
import { MarketplaceBody } from './Marketplace';
import Tip from './Tip';
import { useContent, useLang } from '../i18n/useLang';

/** Tab order. 'Contracts' is special: it renders the contract board. */
const TABS = [
  'Demand', 'Online Models', 'Local Models', 'Home Lab', 'Retrieval', 'Agents',
  'Agent Ops', 'Slop', 'Compliance', 'Sustainability', 'Capacity', 'Training', 'Silicon',
  'Contracts',
] as const;
export type BuildTab = (typeof TABS)[number];

/**
 * Every BuildingTier must appear above, or that tier's nodes have no tab and
 * become unbuildable from the UI with nothing anywhere saying why. Adding a
 * tier without a tab is a silent failure, so make it a loud one: this line
 * stops compiling the moment the two lists disagree.
 */
type MissingTab = Exclude<BuildingTier, BuildTab>;
const _everyTierHasATab: MissingTab extends never ? true : MissingTab = true;
void _everyTierHasATab;

/**
 * Where a node runs, which is the distinction players actually shop by.
 *
 * A tab like Capacity mixes an OpenAI tier with a rented H100 and a Mac Studio;
 * they are the same `tier` but nothing like the same purchase. Splitting on the
 * pool the node touches puts "somebody else's rate limit" and "hardware you own"
 * in separate blocks, and pulls the content generators out of both.
 */
type Group = 'online' | 'local' | 'generated' | 'other';

const GROUP_KEY = {
  online: 'build.groupOnline',
  local: 'build.groupLocal',
  generated: 'build.groupGenerated',
  other: 'build.groupOther',
} as const;
const GROUP_ORDER: Group[] = ['online', 'local', 'generated', 'other'];

function groupOf(b: Building, unlockedRecipes: string[]): Group {
  // Content generators first: what they make matters more than where they run.
  if (makesItems(b.id, unlockedRecipes).some((id) => item(id).form === 'slop')) return 'generated';
  if (b.vendor || b.vendorScoped) return 'online';
  if (b.computeDraw > 0 || b.computeSupply > 0) return 'local';
  return 'other';
}

interface Props {
  state: GameState;
  freshUnlocks: string[];
  initialTab?: BuildTab;
  onClose: () => void;
  /** Arm a building for placement. */
  onPick: (buildingId: string) => void;
  /** Sign a contract offer, which arms it the same way. */
  onSign: (pending: Pending) => void;
  /** Put a building on a quick-build slot (or pull it off). */
  onAssign: (buildingId: string) => void;
}

function ItemRow({ ids, label }: { ids: string[]; label: string }) {
  const { iName } = useContent();
  if (!ids.length) return null;
  return (
    <div className="tip-kv">
      <span>{label}</span>
      <span style={{ textAlign: 'right' }}>
        {ids.map((id) => (
          <span key={id} style={{ color: item(id).color, marginLeft: 5 }}>
            {item(id).icon} {iName(item(id))}
          </span>
        ))}
      </span>
    </div>
  );
}

export function BuildTip({ b, state }: { b: Building; state: GameState }) {
  const { bName, bDesc, rName } = useContent();
  const recipes = (RECIPES_BY_BUILDING[b.id] ?? []).filter((r) =>
    state.unlockedRecipes.includes(r.id),
  );
  const headroom = state.compute.supplyKtpm - state.compute.demandKtpm;
  const wouldThrottle = b.kind !== 'capacity' && b.computeDraw > headroom;

  return (
    <>
      <div className="tip-title">
        <span className="tip-glyph" style={{ background: b.color, color: inkOn(b.color) }}>{b.icon}</span>
        {bName(b)}
      </div>
      <div className="tip-body">{bDesc(b)}</div>

      <ItemRow label="Takes" ids={takesItems(b.id, state.unlockedRecipes)} />
      <ItemRow label="Makes" ids={makesItems(b.id, state.unlockedRecipes)} />

      <div className="tip-kv">
        <span>Cost</span>
        <span className="mono">
          {money(buildingCostAt(b, state.priceIndex))}
          {b.monthlyCost > 0 ? ` + ${money(b.monthlyCost)}/mo` : ''}
        </span>
      </div>
      <div className="tip-kv">
        <span>Pool</span>
        <span style={{ color: b.vendor ? poolColor(b.vendor as Pool) : poolColor('shared') }}>
          {b.vendorScoped
            ? 'One provider — you pick'
            : b.vendor
              ? VENDORS[b.vendor as Vendor].name
              : 'Own hardware (shared)'}
        </span>
      </div>
      <div className="tip-kv">
        <span>{b.kind === 'capacity' ? 'Supplies' : 'Draws'}</span>
        <span className="mono">
          {tpm(b.kind === 'capacity' ? b.computeSupply : b.computeDraw)} TPM
        </span>
      </div>
      {b.dataRisk !== 0 && (
        <div className="tip-kv">
          <span>Data risk</span>
          <span className="mono" style={{ color: b.dataRisk > 0 ? 'var(--bad)' : 'var(--good)' }}>
            {b.dataRisk > 0 ? '+' : ''}{b.dataRisk} exposure
          </span>
        </div>
      )}
      {recipes.length > 1 && (
        <>
          <div className="tip-kv" style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 6 }}>
            <span>Pick one after placing</span>
          </div>
          {recipes.map((r) => (
            <div className="tip-row" key={r.id}>
              {rName(r)}
              <span className="tip-dim"> · {recipeFlow(r)}</span>
            </div>
          ))}
        </>
      )}
      {wouldThrottle && (
        <div className="tip-warn">
          Needs {tpm(b.computeDraw)} TPM but only {tpm(Math.max(0, headroom))} is spare —
          placing this throttles that pool. Add capacity first.
        </div>
      )}
    </>
  );
}

export default function BuildDialog({
  state,
  freshUnlocks,
  initialTab,
  onClose,
  onPick,
  onSign,
  onAssign,
}: Props) {
  const { t } = useLang();
  const { bName, iName } = useContent();
  const unlocked = useMemo(
    () =>
      BUILDINGS.filter(
        (b) =>
          state.unlockedBuildings.includes(b.id) &&
          !isWithdrawn(b, state.priceIndex) &&
          buildingEnabled(b.id, state.addons),
      ),
    [state.unlockedBuildings, state.priceIndex, state.addons],
  );

  const available = TABS.filter(
    (t) => t === 'Contracts' || unlocked.some((b) => b.tier === t),
  );
  const [tab, setTab] = useState<BuildTab>(
    initialTab && available.includes(initialTab) ? initialTab : available[0],
  );
  const active = available.includes(tab) ? tab : available[0];
  const headroom = state.compute.supplyKtpm - state.compute.demandKtpm;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide build-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="badge">{t('build.title')}</span>
          <h2>{active === 'Contracts' ? t('build.contracts') : active}</h2>
        </div>

        <div className="build-split">
        <div className="tabs vertical">
          {available.map((t) => (
            <button
              key={t}
              className={`tab${t === active ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              <span className="tab-label">{t}</span>
              {t === 'Contracts'
                ? hasUnseenOffers(state) && <span className="reddot" />
                : (
                    <span className="tab-count">
                      {unlocked.filter((b) => b.tier === t).length}
                    </span>
                  )}
            </button>
          ))}
        </div>

        <div className="tab-body">
          {active === 'Contracts' ? (
            <MarketplaceBody state={state} onSign={onSign} />
          ) : (
            <>
              {(() => {
                const inTab = unlocked.filter((b) => b.tier === active);
                const groups = GROUP_ORDER.map((g) => ({
                  g,
                  members: inTab.filter((b) => groupOf(b, state.unlockedRecipes) === g),
                })).filter((x) => x.members.length > 0);
                // One group is not a grouping; skip the header rather than
                // labelling a list with the only thing it could be.
                const showHeads = groups.length > 1;
                return groups.map(({ g, members }) => (
                  <div className="build-group" key={g}>
                    {showHeads && <div className="build-group-head">{t(GROUP_KEY[g])}</div>}
                    <div className="build-grid">
              {members
                .map((b) => {
                  const price = buildingCostAt(b, state.priceIndex);
                  const affordable = state.credits >= price;
                  // Kept in the list rather than hidden: a card that vanishes
                  // reads as a bug, a dead one reads as a rule.
                  const capped = b.maxCount !== undefined && countOf(state, b.id) >= b.maxCount;
                  const makes = makesItems(b.id, state.unlockedRecipes);
                  const isNew = freshUnlocks.includes(b.id);
                  const wouldThrottle = b.kind !== 'capacity' && b.computeDraw > headroom;
                  const slot = state.hotbar.indexOf(b.id);

                  return (
                    <Tip key={b.id} content={<BuildTip b={b} state={state} />} width={290}>
                      <div className={`build-card${isNew ? ' fresh' : ''}${capped ? ' capped' : ''}`}>
                        <button
                          className="build-card-main"
                          disabled={!affordable || capped}
                          onClick={() => {
                            onPick(b.id);
                            onClose();
                          }}
                        >
                          <span className="glyph" style={{ background: b.color, color: inkOn(b.color) }}>{b.icon}</span>
                          <span className="meta">
                            <span className="name">
                              {bName(b)}
                              {isNew && <span className="new-badge">NEW</span>}
                              {wouldThrottle && !capped && (
                                <span className="warn-badge" title="Not enough spare capacity">!</span>
                              )}
                              {capped && <span className="cap-badge">{t('build.built')}</span>}
                            </span>
                            <span className="sub mono">
                              {money(price)}
                              {b.monthlyCost > 0 ? ` +${money(b.monthlyCost)}/mo` : ''} ·{' '}
                              {b.kind === 'capacity'
                                ? `+${tpm(b.computeSupply)}`
                                : `${tpm(b.computeDraw)}`} TPM
                            </span>
                            {makes.length > 0 && (
                              <span className="sub makes">
                                Makes{' '}
                                {makes.map((id, i) => (
                                  <span key={id} style={{ color: item(id).color }}>
                                    {i > 0 ? ', ' : ''}{iName(item(id))}
                                  </span>
                                ))}
                              </span>
                            )}
                          </span>
                        </button>
                        <button
                          className={`slot-assign${slot >= 0 ? ' set' : ''}`}
                          title={
                            slot >= 0
                              ? `On quick-build key ${HOTBAR_KEYS[slot]} — click to remove`
                              : 'Assign to the first free quick-build key'
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            onAssign(b.id);
                          }}
                        >
                          {slot >= 0 ? HOTBAR_KEYS[slot] : '＋'}
                        </button>
                      </div>
                    </Tip>
                  );
                })}
                    </div>
                  </div>
                ));
              })()}
            </>
          )}
        </div>
        </div>

        <button className="offer-close" onClick={onClose}>{t('build.close')}</button>
      </div>
    </div>
  );
}
