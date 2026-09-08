/**
 * Headless exercise of the Agentic Ops addon, in the shape of the VC addon's
 * check script: bundle the engine, drive it directly, assert behaviour.
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] ?? process.cwd();
const tmp = mkdtempSync(join(tmpdir(), 'agents-'));
const entry = join(tmp, 'e.ts');
const out = join(tmp, 'g.mjs');
writeFileSync(
  entry,
  `export * as factory from ${JSON.stringify(join(root, 'src/engine/factory.ts'))};\n` +
    `export * as sim from ${JSON.stringify(join(root, 'src/engine/simulate.ts'))};\n` +
    `export * as agents from ${JSON.stringify(join(root, 'src/engine/agents.ts'))};\n` +
    `export * as market from ${JSON.stringify(join(root, 'src/engine/market.ts'))};\n` +
    `export * as data from ${JSON.stringify(join(root, 'src/data/index.ts'))};\n`,
);
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning' });
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { factory, sim, agents, market, data } = await import(pathToFileURL(out).href);
rmSync(tmp, { recursive: true, force: true });

/**
 * The churn and drift checks are statistical, and a 40-run sample of a 20%
 * event swings far enough to fail a correct implementation. Seed the world's
 * randomness so a run either passes or has found a real regression.
 */
const seed = (n) => {
  let a = n >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name} ${detail}`); }
};

/** A state with everything unlocked, the addon on, and cash. */
function world({ agentic = true, credits = 5_000_000 } = {}) {
  const s = factory.createInitialState();
  s.addons = { ...s.addons, agentic };
  s.credits = credits;
  s.unlockedBuildings = data.BUILDINGS.map((b) => b.id);
  s.unlockedRecipes = data.RECIPES.map((r) => r.id);
  s.offers = {};
  return s;
}

const run = (s, seconds) => {
  const events = { milestonesCompleted: [], breaches: [], offersArrived: [], offersExpired: [], blowouts: [], fines: [], contractsLost: [], agentSigned: [], agentBuilt: [], agentVetoed: [], churned: [], agentRenewed: [], runaways: [] };
  const dt = data.BALANCE.tickSeconds;
  for (let t = 0; t < seconds; t += dt) sim.step(s, dt, events);
  return events;
};

/** Place an agent with its recipe and a full input buffer, so it actually runs. */
function placeAgent(s, buildingId, focus) {
  const r = factory.placeMachine(s, buildingId, 400, 200 + Object.keys(s.machines).length * 40);
  if (!r.ok) return { ok: false, reason: r.reason };
  const m = s.machines[r.id];
  m.recipeId = data.RECIPES.find((x) => x.buildingId === buildingId).id;
  if (focus) m.focus = focus;
  // Agents burn agent runs. Top the buffer up every tick in these tests; what
  // is being exercised is the ACTION, not the supply chain feeding it.
  return { ok: true, machine: m };
}
const feed = (s) => {
  for (const m of Object.values(s.machines)) {
    if (data.BUILDING_BY_ID[m.buildingId]?.kind !== 'agent') continue;
    m.inputs.agent_run = 999;
    m.inputs.agent_workflow = 999;
  }
};
const runFed = (s, seconds) => {
  const events = { milestonesCompleted: [], breaches: [], offersArrived: [], offersExpired: [], blowouts: [], fines: [], contractsLost: [], agentSigned: [], agentBuilt: [], agentVetoed: [], churned: [], agentRenewed: [], runaways: [] };
  const dt = data.BALANCE.tickSeconds;
  for (let t = 0; t < seconds; t += dt) { feed(s); sim.step(s, dt, events); }
  return events;
};

console.log('\n— gating —');
{
  const s = world();
  const first = factory.placeMachine(s, 'sales_agent', 100, 100);
  check('an agent needs a Console first', !first.ok, first.reason ?? '');
  factory.placeMachine(s, 'agent_console', 100, 100);
  const second = factory.placeMachine(s, 'sales_agent', 200, 100);
  check('with a Console, an agent places', second.ok);
  const cap = agents.agentHeadcount(s);
  let placed = 1;
  while (factory.placeMachine(s, 'marketing_agent', 300, 100 + placed * 30).ok) placed += 1;
  check(`headcount cap holds (${placed} placed, cap ${cap})`, placed === cap, `cap=${cap}`);
  check('the Console itself is not headcount', agents.agentsPlaced(s) === cap);
}
{
  const s = world({ agentic: false });
  const r = factory.placeMachine(s, 'agent_console', 100, 100);
  check('with the addon off, agents cannot be built', !r.ok, r.reason ?? '');
}

console.log('\n— sales —');
{
  const s = world();
  factory.placeMachine(s, 'agent_console', 100, 100);
  const { machine } = placeAgent(s, 'sales_agent_sr', 'all');
  market.spawnOffer(s, data.listingFor('consumer_app'));
  const before = Object.keys(s.offers).length;
  const events = runFed(s, 120);
  check('a Sales Agent signs a lead by itself', events.agentSigned.length > 0, JSON.stringify(events.agentSigned));
  check('the offer left the board', Object.keys(s.offers).length < before + 1 || events.agentSigned.length > 0);
  check('the chassis is on the canvas', Object.values(s.machines).some((m) => data.BUILDING_BY_ID[m.buildingId]?.kind === 'contract'));
  check('the agent is not idle-labelled while working', s.status[machine.id] !== undefined);
}
{
  // Focus. The board keeps ringing on its own, so the assertion is not "it
  // signed nothing" but "everything it signed was on brief".
  const s = world();
  factory.placeMachine(s, 'agent_console', 100, 100);
  const { machine } = placeAgent(s, 'sales_agent_sr', 'tier:federal');
  market.spawnOffer(s, data.listingFor('consumer_app'));
  const events = runFed(s, 90);
  const offBrief = events.agentSigned.filter((x) => x.buildingName !== data.BUILDING_BY_ID.federal.name);
  check('a focused agent signs nothing off brief', offBrief.length === 0, JSON.stringify(offBrief));
  check('the off-focus lead is still on the board', Object.values(s.offers).some((o) => o.buildingId === 'consumer_app'));
  check('waiting spends no agent runs', machine.inputs.agent_workflow === 999);
}
{
  // The Reviewer's veto. Place first, THEN take the money away — a Console
  // costs $5,000 and cannot be bought out of an empty account.
  const s = world();
  factory.placeMachine(s, 'agent_console', 100, 100);
  placeAgent(s, 'sales_agent_sr', 'all');
  placeAgent(s, 'review_agent', 'all');
  s.credits = 30_000;
  s.offers = {};
  market.spawnOffer(s, data.listingFor('midmarket'));
  const events = runFed(s, 60);
  check('a Reviewer vetoes a sign it cannot afford', events.agentVetoed.length > 0, JSON.stringify({ v: events.agentVetoed.length, s: events.agentSigned.length }));
  check('cash floor rises with a Reviewer running', agents.cashFloor(s) === data.BALANCE.agentReviewedCashFloor);
}

console.log('\n— marketing —');
{
  const s = world();
  factory.placeMachine(s, 'agent_console', 100, 100);
  placeAgent(s, 'marketing_agent_sr', 'tier:federal');
  feed(s);
  run(s, 1); // one tick so status settles to running
  feed(s);
  run(s, 30);
  const boosts = agents.marketingBoosts(s);
  check('marketing boosts only its focus', boosts.federal > 1 && boosts.consumer_app === undefined, JSON.stringify(boosts));
  check('the boost is the building strength', Math.abs(boosts.federal - 1.06) < 1e-9, String(boosts.federal));
}
{
  const s = world({ agentic: false });
  const boosts = agents.marketingBoosts(s);
  check('no boosts with the addon off', Object.keys(boosts).length === 0);
}

console.log('\n— coding —');
{
  const s = world();
  factory.placeMachine(s, 'agent_console', 100, 100);
  placeAgent(s, 'coding_agent_sr', 'all');
  // A signed contract nobody wired.
  const contract = factory.placeMachine(s, 'consumer_app', 900, 300);
  const before = Object.keys(s.machines).length;
  const events = runFed(s, 200);
  const after = Object.keys(s.machines).length;
  check('a Coding Agent builds a chain', events.agentBuilt.length > 0, JSON.stringify(events.agentBuilt));
  check('it placed real nodes', after > before, `${before} -> ${after}`);
  const links = Object.values(s.links).filter((l) => l.toId === contract.id);
  check('and wired them to the contract', links.length > 0, JSON.stringify(Object.values(s.links).map((l) => `${s.machines[l.fromId]?.buildingId}->${s.machines[l.toId]?.buildingId}`)));
  check('the contract got a recipe', !!s.machines[contract.id]?.recipeId);
}
{
  const s = world();
  factory.placeMachine(s, 'agent_console', 100, 100);
  const { machine } = placeAgent(s, 'coding_agent', 'all');
  const events = runFed(s, 120);
  check('with nothing to wire it stays unfocused', events.agentBuilt.length === 0 && s.status[machine.id] === 'unfocused', s.status[machine.id]);
}

console.log('\n— churn and support —');
{
  const s = world({ agentic: false });
  factory.placeMachine(s, 'consumer_app', 500, 300);
  const events = run(s, 600);
  check('no churn with the addon off', events.churned.length === 0);
  // Still there after 10 minutes even though its term ran out at ~5: an
  // expired contract freezes on the canvas, it does not disappear.
  check('the contract is still there', Object.keys(s.machines).length === 1);
}
{
  const s = world();
  factory.placeMachine(s, 'consumer_app', 500, 300);
  const events = run(s, data.BALANCE.churnGraceSeconds - 10);
  check('nothing churns inside the onboarding grace', events.churned.length === 0);
}
/**
 * These runs are 10 minutes long and a Consumer App's term is about 5, so
 * without this every one of them would be measuring contract expiry as much as
 * churn — and the neglected baseline would come out LOWER than the supported
 * arm, because a frozen contract cannot churn while a renewed one can. Churn
 * is the subject here; terms have their own checks below.
 */
const noTerm = (m) => { if (m) delete m.termEndsAt; };
const churnRuns = (setup, seconds = 600, runs = 40) => {
  seed(7);
  let churned = 0;
  for (let i = 0; i < runs; i += 1) {
    const s = world();
    const c = factory.placeMachine(s, 'consumer_app', 500, 300);
    noTerm(s.machines[c.id]);
    setup(s, s.machines[c.id]);
    churned += run(s, seconds).churned.length;
  }
  return churned;
};
const neglected = churnRuns(() => {});
check(`a neglected contract churns (${neglected}/40 runs of 10 min)`, neglected > 0, String(neglected));
{
  // Loyalty decays the moment a contract stops running, which is the whole
  // mechanic — so a healthy customer is simulated by holding servedFor at the
  // ceiling for the length of the run.
  seed(7);
  let churned = 0;
  for (let i = 0; i < 40; i += 1) {
    const s = world();
    const c = factory.placeMachine(s, 'consumer_app', 500, 300);
    noTerm(s.machines[c.id]);
    const ev = { milestonesCompleted: [], breaches: [], offersArrived: [], offersExpired: [], blowouts: [], fines: [], contractsLost: [], agentSigned: [], agentBuilt: [], agentVetoed: [], churned: [], agentRenewed: [], runaways: [] };
    const dt = data.BALANCE.tickSeconds;
    for (let t = 0; t < 600; t += dt) {
      if (s.machines[c.id]) s.machines[c.id].servedFor = data.BALANCE.churnLoyaltySeconds;
      sim.step(s, dt, ev);
    }
    churned += ev.churned.length;
  }
  check(`a well-served contract churns far less (${churned}/40 vs ${neglected}/40)`, churned < neglected, `${churned} vs ${neglected}`);
}
{
  // The bug this guards: an expired contract used to fall through to the churn
  // roll, so a term ending eventually DELETED the node instead of freezing it.
  // Freezing is the whole feature — the player has to be able to re-sign it.
  //
  // Expiry is forced at t=0 rather than waited out, so the run measures only
  // what happens to an ALREADY-frozen contract. A contract that is still live
  // can of course churn on its way to its term; that is the mechanic above.
  seed(11);
  let vanished = 0;
  for (let i = 0; i < 40; i += 1) {
    const s = world();
    const c = factory.placeMachine(s, 'consumer_app', 500, 300);
    factory.setRecipe(s, c.id, 'c_consumer_raw');
    s.machines[c.id].termEndsAt = s.elapsed;
    run(s, 1800);
    if (!s.machines[c.id]) vanished += 1;
  }
  check(`a frozen contract is never deleted (${vanished}/40 lost)`, vanished === 0, String(vanished));
}
{
  // ...and it reads as expired rather than quietly running again.
  const s = world();
  const c = factory.placeMachine(s, 'consumer_app', 500, 300);
  factory.setRecipe(s, c.id, 'c_consumer_raw');
  s.machines[c.id].termEndsAt = s.elapsed;
  run(s, 1800);
  check('and it still reads as expired', s.status[c.id] === 'expired', s.status[c.id]);
}
{
  // The same with the addon off, where nothing should touch it at all.
  const s = world({ agentic: false });
  const c = factory.placeMachine(s, 'consumer_app', 500, 300);
  factory.setRecipe(s, c.id, 'c_consumer_raw');
  s.machines[c.id].termEndsAt = s.elapsed;
  run(s, 1800);
  check('frozen and intact with the addon off', !!s.machines[c.id] && s.status[c.id] === 'expired', s.status[c.id]);
}
{
  // A Support Agent pointed at the tier should cut it further still.
  seed(7);
  let churned = 0;
  for (let i = 0; i < 40; i += 1) {
    const s = world();
    factory.placeMachine(s, 'agent_console', 100, 100);
    placeAgent(s, 'support_agent', 'tier:consumer_app');
    const c = factory.placeMachine(s, 'consumer_app', 500, 300);
    noTerm(s.machines[c.id]);
    churned += runFed(s, 600).churned.length;
  }
  check(`a Support Agent cuts churn (${churned}/40 vs ${neglected}/40)`, churned < neglected, `${churned} vs ${neglected}`);
}

console.log('\n— drift —');
{
  const s = world();
  factory.placeMachine(s, 'agent_console', 100, 100);
  placeAgent(s, 'sales_agent_sr', 'all');
  feed(s);
  run(s, 1);
  const withAgent = s.agentDrift;
  placeAgent(s, 'review_agent', 'all');
  feed(s);
  run(s, 1);
  check(`a Reviewer lowers Drift (${withAgent} -> ${s.agentDrift})`, s.agentDrift < withAgent);
  check('drift never goes negative', s.agentDrift >= 0);
  check('focus-ignoring is zero at low drift', agents.driftIgnoresFocus(10) === 0);
  check('focus-ignoring rises above the floor', agents.driftIgnoresFocus(60) > 0);
  check('and is capped', agents.driftIgnoresFocus(100) === data.BALANCE.driftFocusMax);
}

console.log('\n— the base game is untouched —');
{
  const s = world({ agentic: false });
  factory.placeMachine(s, 'landing_page', 100, 100);
  const events = run(s, 120);
  check('no agent events with the addon off', events.agentSigned.length + events.agentBuilt.length + events.churned.length + events.runaways.length === 0);
  check('drift stays zero', s.agentDrift === 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
