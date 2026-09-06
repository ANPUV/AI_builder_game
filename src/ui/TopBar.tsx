import { useRef } from 'react';
import { BALANCE, VENDORS, featureEnabled, poolColor, poolName, type Pool } from '../data';
import Tip from './Tip';
import { useTheme } from './useTheme';
import { LANGUAGES, type Lang } from '../i18n';
import { useLang } from '../i18n/useLang';
import type { Game } from './useGame';
import { money, tpm } from './format';

const poolShort = (p: string): string =>
  p === 'shared' ? 'HW' : (VENDORS[p as keyof typeof VENDORS]?.short ?? p);

const clock = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/** `onSignOut` is optional so the game still renders standalone, ungated. */
export default function TopBar({
  game,
  onSignOut,
  onOpenSettings,
  onOpenBank,
}: {
  game: Game;
  onSignOut?: () => void;
  onOpenSettings: () => void;
  onOpenBank: () => void;
}) {
  const { state, speed, setSpeed, save, reset, togglePause, exportFile, importFile, savedAt } =
    game;
  const fileInput = useRef<HTMLInputElement>(null);
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const paused = speed === 0;
  const { demandKtpm, supplyKtpm, satisfaction } = state.compute;
  // Show the pool that is hurting, not an average that hides it.
  const poolRows = Object.entries(state.compute.pools)
    .filter(([, p]) => p.demandKtpm > 0 || p.supplyKtpm > 0)
    .sort((a, b) => a[1].satisfaction - b[1].satisfaction);
  const tightCount = state.compute.tight.length;
  const worstPool = state.compute.tight[0] ?? null;
  const load = supplyKtpm > 0 ? Math.min(1, demandKtpm / supplyKtpm) : demandKtpm > 0 ? 1 : 0;
  const short = satisfaction < 0.999;
  const { revenuePerMin, netPerMin } = state.finance;
  const margin = revenuePerMin > 0 ? netPerMin / revenuePerMin : 0;
  const exposure = state.exposure;
  const risky = exposure > 30;
  const vcActive = state.vc.totalSharePct > 0 || state.loans.length > 0;
  const loanBalance = state.loans.reduce((sum, l) => sum + l.principal, 0);
  const loanMonthlyDue = state.loans.reduce(
    (sum, l) => sum + l.principal * l.ratePerMonth + l.principal / Math.max(l.monthsRemaining, 1 / BALANCE.monthSeconds),
    0,
  );

  return (
    <div className="topbar">
      <div className="brand">
        AIfor<span>.</span>study
      </div>

      <div className="stat">
        <span className="label">{t('top.cash')}</span>
        <span
          className="value mono"
          style={{ color: state.credits < 0 ? 'var(--bad)' : undefined }}
        >
          {money(state.credits)}
        </span>
      </div>

      <div className="stat">
        <span className="label">{t('top.netPerMin')}</span>
        <span
          className="value mono"
          style={{ color: netPerMin >= 0 ? 'var(--good)' : 'var(--bad)' }}
        >
          {netPerMin >= 0 ? '+' : ''}{money(netPerMin)}
        </span>
      </div>

      <div className="stat">
        <span className="label">{t('top.netMargin')}</span>
        <span
          className="value mono"
          style={{ color: margin >= 0.4 ? 'var(--good)' : margin > 0 ? 'var(--warn)' : 'var(--bad)' }}
        >
          {revenuePerMin > 0 ? `${Math.round(margin * 100)}%` : '—'}
        </span>
      </div>

      {featureEnabled('ventureCapital', state.addons) && vcActive && (
        <Tip
          width={280}
          content={
            <>
              <div className="tip-title">{t('vc.tipTitle')}</div>
              {state.vc.totalSharePct > 0 && (
                <div className="tip-body">
                  {t('vc.tipShare', { pct: Math.round(state.vc.totalSharePct * 100) })}
                </div>
              )}
              {state.loans.length > 0 && (
                <>
                  <div className="tip-kv">
                    <span>{t('vc.loanBalance')}</span>
                    <span className="mono">{money(loanBalance)}</span>
                  </div>
                  <div className="tip-kv">
                    <span>{t('vc.loanDue')}</span>
                    <span className="mono">{money(loanMonthlyDue)}/mo</span>
                  </div>
                </>
              )}
              <button className="offer-close" style={{ marginTop: 8 }} onClick={onOpenBank}>
                {t('vc.openBank')}
              </button>
            </>
          }
        >
          <div className="stat">
            <span className="label">{t('vc.label')}</span>
            <span className="value mono" style={{ color: 'var(--warn)' }}>
              {state.vc.totalSharePct > 0 ? `${Math.round(state.vc.totalSharePct * 100)}%` : ''}
              {state.vc.totalSharePct > 0 && state.loans.length > 0 ? ' · ' : ''}
              {state.loans.length > 0 ? money(loanBalance) : ''}
            </span>
          </div>
        </Tip>
      )}

      <div className="stat">
        <span className="label">
          {t('top.exposure')}
          {state.breachFreeze > 0 && (
            <span style={{ color: 'var(--bad)' }}> · {t('top.breach')}</span>
          )}
        </span>
        <span
          className="value mono"
          style={{ color: risky ? 'var(--bad)' : exposure > 12 ? 'var(--warn)' : 'var(--good)' }}
        >
          {Math.round(exposure)}{state.breaches > 0 ? ` · ${state.breaches} breach${state.breaches > 1 ? 'es' : ''}` : ''}
        </span>
      </div>

      {state.slop > 0 && (
        <Tip
          width={290}
          content={
            <>
              <div className="tip-title">Slop Index</div>
              <div className="tip-body">
                Summed from every content node you are running. It drives all four slop risks:
                an IP fine, a craft that produces nothing anyone wants, a quality miss that cuts
                the payout, and — on the adult ladder — a legal fine.
              </div>
              <div className="tip-kv">
                <span>Fines paid</span>
                <span className="mono" style={{ color: 'var(--bad)' }}>
                  {money(state.slopFines)}
                </span>
              </div>
              <div className="tip-body">
                A Legal Desk halves your IP fine odds while it has takedown notices to answer.
              </div>
            </>
          }
        >
          <div className="stat">
            <span className="label">{t('top.slop')}</span>
            <span
              className="value mono"
              style={{ color: state.slop > 20 ? 'var(--bad)' : state.slop > 8 ? 'var(--warn)' : 'var(--muted)' }}
            >
              {Math.round(state.slop)}
            </span>
          </div>
        </Tip>
      )}

      {state.priceIndex > 1.02 && (
        <Tip
          width={300}
          content={
            <>
              <div className="tip-title">Hardware price index</div>
              <div className="tip-body">
                Between mid-2024 and now a 32GB DDR5 kit went from about $95 to about $400, a
                2TB NVMe from $120 to $379, and an RTX PRO 6000 from $8,565 to $16,000.
                Manufacturers moved capacity to server DRAM, HBM and GDDR7.
              </div>
              <div className="tip-kv">
                <span>Memory-grade parts</span>
                <span className="mono">×{state.priceIndex.toFixed(2)}</span>
              </div>
              <div className="tip-kv">
                <span>Power supplies, cases</span>
                <span className="mono">×{(1 + 0.025 * (state.priceIndex - 1)).toFixed(2)}</span>
              </div>
              <div className="tip-kv">
                <span>API tokens</span>
                <span className="mono">×1.00</span>
              </div>
              <div className="tip-warn">
                Some of this is you. The buildout that raised these prices is the one you are
                provisioning — and renting capacity never inflates at all.
              </div>
            </>
          }
        >
          <div className="stat">
            <span className="label">{t('top.hardware')}</span>
            <span
              className="value mono"
              style={{ color: state.priceIndex > 2.5 ? 'var(--bad)' : 'var(--warn)' }}
            >
              ×{state.priceIndex.toFixed(2)} ▲
            </span>
          </div>
        </Tip>
      )}

      <Tip
        width={280}
        content={
          <>
            <div className="tip-title">Rate limits by provider</div>
            <div className="tip-body">
              Limits do not pool across providers. Own and rented hardware feeds the shared pool.
            </div>
            {poolRows.length === 0 && <div className="tip-row tip-dim">Nothing drawing yet.</div>}
            {poolRows.map(([id, p]) => (
              <div className="tip-kv" key={id}>
                <span style={{ color: poolColor(id as Pool) }}>{poolName(id as Pool)}</span>
                <span
                  className="mono"
                  style={{ color: p.satisfaction < 0.999 ? 'var(--bad)' : undefined }}
                >
                  {tpm(p.demandKtpm)} / {tpm(p.supplyKtpm)}
                  {p.satisfaction < 0.999 ? ` · ${Math.round(p.satisfaction * 100)}%` : ''}
                </span>
              </div>
            ))}
          </>
        }
      >
        <div className="stat">
          <span className="label">
            {t('top.compute')}{' '}
            {tightCount > 0 && (
              <span style={{ color: 'var(--bad)' }}>
                ·{' '}
                {t(tightCount === 1 ? 'top.poolTight' : 'top.poolsTight', { n: tightCount })}
              </span>
            )}
          </span>
          <span className="value mono" style={{ color: short ? 'var(--bad)' : undefined }}>
            {worstPool
              ? `${poolShort(worstPool)} ${tpm(state.compute.pools[worstPool].demandKtpm)}/${tpm(state.compute.pools[worstPool].supplyKtpm)}`
              : `${tpm(demandKtpm)} / ${tpm(supplyKtpm)} TPM`}
          </span>
          <div className="powerbar">
            <div
              style={{
                width: `${load * 100}%`,
                background: short ? 'var(--bad)' : load > 0.85 ? 'var(--warn)' : 'var(--good)',
              }}
            />
          </div>
        </div>
      </Tip>

      <div className="stat">
        <span className="label">{t('top.uptime')}</span>
        <span className="value mono">{clock(state.elapsed)}</span>
      </div>

      <div className="spacer" />

      <div className="speeds">
        {/* A toggle, not a set-to-zero. It shows what pressing it will DO, so a
            paused game offers ▶ rather than a highlighted ❚❚ with no way back. */}
        <button
          className={paused ? 'active' : ''}
          onClick={togglePause}
          title={`${paused ? t('top.resume') : t('top.pause')} (Space)`}
        >
          {paused ? '▶' : '❚❚'}
        </button>
        {BALANCE.speeds
          .filter((s) => s > 0)
          .map((s) => (
            <button key={s} className={!paused && speed === s ? 'active' : ''} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
      </div>

      {savedAt !== null && (
        <span className="saved-at" title={new Date(savedAt).toLocaleTimeString()}>
          {t('top.saved')}
        </span>
      )}

      <button onClick={save}>{t('top.save')}</button>
      <button onClick={exportFile} title={t('top.exportTitle')}>
        {t('top.export')}
      </button>
      <button onClick={() => fileInput.current?.click()} title={t('top.importTitle')}>
        {t('top.import')}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset the input so picking the same file twice still fires.
          e.target.value = '';
          if (file) void importFile(file);
        }}
      />
      <select
        className="lang-select"
        value={lang}
        title={t('top.language')}
        aria-label={t('top.language')}
        onChange={(e) => setLang(e.target.value as Lang)}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? t('top.toLight') : t('top.toDark')}
      >
        {theme === 'dark' ? '☀' : '☾'}
      </button>
      {featureEnabled('ventureCapital', state.addons) && (
        <button onClick={onOpenBank} title={t('vc.openBank')} aria-label={t('vc.openBank')}>
          🏦
        </button>
      )}
      <button onClick={onOpenSettings} title={t('top.settings')} aria-label={t('top.settings')}>
        ⚙
      </button>
      <button
        className="danger"
        onClick={() => {
          if (confirm(t('top.resetConfirm'))) reset();
        }}
      >
        {t('top.reset')}
      </button>
      {onSignOut && <button onClick={onSignOut}>{t('top.signOut')}</button>}
    </div>
  );
}
