import { useEffect, useState } from 'react';
import {
  HOTBAR_KEYS,
  assignFirstFreeHotkey,
  removeLink,
  removeMachines,
  setHotkey,
} from '../engine/factory';
import { hasUnseenOffers, markOffersSeen } from '../engine/market';
import { featureEnabled } from '../data';
import BankDialog from './BankDialog';
import BuildDialog, { type BuildTab } from './BuildDialog';
import RaiseFundDialog from './RaiseFundDialog';
import SettingsDialog from './SettingsDialog';
import EsgDialog from './EsgDialog';
import Canvas, { machineIds, type Pending, type Selection } from './Canvas';
import Canvas3D from './Canvas3D';
import Coach from './Coach';
import Inspector from './Inspector';
import Hotbar from './Hotbar';
import TechTree from './TechTree';
import TopBar from './TopBar';
import UnlockPanel from './UnlockPanel';
import VentureCapitalOffer from './VentureCapitalOffer';
import { money } from './format';
import { useGame } from './useGame';
import { useTheme } from './useTheme';
import { LangProvider, useLang } from '../i18n/useLang';

export default function App({ onSignOut }: { onSignOut?: () => void } = {}) {
  // The whole game tree reads one language context; nothing below takes a prop.
  return (
    <LangProvider>
      <GameShell onSignOut={onSignOut} />
    </LangProvider>
  );
}

function GameShell({ onSignOut }: { onSignOut?: () => void }) {
  const { t } = useLang();
  const game = useGame();
  /**
   * Theme is owned here rather than by whichever component happens to draw its
   * toggle. `useTheme` is local state that writes `data-theme` onto the root in
   * an effect, so it has to live somewhere that is always mounted — hanging it
   * off the Settings dialog would mean the page rendered unthemed until the
   * player opened Settings, and flipped the moment they did.
   */
  const { theme, toggleTheme } = useTheme();
  // 2D is the editor you build in; the 3D floor is a view of what you built.
  // Opening straight into it put a camera between the player and the work.
  const [threeD, setThreeD] = useState(false);
  const FactoryCanvas = threeD ? Canvas3D : Canvas;
  const [selection, setSelection] = useState<Selection>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  /** The build dialog, and which tab it should land on. */
  const [dialog, setDialog] = useState<BuildTab | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [esgOpen, setEsgOpen] = useState(false);
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
      <TopBar
        game={game}
        onSignOut={onSignOut}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenEsg={() => setEsgOpen(true)}
      />
      <div className="body">
        <FactoryCanvas
          game={game}
          selection={selection}
          setSelection={setSelection}
          pending={pending}
          setPending={setPending}
          onOpenBuild={() => openDialog()}
        >
          <div className="left-rail">
            <button className="rail-btn" onClick={() => setThreeD(!threeD)}>{threeD ? '2D editor' : '3D floor'}</button>
            {featureEnabled('ventureCapital', game.state.addons) && (
              <button
                className="rail-btn"
                onClick={() => setBankOpen(true)}
                title={t('vc.openBank')}
              >
                {t('vc.openBank')}
              </button>
            )}
            <button className="build-fab" onClick={() => openDialog()} title={t('build.openTitle')}>
              <span>＋</span>
              {hasUnseenOffers(game.state) && <span className="reddot" />}
            </button>
            {featureEnabled('ventureCapital', game.state.addons) && (
              <button
                className="rail-btn"
                onClick={game.openRaiseFund}
                title={t('vc.raiseFund')}
              >
                {t('vc.raiseFund')}
              </button>
            )}
            <button
              className={`rail-btn${treeOpen ? ' active' : ''}`}
              onClick={() => setTreeOpen((open) => !open)}
              title={t('side.showTechTree')}
            >
              {t('side.techTree')}
            </button>
          </div>
          {treeOpen && (
            <TechTree state={game.state} onClose={() => setTreeOpen(false)} />
          )}
          <Hotbar
            state={game.state}
            pendingBuilding={pending?.offerId ? null : (pending?.buildingId ?? null)}
            onPick={arm}
            onClear={(slot) => game.act((st) => setHotkey(st, slot, null))}
            onOpenDialog={() => openDialog()}
          />
        </FactoryCanvas>
        <div className="sidebar right">
          <section className="panel">
            <div className="section-title">{t('side.nextStep')}</div>
            <Coach state={game.state} />
          </section>
          <section className="panel panel-grow">
            <div className="section-title">{t('side.inspector')}</div>
            <Inspector game={game} selection={selection} setSelection={setSelection} />
          </section>
        </div>
      </div>
      {settingsOpen && (
        <SettingsDialog
          game={game}
          theme={theme}
          onToggleTheme={toggleTheme}
          addons={game.state.addons}
          onToggleAddon={game.setAddon}
          linkShape={game.state.linkShape}
          onLinkShape={game.setLinkShape}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {bankOpen && (
        <BankDialog
          state={game.state}
          onDraw={(amount) => {
            game.drawLoan(amount);
            setBankOpen(false);
          }}
          onClose={() => setBankOpen(false)}
        />
      )}

      {esgOpen && (
        <EsgDialog
          state={game.state}
          onPublish={game.publishDisclosure}
          onBuyCredits={game.buyCarbonCredits}
          onClose={() => setEsgOpen(false)}
        />
      )}

      {game.raiseFundOpen && (
        <RaiseFundDialog
          state={game.state}
          offer={game.raiseFundOffer}
          onConfirm={game.confirmRaiseFund}
          onClose={game.closeRaiseFund}
        />
      )}

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
      {game.pendingUnlock ? (
        <UnlockPanel
          milestoneId={game.pendingUnlock}
          addons={game.state.addons}
          onClose={game.dismissUnlock}
        />
      ) : (
        game.pendingRaise && (
          <VentureCapitalOffer
            state={game.state}
            offer={game.pendingRaise}
            onAccept={() => game.resolveRaise(true)}
            onDecline={() => game.resolveRaise(false)}
          />
        )
      )}
    </div>
  );
}
