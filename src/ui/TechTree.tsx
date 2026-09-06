import { useState } from 'react';
import {
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
import { useContent } from '../i18n/useLang';
import Tip from './Tip';

/** How many locked milestones ahead of the current one to reveal. */
export const LOOKAHEAD = 3;

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

export default function TechTree({ state }: { state: GameState }) {
  /**
   * One goal per track, not one goal overall. The branches advance in parallel,
   * so a player on the main spine must never be shown a home lab objective as
   * "the" next thing — and a player who has taken a branch needs a way to see
   * where it goes.
   */
  const [track, setTrack] = useState<Track>('main');

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

  const inTrack = MILESTONES.filter((m) => (m.track ?? 'main') === active);
  const nextIndex = inTrack.findIndex((m) => !state.completedMilestones.includes(m.id));
  const done = nextIndex === -1 ? inTrack : inTrack.slice(0, nextIndex);

  const switcher =
    visibleTracks.length > 1 ? (
      <div className="track-tabs">
        {visibleTracks.map((tr) => (
          <button
            key={tr.id}
            className={`track-tab${tr.id === active ? ' on' : ''}`}
            style={tr.id === active ? { borderColor: tr.color, color: tr.color } : undefined}
            onClick={() => setTrack(tr.id)}
            title={tr.blurb}
          >
            {tr.name}
          </button>
        ))}
      </div>
    ) : null;

  if (nextIndex === -1) {
    return (
      <>
        {switcher}
        <div className="card">
          <div className="head"><b>Track complete</b></div>
          <div className="blurb">
            All {inTrack.length} milestones on this track are cleared.
          </div>
        </div>
      </>
    );
  }

  const current = inTrack[nextIndex];
  const upcoming = inTrack.slice(nextIndex + 1, nextIndex + 1 + LOOKAHEAD);
  const hidden = inTrack.length - nextIndex - 1 - upcoming.length;

  return (
    <>
      {switcher}
      {/* --- the one you are working on ------------------------------------ */}
      <div className="card ms current">
        <div className="head">
          <b>{current.name}</b>
          <span className="mono ms-index">
            {current.act ? `${current.act} · ` : ''}{nextIndex + 1}/{inTrack.length}
          </span>
        </div>
        <div className="blurb">{current.blurb}</div>
        {Object.entries(current.requires).map(([itemId, need]) => (
          <Requirement key={itemId} itemId={itemId} need={need} state={state} locked={false} />
        ))}
        <div className="kv" style={{ marginTop: 7 }}>
          <span className="k">Reward</span>
          <span className="mono">{money(current.reward)}</span>
        </div>
        <UnlockList milestone={current} />
      </div>

      {/* --- the next three, visible but locked ----------------------------- */}
      {upcoming.length > 0 && <div className="section-title">Coming up</div>}
      {upcoming.map((m, i) => (
        <div className="card ms locked" key={m.id}>
          <div className="head">
            <b>
              <span className="lock">🔒</span> {m.name}
            </b>
            <span className="mono ms-index">
              {m.act ? `${m.act} · ` : ''}{nextIndex + 2 + i}/{inTrack.length}
            </span>
          </div>
          <div className="blurb">{m.blurb}</div>
          {Object.entries(m.requires).map(([itemId, need]) => (
            <Requirement key={itemId} itemId={itemId} need={need} state={state} locked />
          ))}
          <div className="kv" style={{ marginTop: 7 }}>
            <span className="k">Reward</span>
            <span className="mono">{money(m.reward)}</span>
          </div>
          <UnlockList milestone={m} />
        </div>
      ))}

      {hidden > 0 && (
        <div className="card ms sealed">
          <span className="lock">🔒</span> {hidden} further milestone{hidden === 1 ? '' : 's'} sealed
        </div>
      )}

      {/* --- history -------------------------------------------------------- */}
      {done.length > 0 && (
        <>
          <div className="section-title">Completed</div>
          {done.map((m, i) => (
            <div className="card ms done" key={m.id}>
              <div className="head">
                <b>{i + 1}. {m.name}</b>
                <span style={{ color: 'var(--good)' }}>✓</span>
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
