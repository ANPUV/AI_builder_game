import { useEffect, useState } from 'react';
import { BUILDINGS, VENDORS, building, buildingCostAt, type Building } from '../data';
import { buildingEnabled } from '../data/addons';
import type { GameState } from '../engine/types';
import { money, tpm } from './format';
import { useLang } from '../i18n/useLang';

/**
 * The guided opening: a card over the canvas that walks a new player through
 * the first chain one action at a time, and pulses the control they need.
 *
 * It is a layer on top of the Coach, not a replacement. The Coach answers
 * "what is blocking me" for the whole game; this answers "what do I click" for
 * the first ten minutes, in the words the game wants a player to learn — a
 * capacity node is a developer account, a staffed node is a hire.
 *
 * Steps are derived from the live world, the same way the Coach is, so there
 * is nothing to keep in sync: a step is done when the world says so, whether
 * the player followed the card or ignored it. Only what the player chose to
 * skip is remembered, in localStorage, keyed apart from the save.
 */

const KEY = 'aifor-study/tutorial/v1';
const RESET_EVENT = 'aifor-tutorial-reset';

interface Progress {
  /** "Hide tutorial" — nothing shows again until it is restarted from Settings. */
  hidden: boolean;
  /** Step ids the player skipped or acknowledged. */
  dismissed: string[];
}

const EMPTY: Progress = { hidden: false, dismissed: [] };

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return {
      hidden: parsed.hidden === true,
      dismissed: Array.isArray(parsed.dismissed) ? parsed.dismissed.filter((s) => typeof s === 'string') : [],
    };
  } catch {
    return EMPTY;
  }
}

function store(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode; the tutorial simply forgets between loads */
  }
}

/** Forget every skip and show the tutorial from the top. Settings calls this; so does a factory reset. */
export function resetTutorial() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
  window.dispatchEvent(new Event(RESET_EVENT));
}

interface TourStep {
  id: string;
  title: string;
  body: React.ReactNode;
  /** `data-tour` values of the controls to pulse while this step is up. */
  targets: string[];
  /** The world has reached the point where this step makes sense. */
  available: (s: GameState) => boolean;
  /** The world shows the step has been carried out. */
  done: (s: GameState) => boolean;
}

/** Buildings the player can actually place right now. */
function placeable(state: GameState): Building[] {
  return BUILDINGS.filter(
    (b) => state.unlockedBuildings.includes(b.id) && buildingEnabled(b.id, state.addons),
  );
}

const cheapest = (list: Building[]): Building | undefined =>
  [...list].sort((a, b) => a.cost - b.cost)[0];

/** The pulse targets for "open ＋, go to this tab, click this card". */
const cardTargets = (b: Building | undefined): string[] =>
  b ? ['build', `tab-${b.tier}`, `card-${b.id}`] : ['build'];

