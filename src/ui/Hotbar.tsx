import { BUILDING_BY_ID, buildingCostAt } from '../data';
import { HOTBAR_KEYS } from '../engine/factory';
import type { GameState } from '../engine/types';
import { money } from './format';
import Tip from './Tip';

interface Props {
  state: GameState;
  /** Currently armed building, so its slot can light up. */
  pendingBuilding: string | null;
  onPick: (buildingId: string) => void;
  onClear: (slot: number) => void;
  onOpenDialog: () => void;
}

/**
 * Quick-build strip along the bottom of the canvas. Keys 1-9 then 0 arm the
 * building in that slot; an empty slot opens the build dialog so the bar is
 * discoverable rather than something you have to be told about.
 */
export default function Hotbar({
  state,
  pendingBuilding,
  onPick,
  onClear,
  onOpenDialog,
}: Props) {
  return (
    <div className="hotbar">
      {state.hotbar.map((id, i) => {
        const b = id ? BUILDING_BY_ID[id] : undefined;
        const price = b ? buildingCostAt(b, state.priceIndex) : 0;
        const affordable = b ? state.credits >= price : true;
        const armed = !!b && pendingBuilding === b.id;

        if (!b) {
          return (
            <button
              key={i}
              className="hot-slot empty"
              onClick={onOpenDialog}
              title={`Slot ${HOTBAR_KEYS[i]} — empty. Assign one from the build dialog.`}
            >
              <span className="hot-key">{HOTBAR_KEYS[i]}</span>
            </button>
          );
        }

        return (
          <Tip
            key={i}
            side="right"
            width={230}
            content={
              <>
                <div className="tip-title">
                  <span className="tip-glyph" style={{ background: b.color }}>{b.icon}</span>
                  {b.name}
                </div>
                <div className="tip-kv">
                  <span>Key</span>
                  <span className="mono">{HOTBAR_KEYS[i]}</span>
                </div>
                <div className="tip-kv">
                  <span>Cost</span>
                  <span className="mono" style={{ color: affordable ? undefined : 'var(--bad)' }}>
                    {money(price)}
                  </span>
                </div>
                <div className="tip-sub">Right-click to clear this slot.</div>
              </>
            }
          >
            <button
              className={`hot-slot${armed ? ' armed' : ''}${affordable ? '' : ' broke'}`}
              onClick={() => onPick(b.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                onClear(i);
              }}
            >
              <span className="hot-key">{HOTBAR_KEYS[i]}</span>
              <span className="hot-glyph" style={{ background: b.color }}>{b.icon}</span>
            </button>
          </Tip>
        );
      })}
    </div>
  );
}
