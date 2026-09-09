/**
 * Capacity accounting, in the shape of the other check scripts.
 *
 * The invariant, and the reason this file exists: **what the capacity nodes
 * say they contribute must equal what their pool actually receives.**
 *
 * It did not. A Free Tier carries `servesNodes: 1`, so its allowance stops
 * counting once a second node draws on the same provider — but the node card
 * and the inspector both kept printing the nameplate +150k TPM. A player who
 * placed a Free Tier and then an API Tier 1 added the two cards, got 650k, saw
 * 500k in the top bar, and reasonably called it a bug. The cliff was intended;
 * advertising throughput the pool never received was not.
 *
 *   node tools/capacity-test.mjs      (or: npm run check:capacity)
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] ?? process.cwd();
const tmp = mkdtempSync(join(tmpdir(), 'cap-'));
const entry = join(tmp, 'e.ts');
const out = join(tmp, 'g.mjs');
writeFileSync(
  entry,
  `export * as data from ${JSON.stringify(join(root, 'src/data/index.ts'))};\n` +
    `export * as factory from ${JSON.stringify(join(root, 'src/engine/factory.ts'))};\n` +
    `export * as simulate from ${JSON.stringify(join(root, 'src/engine/simulate.ts'))};\n`,
);
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const { data: D, factory: F, simulate: S } = await import(pathToFileURL(out).href);
rmSync(tmp, { recursive: true, force: true });

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : 'FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};

const capacityNodes = (s) =>
  Object.values(s.machines).filter((m) => D.BUILDING_BY_ID[m.buildingId]?.kind === 'capacity');

/** Build a world with `models` model nodes on OpenAI, then the named capacity. */
function world(models, capacities) {
  const s = F.createInitialState();
  s.credits = 200_000;
  for (let i = 0; i < models; i += 1) {
    const m = F.placeMachine(s, 'gpt_luna', i * 120, 0);
    F.setRecipe(s, m.id, 'd_luna');
  }
  for (const [id, recipeId] of capacities) {
    if (!s.unlockedBuildings.includes(id)) s.unlockedBuildings.push(id);
    if (!s.unlockedRecipes.includes(recipeId)) s.unlockedRecipes.push(recipeId);
    const c = F.placeMachine(s, id, 0, -200);
    F.setVendor(s, c.id, 'openai');
    F.setRecipe(s, c.id, recipeId);
  }
  // A starved node is not a drawer, so it would not exercise the rule at all.
  for (const m of Object.values(s.machines)) {
    if (m.buildingId === 'gpt_luna') m.inputs.user_request = 400;
  }
  S.advance(s, 0.5);
  return s;
}

const stated = (s) => capacityNodes(s).reduce((n, m) => n + S.machineSupplyInEffect(s, m), 0);
const poolSupply = (s) => s.compute.pools.openai?.supplyKtpm ?? 0;

console.log('\n— the cards must equal the pool —');
for (const models of [0, 1, 2, 5]) {
  for (const caps of [
    [['free_tier', 'cap_free']],
    [['api_tier1', 'cap_t1']],
    [['free_tier', 'cap_free'], ['api_tier1', 'cap_t1']],
  ]) {
    const s = world(models, caps);
    const names = caps.map(([id]) => D.BUILDING_BY_ID[id].name).join(' + ');
    check(
      `${models} model(s), ${names}`,
      Math.abs(stated(s) - poolSupply(s)) < 1e-9,
      `cards ${stated(s)}k vs pool ${poolSupply(s)}k`,
    );
  }
}

console.log('\n— the free-tier cliff itself —');
{
  const one = world(1, [['free_tier', 'cap_free'], ['api_tier1', 'cap_t1']]);
  const two = world(2, [['free_tier', 'cap_free'], ['api_tier1', 'cap_t1']]);
  check('one node: free tier stacks on top of Tier 1', poolSupply(one) === 650, `${poolSupply(one)}k`);
  check('two nodes: the allowance stops counting', poolSupply(two) === 500, `${poolSupply(two)}k`);
  const ft = capacityNodes(two).find((m) => m.buildingId === 'free_tier');
  check('and the lapsed tier reports zero, not its nameplate', S.machineSupplyInEffect(two, ft) === 0,
    `${S.machineSupplyInEffect(two, ft)}k vs nameplate ${S.machineComputeSupply(ft)}k`);
}

console.log('\n— a tier with no allowance limit never lapses —');
{
  const s = world(5, [['api_tier1', 'cap_t1']]);
  const t1 = capacityNodes(s).find((m) => m.buildingId === 'api_tier1');
  check('API Tier 1 serves any number of nodes', S.machineSupplyInEffect(s, t1) === 500, `${S.machineSupplyInEffect(s, t1)}k`);
}

console.log('\n— an unconfigured tier supplies nobody —');
{
  const s = F.createInitialState();
  const c = F.placeMachine(s, 'free_tier', 0, 0);
  F.setRecipe(s, c.id, 'cap_free');
  F.setVendor(s, c.id, null);
  S.advance(s, 0.5);
  check('no provider picked: contributes zero', S.machineSupplyInEffect(s, s.machines[c.id]) === 0);
}

console.log('\n— a free node is the way back from the bottom —');
{
  // The whole point: a factory that has run itself negative can still stand up
  // capacity, because capacity that costs nothing cannot be unaffordable.
  for (const cash of [2000, 0, -0.01, -152, -50000]) {
    const s = F.createInitialState();
    s.credits = cash;
    const r = F.placeMachine(s, 'free_tier', 0, 0);
    check(`cash ${cash}: a $0 Free Tier can still be placed`, r.ok, r.ok ? '' : r.reason);
  }
  const s = F.createInitialState();
  s.credits = -152;
  const r = F.placeMachine(s, 'consumer_app', 0, 0);
  check('cash -152: a $0 Consumer App can still be signed', r.ok, r.ok ? '' : r.reason);
  check('Consumer App is free to stand up', D.BUILDING_BY_ID.consumer_app.cost === 0);
  check('...and bills a subscription instead', D.BUILDING_BY_ID.consumer_app.monthlyCost > 0,
    `$${D.BUILDING_BY_ID.consumer_app.monthlyCost}/mo`);

  // Anything with a real price is still refused when you cannot pay for it.
  const t = F.createInitialState();
  t.credits = -152;
  if (!t.unlockedBuildings.includes('api_tier1')) t.unlockedBuildings.push('api_tier1');
  const paid = F.placeMachine(t, 'api_tier1', 0, 0);
  check('but a priced node is still refused when broke', !paid.ok, paid.ok ? 'placed!' : paid.reason);
}

console.log('\n— one at a time, not once per game —');
{
  const s = F.createInitialState();
  const a = F.placeMachine(s, 'free_tier', 0, 0);
  const b = F.placeMachine(s, 'free_tier', 100, 0);
  check('only one Free Tier at a time', !b.ok, b.ok ? 'placed a second!' : b.reason);
  F.removeMachine(s, a.id);
  s.credits = -500;
  const c = F.placeMachine(s, 'free_tier', 200, 0);
  check('and a new one can replace it, even underwater', c.ok, c.ok ? '' : c.reason);
}

console.log(`\n${fails} failure(s)`);
process.exit(fails ? 1 : 0);