function steps(state: GameState): TourStep[] {
  const machines = Object.values(state.machines);
  const avail = placeable(state);

  const account = cheapest(avail.filter((b) => b.kind === 'capacity' && b.vendorScoped));
  const source = cheapest(avail.filter((b) => b.kind === 'source'));
  const model = cheapest(avail.filter((b) => b.vendor !== undefined && b.computeDraw > 0));
  const customer = cheapest(avail.filter((b) => b.kind === 'contract'));
  const desk = cheapest(avail.filter((b) => b.opsRole === 'renewals'));

  const placedModel = machines.map((m) => building(m.buildingId)).find((b) => b?.vendor);
  const vendorToPick = placedModel?.vendor ?? model?.vendor;
  const modelName = placedModel?.name ?? model?.name ?? 'the model';

  const isSource = (id: string) => building(state.machines[id]?.buildingId)?.kind === 'source';
  const isModel = (id: string) => building(state.machines[id]?.buildingId)?.vendor !== undefined;
  const isContract = (id: string) => building(state.machines[id]?.buildingId)?.kind === 'contract';

  return [
    {
      id: 'account',
      title: 'Register a developer account',
      body: (
        <>
          Every model call runs against an account with that model's provider, and the rate
          limit belongs to the account. Open <b>＋</b> and, on the <b>Capacity</b> tab, place a{' '}
          <b>{account?.name ?? 'Free Tier'}</b> — the free developer account every provider
          hands out
          {account && (
            <>
              : {money(account.cost)}, {tpm(account.computeSupply)} TPM
            </>
          )}
          . Then click anywhere on the canvas to put it down.
        </>
      ),
      targets: cardTargets(account),
      available: () => true,
      done: (s) =>
        Object.values(s.machines).some((m) => building(m.buildingId)?.kind === 'capacity'),
    },
    {
      id: 'provider',
      title: 'Register it with a provider',
      body: (
        <>
          A developer account belongs to exactly one provider. Click the account you just
          placed and, in the <b>Inspector</b> on the right, pick who it is registered with.
          {vendorToPick && (
            <>
              {' '}
              Choose <b>{VENDORS[vendorToPick].name}</b> — that is who {modelName} runs on.
            </>
          )}
        </>
      ),
      targets: ['provider'],
      available: (s) =>
        Object.values(s.machines).some((m) => building(m.buildingId)?.kind === 'capacity'),
      done: (s) =>
        Object.values(s.machines).some((m) => building(m.buildingId)?.vendorScoped) &&
        !Object.values(s.machines).some(
          (m) => m.enabled && building(m.buildingId)?.vendorScoped && !m.vendor,
        ),
    },
    {
      id: 'demand',
      title: 'Find some users',
      body: (
        <>
          Requests have to come from somewhere. Open <b>＋</b> and place a{' '}
          <b>{source?.name ?? 'Landing Page'}</b>
          {source && ` (${source.tier} tab, ${money(source.cost)})`}. It makes user requests
          out of nothing, a few every cycle.
        </>
      ),
      targets: cardTargets(source),
      available: () => true,
      done: (s) => Object.values(s.machines).some((m) => building(m.buildingId)?.kind === 'source'),
    },
    {
      id: 'model',
      title: 'Place a model and give it a recipe',
      body: (
        <>
          Place <b>{model?.name ?? 'a model'}</b>
          {model && ` (${model.tier} tab)`}, then click it and pick its <b>recipe</b> in the
          Inspector. A node with no recipe has no inputs or outputs and does nothing.
        </>
      ),
      targets: cardTargets(model),
      available: () => true,
      done: (s) =>
        Object.values(s.machines).some((m) => building(m.buildingId)?.vendor && m.recipeId),
    },
    {
      id: 'wire-in',
      title: 'Wire the users into the model',
      body: (
        <>
          Drag the coloured <b>output dot</b> on the {source?.name ?? 'source'} onto the
          matching <b>input dot</b> on {modelName}. Colours match items — a dot only accepts
          what it is coloured for.
        </>
      ),
      targets: [],
      available: () => true,
      done: (s) => Object.values(s.links).some((l) => isSource(l.fromId) && isModel(l.toId)),
    },
    {
      id: 'customer',
      title: 'Sign a customer',
      body: (
        <>
          Customers are not on the shelf. Open <b>＋</b>, go to the <b>Contracts</b> tab and sign
          the <b>{customer?.name ?? 'first offer'}</b>, then place it. If the board is empty,
          keep the clock running — a lead arrives within seconds.
        </>
      ),
      targets: ['build', 'tab-Contracts'],
      available: () => true,
      done: (s) => Object.values(s.machines).some((m) => building(m.buildingId)?.kind === 'contract'),
    },
    {
      id: 'wire-out',
      title: 'Sell what you make',
      body: (
        <>
          Drag the model's output dot onto the customer's input dot. Milestones count what you{' '}
          <b>sell</b>, not what you produce — an answer sitting in a buffer advances nothing.
        </>
      ),
      targets: [],
      available: () => true,
      done: (s) => Object.values(s.links).some((l) => isContract(l.toId)),
    },
    {
      id: 'hire',
      title: 'Make your first hire',
      body: (
        <>
          Staff are nodes too: placing one is hiring, and its monthly cost is salary. Open{' '}
          <b>＋</b> and hire a <b>{desk?.name ?? 'Human Ops Desk'}</b>
          {desk && (
            <>
              {' '}
              ({desk.tier} tab, {money(buildingCostAt(desk, state.priceIndex))} to hire,{' '}
              {money(desk.monthlyCost)}/mo payroll)
            </>
          )}
          . Two people who phone customers back when a contract's term runs out, so you are not
          re-signing every deal by hand.
        </>
      ),
      targets: cardTargets(desk),
      available: () => desk !== undefined,
      done: (s) => Object.values(s.machines).some((m) => building(m.buildingId)?.opsRole === 'renewals'),
    },
  ];
}

/** Ids of the two interlude cards that sit between and after the steps. */
const RUNNING = 'running';
const COMPLETE = 'complete';

