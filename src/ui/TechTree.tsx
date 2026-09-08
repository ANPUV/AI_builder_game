import { useState } from 'react';
import {
  BALANCE,
  BUILDING_BY_ID,
  MILESTONES,
  RECIPE_BY_ID,
  TRACKS,
  trackEnabled,
  item,
  unlockedProducersOf,
  type Milestone,
  type Track,
} from '../data';
import type { GameState } from '../engine/types';
import { inkOn, money } from './format';
import { useContent, useLang } from '../i18n/useLang';
import Tip from './Tip';

function UnlockList({ milestone }: { milestone: Milestone }) {
  const { bName, bDesc } = useContent();
  const buildings = milestone.unlocksBuildings.map((id) => BUILDING_BY_ID[id]).filter(Boolean);
  const recipes = milestone.unlocksRecipes.map((id) => RECIPE_BY_ID[id]).filter(Boolean);
  if (!buildings.length && !recipes.length) return null;

  return (
    <div className="unlocks">
      {buildings.map((b) => (
        <Tip
          key={b.id}
          side="left"
          content={
            <>
              <div className="tip-title">
                <span className="tip-glyph" style={{ background: b.color, color: inkOn(b.color) }}>{b.icon}</span>
                {bName(b)}
              </div>
              <div className="tip-body">{bDesc(b)}</div>
              <div className="tip-kv"><span>Cost</span><span className="mono">{money(b.cost)}</span></div>
              {b.dataRisk !== 0 && (
                <div className="tip-kv">
                  <span>Data risk</span>
                  <span className="mono" style={{ color: b.dataRisk > 0 ? 'var(--bad)' : 'var(--good)' }}>
                    {b.dataRisk > 0 ? '+' : ''}{b.dataRisk}
                  </span>
                </div>
              )}
            </>
          }
        >
          <span className="chip" style={{ borderColor: b.color }}>
            <span style={{ color: b.color }}>{b.icon}</span> {bName(b)}
          </span>
        </Tip>
      ))}
      {recipes.length > 0 && (
        <span className="chip subtle">+{recipes.length} recipe{recipes.length === 1 ? '' : 's'}</span>
      )}
    </div>
  );
}

function Requirement({
  itemId,
  need,
  state,
  locked,
}: {
  itemId: string;
  need: number;
  state: GameState;
  locked: boolean;
}) {
  const { iName, bName, rName } = useContent();
  const it = item(itemId);
  const have = Math.floor(state.delivered[itemId] ?? 0);
  const pct = Math.min(1, have / need);
  // The single most important hint in the game: which node makes this thing.
  const producers = unlockedProducersOf(itemId, state.unlockedBuildings, state.unlockedRecipes);

  return (
    <div className="req">
      <div className="line">
        <Tip
          side="left"
          content={
            <>
              <div className="tip-title">
                <span style={{ color: it.color }}>{it.icon}</span> {iName(it)}
              </div>
              <div className="tip-body">{it.note}</div>
              <div className="tip-sub">Sold to contracts, not merely produced.</div>
              <div className="tip-kv" style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 6 }}>
                <span>Made by</span>
              </div>
              {producers.length ? (
                producers.slice(0, 5).map(({ building, recipe }) => (
                  <div className="tip-row" key={recipe.id}>
                    <span style={{ color: building.color }}>{building.icon}</span> {bName(building)}
                    <span className="tip-dim"> · {rName(recipe)}</span>
                  </div>
                ))
              ) : (
                <div className="tip-row tip-dim">Nothing you have unlocked yet.</div>
              )}
            </>
          }
        >
          <span className="req-name">
            <span style={{ color: it.color }}>{it.icon}</span> {iName(it)}
            <span className="req-help">?</span>
          </span>
        </Tip>
        <span className="mono">
          {Math.min(have, need).toLocaleString()}/{need.toLocaleString()}
        </span>
      </div>
      <div className="track">
        <div
          style={{
            width: `${pct * 100}%`,
            background: locked ? 'var(--line)' : have >= need ? 'var(--good)' : 'var(--accent)',
          }}
        />
      </div>
      {!locked && producers.length === 0 && (
        <div className="req-warn">Nothing you own makes this yet.</div>
      )}
    </div>
  );
}

type NodeStatus = 'done' | 'current' | 'locked';

/** Consecutive milestones sharing an `act` become one era column — the data
 * is already authored in that order, so this is a grouping, not a sort. */
function groupByAct(milestones: Milestone[]): { label: string; milestones: Milestone[] }[] {
  const groups: { label: string; milestones: Milestone[] }[] = [];
  for (const m of milestones) {
    const label = m.act ?? '';
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.milestones.push(m);
    else groups.push({ label, milestones: [m] });
  }
  return groups;
}

/** A bigger unlock earns a bigger circle — the one piece of the reference
 * timeline's bubble-sizing this data can actually support honestly. */
function nodeSize(m: Milestone): number {
  const impact = m.unlocksBuildings.length + m.unlocksRecipes.length;
  return Math.round(Math.min(34, Math.max(20, 18 + impact * 1.1)));
}

/**
 * The unlock tree, laid out as a horizontal timeline: one column per `act`,
 * left to right, milestones as circles down each column. All of it is on
 * screen at once — nothing is hidden behind a lookahead count — because the
 * whole point of a timeline is seeing where the track goes, not just what's
 * next. Clicking any circle (done, current, or locked) opens its detail in
 * the panel on the right; only the current one's requirements actually move.
 */
