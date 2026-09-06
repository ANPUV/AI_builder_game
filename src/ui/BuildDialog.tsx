import { useMemo, useState } from 'react';
import {
  BUILDINGS,
  RECIPES_BY_BUILDING,
  VENDORS,
  buildingCostAt,
  isWithdrawn,
  item,
  makesItems,
  poolColor,
  takesItems,
  type Building,
  type Pool,
  type Vendor,
} from '../data';
import { HOTBAR_KEYS } from '../engine/factory';
import type { GameState } from '../engine/types';
import type { Pending } from './Canvas';
import { money, recipeFlow, tpm } from './format';
import { MarketplaceBody } from './Marketplace';
import Tip from './Tip';

/** Tab order. 'Contracts' is special: it renders the contract board. */
const TABS = [
  'Demand', 'Online Models', 'Local Models', 'Home Lab', 'Retrieval', 'Agents',
  'Slop', 'Compliance', 'Capacity', 'Training', 'Silicon', 'Contracts',
] as const;
export type BuildTab = (typeof TABS)[number];

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
  if (!ids.length) return null;
  return (
    <div className="tip-kv">
      <span>{label}</span>
      <span style={{ textAlign: 'right' }}>
        {ids.map((id) => (
          <span key={id} style={{ color: item(id).color, marginLeft: 5 }}>
            {item(id).icon} {item(id).name}
          </span>
        ))}
      </span>
    </div>
  );
}

export function BuildTip({ b, state }: { b: Building; state: GameState }) {
  const recipes = (RECIPES_BY_BUILDING[b.id] ?? []).filter((r) =>
    state.unlockedRecipes.includes(r.id),
  );
  const headroom = state.compute.supplyKtpm - state.compute.demandKtpm;
  const wouldThrottle = b.kind !== 'capacity' && b.computeDraw > headroom;

  return (
    <>
      <div className="tip-title">
        <span className="tip-glyph" style={{ background: b.color }}>{b.icon}</span>
        {b.name}
      </div>
      <div className="tip-body">{b.description}</div>

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
              {r.name}
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
  const unlocked = useMemo(
    () =>
      BUILDINGS.filter(
        (b) => state.unlockedBuildings.includes(b.id) && !isWithdrawn(b, state.priceIndex),
      ),
    [state.unlockedBuildings, state.priceIndex],
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
          <span className="badge">Build</span>
          <h2>{active === 'Contracts' ? 'Contract offers' : active}</h2>
        </div>

        <div className="tabs">
          {available.map((t) => (
            <button
              key={t}
              className={`tab${t === active ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t}
              {t !== 'Contracts' && (
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
            <div className="build-grid">
              {unlocked
                .filter((b) => b.tier === active)
                .map((b) => {
                  const price = buildingCostAt(b, state.priceIndex);
                  const affordable = state.credits >= price;
                  const makes = makesItems(b.id, state.unlockedRecipes);
                  const isNew = freshUnlocks.includes(b.id);
                  const wouldThrottle = b.kind !== 'capacity' && b.computeDraw > headroom;
                  const slot = state.hotbar.indexOf(b.id);

                  return (
                    <Tip key={b.id} content={<BuildTip b={b} state={state} />} width={290}>
                      <div className={`build-card${isNew ? ' fresh' : ''}`}>
                        <button
                          className="build-card-main"
                          disabled={!affordable}
                          onClick={() => {
                            onPick(b.id);
                            onClose();
                          }}
                        >
                          <span className="glyph" style={{ background: b.color }}>{b.icon}</span>
                          <span className="meta">
                            <span className="name">
                              {b.name}
                              {isNew && <span className="new-badge">NEW</span>}
                              {wouldThrottle && (
                                <span className="warn-badge" title="Not enough spare capacity">!</span>
                              )}
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
                                    {i > 0 ? ', ' : ''}{item(id).name}
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
          )}
        </div>

        <button className="offer-close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
