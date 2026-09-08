import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  BALANCE,
  BUILDING_BY_ID,
  MILESTONE_BY_ID,
  RARITY,
  atLeastRare,
  listingFor,
  rarityOf,
} from '../data';
import { createInitialState } from '../engine/factory';
import {
  clearSave,
  exportSaveJSON,
  importSaveJSON,
  loadState,
  saveState,
} from '../engine/save';
import { advance } from '../engine/simulate';
import {
  acceptRaise,
  declineRaise,
  drawLoan,
  loanProceeds,
  raiseOfferFor,
  type RaiseOffer,
} from '../engine/venture';
import type { GameState } from '../engine/types';
import type { AddonId } from '../data/addons';
import { money } from './format';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad';
}

/** Sim renders are throttled to this; input still repaints immediately. */
const RENDER_INTERVAL_MS = 50;
/** How often the world advances. Background tabs throttle timers to ~1s; the
 *  catch-up cap inside `advance()` keeps that from fast-forwarding the game. */
const TICK_INTERVAL_MS = 50;

export function useGame() {
  const stateRef = useRef<GameState | null>(null);
  if (stateRef.current === null) {
    stateRef.current = loadState() ?? createInitialState();
    if (import.meta.env.DEV) {
      const bridge = (window as unknown as { __ai?: Record<string, unknown> }).__ai;
      if (bridge) bridge.state = stateRef.current;
    }
  }

  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [speed, setSpeed] = useState<number>(1);
  /**
   * The loop reads speed from a ref, not from its closure. Rebuilding the timer
   * every time the player taps a speed button is how pause/unpause ends up
   * racing itself.
   */
  const speedRef = useRef(speed);
  speedRef.current = speed;
  /**
   * The speed to come back to when unpausing. Without this, pause is a one-way
   * door: the ❚❚ button only ever *sets* zero, so pressing it again re-pauses
   * and the only way to resume is to notice you must click 1×.
   */
  const resumeSpeedRef = useRef(1);
  /** When the world was last written to localStorage, for the top bar. */
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  /** Milestone awaiting its unlock panel, and what it made available. */
  const [pendingUnlock, setPendingUnlock] = useState<string | null>(null);
  const [freshUnlocks, setFreshUnlocks] = useState<string[]>([]);
  /**
   * Milestone awaiting its Venture Capital raise offer. Rendered after
   * `pendingUnlock` clears for the same milestone, not alongside it — see
   * what you unlocked, then decide whether to fund it.
   */
  const [pendingRaise, setPendingRaise] = useState<RaiseOffer | null>(null);

  const repaint = useCallback(() => bump(), []);

  const persist = useCallback(() => {
    saveState(stateRef.current!);
    setSavedAt(Date.now());
  }, []);

  /**
   * Placing a node then reloading within the autosave window used to lose the
   * node. Structural changes are cheap to write and rare compared to ticks, so
   * they get their own debounced save instead of waiting for the interval.
   */
  const saveSoon = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSave = useCallback(() => {
    if (saveSoon.current) clearTimeout(saveSoon.current);
    saveSoon.current = setTimeout(persist, 800);
  }, [persist]);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((list) => [...list, { id, text, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3200);
  }, []);

  /** Run a mutation against the live state and repaint. */
  const act = useCallback(
    <T,>(fn: (state: GameState) => T): T => {
      const result = fn(stateRef.current!);
      repaint();
      scheduleSave();
      return result;
    },
    [repaint, scheduleSave],
  );

  const reset = useCallback(() => {
    clearSave();
    stateRef.current = createInitialState();
    setPendingUnlock(null);
    setFreshUnlocks([]);
    setPendingRaise(null);
    if (import.meta.env.DEV) {
      const bridge = (window as unknown as { __ai?: Record<string, unknown> }).__ai;
      if (bridge) bridge.state = stateRef.current;
    }
    repaint();
    toast('Factory reset', 'info');
  }, [repaint, toast]);

  // --- simulation loop ----------------------------------------------------
  // Driven by a timer, not requestAnimationFrame. rAF is suspended entirely
  // while the tab or preview pane is hidden, which froze the simulation and
  // made speed changes — pause and unpause especially — appear to do nothing.
  // A timer keeps ticking (throttled, but ticking), and the loop is built once
  // rather than rebuilt on every speed change.
  useEffect(() => {
    let last = performance.now();
    let lastRender = 0;

    // Coming back from a hidden tab, drop the gap instead of fast-forwarding.
    const onVisibility = () => {
      if (!document.hidden) last = performance.now();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const handle = setInterval(() => {
      const now = performance.now();
      const realSeconds = (now - last) / 1000;
      last = now;

      const currentSpeed = speedRef.current;
      if (currentSpeed <= 0) return; // paused: clock still advances, world does not

      const events = advance(stateRef.current!, realSeconds * currentSpeed);
      for (const id of events.milestonesCompleted) {
        const milestone = MILESTONE_BY_ID[id];
        if (!milestone) continue;
        setPendingUnlock(id);
        setFreshUnlocks(milestone.unlocksBuildings);
        // Snapshot the terms as they stood when the milestone landed. They
        // depend on company health, and a term sheet must not reprice itself
        // while the player is reading it.
        const offer = raiseOfferFor(stateRef.current!, id);
        if (offer) setPendingRaise(offer);
      }

      // Common leads only get the red dot; interrupting play for a $100
      // prosumer signup every 20 seconds would train the player to ignore
      // toasts entirely. Rare ones are worth stopping for.
      for (const offer of events.offersArrived) {
        const listing = listingFor(offer.buildingId);
        if (!listing) continue;
        const rarity = rarityOf(listing.weight);
        if (!atLeastRare(rarity, 'uncommon')) continue;
        toast(
          `${RARITY[rarity].label} contract on the board — ${BUILDING_BY_ID[offer.buildingId]?.name}`,
          'good',
        );
      }
      for (const offer of events.offersExpired) {
        const listing = listingFor(offer.buildingId);
        if (!listing || !atLeastRare(rarityOf(listing.weight), 'rare')) continue;
        toast(`${BUILDING_BY_ID[offer.buildingId]?.name} walked away — the offer expired.`, 'bad');
      }
      for (const loss of events.breaches) {
        toast(`Data breach — ${money(loss)} lost. Contracts frozen while you respond.`, 'bad');
      }

      // A blowout must never be quiet. It destroys parts at today's price and
      // takes every node grouped with it down at the same moment.
      for (const b of events.blowouts) {
        toast(
          `${b.buildingName} blew up — ${money(b.lostPartValue)} of parts destroyed. Repair it or it keeps billing.`,
          'bad',
        );
      }
      for (const f of events.fines) {
        toast(
          f.kind === 'ip'
            ? `Copyright claim — ${money(f.amount)}. A takedown notice is waiting on the node.`
            : `Legal fine — ${money(f.amount)}. Exposure spiked; your regulated contracts just stopped.`,
          'bad',
        );
      }
      // A node vanishing without a word is a bug report, not a mechanic.
      for (const c of events.contractsLost) {
        toast(`${c.buildingName} terminated the contract — three quality misses.`, 'bad');
      }

      // Agentic Ops: an agent acting on its own must never be quiet. It just
      // spent the player's money without asking, which is the entire point.
      for (const s of events.agentSigned) {
        toast(
          s.offBrief
            ? `Sales Agent signed ${s.buildingName} for ${money(s.cost)} — off brief. Drift is doing that.`
            : `Sales Agent signed ${s.buildingName} for ${money(s.cost)}.`,
          s.offBrief ? 'bad' : 'good',
        );
      }
      for (const v of events.agentVetoed) {
        toast(
          `Reviewer blocked a ${v.buildingName} sign at ${money(v.cost)} — it would have emptied the account.`,
          'info',
        );
      }
      for (const b of events.agentBuilt) {
        toast(
          b.wasted > 0
            ? `Coding Agent wired ${b.buildingName} — ${b.nodes} node(s), plus ${b.wasted} nobody asked for.`
            : `Coding Agent wired ${b.buildingName} — ${b.nodes} node(s) placed.`,
          b.wasted > 0 ? 'bad' : 'good',
        );
      }
      for (const c of events.churned) {
        toast(`${c.buildingName} churned — nobody was looking after that account.`, 'bad');
      }
      for (const loss of events.runaways) {
        toast(`A runaway agent spent ${money(loss)} on its own. Drift is too high.`, 'bad');
      }

      if (now - lastRender >= RENDER_INTERVAL_MS) {
        lastRender = now;
        bump();
      }
    }, TICK_INTERVAL_MS);

    return () => {
      clearInterval(handle);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [toast]);

  // --- autosave -----------------------------------------------------------
  useEffect(() => {
    const handle = setInterval(persist, BALANCE.autosaveSeconds * 1000);
    const onLeave = () => persist();
    window.addEventListener('beforeunload', onLeave);
    return () => {
      clearInterval(handle);
      window.removeEventListener('beforeunload', onLeave);
      onLeave();
    };
  }, [persist]);

  return {
    pendingUnlock,
    dismissUnlock: () => setPendingUnlock(null),
    freshUnlocks,
    pendingRaise,

    /** Accept or decline the pending raise offer. Declining is permanent. */
    resolveRaise: useCallback((accept: boolean) => {
      const state = stateRef.current!;
      const offer = pendingRaise;
      if (!offer) return;
      if (accept) {
        const result = acceptRaise(state, offer);
        if (result.ok) toast('Funding round closed', 'good');
        else toast(result.reason, 'bad');
      } else {
        declineRaise(state, offer.milestoneId);
      }
      setPendingRaise(null);
      persist();
      bump();
    }, [pendingRaise, persist, toast]),

    /** Draw a new bank loan. Multiple can be outstanding at once. */
    drawLoan: useCallback((amount: number) => {
      const state = stateRef.current!;
      const result = drawLoan(state, amount);
      if (!result.ok) {
        toast(result.reason, 'bad');
        return;
      }
      // What lands is net of the origination fee; the debt is the full amount.
      toast(`Borrowed ${money(amount)} — received ${money(loanProceeds(amount))}`, 'good');
      persist();
      bump();
    }, [persist, toast]),

    state: stateRef.current!,
    act,
    repaint,
    speed,
    setSpeed: useCallback((next: number) => {
      setSpeed(next);
      speedRef.current = next;
      bump();
    }, []),
    toasts,
    toast,
    reset,
    savedAt,
    save: () => {
      persist();
      toast('Saved', 'good');
    },

    /**
     * Switch an optional content track on or off. Persisted straight away —
     * this is a preference, and losing it to a crash before the next autosave
     * would be a small but pointless annoyance.
     */
    setAddon: useCallback((id: AddonId, on: boolean) => {
      const state = stateRef.current!;
      state.addons = { ...state.addons, [id]: on };
      persist();
      bump();
    }, []),

    /** Pause if running, resume at the last speed if paused. */
    togglePause: useCallback(() => {
      const current = speedRef.current;
      if (current > 0) resumeSpeedRef.current = current;
      const next = current > 0 ? 0 : resumeSpeedRef.current || 1;
      setSpeed(next);
      speedRef.current = next;
      bump();
    }, []),

    /** Write the world to a .json file the player keeps. */
    exportFile: useCallback(() => {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const blob = new Blob([exportSaveJSON(stateRef.current!)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aifor-study-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoking immediately can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast('Save exported', 'good');
    }, [toast]),

    /** Replace the world with a file the player picked. */
    importFile: useCallback(
      async (file: File) => {
        const result = importSaveJSON(await file.text());
        if (!result.ok) {
          toast(result.reason, 'bad');
          return;
        }
        stateRef.current = result.state;
        setPendingUnlock(null);
        setFreshUnlocks([]);
        setPendingRaise(null);
        if (import.meta.env.DEV) {
          const bridge = (window as unknown as { __ai?: Record<string, unknown> }).__ai;
          if (bridge) bridge.state = stateRef.current;
        }
        persist();
        repaint();
        toast(`Loaded ${file.name}`, 'good');
      },
      [persist, repaint, toast],
    ),
  };
}

export type Game = ReturnType<typeof useGame>;
