import { MILESTONE_BY_ID } from '../data';
import { raiseOfferFor } from '../engine/venture';
import type { GameState } from '../engine/types';
import { money } from './format';
import { useLang } from '../i18n/useLang';

/**
 * Shown right after UnlockPanel, for the same milestone — see what you
 * unlocked, then decide whether to fund it. Accept or decline; a decline is
 * permanent, the same way the milestone itself only fires once.
 */
export default function VentureCapitalOffer({
  state,
  milestoneId,
  onAccept,
  onDecline,
}: {
  state: GameState;
  milestoneId: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useLang();
  const m = MILESTONE_BY_ID[milestoneId];
  const offer = raiseOfferFor(state, milestoneId);
  if (!m || !offer) return null;

  const totalAfter = Math.round((state.vc.totalSharePct + offer.sharePct) * 100);

  return (
    <div className="modal-backdrop" onClick={onDecline}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="badge good">{t('vc.offerBadge')}</span>
          <h2>{t('vc.offerTitle', { milestone: m.name })}</h2>
          <p>{t('vc.offerBlurb')}</p>
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
            <span className="k">{t('vc.totalAfter')}</span>
            <span className="mono">{totalAfter}%</span>
          </div>
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
