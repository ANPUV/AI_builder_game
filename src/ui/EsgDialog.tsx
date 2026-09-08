import { useState } from 'react';
import { BALANCE } from '../data';
import { esgBillSplit } from '../engine/esg';
import { disclosureGap, gridPricePerKwh, hasOfficer } from '../engine/esgRules';
import type { GameState } from '../engine/types';
import { money } from './format';
import { useLang } from '../i18n/useLang';

/**
 * The ESG report (ESG addon).
 *
 * This dialog is a game object, not a panel. The disclosure it publishes is
 * what the top of the contract ladder actually reads, which is the only reason
 * a fifth global meter earns its place in a top bar that was already full: one
 * number up there, all the detail behind a button the player has a mechanical
 * reason to open.
 *
 * The two publish routes are the whole addon in one control. An assurance
 * engagement costs twenty times more, takes an observation window you cannot
 * pay to skip, and reports what it finds. Self-certification is instant, cheap,
 * and reports whatever you type — until the audit rolls on the gap.
 */
export default function EsgDialog({
  state,
  onPublish,
  onBuyCredits,
  onClose,
}: {
  state: GameState;
  onPublish: (mode: 'audit' | 'self', claimed?: number) => void;
  onBuyCredits: () => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  const esg = state.esg;
  const officer = hasOfficer(state);
  const gap = disclosureGap(state);
  const bill = esgBillSplit(state);
  const [claim, setClaim] = useState(Math.round(esg.footprint));

  const pillar = (label: string, value: number, detail: string) => (
    <div className="kv">
      <span className="k">
        {label}
        <span className="hintline" style={{ display: 'block' }}>{detail}</span>
      </span>
      <span
        className="mono"
        style={{ color: value > 60 ? 'var(--bad)' : value > 30 ? 'var(--warn)' : 'var(--good)' }}
      >
        {Math.round(value)}
      </span>
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="badge">{t('esg.badge')}</span>
          <h2>{t('esg.title')}</h2>
          <p>{t('esg.blurb')}</p>
        </div>

        <div className="section-title">{t('esg.pillars')}</div>
        {pillar(
          t('esg.environmental'),
          esg.environmental,
          `${Math.round(esg.powerKw).toLocaleString()} kW · ${Math.round(esg.waterLitresPerMonth).toLocaleString()} L/mo · land ${esg.landUse}`,
        )}
        {pillar(t('esg.social'), esg.social, t('esg.socialDetail'))}
        {pillar(t('esg.governance'), esg.governance, t('esg.governanceDetail'))}
        <div className="kv" style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 6 }}>
          <span className="k"><strong>{t('esg.footprint')}</strong></span>
          <span
            className="mono"
            style={{
              color: esg.footprint > 60 ? 'var(--bad)' : esg.footprint > 30 ? 'var(--warn)' : 'var(--good)',
            }}
          >
            <strong>{Math.round(esg.footprint)}</strong>
          </span>
        </div>

        <div className="section-title">{t('esg.running')}</div>
        <div className="kv">
          <span className="k">{t('esg.power')}</span>
          <span className="mono">
            {money(bill.power)}/mo @ {gridPricePerKwh(state).toFixed(3)}/kWh
          </span>
        </div>
        <div className="kv">
          <span className="k">{t('esg.water')}</span>
          <span className="mono">{money(bill.water)}/mo</span>
        </div>
        <div className="kv">
          <span className="k">{t('esg.gridIndex')}</span>
          <span className="mono" style={{ color: esg.gridIndex > 2 ? 'var(--warn)' : undefined }}>
            ×{esg.gridIndex.toFixed(2)}
          </span>
        </div>
        {esg.cleanFraction > 0 && (
          <div className="kv">
            <span className="k">{t('esg.clean')}</span>
            <span className="mono" style={{ color: 'var(--good)' }}>
              {Math.round(esg.cleanFraction * 100)}%
            </span>
          </div>
        )}
        <div className="kv">
          <span className="k">{t('esg.paid')}</span>
          <span className="mono">{money(esg.powerPaid + esg.waterPaid)}</span>
        </div>
        {esg.heatRevenue > 0 && (
          <div className="kv">
            <span className="k">{t('esg.heatSold')}</span>
            <span className="mono" style={{ color: 'var(--good)' }}>{money(esg.heatRevenue)}</span>
          </div>
        )}
        {esg.fines > 0 && (
          <div className="kv">
            <span className="k">{t('esg.finesPaid')}</span>
            <span className="mono" style={{ color: 'var(--bad)' }}>{money(esg.fines)}</span>
          </div>
        )}

        {/* Offsets: the cheapest lever here by a wide margin, which is the first
            thing worth noticing about them. The auditor discounts them heavily. */}
        <div className="section-title">{t('esg.offsets')}</div>
        <div className="kv">
          <span className="k">
            {t('esg.reliefHeld')}
            <span className="hintline" style={{ display: 'block' }}>
              {t('esg.reliefNote', { pct: Math.round(BALANCE.offsetAuditDiscount * 100) })}
            </span>
          </span>
          <span className="mono">
            −{esg.carbonRelief.toFixed(1)} / {BALANCE.carbonCreditMaxRelief}
          </span>
        </div>
        <button
          style={{ width: '100%', marginTop: 6 }}
          disabled={state.credits < BALANCE.carbonCreditCost}
          onClick={onBuyCredits}
        >
          {t('esg.buyCredits', {
            cost: money(BALANCE.carbonCreditCost),
            relief: BALANCE.carbonCreditRelief,
          })}
        </button>

        <div className="section-title">{t('esg.disclosure')}</div>
        {!officer && <div className="hintline">{t('esg.needOfficer')}</div>}

        {esg.auditPending > 0 && (
          <div className="kv">
            <span className="k">{t('esg.auditRunning')}</span>
            <span className="mono">{esg.auditPending.toFixed(0)}s</span>
          </div>
        )}

        {esg.disclosure ? (
          <>
            <div className="kv">
              <span className="k">
                {esg.disclosure.audited ? t('esg.publishedAudited') : t('esg.publishedSelf')}
              </span>
              <span className="mono">{Math.round(esg.disclosure.claimed)}</span>
            </div>
            {/* The live gap, prominently: the failure this models is drift, not
                fraud. A player who published honestly at 30 and then built a
                datacenter is running the same gap a liar is. */}
            <div className="kv">
              <span className="k">{t('esg.gap')}</span>
              <span className="mono" style={{ color: gap > 0 ? 'var(--bad)' : 'var(--good)' }}>
                {gap > 0 ? `+${Math.round(gap)}` : t('esg.gapNone')}
              </span>
            </div>
            {gap > 0 && <div className="hintline">{t('esg.gapWarn')}</div>}
          </>
        ) : (
          <div className="hintline">{t('esg.nothingPublished')}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label className="hintline">{t('esg.claimLabel')}</label>
            <input
              type="number"
              min={0}
              max={100}
              value={claim}
              onChange={(e) => setClaim(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          <button
            style={{ flex: 1 }}
            disabled={!officer || esg.auditPending > 0 || state.credits < BALANCE.esgSelfCertifyCost}
            onClick={() => onPublish('self', claim)}
          >
            {t('esg.selfCertify', { cost: money(BALANCE.esgSelfCertifyCost) })}
          </button>
          <button
            className="primary"
            style={{ flex: 1 }}
            disabled={!officer || esg.auditPending > 0 || state.credits < BALANCE.esgAuditCost}
            onClick={() => onPublish('audit')}
          >
            {t('esg.commission', {
              cost: money(BALANCE.esgAuditCost),
              seconds: BALANCE.esgAuditSeconds,
            })}
          </button>
        </div>

        <button style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
          {t('build.close')}
        </button>
      </div>
    </div>
  );
}
