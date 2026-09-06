import { useState } from 'react';
import { BALANCE } from '../data';
import { loanCap } from '../engine/venture';
import type { GameState } from '../engine/types';
import { money } from './format';
import { useLang } from '../i18n/useLang';

/**
 * The Venture Capital addon's bank facility. Always open once the addon is
 * on — drawing is not tied to milestone timing the way a raise offer is.
 * Multiple loans can be outstanding at once, each keeping the rate it was
 * drawn at, so a later balance change never reprices a loan already taken.
 */
export default function BankDialog({
  state,
  onDraw,
  onClose,
}: {
  state: GameState;
  onDraw: (amount: number) => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  const cap = loanCap(state);
  const [amount, setAmount] = useState(Math.round(cap));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('vc.bankTitle')}</h2>
          <p>{t('vc.bankBlurb', { rate: (BALANCE.bankLoanRatePerMonth * 100).toFixed(0) })}</p>
        </div>

        {state.loans.length > 0 && (
          <>
            <div className="section-title">{t('vc.bankOutstanding')}</div>
            {state.loans.map((l) => (
              <div className="kv" key={l.id}>
                <span className="k">
                  {money(l.principal)} {t('vc.bankRemaining', { months: l.monthsRemaining.toFixed(1) })}
                </span>
                <span className="mono">
                  {money(l.principal * l.ratePerMonth + l.principal / Math.max(l.monthsRemaining, 1))}/mo
                </span>
              </div>
            ))}
          </>
        )}

        <div className="section-title">{t('vc.bankDraw')}</div>
        <div className="kv">
          <span className="k">{t('vc.bankCap')}</span>
          <span className="mono">{money(cap)}</span>
        </div>
        <input
          type="number"
          min={0}
          max={Math.round(cap)}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          style={{ width: '100%', marginTop: 8 }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button style={{ flex: 1 }} onClick={onClose}>
            {t('build.close')}
          </button>
          <button
            className="primary"
            style={{ flex: 1 }}
            disabled={!(amount > 0) || amount > cap}
            onClick={() => onDraw(amount)}
          >
            {t('vc.bankBorrow')}
          </button>
        </div>
      </div>
    </div>
  );
}
