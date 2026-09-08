import { useState } from 'react';
import {
  ALL_VENDORS,
  BALANCE,
  RECIPES_BY_BUILDING,
  VENDORS,
  building,
  item,
  poolColor,
  poolName,
  recipe,
  type Vendor,
} from '../data';
import {
  removeLink,
  setLinkShape,
  currentCost,
  groupMachines,
  groupOf,
  removeMachine,
  removeMachines,
  repairCost,
  repairMachine,
  triggerCraft,
  ungroup,
  setClock,
  setEnabled,
  setFocus,
  setRarityFloor,
  setRecipe,
  setVendor,
} from '../engine/factory';
import FocusPicker from './FocusPicker';
import NodeWiki from './NodeWiki';
import { CoolingPicker, coolingSpec } from './CoolingPicker';
import { setCooling } from '../engine/factory';
import { coolingOf, effectiveFootprint } from '../engine/esgRules';
import { featureEnabled } from '../data/addons';
import {
  agentCapacity,
  machineComputeDraw,
  machineDrawPerMin,
  machineRatePerMin,
  poolOf,
  statusLabel,
} from '../engine/simulate';
import { onSiteCount } from '../engine/simulate';
import { money, tpm } from './format';
import type { Selection } from './Canvas';
import type { Game } from './useGame';
import { useContent, useLang } from '../i18n/useLang';

interface Props {
  game: Game;
  selection: Selection;
  setSelection: (s: Selection) => void;
}

const round = (n: number): string => (Math.round(n * 10) / 10).toString();