export default function TechTree({
  state,
  onClose,
}: {
  state: GameState;
  onClose: () => void;
}) {
  const { t } = useLang();
  /**
   * One goal per track, not one goal overall. The branches advance in parallel,
   * so a player on the main spine must never be shown a home lab objective as
   * "the" next thing — and a player who has taken a branch needs a way to see
   * where it goes.
   */
  const [track, setTrack] = useState<Track>('main');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // A branch only appears once the player has actually opened it: nothing is
  // unlocked from it before then, so advertising it would be noise.
  const visibleTracks = TRACKS.filter(
    (tr) =>
      tr.id === 'main' ||
      // A switched-off addon leaves the tab list too, so the tech tree agrees
      // with the build bar about what game is being played.
      (trackEnabled(tr.id, state.addons) &&
      MILESTONES.some(
        (m) =>
          m.track === tr.id &&
          (state.completedMilestones.includes(m.id) ||
            m.unlocksBuildings.some((b) => state.unlockedBuildings.includes(b)) ||
            Object.keys(m.requires).some((i) => (state.delivered[i] ?? 0) > 0)),
      )),
  );
  const active = visibleTracks.some((tr) => tr.id === track) ? track : 'main';
  const activeTrack = TRACKS.find((tr) => tr.id === active)!;

  const inTrack = MILESTONES.filter((m) => (m.track ?? 'main') === active);
  const nextIndex = inTrack.findIndex((m) => !state.completedMilestones.includes(m.id));
  const currentMilestone = nextIndex === -1 ? inTrack[inTrack.length - 1] : inTrack[nextIndex];

  const selected = (selectedId && inTrack.find((m) => m.id === selectedId)) || currentMilestone;
  const selectedIndex = inTrack.indexOf(selected);
  const selectedStatus: NodeStatus =
    nextIndex === -1 || selectedIndex < nextIndex ? 'done' : selectedIndex === nextIndex ? 'current' : 'locked';

  const eras = groupByAct(inTrack);

  const pickTrack = (id: Track) => {
    setTrack(id);
    // A different track has a different current milestone; showing the old
    // selection after switching would name the wrong track's objective.
    setSelectedId(null);
  };

  return (
    <div className="tt-panel">
      <div className="tt-head">
        <span className="section-title" style={{ margin: 0 }}>{t('side.techTree')}</span>
        {visibleTracks.length > 1 && (
          <div className="track-tabs" style={{ margin: '0 0 0 auto' }}>
            {visibleTracks.map((tr) => (
              <button
                key={tr.id}
                className={`track-tab${tr.id === active ? ' on' : ''}`}
                style={tr.id === active ? { borderColor: tr.color, color: tr.color } : undefined}
                onClick={() => pickTrack(tr.id)}
                title={tr.blurb}
              >
                {tr.name}
              </button>
            ))}
          </div>
        )}
        <button
          className="drawer-close"
          style={visibleTracks.length > 1 ? undefined : { marginLeft: 'auto' }}
          onClick={onClose}
          title={t('side.close')}
        >
          ✕
        </button>
      </div>

      <div className="tt-body">
        <div className="tt-timeline">
          {eras.map((era, ei) => (
            <div className="tt-era" key={`${era.label}-${ei}`}>
              <div className="tt-era-label">{era.label || activeTrack.name}</div>
              <div className="tt-era-nodes">
                <div className="tt-ribbon" style={{ background: activeTrack.color }} />
                {era.milestones.map((m) => {
                  const i = inTrack.indexOf(m);
                  const status: NodeStatus =
                    nextIndex === -1 || i < nextIndex ? 'done' : i === nextIndex ? 'current' : 'locked';
                  const size = nodeSize(m);
                  return (
                    <button
                      key={m.id}
                      className={`tt-node tt-node-${status}${m.id === selected.id ? ' tt-node-selected' : ''}`}
                      onClick={() => setSelectedId(m.id)}
                      title={m.name}
                    >
                      <span
                        className="tt-dot"
                        style={{
                          width: size,
                          height: size,
                          ...(status !== 'locked'
                            ? { background: activeTrack.color, borderColor: activeTrack.color, color: 'var(--ink-on-color)' }
                            : undefined),
                        }}
                      >
                        {status === 'done' ? '✓' : status === 'locked' ? '🔒' : ''}
                      </span>
                      <span className="tt-node-name">{m.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="tt-detail">
          <div className="card ms" style={{ margin: 0, border: 'none', background: 'none', padding: 0 }}>
            <div className="head">
              <b>{selected.name}</b>
              <span className="mono ms-index">
                {selected.act ? `${selected.act} · ` : ''}{selectedIndex + 1}/{inTrack.length}
              </span>
            </div>
            {selectedStatus === 'done' && (
              <div style={{ color: 'var(--good)', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
                ✓ Complete
              </div>
            )}
            {selectedStatus === 'locked' && (
              <div className="req-warn" style={{ marginBottom: 6 }}>
                <span className="lock">🔒</span> Locked — clear what's ahead of it first
              </div>
            )}
            <div className="blurb">{selected.blurb}</div>
            {Object.entries(selected.requires).map(([itemId, need]) => (
              <Requirement
                key={itemId}
                itemId={itemId}
                need={need}
                state={state}
                locked={selectedStatus !== 'current'}
              />
            ))}
            {BALANCE.milestoneRewardMultiplier > 0 && (
              <div className="kv" style={{ marginTop: 7 }}>
                <span className="k">Reward</span>
                <span className="mono">{money(selected.reward * BALANCE.milestoneRewardMultiplier)}</span>
              </div>
            )}
            <UnlockList milestone={selected} />
          </div>
        </div>
      </div>
    </div>
  );
}
