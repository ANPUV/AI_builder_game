import { MILESTONE_BY_ID } from '../data';
import { activeSharePct, type RaiseOffer } from '../engine/venture';
import type { GameState } from '../engine/types';
import { money } from './format';
import { useLang } from '../i18n/useLang';

/**
 * Shown right after UnlockPanel, for the same milestone — see what you
 * unlocked, then decide whether to fund it. Accept or decline; a decline is
 * permanent, the same way the milestone itself only fires once.
 *
 * The offer is passed in, not derived here: its terms were fixed when the
 * milestone landed, and re-deriving on every render would let them move while
 * the player is still reading the sheet.
 */
export default function VentureCapitalOffer({
  state,
  offer,
  onAccept,
  onDecline,
}: {
  state: GameState;
  offer: RaiseOffer;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useLang();
  const m = MILESTONE_BY_ID[offer.milestoneId];
  if (!m) return null;

  const totalAfter = Math.round((activeSharePct(state) + offer.sharePct) * 100);
  const multiple = offer.capital > 0 ? offer.owed / offer.capital : 0;

  return (
    <div className="modal-backdrop" onClick={onDecline}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className={`badge ${offer.downRound ? 'bad' : 'good'}`}>
            {offer.downRound ? t('vc.downRoundBadge') : t('vc.offerBadge')}
          </span>
          <h2>{t('vc.offerTitle', { milestone: m.name })}</h2>
          <p>{offer.downRound ? t('vc.downRoundBlurb') : t('vc.offerBlurb')}</p>
          <div className="kv">
            <span className="k">{t('vc.capital')}</span>
            <span className="mono" style={{ color: 'var(--good)' }}>+{money(offer.capital)}</span>
          </div>
          <div className="kv">
            <span className="k">{t('vc.share')}</span>
            <span className="mono" style={{ color: 'var(--warn)' }}>
              {Math.round(offer.sharePct * 100)}%
            </span>
          </div>
          <div className="kv">
            <span className="k">{t('vc.repayTotal')}</span>
            <span className="mono" style={{ color: 'var(--warn)' }}>
              {money(offer.owed)} · {multiple.toFixed(1)}x
            </span>
          </div>
          <div className="kv">
            <span className="k">{t('vc.totalAfter')}</span>
            <span className="mono">{totalAfter}%</span>
          </div>
          <p className="tip-body" style={{ marginTop: 8 }}>{t('vc.repayNote')}</p>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button style={{ flex: 1 }} onClick={onDecline}>
            {t('vc.decline')}
          </button>
          <button className="primary" style={{ flex: 1 }} onClick={onAccept}>
            {t('vc.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