export default function Inspector({ game, selection, setSelection }: Props) {
  const { state, act, toast } = game;
  const { t } = useLang();
  const { bName, bDesc, iName, rName } = useContent();
  /**
   * The wiki is a property of "whatever node is selected", not of one node, so
   * it stays open across a change of selection and repaints for the new one.
   * Declared before the early returns below because it is a hook.
   */
  const [wikiOpen, setWikiOpen] = useState(false);

  if (!selection) {
    return (
      <p className="empty">
        {t('inspector.empty')}
      </p>
    );
  }

  if (selection.kind === 'link') {
    const link = state.links[selection.id];
    if (!link) return <p className="empty">{t('inspector.beltGone')}</p>;
    const from = state.machines[link.fromId];
    const to = state.machines[link.toId];
    return (
      <>
        <div className="field">
          <label>{t('inspector.belt')}</label>
          <div className="kv">
            <span className="k">{t('inspector.carrying')}</span>
            <span>{iName(item(link.itemId))}</span>
          </div>
          <div className="kv">
            <span className="k">{t('inspector.from')}</span>
            <span>{(() => { const fb = building(from?.buildingId ?? ''); return fb ? bName(fb) : '—'; })()}</span>
          </div>
          <div className="kv">
            <span className="k">{t('inspector.to')}</span>
            <span>{(() => { const tb = building(to?.buildingId ?? ''); return tb ? bName(tb) : '—'; })()}</span>
          </div>
          <div className="kv">
            <span className="k">{t('inspector.capacity')}</span>
            <span className="mono">{BALANCE.linkRatePerMin}/min</span>
          </div>
        </div>
        <div className="field">
          <label>{t('inspector.shape')}</label>
          {/* Routing is cosmetic — throughput does not change — but forty
              crossing curves are unreadable, so let the player straighten. */}
          <div className="seg">
            {(['curve', 'straight', 'elbow'] as const).map((shape) => (
              <button
                key={shape}
                className={(link.shape ?? 'curve') === shape ? 'active' : ''}
                onClick={() => act((s) => setLinkShape(s, link.id, shape))}
              >
                {t(shape === 'curve' ? 'inspector.curve' : shape === 'straight' ? 'inspector.straight' : 'inspector.elbow')}
              </button>
            ))}
          </div>
        </div>
        <button
          className="danger"
          style={{ width: '100%' }}
          onClick={() => {
            act((s) => removeLink(s, link.id));
            setSelection(null);
          }}
        >
          {t('inspector.removeBelt')}
        </button>
      </>
    );
  }

  const selected = selection.ids.map((id) => state.machines[id]).filter(Boolean);
  if (!selected.length) return <p className="empty">Machine is gone.</p>;

  /*
   * More than one node selected. The panel drops to the operations that
   * genuinely apply to a block — grouping, power, demolition — rather than
   * pretending a recipe dropdown means anything across six chassis.
   */
  if (selected.length > 1) {
    const ids = selected.map((m) => m.id);
    const counts = new Map<string, number>();
    for (const m of selected) counts.set(m.buildingId, (counts.get(m.buildingId) ?? 0) + 1);
    const refund = selected.reduce(
      (sum, m) => sum + currentCost(state, m.buildingId) * BALANCE.refundRate,
      0,
    );
    const monthly = selected.reduce((sum, m) => sum + (building(m.buildingId)?.monthlyCost ?? 0), 0);
    const draw = selected.reduce((sum, m) => sum + machineComputeDraw(m), 0);
    const anyOff = selected.some((m) => !m.enabled);
    const groupIds = [...new Set(selected.map((m) => m.groupId).filter(Boolean))] as string[];

    return (
      <>
        <div className="field">
          <div className="card" style={{ marginBottom: 10 }}>
            <div className="head">
              <b>{selected.length} nodes selected</b>
            </div>
            {[...counts.entries()].map(([id, n]) => (
              <div className="kv" key={id}>
                <span className="k">{(() => { const gb = building(id); return gb ? bName(gb) : id; })()}</span>
                <span className="mono">×{n}</span>
              </div>
            ))}
            <div className="kv">
              <span className="k">Compute draw</span>
              <span className="mono">−{tpm(draw)} TPM</span>
            </div>
            {monthly > 0 && (
              <div className="kv">
                <span className="k">Subscriptions</span>
                <span className="mono">{money(monthly)}/mo</span>
              </div>
            )}
            <div className="kv">
              <span className="k">Scrap value</span>
              <span className="mono">{money(Math.floor(refund))}</span>
            </div>
          </div>
        </div>

        <button
          style={{ width: '100%', marginBottom: 6 }}
          onClick={() => {
            const outcome = act((s) => groupMachines(s, ids));
            if (!outcome.ok) toast(outcome.reason, 'bad');
            else toast(`Grouped ${ids.length} nodes — they now fail together`, 'good');
          }}
        >
          Group these {ids.length} nodes
        </button>
        {groupIds.length > 0 && (
          <button
            style={{ width: '100%', marginBottom: 6 }}
            onClick={() => {
              act((s) => groupIds.forEach((g) => ungroup(s, g)));
              toast('Ungrouped', 'info');
            }}
          >
            Ungroup
          </button>
        )}

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            style={{ flex: 1 }}
            onClick={() => act((s) => ids.forEach((id) => setEnabled(s, id, anyOff)))}
          >
            {anyOff ? 'Switch all on' : 'Switch all off'}
          </button>
          <button
            className="danger"
            style={{ flex: 1 }}
            onClick={() => {
              const result = act((s) => removeMachines(s, ids));
              setSelection(null);
              toast(`Demolished ${result.removed} — refunded ${money(result.refund)}`, 'info');
            }}
          >
            Demolish all
          </button>
        </div>
      </>
    );
  }

  const machine = selected[0];

  const b = building(machine.buildingId);
  const r = recipe(machine.recipeId);
  if (!b) return null;

  const options = (RECIPES_BY_BUILDING[b.id] ?? []).filter((opt) =>
    state.unlockedRecipes.includes(opt.id),
  );
  const status = state.status[machine.id] ?? 'idle';
  const esgOn = featureEnabled('esg', state.addons);
  const isCapacity = b.kind === 'capacity';
  const nodePool = poolOf(machine);
  const poolStat = nodePool ? state.compute.pools[nodePool] : undefined;
  const refund = currentCost(state, machine.buildingId) * BALANCE.refundRate;
  const selectedGroup = groupOf(state, machine.id);
  /**
   * Nodes close enough to be one rig. Grouping is opt-in and proximity is the
   * only signal we have for "these belong together" — the player laid them out.
   */
  const groupCandidates = Object.values(state.machines).filter(
    (o) =>
      o.id !== machine.id &&
      !o.groupId &&
      Math.abs(o.x - machine.x) < 320 &&
      Math.abs(o.y - machine.y) < 260,
  );

  return (
    <>
      {wikiOpen && <NodeWiki b={b} state={state} onClose={() => setWikiOpen(false)} />}
      <div className="field">
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="head">
            <span className="head-name">
              <b>{bName(b)}</b>
              <button
                className="wiki-btn"
                title={t('wiki.open')}
                aria-label={t('wiki.open')}
                onClick={() => setWikiOpen(true)}
              >
                ?
              </button>
            </span>
            <span
              className="badge"
              style={{
                background: status === 'running' ? '#1d3d28' : '#3d2a1d',
                color: status === 'running' ? 'var(--good)' : 'var(--warn)',
              }}
            >
              {statusLabel[status]}
            </span>
          </div>
          <div className="blurb">{bDesc(b)}</div>
          <div className="kv">
            <span className="k">Compute</span>
            <span className="mono">
              {isCapacity
                ? `+${tpm(b.computeSupply * machine.clock)} TPM`
                : `−${tpm(machineComputeDraw(machine))} TPM`}
            </span>
          </div>
          {nodePool && (
            <div className="kv">
              <span className="k">{isCapacity ? 'Supplies' : 'Limited by'}</span>
              <span className="mono" style={{ color: poolColor(nodePool) }}>
                {poolName(nodePool)}
                {poolStat && poolStat.satisfaction < 0.999
                  ? ` · ${Math.round(poolStat.satisfaction * 100)}%`
                  : ''}
              </span>
            </div>
          )}
          {b.monthlyCost > 0 && (
            <div className="kv">
              <span className="k">Subscription</span>
              <span className="mono">{money(b.monthlyCost)}/mo</span>
            </div>
          )}
          {b.dataRisk !== 0 && (
            <div className="kv">
              <span className="k">Data risk</span>
              <span
                className="mono"
                style={{ color: b.dataRisk > 0 ? 'var(--bad)' : 'var(--good)' }}
              >
                {b.dataRisk > 0 ? `+${b.dataRisk} exposure` : `${b.dataRisk} exposure`}
              </span>
            </div>
          )}
          {/* The ESG addon's physical line. Shown only with the addon on:
              a player who never enabled it should not be told their Gaming PC
              draws half a kilowatt. */}
          {esgOn && (b.powerKw ?? 0) > 0 && (
            <div className="kv">
              <span className="k">Draw</span>
              <span className="mono">
                {((b.powerKw ?? 0) * machine.clock * coolingSpec(coolingOf(machine)).pue).toFixed(
                  (b.powerKw ?? 0) < 10 ? 2 : 0,
                )}{' '}
                kW
                {coolingSpec(coolingOf(machine)).litres > 0
                  ? ` · ${Math.round((b.powerKw ?? 0) * machine.clock * 730 * coolingSpec(coolingOf(machine)).litres).toLocaleString()} L/mo`
                  : ' · no water'}
              </span>
            </div>
          )}
          {esgOn && (b.landUse ?? 0) > 0 && (
            <div className="kv">
              <span className="k">Land use</span>
              <span className="mono" style={{ color: 'var(--warn)' }}>+{b.landUse}</span>
            </div>
          )}
          {esgOn && (b.laborLoad ?? 0) !== 0 && (
            <div className="kv">
              <span className="k">Labour load</span>
              <span
                className="mono"
                style={{ color: (b.laborLoad ?? 0) > 0 ? 'var(--bad)' : 'var(--good)' }}
              >
                {(b.laborLoad ?? 0) > 0 ? `+${b.laborLoad}` : b.laborLoad} social
              </span>
            </div>
          )}
          {esgOn && ((b.provenanceRisk ?? 0) !== 0 || (r?.provenanceRisk ?? 0) !== 0) && (
            <div className="kv">
              <span className="k">Provenance</span>
              <span
                className="mono"
                style={{
                  color:
                    (b.provenanceRisk ?? 0) + (r?.provenanceRisk ?? 0) > 0
                      ? 'var(--bad)'
                      : 'var(--good)',
                }}
              >
                {(b.provenanceRisk ?? 0) + (r?.provenanceRisk ?? 0) > 0 ? '+' : ''}
                {(b.provenanceRisk ?? 0) + (r?.provenanceRisk ?? 0)} governance
              </span>
            </div>
          )}
          {/* The Footprint ceiling sits beside the Exposure ceiling that is
              already here — two different doors, and the player should be able
              to see which one is shut. */}
          {esgOn && r?.maxFootprint !== undefined && (
            <div className="kv">
              <span className="k">Footprint ceiling</span>
              <span
                className="mono"
                style={{
                  color:
                    effectiveFootprint(state) > r.maxFootprint ? 'var(--bad)' : 'var(--good)',
                }}
              >
                {Math.round(effectiveFootprint(state))} / {r.maxFootprint}
                {r.requiresDisclosure ? (state.esg.disclosure ? '' : ' · needs a disclosure') : ''}
              </span>
            </div>
          )}
          {r?.cost ? (
            <div className="kv">
              <span className="k">API spend</span>
              <span className="mono">{money(r.cost)} / craft</span>
            </div>
          ) : null}
          {r?.payout ? (
            <div className="kv">
              <span className="k">Contract pays</span>
              <span className="mono" style={{ color: 'var(--good)' }}>
                {money(r.payout)} / craft
              </span>
            </div>
          ) : null}
          {r?.maxExposure !== undefined ? (
            <div className="kv">
              <span className="k">Exposure ceiling</span>
              <span
                className="mono"
                style={{ color: state.exposure > r.maxExposure ? 'var(--bad)' : 'var(--good)' }}
              >
                {Math.round(state.exposure)} / {r.maxExposure}
              </span>
            </div>
          ) : null}
          {r?.note ? <div className="blurb" style={{ marginTop: 8, opacity: 0.75 }}>{r.note}</div> : null}
        </div>
      </div>

      {/*
        An agent's whole configuration is one dropdown. It sells nothing, so
        what it is POINTED AT is the only decision the player makes about it —
        and a focus with nothing in it is a specialist you are paying to wait.
      */}
      {b.kind === 'agent' && b.agentRole !== 'console' && (
        <>
          <div className="field">
            <div className="tip-kv">
              <span>Agent Drift</span>
              <span
                className="mono"
                style={{ color: (b.agentDrift ?? 0) > 0 ? 'var(--warn)' : 'var(--good)' }}
              >
                {(b.agentDrift ?? 0) > 0 ? `+${b.agentDrift}` : b.agentDrift} · {Math.round(state.agentDrift)} total
              </span>
            </div>
            <div className="tip-kv">
              <span>Headcount</span>
              <span className="mono">
                {agentCapacity(state).used} / {agentCapacity(state).cap}
              </span>
            </div>
          </div>
          <FocusPicker
            state={state}
            focus={machine.focus}
            rarityFloor={machine.rarityFloor}
            onFocus={(focus) => {
              const result = act((s) => setFocus(s, machine.id, focus));
              if (!result.ok) toast(result.reason, 'bad');
            }}
            onRarityFloor={(floor) => {
              const result = act((s) => setRarityFloor(s, machine.id, floor));
              if (!result.ok) toast(result.reason, 'bad');
            }}
          />
        </>
      )}

      {/* Cooling is an operating decision, not a purchase — same shape as the
          provider a vendor-scoped node picks after it lands on the canvas. */}
      {esgOn && (b.powerKw ?? 0) > 0 && (
        <CoolingPicker
          state={state}
          cooling={machine.cooling}
          onChange={(mode) => {
            const result = act((s) => setCooling(s, machine.id, mode));
            if (!result.ok) toast(result.reason, 'bad');
          }}
        />
      )}

      {b.vendorScoped && (
        <div className="field">
          <label>
            Provider
            {!machine.vendor && <span style={{ color: 'var(--warn)' }}> — pick one</span>}
          </label>
          <select
            value={machine.vendor ?? ''}
            onChange={(e) => {
              const result = act((st) => setVendor(st, machine.id, e.target.value || null));
              if (!result.ok) toast(result.reason, 'bad');
            }}
          >
            <option value="">— none —</option>
            {ALL_VENDORS.map((v) => (
              <option key={v} value={v}>
                {VENDORS[v].name}
              </option>
            ))}
          </select>
          <div className="hintline">
            Rate limits do not pool across providers. This buys throughput for{' '}
            {machine.vendor ? VENDORS[machine.vendor as Vendor].name : 'whichever you choose'} only.
            {b.servesNodes !== undefined &&
              ` A free tier covers ${b.servesNodes} node; a second on the same provider stops it counting.`}
          </div>
        </div>
      )}

      {true && (
        <div className="field">
          <label>Recipe</label>
          {options.length === 0 ? (
            <p className="empty" style={{ padding: 0 }}>
              No unlocked recipe fits this chassis yet.
            </p>
          ) : (
            <select
              value={machine.recipeId ?? ''}
              onChange={(e) => {
                const result = act((s) => setRecipe(s, machine.id, e.target.value || null));
                if (!result.ok) toast(result.reason, 'bad');
              }}
            >
              <option value="">— none —</option>
              {options.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {rName(opt)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {r && (
        <div className="field">
          <label>Throughput at {Math.round(machine.clock * 100)}%</label>
          {r.inputs.map((s) => (
            <div className="kv" key={`in-${s.itemId}`}>
              <span className="k">
                ← {iName(item(s.itemId))}{' '}
                <span className="mono" style={{ opacity: 0.7 }}>
                  ({Math.floor(machine.inputs[s.itemId] ?? 0)} held)
                </span>
              </span>
              <span className="mono">{round(machineDrawPerMin(machine, s.itemId))}/min</span>
            </div>
          ))}
          {r.outputs.map((s) => (
            <div className="kv" key={`out-${s.itemId}`}>
              <span className="k">
                → {iName(item(s.itemId))}{' '}
                <span className="mono" style={{ opacity: 0.7 }}>
                  ({Math.floor(machine.outputs[s.itemId] ?? 0)} held)
                </span>
              </span>
              <span className="mono">{round(machineRatePerMin(machine, s.itemId))}/min</span>
            </div>
          ))}
          {r.inputs.length === 0 && r.outputs.length === 0 && (
            <div className="kv">
              <span className="k">Cycle</span>
              <span className="mono">{r.seconds}s, no items</span>
            </div>
          )}
        </div>
      )}

      {true && (
        <div className="field">
          <label>
            Clock speed — {Math.round(machine.clock * 100)}%
            {!isCapacity && machine.clock > 1 && (
              <span style={{ color: 'var(--warn)' }}>
                {' '}
                (compute ×{round(machine.clock ** BALANCE.clockExponent)})
              </span>
            )}
          </label>
          <input
            type="range"
            min={BALANCE.minClock * 100}
            max={BALANCE.maxClock * 100}
            step={5}
            value={machine.clock * 100}
            onChange={(e) => act((s) => setClock(s, machine.id, Number(e.target.value) / 100))}
          />
        </div>
      )}

      {/*
        A blown node supplies nothing, produces nothing, fails every on-site
        audit it was counting toward — and still bills its monthly cost. Repair
        is priced at today's replacement cost, not what you originally paid.
      */}
      {machine.broken && (
        <div className="tip-warn" style={{ marginBottom: 8 }}>
          <b>Blown.</b> Whatever this bay was holding is gone. It is still billing{' '}
          {money(b.monthlyCost)}/mo until you repair it or switch it off.
          <button
            style={{ width: '100%', marginTop: 8 }}
            disabled={!!machine.repairing}
            onClick={() => {
              const outcome = act((s) => repairMachine(s, machine.id));
              if (!outcome.ok) toast(outcome.reason, 'bad');
              else toast('Repair started', 'good');
            }}
          >
            {machine.repairing
              ? `Repairing… ${Math.ceil(machine.repairing)}s`
              : `Repair for ${money(repairCost(state, machine.id))}`}
          </button>
        </div>
      )}

      {r?.manual && !machine.broken && (
        <button
          style={{ width: '100%', marginBottom: 8 }}
          disabled={machine.crafting || !machine.enabled}
          onClick={() => {
            const outcome = act((s) => triggerCraft(s, machine.id));
            if (!outcome.ok) toast(outcome.reason, 'bad');
          }}
        >
          {machine.crafting ? 'Running…' : '⚡ Generate'}
        </button>
      )}

      {r?.requiresOnSite && (
        <div className="tip-kv">
          <span>On-site audit</span>
          <span className="mono">
            {onSiteCount(state, r.requiresOnSite.tier)} / {r.requiresOnSite.count}{' '}
            {r.requiresOnSite.tier}
          </span>
        </div>
      )}

      {(machine.groupId || selectedGroup.length > 1) && (
        <div style={{ marginBottom: 8 }}>
          <div className="tip-kv">
            <span>Group</span>
            <span className="mono">{selectedGroup.length} nodes fail together</span>
          </div>
          {machine.groupId && (
            <button
              style={{ width: '100%', marginTop: 6 }}
              onClick={() => {
                act((s) => ungroup(s, machine.groupId!));
                toast('Ungrouped', 'info');
              }}
            >
              Ungroup
            </button>
          )}
        </div>
      )}

      {!machine.groupId && groupCandidates.length > 0 && (
        <button
          style={{ width: '100%', marginBottom: 8 }}
          onClick={() => {
            const outcome = act((s) =>
              groupMachines(s, [machine.id, ...groupCandidates.map((o) => o.id)]),
            );
            if (!outcome.ok) toast(outcome.reason, 'bad');
            else toast(`Grouped ${groupCandidates.length + 1} nodes — they now fail together`, 'good');
          }}
        >
          Group with {groupCandidates.length} nearby node
          {groupCandidates.length === 1 ? '' : 's'}
        </button>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          style={{ flex: 1 }}
          onClick={() => act((s) => setEnabled(s, machine.id, !machine.enabled))}
        >
          {machine.enabled ? 'Switch off' : 'Switch on'}
        </button>
        <button
          className="danger"
          style={{ flex: 1 }}
          onClick={() => {
            act((s) => removeMachine(s, machine.id));
            setSelection(null);
            toast(`Refunded ${money(Math.floor(refund))}`, 'info');
          }}
        >
          Demolish
        </button>
      </div>
    </>
  );
}
