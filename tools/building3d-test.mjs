import assert from 'node:assert/strict';
import { build } from 'esbuild';

const result = await build({
  stdin: { contents: `export { createInitialState } from './src/engine/factory';
    export { advance } from './src/engine/simulate';
    export { reviveState } from './src/engine/save';
    export { contractFloors, createBuildingModel } from './src/ui/building3d';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'warning',
});
const { createInitialState, advance, reviveState, contractFloors, createBuildingModel } =
  await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
const state = createInitialState();
const machine = (id) => ({ id, buildingId: 'consumer_app', recipeId: 'c_consumer_raw', x: 0, y: 0, clock: 1, enabled: true, progress: 0, crafting: false, inputs: { draft_answer: 400 }, outputs: {} });
state.machines.earning = machine('earning');
state.machines.idle = { ...machine('idle'), inputs: {} };
for (let i = 0; i < 260; i++) advance(state, .05);
assert.equal(state.machines.earning.revenueEarned, 9, 'A completed contract records its actual payout');
assert.equal(state.machines.idle.revenueEarned ?? 0, 0, 'An unfed contract earns nothing');
assert.equal(reviveState(JSON.parse(JSON.stringify(state))).machines.earning.revenueEarned, 9, 'Revenue survives save revival');
assert.equal(reviveState(JSON.parse(JSON.stringify(state))).machines.idle.revenueEarned, 0, 'Old machines default to zero');
for (let i = 0; i < 3000; i++) advance(state, .05);
assert.ok(state.machines.earning.revenueEarned >= 100);
assert.ok(contractFloors(state.machines.earning.revenueEarned) > contractFloors(0), 'Real earnings grow the tower');
assert.equal(contractFloors(99), 2);
assert.equal(contractFloors(100), 3);
assert.equal(contractFloors(300), 4);
assert.equal(contractFloors(1e12), 12);
assert.ok(createBuildingModel('contract', '#abcdef', 4).height > createBuildingModel('contract', '#abcdef', 2).height);
assert.equal(new Set(['source', 'factory', 'capacity', 'contract'].map(kind => createBuildingModel(kind, '#abcdef', 2).height)).size, 4);
console.log('PASS: actual payouts, idle contracts, save compatibility, revenue-driven growth, and distinct building heights');
