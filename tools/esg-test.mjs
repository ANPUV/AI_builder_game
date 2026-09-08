/**
 * Headless exercise of the ESG addon, in the shape of the Agentic Ops and VC
 * check scripts: bundle the engine, drive it directly, assert behaviour.
 *
 * The last section is the one that matters most and it is the house
 * convention: with the addon off, nothing here may touch the base game.
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] ?? process.cwd();
const tmp = mkdtempSync(join(tmpdir(), 'esg-'));
const entry = join(tmp, 'e.ts');
const out = join(tmp, 'g.mjs');
writeFileSync(
  entry,
  `export * as factory from ${JSON.stringify(join(root, 'src/engine/factory.ts'))};\n` +
    `export * as sim from ${JSON.stringify(join(root, 'src/engine/simulate.ts'))};\n` +
    `export * as esg from ${JSON.stringify(join(root, 'src/engine/esg.ts'))};\n` +
    `export * as rules from ${JSON.stringify(join(root, 'src/engine/esgRules.ts'))};\n` +
    `export * as data from ${JSON.stringify(join(root, 'src/data/index.ts'))};\n`,
);
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning' });
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { factory, sim, esg, rules, data } = await import(pathToFileURL(out).href);
rmSync(tmp, { recursive: true, force: true });

/** Seeded, so a statistical check either passes or has found a real regression. */
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
const realRandom = Math.random;

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name} ${detail}`); }
};

function world({ esg: on = true, credits = 2_000_000_000 } = {}) {
  const s = factory.createInitialState();
  s.addons = { ...s.addons, esg: on };
  s.credits = credits;
  s.unlockedBuildings = data.BUILDINGS.map((b) => b.id);
  s.unlockedRecipes = data.RECIPES.map((r) => r.id);
  s.offers = {};
  return s;
}

const events = () => ({
  milestonesCompleted: [], breaches: [], offersArrived: [], offersExpired: [],
  blowouts: [], fines: [], contractsLost: [], agentSigned: [], agentBuilt: [],
  agentVetoed: [], churned: [], runaways: [],
  esgIncidents: [], esgFines: [], disclosuresPublished: [],
});

const run = (s, seconds) => {
  const ev = events();
  const dt = data.BALANCE.tickSeconds;
  for (let t = 0; t < seconds; t += dt) sim.step(s, dt, ev);
  return ev;
};

/** Place a node and give it its first recipe, so it actually runs. */
function place(s, buildingId, cooling) {
  const r = factory.placeMachine(s, buildingId, 400, 100 + Object.keys(s.machines).length * 30);
  if (!r.ok) return { ok: false, reason: r.reason };
  const m = s.machines[r.id];
  const recipe = data.RECIPES.find((x) => x.buildingId === buildingId);
  if (recipe) m.recipeId = recipe.id;
  if (cooling) m.cooling = cooling;
  return { ok: true, id: r.id, m };
}

console.log('\n— the meter —');
{
  const s = world();
  run(s, 1);
  check('an empty factory has no footprint', s.esg.footprint === 0, `got ${s.esg.footprint}`);

  place(s, 'gaming_pc');
  run(s, 1);
  const homeFootprint = s.esg.footprint;
  check('a Gaming PC registers, barely', homeFootprint > 0 && homeFootprint < 8, `got ${homeFootprint.toFixed(2)}`);

  const big = world();
  place(big, 'datacenter');
  run(big, 1);
  // A lone datacenter is an ENVIRONMENTAL problem and nothing else: it employs
  // nobody and buys nothing untraceable, so the headline blend sits well below
  // the pillar. That is the blend working, not a mis-scaled meter.
  check('a 10MW datacenter dominates the environmental pillar', big.esg.environmental > 55,
    `got ${big.esg.environmental.toFixed(1)}`);
  check('...and still leaves headroom (log scale, not linear)', big.esg.environmental < 100,
    `got ${big.esg.environmental.toFixed(1)}`);
  check('...while the headline stays a blend', big.esg.footprint < big.esg.environmental);
  check('one datacenter is worth many home rigs', big.esg.footprint > homeFootprint * 8);

  // The assertion that actually protects the design: a realistic Act III
  // factory has to cross the Enterprise ceiling, or the gate never bites.
  const mixed = world();
  place(mixed, 'datacenter', 'evaporative');
  place(mixed, 'colo_rack', 'evaporative');
  const cur = place(mixed, 'data_curation');
  mixed.machines[cur.id].recipeId = 'curate';
  place(mixed, 'nsfw_studio');
  place(mixed, 'hbm_stacker');
  run(mixed, 1);
  check('a real Act III factory clears the Enterprise ceiling of 55',
    mixed.esg.footprint > 55, `got ${mixed.esg.footprint.toFixed(1)}`);
}

console.log('\n— the power bill —');
{
  const s = world();
  place(s, 'datacenter', 'air');
  run(s, 1);
  // The design anchor: at grid index 1.0 with no cooling overhead, a 10MW site
  // bills 10,000 x 730 x $0.09 = about $657k against its $7.08M monthly cost.
  // The node's own description says power is "only ~7%", and this is that.
  const anchor =
    (data.BUILDING_BY_ID.datacenter.powerKw *
      data.BALANCE.hoursPerMonth *
      data.BALANCE.gridPriceBasePerKwh) /
    data.BUILDING_BY_ID.datacenter.monthlyCost;
  check('the base arithmetic lands on the ~7-9% the node claims',
    anchor > 0.07 && anchor < 0.11, `got ${(anchor * 100).toFixed(1)}%`);

  // Live, it is several times that, and every multiple is a choice the player
  // made: air cooling costs 55% overhead, and the grid index is their own
  // buildout coming back at them.
  const bill = esg.esgBillSplit(s);
  const share = bill.power / data.BUILDING_BY_ID.datacenter.monthlyCost;
  check('air cooling on an expensive grid costs far more than the brochure',
    share > anchor * 2 && share < 0.35, `got ${(share * 100).toFixed(1)}%`);
  check('the grid index rose with the player\'s own load', s.esg.gridIndex > 1.5,
    `got ${s.esg.gridIndex.toFixed(2)}`);

  const before = s.credits;
  run(s, 10);
  check('power is actually charged', s.credits < before);
  check('...and recorded for the report', s.esg.powerPaid > 0, `got ${s.esg.powerPaid}`);
  check('the bill is inside burnPerMonth, not a side debit',
    s.finance.burnPerMonth > data.BUILDING_BY_ID.datacenter.monthlyCost);
}

console.log('\n— cooling is a trade, not an upgrade —');
{
  const air = world();
  place(air, 'colo_rack', 'air');
  run(air, 1);
  const evap = world();
  place(evap, 'colo_rack', 'evaporative');
  run(evap, 1);

  check('evaporative draws less power than air', evap.esg.powerKw < air.esg.powerKw,
    `${evap.esg.powerKw} vs ${air.esg.powerKw}`);
  check('...and air uses no water at all', air.esg.waterLitresPerMonth === 0);
  check('...while evaporative drinks', evap.esg.waterLitresPerMonth > 0);
  check('evaporative has the cheaper bill',
    esg.esgBillSplit(evap).power < esg.esgBillSplit(air).power);
  check('there is no free option: evaporative scores worse on water',
    evap.esg.waterLitresPerMonth > air.esg.waterLitresPerMonth);
}

console.log('\n— a PPA moves the score and not the bill —');
{
  const s = world();
  place(s, 'colo_rack', 'air');
  run(s, 1);
  const scoreBefore = s.esg.environmental;
  const billBefore = esg.esgBillSplit(s).power;

  place(s, 'sustainability_officer');
  place(s, 'renewable_ppa');
  run(s, 1);
  check('a PPA cuts the environmental score', s.esg.environmental < scoreBefore,
    `${s.esg.environmental.toFixed(1)} vs ${scoreBefore.toFixed(1)}`);
  check('...and not one cent of the power bill',
    Math.abs(esg.esgBillSplit(s).power - billBefore) < 1e-6);
}

console.log('\n— the disclosure gate —');
{
  const s = world();
  place(s, 'datacenter', 'evaporative');
  place(s, 'colo_rack', 'evaporative');
  place(s, 'sustainability_officer');
  place(s, 'nsfw_studio');
  const cur = place(s, 'data_curation');
  s.machines[cur.id].recipeId = 'curate';
  const ent = place(s, 'enterprise');
  s.machines[ent.id].recipeId = 'c_ent';
  run(s, 1);

  check('an Enterprise contract stops without a disclosure',
    s.status[ent.id] === 'disclosed', `got ${s.status[ent.id]}`);

  const before = factory.placeMachine(world({ esg: false }), 'enterprise', 0, 0);
  check('the same contract is fine with the addon off', before.ok);

  // Publishing the truth does NOT open the door when the truth is over the
  // ceiling. That is the honest path costing something.
  const r1 = esg.publishDisclosure(s, 'self', Math.round(s.esg.footprint));
  check('an honest self-certification is accepted', r1.ok, r1.reason ?? '');
  run(s, 1);
  check('...and an over-ceiling truth still shuts the contract',
    s.status[ent.id] === 'disclosed', `footprint ${s.esg.footprint.toFixed(1)}`);

  // Lying opens it.
  esg.publishDisclosure(s, 'self', 10);
  run(s, 1);
  check('an understatement opens it immediately',
    s.status[ent.id] !== 'disclosed', `got ${s.status[ent.id]}`);
  check('...and the gap is visible the whole time', rules.disclosureGap(s) > 20,
    `gap ${rules.disclosureGap(s).toFixed(1)}`);
}

console.log('\n— not disclosing is honest by default —');
{
  const s = world();
  place(s, 'gaming_pc');
  const mid = place(s, 'midmarket');
  s.machines[mid.id].recipeId = 'c_mid';
  run(s, 1);
  check('a clean factory passes a Footprint ceiling with nothing published',
    s.status[mid.id] !== 'disclosed', `got ${s.status[mid.id]}`);
  check('effectiveFootprint falls back to the truth',
    rules.effectiveFootprint(s) === s.esg.footprint);
}

console.log('\n— the audit —');
{
  seed(7);
  let caught = 0;
  for (let n = 0; n < 40; n += 1) {
    const s = world();
    place(s, 'datacenter', 'evaporative');
    place(s, 'sustainability_officer');
    run(s, 1);
    esg.publishDisclosure(s, 'self', 5);
    const ev = run(s, 90);
    if (ev.esgFines.length) caught += 1;
  }
  check(`a large understatement is usually caught (${caught}/40)`, caught > 20, `got ${caught}`);

  let honest = 0;
  for (let n = 0; n < 40; n += 1) {
    const s = world();
    place(s, 'datacenter', 'evaporative');
    place(s, 'sustainability_officer');
    run(s, 1);
    esg.publishDisclosure(s, 'self', Math.round(s.esg.footprint));
    const ev = run(s, 90);
    if (ev.esgFines.length) honest += 1;
  }
  check(`an honest filing is never fined (${honest}/40)`, honest === 0, `got ${honest}`);
  check('the audit rolls on the gap, not on the footprint', honest < caught);
  Math.random = realRandom;
}

console.log('\n— being caught costs the ladder, not just the fine —');
{
  seed(3);
  const s = world();
  place(s, 'datacenter', 'evaporative');
  place(s, 'sustainability_officer');
  const ent = place(s, 'enterprise');
  s.machines[ent.id].recipeId = 'c_ent';
  run(s, 1);
  esg.publishDisclosure(s, 'self', 4);
  run(s, 1);
  check('the contract runs while the lie holds', s.status[ent.id] !== 'disclosed');
  // Step until it fires, so the spike is read at the moment it lands rather
  // than after it has decayed away again.
  let fired = null;
  let spikeAtFine = 0;
  for (let t = 0; t < 240 && !fired; t += 1) {
    const ev = run(s, 1);
    if (ev.esgFines.length) { fired = ev.esgFines[0]; spikeAtFine = s.slopExposureSpike; }
  }
  check('the audit eventually fires', fired !== null);
  check('...the fine is real money', fired !== null && fired.amount >= data.BALANCE.esgFineMin);
  check('...the disclosure is voided, not corrected', s.esg.disclosure === null);
  run(s, 0.1);
  // Shut twice over, in fact: the Exposure spike closes the security gate in
  // the same tick the voided disclosure closes the ESG one, and `onHold` is
  // evaluated first. Either label means the revenue has stopped.
  check('...the contract stops again',
    s.status[ent.id] === 'disclosed' || s.status[ent.id] === 'audited',
    `got ${s.status[ent.id]}`);
  check('...and Exposure spikes with it', spikeAtFine > 0, `got ${spikeAtFine}`);
  Math.random = realRandom;
}

console.log('\n— a commissioned audit reports what it finds —');
{
  const s = world();
  place(s, 'datacenter', 'evaporative');
  place(s, 'sustainability_officer');
  run(s, 1);
  const r = esg.publishDisclosure(s, 'audit');
  check('commissioning is accepted', r.ok, r.reason ?? '');
  check('...and nothing is published yet', s.esg.disclosure === null);
  run(s, data.BALANCE.esgAuditSeconds + 2);
  check('...until the observation window closes', s.esg.disclosure !== null);
  check('...and then it reports the truth',
    s.esg.disclosure && Math.abs(s.esg.disclosure.claimed - s.esg.footprint) < 1,
    `claimed ${s.esg.disclosure?.claimed}`);
  check('...marked as assured', s.esg.disclosure?.audited === true);
}

console.log('\n— an officer is required to publish at all —');
{
  const s = world();
  place(s, 'gaming_pc');
  run(s, 1);
  const r = esg.publishDisclosure(s, 'self', 1);
  check('no officer, no disclosure', !r.ok, JSON.stringify(r));
  const blocked = factory.placeMachine(s, 'renewable_ppa', 0, 0);
  check('and nothing else in the tier places either', !blocked.ok, JSON.stringify(blocked));
}

console.log('\n— water costs throughput, not cash —');
{
  const s = world();
  place(s, 'datacenter', 'evaporative');
  run(s, 1);
  const full = s.compute.supplyKtpm;
  s.esg.waterFreeze = 10;
  run(s, 0.1);
  check('a restriction curtails capacity supply', s.compute.supplyKtpm < full,
    `${s.compute.supplyKtpm} vs ${full}`);
  check('...by the balance factor',
    Math.abs(s.compute.supplyKtpm / full - data.BALANCE.waterCurtailmentFactor) < 0.05);
  const dcId = Object.keys(s.machines)[0];
  check('...and the node says so', s.status[dcId] === 'curtailed', `got ${s.status[dcId]}`);
}

console.log('\n— land stops you building —');
{
  const s = world();
  place(s, 'datacenter');
  run(s, 1);
  s.esg.permitFreeze = 30;
  const r = factory.placeMachine(s, 'colo_rack', 0, 0);
  check('a moratorium refuses new capacity', !r.ok, JSON.stringify(r));
  check('...with a reason that names the tier', !r.ok && r.reason.includes('Capacity'));
  const other = factory.placeMachine(s, 'landing_page', 0, 0);
  check('...and leaves everything else alone', other.ok, JSON.stringify(other));
}

console.log('\n— heat is the one line that runs the other way —');
{
  const s = world();
  place(s, 'colo_rack');
  place(s, 'colo_rack');
  place(s, 'sustainability_officer');
  const loop = place(s, 'heat_recovery');
  check('the heat loop places', loop.ok, JSON.stringify(loop));
  const buyer = place(s, 'heat_offtake');
  s.machines[buyer.id].recipeId = 'c_heat';
  // Wire the loop into the buyer, the way the player would.
  factory.addLink(s, loop.id, 'waste_heat', buyer.id);
  run(s, 180);
  check('heat recovery sells', s.esg.heatRevenue > 0, `got ${s.esg.heatRevenue}`);
  // It never rivals a real contract, and it is not supposed to: the point is
  // that the largest liability in the addon has a revenue line at all.
  check('...but it never rivals an Enterprise seat',
    s.esg.heatRevenue < data.RECIPE_BY_ID.c_ent.payout * 10, `got ${s.esg.heatRevenue}`);
}

console.log('\n— provenance is a per-craft choice —');
{
  const crawl = world();
  const c1 = place(crawl, 'data_curation');
  crawl.machines[c1.id].recipeId = 'curate';
  run(crawl, 1);

  const licensed = world();
  const c2 = place(licensed, 'data_curation');
  licensed.machines[c2.id].recipeId = 'curate_licensed';
  run(licensed, 1);

  check('crawling the open web scores worse than licensing',
    crawl.esg.governance > licensed.esg.governance,
    `${crawl.esg.governance.toFixed(1)} vs ${licensed.esg.governance.toFixed(1)}`);
}

console.log('\n— the base game is untouched —');
{
  const s = world({ esg: false });
  place(s, 'datacenter', 'evaporative');
  place(s, 'landing_page');
  const ent = place(s, 'enterprise');
  s.machines[ent.id].recipeId = 'c_ent';
  const before = s.credits;
  const ev = run(s, 120);

  check('no ESG events fire',
    ev.esgIncidents.length + ev.esgFines.length + ev.disclosuresPublished.length === 0);
  check('no power bill is charged', esg.esgBillPerMonth(s) === 0);
  check('nothing is recorded as paid', s.esg.powerPaid === 0 && s.esg.waterPaid === 0);
  check('the disclosure gate does not shut a contract',
    s.status[ent.id] !== 'disclosed', `got ${s.status[ent.id]}`);
  check('burn is exactly the chassis subscriptions', s.finance.burnPerMonth ===
    data.BUILDING_BY_ID.datacenter.monthlyCost + data.BUILDING_BY_ID.landing_page.monthlyCost +
    data.BUILDING_BY_ID.enterprise.monthlyCost);
  check('placement is never blocked', factory.placeMachine(s, 'colo_rack', 0, 0).ok);
  check('the world still ran', s.credits !== before);
  // The score itself is still computed, so switching the addon ON mid-run
  // shows a number that was already true rather than one starting at zero.
  check('...but the meter was quietly running all along', s.esg.footprint > 0,
    `got ${s.esg.footprint}`);
}

console.log('\n— content validation —');
{
  const problems = data.validateContent();
  // One pre-existing note about the pretraining recipe's buffer predates this
  // addon; assert that ESG added nothing to the list rather than that the list
  // is empty, so this test fails on a regression it actually caused.
  const mine = problems.filter((p) =>
    /sustainability|footprint|disclosure|esg|cleanFraction|land but draws no power/i.test(p),
  );
  check('the ESG content adds no validation problems', mine.length === 0,
    '\n    ' + mine.join('\n    '));
  check('nothing else regressed either', problems.length <= 1,
    '\n    ' + problems.join('\n    '));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
