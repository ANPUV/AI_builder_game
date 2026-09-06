import { useCallback, useEffect, useRef, useState } from 'react';
import { BUILDING_BY_ID, item } from '../data';
import {
  addLink,
  copyMachines,
  moveMachine,
  pasteClipboard,
  placeMachine,
  signOffer,
  triggerCraft,
  type Clipboard,
} from '../engine/factory';
import {
  inboundPos,
  linkPath,
  nodeHeight,
  NODE_W,
  outputPortPos,
  type Point,
} from './geometry';
import MachineNode from './MachineNode';
import type { Game } from './useGame';

/**
 * What the inspector is looking at. Machines are a *set* — a marquee or a
 * shift-click can hold several, and everything that acts on a selection acts on
 * all of them. Belts stay single: there is nothing useful to do to six at once.
 */
export type Selection =
  | { kind: 'machine'; ids: string[] }
  | { kind: 'link'; id: string }
  | null;

/** The selected machine ids, or an empty list if a belt (or nothing) is selected. */
export const machineIds = (s: Selection): string[] => (s?.kind === 'machine' ? s.ids : []);

/** Selecting no machines is the same as selecting nothing. */
export const selectMachines = (ids: string[]): Selection =>
  ids.length ? { kind: 'machine', ids } : null;

/**
 * What the next canvas click will place. `offerId` is set when the chassis came
 * off the contract board — placing it spends that lead, and there is exactly
 * one of it, so shift-to-keep-placing does not apply.
 */
export type Pending = { buildingId: string; offerId?: string };

interface View {
  x: number;
  y: number;
  zoom: number;
}

type Drag =
  | { mode: 'pan'; startX: number; startY: number; originX: number; originY: number }
  | {
      mode: 'node';
      /** Every node moving with this drag, and where each one started. */
      origins: { id: string; x: number; y: number }[];
      startWorld: Point;
      moved: boolean;
    }
  | { mode: 'marquee'; start: Point; additive: boolean; base: string[] }
  | { mode: 'link'; fromId: string; itemId: string }
  | null;

