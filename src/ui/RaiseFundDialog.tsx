import { BALANCE } from '../data';
import { activeSharePct, type RaiseOffer } from '../engine/venture';
import type { GameState } from '../engine/types';
import { money } from './format';
import { useLang } from '../i18n/useLang';

/**
 * The on-demand twin of the milestone-triggered raise offer
 * (VentureCapitalOffer): same terms, same down-round math, but reachable any
 * time from the Venture Capital tooltip rather than only right after a
 * milestone lands.
 *
 * `offer` is computed once, when the dialog opens (useGame's `openRaiseFund`)
 * — not re-derived on every render, for the same reason a milestone offer
 * does not reprice itself while it is on the table. It is `null` only when
 * the cap table has nothing left to sell; unlike a milestone's one-time
 * offer, closing this without accepting has no side effect, so the player
 * can just ask again once that changes.
 */
export default function RaiseFundDialog({
  state,
  offer,
  onConfirm,
  onClose,
}: {
  state: GameState;
  offer: RaiseOffer | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useLang();

  if (!offer) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2>{t('vc.raiseFundTitle')}</h2>
            <p>{t('vc.raiseFundFull', { pct: Math.round(BALANCE.vcMaxTotalSharePct * 100) })}</p>
          </div>
          <button className="offer-close" onClick={onClose}>
            {t('build.close')}
          </button>
        </div>
      </div>
    );
  }

  const totalAfter = Math.round((activeSharePct(state) + offer.sharePct) * 100);
  const multiple = offer.capital > 0 ? offer.owed / offer.capital : 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className={`badge ${offer.downRound ? 'bad' : 'good'}`}>
            {offer.downRound ? t('vc.downRoundBadge') : t('vc.offerBadge')}
          </span>
          <h2>{t('vc.raiseFundTitle')}</h2>
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
          <button style={{ flex: 1 }} onClick={onClose}>
            {t('build.close')}
          </button>
          <button className="primary" style={{ flex: 1 }} onClick={onConfirm}>
            {t('vc.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
