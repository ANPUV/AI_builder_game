import {
  BALANCE,
  VENDORS,
  building,
  item,
  poolColor,
  recipe,
  type Pool,
  type Vendor,
} from '../data';
import { inputPorts, outputPorts } from '../engine/factory';
import { machineComputeSupply, statusLabel } from '../engine/simulate';
import { craftProgress, NODE_W, ROW_H } from './geometry';
import type { Machine, MachineStatus } from '../engine/types';
import { inkOn, money, tpm } from './format';
import { useContent } from '../i18n/useLang';
import { useFocusLabel } from './FocusPicker';

const STATUS_COLOR: Record<MachineStatus, string> = {
  running: 'var(--good)',
  idle: 'var(--muted)',
  disabled: '#4a5464',
  starved: 'var(--warn)',
  blocked: 'var(--warn)',
  throttled: 'var(--bad)',
  broke: 'var(--bad)',
  audited: '#c46f6f',
  awaiting: '#c9a13d',
  broken: '#ff4d4d',
  unfocused: '#8f7fc4',
  unmanaged: 'var(--warn)',
  curtailed: '#4a8fa8',
  disputed: '#c98a3d',
  disclosed: '#5f9e7a',
  // A dead contract, not a stalled one: the same red the danger tokens use.
  expired: 'var(--bad)',
};

/**
 * A port is an orb: the item's colour, a specular highlight from the top left
 * and a halo in the same colour. The highlight is a class rule; the colour and
 * its halo have to be inline because only the item knows them.
 */
const orb = (color: string) => ({ backgroundColor: color, boxShadow: `0 0 10px ${color}` });

interface Props {
  machine: Machine;
  status: MachineStatus;
  selected: boolean;
  /** Item being dragged from an output port, so valid targets can light up. */
  pendingItemId: string | null;
  /** Press Generate on a manual node. The click IS the mechanic. */
  onGenerate: (id: string) => void;
}

export default function MachineNode({
  machine,
  status,
  selected,
  pendingItemId,
  onGenerate,
}: Props) {
  const { bName, iName, rName } = useContent();
  const focusLabel = useFocusLabel();
  const b = building(machine.buildingId);
  const r = recipe(machine.recipeId);
  if (!b) return null;

  const ins = inputPorts(machine);
  const outs = outputPorts(machine);
  const rows = Math.max(1, ins.length, outs.length);
  const isCapacity = b.kind === 'capacity';

  const highlight = (itemId: string): boolean =>
    pendingItemId !== null && itemId === pendingItemId;

  return (
    <div
      className={`node${selected ? ' selected' : ''}${machine.enabled ? '' : ' off'}${
        machine.broken ? ' broken' : ''
      }${machine.groupId ? ' grouped' : ''}`}
      style={{ left: machine.x, top: machine.y, width: NODE_W }}
      data-node-id={machine.id}
    >
      {/* backgroundColor, not background: the shorthand would clear the sheen
          gradient the stylesheet paints on top of the building's colour. */}
      <div className="node-header" style={{ backgroundColor: b.color, color: inkOn(b.color) }}>
        <span className="glyph">{b.icon}</span>
        <span className="title">{bName(b)}</span>
        <span
          className={`dot${status === 'running' ? ' running' : ''}`}
          style={{
            background: STATUS_COLOR[status],
            boxShadow: `0 0 9px ${STATUS_COLOR[status]}`,
          }}
          title={statusLabel[status]}
        />
      </div>

      <div className="node-rows">
        {Array.from({ length: rows }, (_, i) => {
          const inId = ins[i];
          const outId = outs[i];
          const inItem = inId ? item(inId) : null;
          const outItem = outId ? item(outId) : null;
          const inColor = inItem?.color ?? 'transparent';

          return (
            <div className="node-row" key={i} style={{ height: ROW_H }}>
              <span className="side">
                {inId && (
                  <>
                    <span className="amt mono">{Math.floor(machine.inputs[inId] ?? 0)}</span>
                    <span className="name">{inItem ? iName(inItem) : ''}</span>
                  </>
                )}
              </span>
              <span className="side">
                {outItem && (
                  <>
                    <span className="name">{iName(outItem)}</span>
                    <span className="amt mono">{Math.floor(machine.outputs[outId] ?? 0)}</span>
                  </>
                )}
              </span>

              {inId && (
                <div
                  className={`port in${highlight(inId) ? ' target' : ''}`}
                  style={orb(inColor)}
                  data-port="in"
                  data-machine-id={machine.id}
                  data-item-id={inId}
                />
              )}
              {outItem && (
                <div
                  className="port out"
                  style={orb(outItem.color)}
                  data-port="out"
                  data-machine-id={machine.id}
                  data-item-id={outId}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="node-footer">
        <div className="row">
          <span>
            {r ? rName(r) : 'No recipe'}
            {b.vendorScoped && (
              <span
                className="vendor-tag"
                style={{
                  color: machine.vendor ? poolColor(machine.vendor as Pool) : 'var(--warn)',
                }}
              >
                {machine.vendor ? VENDORS[machine.vendor as Vendor].short : 'SET?'}
              </span>
            )}
            {/* An agent's configuration is one dropdown — reading it should not
                mean opening the inspector. */}
            {b.kind === 'agent' && b.agentRole !== 'console' && (
              <span className="vendor-tag" style={{ color: 'var(--muted)' }}>
                → {focusLabel(machine.focus)}
              </span>
            )}
          </span>
          <span className="mono">
            {isCapacity
              ? `+${tpm(machineComputeSupply(machine))}`
              : r?.payout
                ? money(r.payout)
                : `${Math.round(machine.clock * 100)}%`}
          </span>
        </div>
        {status === 'awaiting' && (
          <button
            type="button"
            className="generate"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onGenerate(machine.id);
            }}
          >
            ⚡ Generate
          </button>
        )}
        {machine.broken && (
          <div className="blown-tag">
            {machine.repairing ? `Repairing… ${Math.ceil(machine.repairing)}s` : 'Blown'}
          </div>
        )}
        <div className="progress">
          <div
            style={{
              width: `${craftProgress(machine) * 100}%`,
              background: `linear-gradient(90deg, var(--accent), ${
                machine.clock > 1 ? 'var(--warn)' : 'var(--good)'
              })`,
              transition: `width ${BALANCE.tickSeconds}s linear`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
