import {
  BUILDING_BY_ID,
  CONTRACT_BUILDINGS,
  RARITY,
  bestRecipeFor,
  item,
  listingFor,
  rarityOf,
} from '../data';
import {
  boardSlots,
  openOffers,
  steadyLeadRate,
  timeLeft,
  unlockedListings,
  windowRemaining,
} from '../engine/market';
import type { ContractOffer, GameState } from '../engine/types';
import { money } from './format';
import type { Pending } from './Canvas';

/** m:ss, the same shape the top bar uses for elapsed time. */
function countdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface Props {
  state: GameState;
  onClose: () => void;
  /** Arm the offer for placement. The canvas spends it on the next click. */
  onSign: (pending: Pending) => void;
}

function OfferRow({
  state,
  offer,
  onSign,
}: {
  state: GameState;
  offer: ContractOffer;
  onSign: (pending: Pending) => void;
}) {
  const b = BUILDING_BY_ID[offer.buildingId];
  const listing = listingFor(offer.buildingId);
  if (!b || !listing) return null;

  const rarity = rarityOf(listing.weight);
  const tone = RARITY[rarity];
  const best = bestRecipeFor(offer.buildingId, state.unlockedRecipes);
  const left = timeLeft(state, offer);
  const frac = windowRemaining(state, offer);
  const affordable = state.credits >= b.cost;
  // The gate is on the recipe, not the chassis — it is what the customer's
  // security review actually objects to.
  const gated = best?.maxExposure !== undefined && state.exposure > best.maxExposure;
  const urgent = frac < 0.25;

  return (
    <div className="offer">
      <div className="offer-head">
        <span className="glyph" style={{ background: b.color }}>{b.icon}</span>
        <span className="offer-title">
          <span className="name">
            {b.name}
            <span className="rarity" style={{ color: tone.color, borderColor: tone.color }}>
              {tone.label}
            </span>
          </span>
          <span className="lead">{offer.lead}</span>
        </span>
        <span className={`offer-clock mono${urgent ? ' urgent' : ''}`}>{countdown(left)}</span>
      </div>

      <div className="offer-window">
        <div
          style={{
            width: `${frac * 100}%`,
            background: urgent ? 'var(--bad)' : frac < 0.5 ? 'var(--warn)' : tone.color,
          }}
        />
      </div>

      <div className="kv">
        <span className="k">Buys</span>
        <span style={{ textAlign: 'right' }}>
          {best
            ? best.inputs.map((i, n) => (
                <span key={i.itemId}>
                  {n > 0 ? ' + ' : ''}
                  {i.qty}× <span style={{ color: item(i.itemId).color }}>{item(i.itemId).name}</span>
                </span>
              ))
            : 'nothing you have unlocked yet'}
        </span>
      </div>
      <div className="kv">
        <span className="k">Pays</span>
        <span className="mono" style={{ color: 'var(--good)' }}>
          {best ? `${money(best.payout ?? 0)} every ${best.seconds}s` : '—'}
          {best && (
            <span className="tip-dim">
              {' · '}{money(((best.payout ?? 0) / best.seconds) * 60)}/min
            </span>
          )}
        </span>
      </div>
      {best?.maxExposure !== undefined && (
        <div className="kv">
          <span className="k">Exposure ceiling</span>
          <span className="mono" style={{ color: gated ? 'var(--bad)' : 'var(--muted)' }}>
            ≤ {best.maxExposure} · you are at {state.exposure}
          </span>
        </div>
      )}
      <div className="kv">
        <span className="k">Setup</span>
        <span className="mono" style={{ color: affordable ? undefined : 'var(--bad)' }}>
          {money(b.cost)}
        </span>
      </div>

      <p className="offer-note">{b.description}</p>

      {gated && (
        <div className="tip-warn">
          They will sign, but the node sits on a security hold until Exposure drops to{' '}
          {best?.maxExposure} or below.
        </div>
      )}

      <button
        className="primary offer-sign"
        disabled={!affordable}
        onClick={() => onSign({ buildingId: offer.buildingId, offerId: offer.id })}
      >
        {affordable ? `Sign — ${money(b.cost)}` : `Need ${money(b.cost - state.credits)} more`}
      </button>
    </div>
  );
}

/**
 * The contract board. Contract chassis exist nowhere else: a customer has to
 * turn up and be signed inside their window, which is what makes a $22k federal
 * program feel like an event instead of a purchase.
 */
export function MarketplaceBody({ state, onSign }: Omit<Props, 'onClose'>) {
  const offers = openOffers(state);
  const slots = boardSlots(state);
  const types = unlockedListings(state).length;
  const perMinute = steadyLeadRate(state);
  const locked = CONTRACT_BUILDINGS.filter((b) => !state.unlockedBuildings.includes(b.id));

  return (
    <>
        <div className="modal-head">
          <p>
            Leads arrive on their own — about {perMinute.toFixed(1)} a minute across the{' '}
            {types} {types === 1 ? 'tier' : 'tiers'} you have unlocked. The better a contract
            pays, the rarer it is and the longer its window stays open. Sign one and click the
            canvas to place it; miss the window and the customer walks.
          </p>
          <div className="kv">
            <span className="k">On the board</span>
            <span className="mono">{offers.length} / {slots}</span>
          </div>
        </div>

        {offers.length === 0 ? (
          <div className="empty" style={{ padding: '18px 2px' }}>
            Nobody is calling right now. An empty board rings fast — expect somebody within
            about ten seconds of running clock. Unlocking a new contract tier always brings
            one in immediately.
          </div>
        ) : (
          <div className="offer-list">
            {offers.map((o) => (
              <OfferRow key={o.id} state={state} offer={o} onSign={onSign} />
            ))}
          </div>
        )}

        {locked.length > 0 && (
          <>
            <div className="section-title">Not in your pipeline yet</div>
            <div className="unlocks">
              {locked.map((b) => {
                const l = listingFor(b.id);
                const tone = RARITY[rarityOf(l?.weight ?? 0)];
                return (
                  <span className="chip subtle" key={b.id} title={b.description}>
                    <span className="lock">🔒</span>
                    {b.name}
                    <span style={{ color: tone.color, marginLeft: 5 }}>{tone.label}</span>
                  </span>
                );
              })}
            </div>
          </>
        )}

    </>
  );
}

/**
 * The contract board as its own modal. Kept so the board can still be opened
 * directly (the red dot in the top bar), while the same body also renders as
 * the Contracts tab of the build dialog.
 */
export default function Marketplace({ state, onClose, onSign }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <MarketplaceBody state={state} onSign={onSign} />
        <button className="offer-close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
