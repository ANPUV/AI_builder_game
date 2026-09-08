/**
 * The Focus control (Agentic Ops addon).
 *
 * One dropdown, three shapes: everything, a whole track, or one named contract
 * tier. Sales, Marketing and Support all read the same field, so the player
 * learns it once — and the list is built from MARKET_LISTINGS at render time,
 * so it can never drift out of step with the board itself.
 *
 * Locked tiers are shown and disabled rather than hidden, the same treatment
 * contract rows get in the quick-build popup: the ladder should be legible from
 * the first agent you place, not assembled tier by tier as you unlock it.
 */
import {
  BUILDING_BY_ID,
  MARKET_LISTINGS,
  RARITY,
  RARITY_ORDER,
  addonOfBuilding,
  building,
  rarityOf,
  type FocusTarget,
  type Rarity,
} from '../data';
import { buildingEnabled } from '../data/addons';
import type { GameState } from '../engine/types';
import { useContent, useLang } from '../i18n/useLang';
import type { Key } from '../i18n';

type FocusTrack = 'main' | 'homelab' | 'slop';

const TRACK_KEY: Record<FocusTrack, Key> = {
  main: 'agent.trackMain',
  homelab: 'agent.trackHomelab',
  slop: 'agent.trackSlop',
};

const trackOf = (buildingId: string): FocusTrack =>
  (addonOfBuilding(buildingId) ?? 'main') as FocusTrack;

/** What an agent's focus reads as on the node and in the inspector. */
export function useFocusLabel(): (focus: FocusTarget | undefined) => string {
  const { t } = useLang();
  const { bName } = useContent();
  return (focus) => {
    const target = focus ?? 'all';
    if (target.startsWith('tier:')) {
      const b = building(target.slice(5));
      return b ? bName(b) : target.slice(5);
    }
    if (target.startsWith('track:')) {
      return t(TRACK_KEY[target.slice(6) as FocusTrack] ?? 'agent.trackMain');
    }
    return t('agent.focusAll');
  };
}

export default function FocusPicker({
  state,
  focus,
  rarityFloor,
  onFocus,
  onRarityFloor,
}: {
  state: GameState;
  focus: FocusTarget | undefined;
  rarityFloor: Rarity | undefined;
  onFocus: (focus: FocusTarget) => void;
  onRarityFloor: (floor: Rarity | null) => void;
}) {
  const { t } = useLang();
  const { bName } = useContent();
  const current = focus ?? 'all';
  const namedTier = current.startsWith('tier:');

  // A track whose addon is switched off is not a choice the player has.
  const tracks = (['main', 'homelab', 'slop'] as FocusTrack[]).map((track) => ({
    track,
    listings: MARKET_LISTINGS.filter(
      (l) => trackOf(l.buildingId) === track && buildingEnabled(l.buildingId, state.addons),
    ),
  })).filter((g) => g.listings.length > 0);

  return (
    <>
      <div className="field">
        <label>{t('agent.focus')}</label>
        <select value={current} onChange={(e) => onFocus(e.target.value as FocusTarget)}>
          <option value="all">{t('agent.focusAll')}</option>
          {tracks.map(({ track, listings }) => (
            <optgroup key={track} label={t(TRACK_KEY[track])}>
              <option value={`track:${track}`}>
                {t('agent.anyIn', { track: t(TRACK_KEY[track]) })}
              </option>
              {listings.map((l) => {
                const b = BUILDING_BY_ID[l.buildingId];
                const locked = !state.unlockedBuildings.includes(l.buildingId);
                const rarity = rarityOf(l.weight);
                return (
                  <option key={l.buildingId} value={`tier:${l.buildingId}`} disabled={locked}>
                    {b ? bName(b) : l.buildingId}
                    {' — '}
                    {locked ? t('agent.locked') : RARITY[rarity].label}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>
        <div className="hintline">
          {namedTier ? t('agent.focusTierNote') : t('agent.focusGroupNote')}
        </div>
      </div>

      <div className="field">
        <label>{t('agent.rarityFloor')}</label>
        <select
          value={rarityFloor ?? ''}
          disabled={namedTier}
          onChange={(e) => onRarityFloor((e.target.value || null) as Rarity | null)}
        >
          <option value="">{t('agent.rarityAny')}</option>
          {RARITY_ORDER.map((r) => (
            <option key={r} value={r}>
              {RARITY[r].label}
              {t('agent.orBetter')}
            </option>
          ))}
        </select>
        {namedTier && <div className="hintline">{t('agent.rarityDisabled')}</div>}
      </div>
    </>
  );
}
