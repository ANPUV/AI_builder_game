import { useEffect, useState } from 'react';
import {
  HOTBAR_KEYS,
  assignFirstFreeHotkey,
  removeLink,
  removeMachines,
  setHotkey,
} from '../engine/factory';
import { hasUnseenOffers, markOffersSeen } from '../engine/market';
import BuildDialog, { type BuildTab } from './BuildDialog';
import Canvas, { machineIds, type Pending, type Selection } from './Canvas';
import Coach from './Coach';
import Inspector from './Inspector';
import Hotbar from './Hotbar';
import TechTree from './TechTree';
import TopBar from './TopBar';
import UnlockPanel from './UnlockPanel';
import { money } from './format';
import { useGame } from './useGame';

export default function App({ onSignOut }: { onSignOut?: () => void } = {}) {
  const game = useGame();
  const [selection, setSelection] = useState<Selection>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  /** The build dialog, and which tab it should land on. */
  const [dialog, setDialog] = useState<BuildTab | null>(null);
  /** The tech tree lives in a left drawer now, closed until asked for. */
  const [treeOpen, setTreeOpen] = useState(false);

  const openDialog = (tab?: BuildTab) => {
    // Opening the board is what clears the dot — the leads have been looked at.
    if (tab === 'Contracts') game.act((s) => markOffersSeen(s));
    setDialog(tab ?? 'Demand');
  };

  const arm = (buildingId: string) => setPending({ buildingId });

  // Keyboard: delete the selection, escape out of whatever is in progress.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      // Space is the universal pause key in a sim; without it the only control
      // is a button the player has to aim at.
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        game.togglePause();
        return;
      }
      if (e.key === 'Escape') {
        setDialog(null);
        setPending(null);
        setSelection(null);
        return;
      }
      // Quick build. Ignored while a modifier is held so browser tab-switching
      // and the usual shortcuts keep working.
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const slot = HOTBAR_KEYS.indexOf(e.key);
        if (slot >= 0) {
          e.preventDefault();
          const id = game.state.hotbar[slot];
          if (id) setPending({ buildingId: id });
          else openDialog();
          return;
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        e.preventDefault();
        if (selection.kind === 'link') {
          game.act((s) => removeLink(s, selection.id));
        } else {
          // One toast for the whole demolition, not one per node.
          const result = game.act((s) => removeMachines(s, machineIds(selection)));
          if (result.removed > 1) {
            game.toast(
              `Demolished ${result.removed} nodes — refunded ${money(result.refund)}`,
              'info',
            );
          }
        }
        setSelection(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, game]);

  return (
    <div className="app">
      <TopBar game={game} onSignOut={onSignOut} />
      <div className="body">
        <Canvas
          game={game}
          selection={selection}
          setSelection={setSelection}
          pending={pending}
          setPending={setPending}
        >
          <div className="left-rail">
            <button className="build-fab" onClick={() => openDialog()} title="Build (or press 1-0)">
              <span>＋</span>
              {hasUnseenOffers(game.state) && <span className="reddot" />}
            </button>
            <button
              className={`rail-btn${treeOpen ? ' active' : ''}`}
              onClick={() => setTreeOpen((open) => !open)}
              title="Show the tech tree"
            >
              Tech tree
            </button>
          </div>
          {treeOpen && (
            <div className="left-drawer">
              <div className="drawer-head">
                <span className="section-title">Tech tree</span>
                <button className="drawer-close" onClick={() => setTreeOpen(false)} title="Close">
                  ✕
                </button>
              </div>
              <div className="drawer-body">
                <TechTree state={game.state} />
              </div>
            </div>
          )}
          <Hotbar
            state={game.state}
            pendingBuilding={pending?.offerId ? null : (pending?.buildingId ?? null)}
            onPick={arm}
            onClear={(slot) => game.act((st) => setHotkey(st, slot, null))}
            onOpenDialog={() => openDialog()}
          />
        </Canvas>
        <div className="sidebar right">
          <section className="panel">
            <div className="section-title">Next step</div>
            <Coach state={game.state} />
          </section>
          <section className="panel panel-grow">
            <div className="section-title">Inspector</div>
            <Inspector game={game} selection={selection} setSelection={setSelection} />
          </section>
        </div>
      </div>
      {dialog && (
        <BuildDialog
          state={game.state}
          freshUnlocks={game.freshUnlocks}
          initialTab={dialog}
          onClose={() => setDialog(null)}
          onPick={arm}
          onSign={(p) => {
            setPending(p);
            setDialog(null);
          }}
          onAssign={(id) => {
            const existing = game.state.hotbar.indexOf(id);
            if (existing >= 0) game.act((st) => setHotkey(st, existing, null));
            else {
              const slot = game.act((st) => assignFirstFreeHotkey(st, id));
              if (slot < 0) game.toast('Every quick-build slot is taken', 'bad');
            }
          }}
        />
      )}
      {game.pendingUnlock && (
        <UnlockPanel milestoneId={game.pendingUnlock} onClose={game.dismissUnlock} />
      )}
    </div>
  );
}