export default function Tutorial({ state }: { state: GameState }) {
  const { t } = useLang();
  const [progress, setProgress] = useState<Progress>(load);

  useEffect(() => {
    const onReset = () => setProgress(EMPTY);
    window.addEventListener(RESET_EVENT, onReset);
    return () => window.removeEventListener(RESET_EVENT, onReset);
  }, []);

  const all = steps(state);
  const dismissed = new Set(progress.dismissed);
  const settled = (s: TourStep) => s.done(state) || dismissed.has(s.id);

  // The first step the world has reached and the player has neither done nor
  // skipped. Order is the teaching order, not the order things must happen in.
  const current = progress.hidden
    ? undefined
    : all.find((s) => s.available(state) && !settled(s));
  const index = current ? all.indexOf(current) : -1;

  // Between the opening chain and the hire step is a stretch where nothing is
  // asked of the player; say so once, rather than leaving an empty card up.
  const opening = all.filter((s) => s.id !== 'hire');
  const openingDone = opening.every(settled);
  const hire = all.find((s) => s.id === 'hire')!;
  const showRunning =
    !progress.hidden && !current && openingDone && !hire.available(state) && !dismissed.has(RUNNING);
  const showComplete =
    !progress.hidden && !current && openingDone && settled(hire) && !dismissed.has(COMPLETE);

  // Pulse the controls this step points at. Re-run after every render because
  // the build dialog and the Inspector mount and unmount underneath us.
  const targets = current?.targets ?? [];
  const targetKey = targets.join('|');
  useEffect(() => {
    document.querySelectorAll('.tour-target').forEach((el) => el.classList.remove('tour-target'));
    if (!targets.length) return;
    const selector = targets.map((id) => `[data-tour="${id}"]`).join(',');
    document.querySelectorAll(selector).forEach((el) => el.classList.add('tour-target'));
  });
  useEffect(
    () => () => {
      document.querySelectorAll('.tour-target').forEach((el) => el.classList.remove('tour-target'));
    },
    [targetKey],
  );

  const update = (next: Progress) => {
    store(next);
    setProgress(next);
  };
  const dismiss = (id: string) => update({ ...progress, dismissed: [...progress.dismissed, id] });
  const hide = () => update({ ...progress, hidden: true });

  if (current) {
    return (
      <div className="tour" role="dialog" aria-label={t('tour.label')}>
        <div className="tour-step">
          {t('tour.label')} · {t('tour.stepOf', { n: index + 1, total: all.length })}
        </div>
        <div className="tour-title">{current.title}</div>
        <div className="tour-body">{current.body}</div>
        <div className="tour-actions">
          <div className="tour-dots" aria-hidden="true">
            {all.map((s, i) => (
              <span
                key={s.id}
                className={`tour-dot${settled(s) ? ' done' : ''}${i === index ? ' now' : ''}`}
              />
            ))}
          </div>
          <button className="tour-skip" onClick={() => dismiss(current.id)}>
            {t('tour.skipStep')}
          </button>
          <button className="tour-skip" onClick={hide}>
            {t('tour.skipAll')}
          </button>
        </div>
      </div>
    );
  }

  if (showRunning) {
    return (
      <div className="tour" role="dialog" aria-label={t('tour.label')}>
        <div className="tour-step">{t('tour.label')}</div>
        <div className="tour-title">Your chain is running</div>
        <div className="tour-body">
          From here the <b>Next step</b> panel on the right tells you what is blocking you. The
          tutorial has one more step, about hiring, and it comes back when your first milestone
          unlocks the people to hire.
        </div>
        <div className="tour-actions">
          <button className="tour-ok" onClick={() => dismiss(RUNNING)}>
            {t('tour.gotIt')}
          </button>
        </div>
      </div>
    );
  }

  if (showComplete) {
    return (
      <div className="tour" role="dialog" aria-label={t('tour.label')}>
        <div className="tour-step">{t('tour.label')}</div>
        <div className="tour-title">That is the whole loop</div>
        <div className="tour-body">
          An account with a provider, users, a model, a customer, and people on payroll. Everything
          after this is the same moves at a bigger scale — the <b>Next step</b> panel keeps
          coaching, and every node has a <b>?</b> that explains its rules.
        </div>
        <div className="tour-actions">
          <button className="tour-ok" onClick={() => update({ ...progress, hidden: true })}>
            {t('tour.finish')}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
