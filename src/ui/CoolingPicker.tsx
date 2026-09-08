/**
 * How a node rejects its heat (ESG addon).
 *
 * The design rule this control exists to make legible: there is no button
 * marked "sustainable". Air pays for the job in electricity and drinks nothing;
 * evaporative is the cheapest thing to run and is why a data centre turns up in
 * a drought story; buying your way out of both costs capital. A player
 * optimising the power bill alone will pick evaporative every time and walk
 * straight into the water restriction, which is the lesson.
 *
 * Locked options are rendered disabled rather than hidden — a row that vanishes
 * reads as a bug, a dead one reads as a rule. Same convention as FocusPicker.
 */
import { BALANCE } from '../data';
import { coolingOptions } from '../engine/esgRules';
import type { CoolingMode, GameState } from '../engine/types';
import { useLang } from '../i18n/useLang';

const ORDER: CoolingMode[] = ['air', 'evaporative', 'closed_loop', 'immersion'];

const LABEL: Record<CoolingMode, string> = {
  air: 'Air',
  evaporative: 'Evaporative',
  closed_loop: 'Closed loop',
  immersion: 'Immersion',
};

const LOCKED_HINT: Record<CoolingMode, string> = {
  air: '',
  evaporative: '',
  closed_loop: 'needs the Closed-Loop Retrofit',
  immersion: 'needs Act III packaging',
};

/** What a mode reads as wherever it is shown. One place, so the node and the inspector agree. */
export function useCoolingLabel(): (mode: CoolingMode | undefined) => string {
  return (mode) => LABEL[mode ?? 'air'];
}

/** PUE and litres per kWh, for the row and the hint line. */
export const coolingSpec = (mode: CoolingMode): { pue: number; litres: number } => ({
  pue: BALANCE.coolingPue[mode],
  litres: BALANCE.coolingLitresPerKwh[mode],
});

interface Props {
  state: GameState;
  cooling: CoolingMode | undefined;
  onChange: (mode: CoolingMode) => void;
}

export function CoolingPicker({ state, cooling, onChange }: Props) {
  const { t } = useLang();
  const available = coolingOptions(state);
  const current = cooling ?? 'air';

  return (
    <div className="field">
      <label>{t('esg.cooling')}</label>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value as CoolingMode)}
      >
        {ORDER.map((mode) => {
          const s = coolingSpec(mode);
          const locked = !available.includes(mode);
          return (
            <option key={mode} value={mode} disabled={locked}>
              {LABEL[mode]} — PUE {s.pue.toFixed(2)}, {s.litres === 0 ? 'no water' : `${s.litres} L/kWh`}
              {locked ? ` (${LOCKED_HINT[mode]})` : ''}
            </option>
          );
        })}
      </select>
      <div className="hintline">
        {current === 'evaporative'
          ? 'Cheapest to run, and the reason a data centre shows up in a drought story.'
          : current === 'air'
            ? 'Drinks nothing and pays for the same job in electricity instead.'
            : current === 'closed_loop'
              ? 'Sealed. Almost no water, and the power bill goes back up.'
              : 'Dielectric fluid, no evaporation, and a capital cost to match.'}
      </div>
    </div>
  );
}