interface Props {
  game: Game;
  selection: Selection;
  setSelection: (s: Selection) => void;
  pending: Pending | null;
  setPending: (p: Pending | null) => void;
  /** Floating overlays drawn above the canvas: build button, hotbar. */
  children?: React.ReactNode;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;
/** How far each successive off-canvas paste steps, so copies do not stack. */
const PASTE_STEP = 36;

/**
 * Pointer capture is best effort. A pointer that has already been released
 * throws here, and losing the capture is never a reason to abort the gesture.
 */
const capture = (el: HTMLElement | null, pointerId: number): void => {
  try {
    el?.setPointerCapture(pointerId);
  } catch {
    /* pointer is gone; the gesture still runs off the document handlers */
  }
};

export default function Canvas({
  game,
  selection,
  setSelection,
  pending,
  setPending,
  children,
}: Props) {
  const { state, act, toast } = game;
  const ref = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag>(null);
  const [view, setView] = useState<View>({ x: 120, y: 90, zoom: 1 });
  const [ghost, setGhost] = useState<{ from: Point; to: Point; itemId: string } | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [panning, setPanning] = useState(false);

  /** Last known pointer position in world space, so paste lands under the cursor. */
  const pointerRef = useRef<Point | null>(null);
  const clipRef = useRef<{ clip: Clipboard; x: number; y: number; pastes: number } | null>(null);

  const toWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = ref.current!.getBoundingClientRect();
      return {
        x: (clientX - rect.left - view.x) / view.zoom,
        y: (clientY - rect.top - view.y) / view.zoom,
      };
    },
    [view],
  );

  const selectedIds = machineIds(selection);

  // --- pointer down -------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    // Middle-drag always pans, which is what keeps panning available while a
    // modifier is held down for box select.
    if (e.button === 1) {
      e.preventDefault();
      capture(ref.current, e.pointerId);
      setPanning(true);
      dragRef.current = {
        mode: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        originX: view.x,
        originY: view.y,
      };
      return;
    }
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    capture(ref.current, e.pointerId);

    const port = target.closest<HTMLElement>('[data-port="out"]');
    if (port) {
      const fromId = port.dataset.machineId!;
      const itemId = port.dataset.itemId!;
      dragRef.current = { mode: 'link', fromId, itemId };
      const from = outputPortPos(state.machines[fromId], itemId);
      setGhost({ from, to: toWorld(e.clientX, e.clientY), itemId });
      return;
    }

    const node = target.closest<HTMLElement>('[data-node-id]');
    if (node) {
      const id = node.dataset.nodeId!;
      const world = toWorld(e.clientX, e.clientY);

      // Shift/⌘-click adds or removes one node without disturbing the rest.
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        const next = selectedIds.includes(id)
          ? selectedIds.filter((o) => o !== id)
          : [...selectedIds, id];
        setSelection(selectMachines(next));
        return;
      }

      // Dragging any member of a multi-selection drags the whole set. Dragging
      // anything else selects it first, as before.
      const moving = selectedIds.includes(id) ? selectedIds : [id];
      if (!selectedIds.includes(id)) setSelection(selectMachines([id]));
      dragRef.current = {
        mode: 'node',
        origins: moving
          .map((mid) => state.machines[mid])
          .filter(Boolean)
          .map((m) => ({ id: m.id, x: m.x, y: m.y })),
        startWorld: world,
        moved: false,
      };
      return;
    }

    // Background.
    if (pending) {
      const world = toWorld(e.clientX, e.clientY);
      const x = Math.round(world.x - NODE_W / 2);
      const y = Math.round(world.y - 30);
      const result = act((s) =>
        pending.offerId
          ? signOffer(s, pending.offerId, x, y)
          : placeMachine(s, pending.buildingId, x, y),
      );
      if (!result.ok) toast(result.reason, 'bad');
      else if (result.id) setSelection(selectMachines([result.id]));
      // A signed lead is one customer, so it cannot be repeat-placed.
      if (pending.offerId || !e.shiftKey) setPending(null);
      return;
    }

    // Holding a modifier turns the background drag into a selection box. Plain
    // dragging still pans, because that is the gesture the canvas is built on.
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      const world = toWorld(e.clientX, e.clientY);
      dragRef.current = {
        mode: 'marquee',
        start: world,
        additive: e.shiftKey,
        base: e.shiftKey ? selectedIds : [],
      };
      setMarquee({ x: world.x, y: world.y, w: 0, h: 0 });
      return;
    }

    setSelection(null);
    setPanning(true);
    dragRef.current = {
      mode: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      originX: view.x,
      originY: view.y,
    };
  };

  // --- pointer move -------------------------------------------------------
  const onPointerMove = (e: React.PointerEvent) => {
    pointerRef.current = toWorld(e.clientX, e.clientY);
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.mode === 'pan') {
      setView((v) => ({
        ...v,
        x: drag.originX + (e.clientX - drag.startX),
        y: drag.originY + (e.clientY - drag.startY),
      }));
      return;
    }

    if (drag.mode === 'node') {
      const world = toWorld(e.clientX, e.clientY);
      const dx = world.x - drag.startWorld.x;
      const dy = world.y - drag.startWorld.y;
      drag.moved = true;
      act((s) => {
        for (const o of drag.origins) {
          moveMachine(s, o.id, Math.round(o.x + dx), Math.round(o.y + dy));
        }
      });
      return;
    }

    if (drag.mode === 'marquee') {
      const world = toWorld(e.clientX, e.clientY);
      setMarquee({
        x: Math.min(drag.start.x, world.x),
        y: Math.min(drag.start.y, world.y),
        w: Math.abs(world.x - drag.start.x),
        h: Math.abs(world.y - drag.start.y),
      });
      return;
    }

    if (drag.mode === 'link') {
      setGhost((g) => (g ? { ...g, to: toWorld(e.clientX, e.clientY) } : g));
    }
  };

  // --- pointer up ---------------------------------------------------------
  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setPanning(false);
    setGhost(null);
    setMarquee(null);
    if (!drag) return;

    if (drag.mode === 'marquee') {
      const world = toWorld(e.clientX, e.clientY);
      const x0 = Math.min(drag.start.x, world.x);
      const y0 = Math.min(drag.start.y, world.y);
      const x1 = Math.max(drag.start.x, world.x);
      const y1 = Math.max(drag.start.y, world.y);
      // Touching counts. Demanding full containment means missing the node you
      // were obviously dragging around.
      const hit = Object.values(state.machines)
        .filter(
          (m) =>
            m.x < x1 && m.x + NODE_W > x0 && m.y < y1 && m.y + nodeHeight(m) > y0,
        )
        .map((m) => m.id);
      const next = drag.additive ? [...new Set([...drag.base, ...hit])] : hit;
      setSelection(selectMachines(next));
      return;
    }

    if (drag.mode !== 'link') return;

    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const port = under?.closest<HTMLElement>('[data-port="in"]');
    if (!port) return;

    const toId = port.dataset.machineId!;
    const result = act((s) => addLink(s, drag.fromId, drag.itemId, toId));
    if (!result.ok) toast(result.reason, 'bad');
  };

  // --- zoom ---------------------------------------------------------------
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      setView((v) => {
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * Math.exp(-e.deltaY * 0.0015)));
        return {
          zoom,
          x: sx - ((sx - v.x) / v.zoom) * zoom,
          y: sy - ((sy - v.y) / v.zoom) * zoom,
        };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // --- clipboard ----------------------------------------------------------
  // Copy and paste live here rather than in App because a paste needs the
  // cursor's world position, which only the canvas knows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (!e.metaKey && !e.ctrlKey) return;
      const key = e.key.toLowerCase();

      if (key === 'a') {
        e.preventDefault();
        setSelection(selectMachines(Object.keys(state.machines)));
        return;
      }

      if (key === 'c' || key === 'x') {
        const ids = machineIds(selection);
        if (!ids.length) return;
        // Never steal a real text copy out from under the player.
        if (window.getSelection()?.toString()) return;
        e.preventDefault();
        const { clipboard, skippedContracts } = copyMachines(state, ids);
        if (!clipboard) {
          toast('Contracts cannot be copied — sign a new lead off the board', 'bad');
          return;
        }
        const source = ids.map((id) => state.machines[id]).filter(Boolean);
        clipRef.current = {
          clip: clipboard,
          x: Math.min(...source.map((m) => m.x)),
          y: Math.min(...source.map((m) => m.y)),
          pastes: 0,
        };
        const n = clipboard.nodes.length;
        toast(
          `Copied ${n} node${n === 1 ? '' : 's'}` +
            (skippedContracts ? ` — ${skippedContracts} contract skipped` : ''),
          'good',
        );
        return;
      }

      if (key === 'v') {
        const held = clipRef.current;
        if (!held) return;
        e.preventDefault();
        // Under the cursor if it is over the canvas, otherwise stepped away
        // from the original so successive pastes do not stack.
        const at = pointerRef.current;
        held.pastes += 1;
        const x = at ? at.x : held.x + PASTE_STEP * held.pastes;
        const y = at ? at.y : held.y + PASTE_STEP * held.pastes;
        const result = act((s) => pasteClipboard(s, held.clip, Math.round(x), Math.round(y)));
        if (!result.ok) {
          toast(result.reason, 'bad');
          return;
        }
        setSelection(selectMachines(result.ids ?? []));
        const n = result.ids?.length ?? 0;
        toast(`Pasted ${n} node${n === 1 ? '' : 's'}`, 'good');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, selection, setSelection, state, toast]);

  const transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
  const machines = Object.values(state.machines);

  /**
   * One bounding box per group of nodes that fail together. Padded generously
   * so the hull reads as a chassis the nodes sit inside rather than a selection
   * rectangle drawn around them.
   */
  const hulls = (() => {
    const byGroup = new Map<string, typeof machines>();
    for (const m of machines) {
      if (!m.groupId) continue;
      const list = byGroup.get(m.groupId);
      if (list) list.push(m);
      else byGroup.set(m.groupId, [m]);
    }
    const PAD = 16;
    return [...byGroup.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([id, list]) => {
        const xs = list.map((m) => m.x);
        const ys = list.map((m) => m.y);
        const heights = list.map((m) => nodeHeight(m));
        return {
          id,
          x: Math.min(...xs) - PAD,
          y: Math.min(...ys) - PAD - 10,
          w: Math.max(...xs) + NODE_W - Math.min(...xs) + PAD * 2,
          h: Math.max(...ys.map((y, i) => y + heights[i])) - Math.min(...ys) + PAD * 2 + 10,
          broken: list.some((m) => m.broken),
        };
      });
  })();
  const links = Object.values(state.links);
  const gridSize = 28 * view.zoom;
  const selectedSet = new Set(selectedIds);

  return (
    <div
      ref={ref}
      className={`canvas${panning ? ' panning' : ''}${pending ? ' placing' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => {
        pointerRef.current = null;
      }}
      style={{
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
    >
      <svg className="wires">
        <g transform={`translate(${view.x}, ${view.y}) scale(${view.zoom})`}>
          {links.map((link) => {
            const from = state.machines[link.fromId];
            const to = state.machines[link.toId];
            if (!from || !to) return null;
            const d = linkPath(outputPortPos(from, link.itemId), inboundPos(to, link.itemId));
            const flowing = (from.outputs[link.itemId] ?? 0) > 0.001;
            const isSelected = selection?.kind === 'link' && selection.id === link.id;
            return (
              <g key={link.id}>
                <path
                  className="wire-hit"
                  d={d}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelection({ kind: 'link', id: link.id });
                  }}
                />
                <path
                  className={`wire${flowing ? ' flowing' : ''}${isSelected ? ' selected' : ''}`}
                  d={d}
                  stroke={item(link.itemId).color}
                  pointerEvents="none"
                />
              </g>
            );
          })}
          {ghost && (
            <path className="wire ghost" d={linkPath(ghost.from, ghost.to)} pointerEvents="none" />
          )}
        </g>
      </svg>

      <div className="world" style={{ transform }}>
        {/*
          A rig is a set of nodes that fail together. The hull is what makes a
          blowout read as one event instead of six unrelated ones.
        */}
        {hulls.map((h) => (
          <div
            key={h.id}
            className={`group-hull${h.broken ? ' broken' : ''}`}
            style={{ left: h.x, top: h.y, width: h.w, height: h.h }}
          />
        ))}
        {machines.map((m) => (
          <MachineNode
            key={m.id}
            machine={m}
            status={state.status[m.id] ?? 'idle'}
            selected={selectedSet.has(m.id)}
            pendingItemId={ghost?.itemId ?? null}
            onGenerate={(id) => {
              const outcome = game.act((s) => triggerCraft(s, id));
              if (!outcome.ok) game.toast(outcome.reason, 'bad');
            }}
          />
        ))}
        {marquee && (
          <div
            className="marquee"
            style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
          />
        )}
      </div>

      {machines.length === 0 && (
        <div className="hint">
          <b>Getting started</b>
          <br />
          Place a <b>Free Tier</b> first — every node draws throughput, and without capacity
          everything runs at a 429.
          <br />
          Then <b>Landing Page</b> → <b>GPT-5.6 Luna</b> → a customer. Everything is behind
          the <b>＋</b> button, top left. Customers are not on the shelf — open its{' '}
          <b>Contracts</b> tab and sign one before its window closes.
          <br />
          Put anything on the bar at the bottom with <b>＋</b> on its card, then build it with{' '}
          <kbd>1</kbd>–<kbd>0</kbd>.
          <br />
          Watch <b>Net margin</b> in the top bar. Cheap tokens are how you stay alive; the
          contracts that pay well will ask what you route through.
        </div>
      )}
      {machines.length > 0 && (
        <div className="hint">
          Drag a coloured <b>output dot</b> onto a matching <b>input dot</b> to run a belt.
          <br />
          Drag the background to pan · scroll to zoom · <kbd>Del</kbd> removes the selection ·{' '}
          <kbd>Esc</kbd> cancels · hold <kbd>Shift</kbd> while placing to keep placing.
          <br />
          <kbd>⌘/Ctrl</kbd>-drag the background to box-select · <kbd>Shift</kbd>-click to add ·{' '}
          <kbd>⌘C</kbd>/<kbd>⌘V</kbd> copies a block of nodes with its belts.
          <br />
          <kbd>1</kbd>–<kbd>0</kbd> quick-builds from the bar · right-click a slot to clear it.
        </div>
      )}
      {selectedIds.length > 1 && (
        <div className="selection-tag">
          {selectedIds.length} nodes selected
        </div>
      )}
      {pending && (
        <div className="hint" style={{ left: 'auto', right: 14 }}>
          {pending.offerId ? 'Signing ' : 'Placing '}
          <b>{BUILDING_BY_ID[pending.buildingId]?.name}</b> — click the canvas.
        </div>
      )}

      {/*
        * Floating controls live inside the canvas so they can be positioned
        * against it, but the canvas captures the pointer on every left-press.
        * Once it does, pointerup and the synthesized click retarget to the
        * canvas and the button never hears about it — so the overlay has to
        * stop its own presses from reaching that handler. The wrapper itself
        * is click-through; only its children take events.
        */}
      <div className="canvas-overlay" onPointerDown={(e) => e.stopPropagation()}>
        {children}
      </div>

      <div className="toasts">
        {game.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
