/**
 * Generates docs/reference-card.html from src/data/*.ts.
 *
 * The card is DERIVED, never hand-edited: every number, name, price and
 * exposure ceiling on it is read out of the content files, so re-running this
 * after any content or balance change re-syncs the whole sheet.
 *
 *   node tools/build-reference-card.mjs      (or: npm run card)
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'aifor-study-card-'));
const bundle = join(tmp, 'data.mjs');

await build({
  entryPoints: [join(root, 'src/data/index.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'warning',
});
const D = await import(pathToFileURL(bundle).href);
rmSync(tmp, { recursive: true, force: true });

const {
  ITEMS, BUILDINGS, RECIPES, MILESTONES, BALANCE,
  ITEM_BY_ID, BUILDING_BY_ID, RECIPES_BY_BUILDING,
  STARTING_BUILDINGS, STARTING_RECIPES, validateContent,
} = D;

const problems = validateContent();
if (problems.length) {
  console.warn(`content problems (${problems.length}):`);
  for (const p of problems) console.warn('  ' + p);
}

// --- formatting ----------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const trim = (v) => String(Math.round(v * 10) / 10);

function money(n) {
  if (n === 0 || n == null) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `$${trim(n / 1e9)}B`;
  if (a >= 1e6) return `$${trim(n / 1e6)}M`;
  if (a >= 1e5) return `$${trim(n / 1e3)}k`;
  if (a >= 1) return `$${Math.round(n).toLocaleString('en-US')}`;
  return `$${n.toFixed(2)}`;
}
function cents(n) {
  if (n === 0 || n == null) return '—';
  if (Math.abs(n) >= 1e6) return money(n);
  if (Math.abs(n) >= 100) return `$${Math.round(n).toLocaleString('en-US')}`;
  return `$${n.toFixed(2)}`;
}
function tpmLabel(n) {
  if (!n) return '—';
  if (n < 1e3) return `${trim(n)}k`;
  if (n < 1e6) return `${trim(n / 1e3)}M`;
  return `${trim(n / 1e6)}B`;
}
const perMin = (qty, seconds) => (qty / seconds) * 60;

// --- item helpers --------------------------------------------------------
function chip(id, qty) {
  const it = ITEM_BY_ID[id];
  if (!it) return `<span class="chip">${esc(id)}</span>`;
  return `<span class="chip" style="--c:${it.color}" title="${esc(it.name)} — ${esc(it.note || '')}">`
    + `<b>${esc(it.icon)}</b>${esc(it.name)}${qty ? `<i>${qty}</i>` : ''}</span>`;
}
const stacks = (list) => list.length
  ? `<span class="stacks">${list.map((s) => chip(s.itemId, s.qty)).join('')}</span>`
  : '<span class="none">nothing</span>';

const outQty = (r) => r.outputs.reduce((n, o) => n + o.qty, 0);
const kindLabel = { source: 'Source', factory: 'Factory', capacity: 'Capacity', contract: 'Contract' };

const risk = (n) => {
  if (n === 0) return '<span class="risk zero">0</span>';
  const cls = n < 0 ? 'good' : n >= 6 ? 'bad' : 'warn';
  return `<span class="risk ${cls}">${n > 0 ? '+' : ''}${n}</span>`;
};

const TIER_ORDER = ['Demand', 'Models', 'Retrieval', 'Agents', 'Compliance', 'Capacity', 'Training', 'Silicon', 'Contracts'];
const TIER_NOTE = {
  Demand: 'No inputs. Runs forever. Everything downstream starves without one.',
  Models: 'Free to place, free per month. You pay only per craft — so the recipe you assign is the whole cost decision.',
  Retrieval: 'Turns a customer corpus into grounded prompts. Same model spend, better output.',
  Agents: 'Orchestration, real tool calls, and the two nodes that cut Exposure instead of raising it.',
  Compliance: 'Slow, expensive, and the only key to the contracts above Mid-Market. Contracts consume the certificates as an input.',
  Capacity: 'Supplies throughput. Exempt from throttling, so these always run. Place one before anything else.',
  Training: 'Act III · Lab. Own the weights, drop marginal token cost to zero, and unlock sovereign output.',
  Silicon: 'Act III · Fab. Own the supply chain from sand to rack.',
  Contracts: 'The only source of revenue in the game. Each one audits your Exposure before it pays.',
};

const startSet = new Set(STARTING_BUILDINGS);
const unlockAt = {};
MILESTONES.forEach((m, i) => { for (const b of m.unlocksBuildings) unlockAt[b] ??= { i, m }; });

const stamp = new Date().toISOString().slice(0, 10);

// =========================================================================
// CSS
// =========================================================================
const CSS = `
:root {
  --ground:#e9ecf1; --surface:#ffffff; --surface-2:#f3f6f9; --sunk:#dee3ea;
  --line:#ccd4de; --line-soft:#e2e8ef;
  --ink:#111b25; --ink-2:#3a4956; --muted:#66757f;
  --accent:#1f6f9e; --accent-soft:#d7e8f3;
  --bad:#b0473f; --warn:#a06a2a; --good:#1f7a52;
  --shadow:0 1px 2px rgba(17,27,37,.07), 0 8px 22px -14px rgba(17,27,37,.30);
  --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --sans:"IBM Plex Sans",system-ui,-apple-system,Segoe UI,sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground:#0d141b; --surface:#151f29; --surface-2:#1a2530; --sunk:#101922;
    --line:#2a3a48; --line-soft:#22303c;
    --ink:#dde6ee; --ink-2:#b3c2d0; --muted:#7d8e9c;
    --accent:#5cb3e4; --accent-soft:#183345;
    --bad:#e0776f; --warn:#d3a353; --good:#4cc47f;
    --shadow:0 1px 2px rgba(0,0,0,.4), 0 10px 26px -16px rgba(0,0,0,.8);
  }
}
:root[data-theme="dark"] {
  --ground:#0d141b; --surface:#151f29; --surface-2:#1a2530; --sunk:#101922;
  --line:#2a3a48; --line-soft:#22303c;
  --ink:#dde6ee; --ink-2:#b3c2d0; --muted:#7d8e9c;
  --accent:#5cb3e4; --accent-soft:#183345;
  --bad:#e0776f; --warn:#d3a353; --good:#4cc47f;
  --shadow:0 1px 2px rgba(0,0,0,.4), 0 10px 26px -16px rgba(0,0,0,.8);
}

* { box-sizing:border-box; }
body { background:var(--ground); color:var(--ink); font-family:var(--sans); font-size:14px; line-height:1.5; }
.wrap { max-width:1160px; margin:0 auto; padding:28px 20px 80px; display:flex; flex-direction:column; gap:34px; }
h1,h2,h3 { margin:0; text-wrap:balance; }
p { margin:0; }
a { color:var(--accent); }

/* --- masthead --- */
.mast { display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:18px;
  border-bottom:2px solid var(--ink); padding-bottom:14px; }
.mast h1 { font-size:30px; font-weight:600; letter-spacing:-.02em; }
.mast .sub { color:var(--muted); font-size:13px; max-width:56ch; margin-top:6px; }
.stampline { font-family:var(--mono); font-size:11px; color:var(--muted); text-align:right; line-height:1.8; }
.stampline b { color:var(--ink-2); font-weight:500; }

/* --- search --- */
.searchbar { position:sticky; top:0; z-index:20; background:var(--ground);
  padding:10px 0 12px; margin-bottom:-14px; display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.searchbar input { flex:1 1 260px; min-width:0; font-family:var(--mono); font-size:13px;
  padding:9px 12px; border-radius:6px; border:1px solid var(--line); background:var(--surface); color:var(--ink); }
.searchbar input:focus-visible { outline:2px solid var(--accent); outline-offset:1px; border-color:var(--accent); }
.searchbar .hint { font-family:var(--mono); font-size:11px; color:var(--muted); }

/* --- section --- */
.sec { display:flex; flex-direction:column; gap:14px; }
.sec > header { display:flex; flex-direction:column; gap:4px; border-top:1px solid var(--line); padding-top:12px; }
.eyebrow { font-family:var(--mono); font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--accent); }
.sec h2 { font-size:19px; font-weight:600; letter-spacing:-.01em; }
.sec .lede { color:var(--muted); font-size:13px; max-width:74ch; }

/* --- meters --- */
.meters { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:14px; }
.meter { background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:16px 16px 14px;
  box-shadow:var(--shadow); display:flex; flex-direction:column; gap:9px; border-top:3px solid var(--m,var(--accent)); }
.meter h3 { font-size:15px; font-weight:600; display:flex; align-items:baseline; gap:8px; }
.meter h3 span { font-family:var(--mono); font-size:11px; color:var(--muted); font-weight:400; letter-spacing:.04em; }
.meter p { font-size:13px; color:var(--ink-2); }
.meter .fx { font-family:var(--mono); font-size:12px; background:var(--sunk); border-radius:5px; padding:7px 9px; color:var(--ink); overflow-x:auto; }
.meter ul { margin:0; padding-left:16px; font-size:12.5px; color:var(--muted); display:flex; flex-direction:column; gap:3px; }

/* --- spine --- */
.spine { background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:18px; box-shadow:var(--shadow);
  display:flex; flex-direction:column; gap:16px; overflow-x:auto; }
.lane { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.lane .laneName { font-family:var(--mono); font-size:11px; text-transform:uppercase; letter-spacing:.1em;
  color:var(--muted); min-width:82px; }
.step { display:flex; align-items:center; gap:8px; }
.arrow { font-family:var(--mono); color:var(--muted); font-size:11px; white-space:nowrap;
  display:flex; flex-direction:column; align-items:center; line-height:1.1; }
.arrow em { font-style:normal; font-size:10px; letter-spacing:.03em; }

/* --- chips --- */
.chip { display:inline-flex; align-items:center; gap:5px; font-size:12px; padding:3px 8px 3px 6px;
  border-radius:5px; border:1px solid color-mix(in srgb, var(--c,var(--line)) 45%, transparent);
  background:color-mix(in srgb, var(--c,var(--line)) 12%, transparent); white-space:nowrap; }
.chip b { color:var(--c,var(--ink)); font-size:13px; font-weight:600; }
.chip i { font-family:var(--mono); font-style:normal; font-size:11px; color:var(--muted); }
.chip i::before { content:"×"; }
.stacks { display:inline-flex; gap:5px; flex-wrap:wrap; }
.none { color:var(--muted); font-style:italic; font-size:12px; }

/* --- tables --- */
.tablewrap { overflow-x:auto; background:var(--surface); border:1px solid var(--line); border-radius:8px; box-shadow:var(--shadow); }
table { border-collapse:collapse; width:100%; font-size:13px; }
th { font-family:var(--mono); font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted);
  text-align:left; font-weight:500; padding:10px 12px; border-bottom:1px solid var(--line); white-space:nowrap; background:var(--surface-2); }
td { padding:9px 12px; border-bottom:1px solid var(--line-soft); vertical-align:middle; }
tr:last-child td { border-bottom:none; }
td.num, th.num { font-family:var(--mono); text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.nm { font-weight:600; display:flex; align-items:center; gap:7px; white-space:nowrap; }
.nm .g { font-size:15px; color:var(--gc,var(--muted)); width:16px; text-align:center; }
.sub2 { color:var(--muted); font-size:11.5px; font-family:var(--mono); }
.desc { color:var(--ink-2); font-size:12.5px; min-width:22ch; }

/* --- risk + kind pills --- */
.risk { font-family:var(--mono); font-size:11px; padding:2px 6px; border-radius:4px; font-weight:500; }
.risk.zero { color:var(--muted); background:var(--sunk); }
.risk.warn { color:var(--warn); background:color-mix(in srgb,var(--warn) 15%,transparent); }
.risk.bad  { color:var(--bad);  background:color-mix(in srgb,var(--bad) 16%,transparent); }
.risk.good { color:var(--good); background:color-mix(in srgb,var(--good) 15%,transparent); }
.kind { font-family:var(--mono); font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted);
  border:1px solid var(--line); border-radius:4px; padding:1px 5px; }

/* --- ceiling bar --- */
.ceil { display:flex; align-items:center; gap:8px; min-width:130px; }
.ceil .track { flex:1; height:7px; border-radius:4px; background:var(--sunk); overflow:hidden; }
.ceil .fill { height:100%; background:var(--bad); border-radius:4px; }
.ceil .v { font-family:var(--mono); font-size:12px; font-variant-numeric:tabular-nums; width:2.4ch; text-align:right; }

/* --- steps / traps --- */
.cols2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px; align-items:start; }
ol.steps { margin:0; padding:0; list-style:none; counter-reset:s; display:flex; flex-direction:column; gap:11px; }
ol.steps li { counter-increment:s; display:grid; grid-template-columns:26px 1fr; gap:11px; font-size:13.5px; color:var(--ink-2); }
ol.steps li::before { content:counter(s,decimal-leading-zero); font-family:var(--mono); font-size:11px; color:var(--accent);
  padding-top:2px; }
ol.steps b { color:var(--ink); font-weight:600; }
ul.traps { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:10px; }
ul.traps li { font-size:13.5px; color:var(--ink-2); padding-left:14px; border-left:2px solid var(--bad); }
ul.traps b { color:var(--ink); display:block; font-weight:600; }
.panel { background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:16px 18px; box-shadow:var(--shadow);
  display:flex; flex-direction:column; gap:12px; }
.panel h3 { font-size:14px; font-weight:600; display:flex; gap:8px; align-items:baseline; }
.panel h3 span { font-family:var(--mono); font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); }

/* --- milestones --- */
.track2 { display:flex; flex-direction:column; gap:0; }
.ms { display:grid; grid-template-columns:78px 1fr auto; gap:14px; padding:11px 0; border-bottom:1px solid var(--line-soft); align-items:baseline; }
.ms:last-child { border-bottom:none; }
.ms .act { font-family:var(--mono); font-size:10.5px; text-transform:uppercase; letter-spacing:.07em; color:var(--accent); }
.ms .name { font-weight:600; font-size:13.5px; }
.ms .req { margin-top:5px; display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
.ms .req .lbl { font-family:var(--mono); font-size:10.5px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
.ms .rw { font-family:var(--mono); font-size:12.5px; color:var(--good); font-variant-numeric:tabular-nums; }

.hidden { display:none !important; }
.empty { color:var(--muted); font-size:13px; font-style:italic; padding:10px 0; }
footer { border-top:1px solid var(--line); padding-top:14px; color:var(--muted); font-size:12px; display:flex;
  flex-wrap:wrap; gap:10px; justify-content:space-between; font-family:var(--mono); }

@media print {
  .searchbar { display:none; }
  body { background:#fff; }
  .wrap { max-width:none; padding:0; gap:22px; }
  .meter, .panel, .tablewrap, .spine { box-shadow:none; break-inside:avoid; }
  .sec { break-inside:avoid-page; }
}
@media (prefers-reduced-motion:no-preference) { .chip, .meter { transition:none; } }
`;

const CSS2 = `
.nodelist { background:var(--surface); border:1px solid var(--line); border-radius:8px; box-shadow:var(--shadow); padding:2px 18px; }
.node { display:grid; grid-template-columns:225px 1fr; gap:16px; padding:13px 0; border-bottom:1px solid var(--line-soft); }
.node:last-child { border-bottom:none; }
.node .id { display:flex; flex-direction:column; gap:3px; }
.node .id .t { display:flex; align-items:center; gap:8px; font-weight:600; font-size:13.5px; }
.node .id .t .g { font-size:16px; color:var(--gc,var(--muted)); width:18px; text-align:center; }
.node .id .m { font-family:var(--mono); font-size:10.5px; color:var(--muted); padding-left:26px; }
.node .body { display:flex; flex-direction:column; gap:8px; min-width:0; }
.node .body p { font-size:13px; color:var(--ink-2); }
.stat { display:flex; flex-wrap:wrap; gap:4px 16px; font-family:var(--mono); font-size:11px; color:var(--muted); }
.stat span b { color:var(--ink-2); font-weight:500; }
.io { display:flex; flex-wrap:wrap; gap:6px; align-items:center; font-family:var(--mono); font-size:10.5px;
  text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
@media (max-width:640px) { .node { grid-template-columns:1fr; gap:8px; } .node .id .m { padding-left:0; } }
`;

// =========================================================================
// SECTIONS
// =========================================================================
const section = (eyebrow, title, lede, body) => `
<section class="sec">
  <header><p class="eyebrow">${eyebrow}</p><h2>${title}</h2>${lede ? `<p class="lede">${lede}</p>` : ''}</header>
  ${body}
</section>`;

// --- 1. the three meters -------------------------------------------------
const meters = `
<div class="meters">
  <div class="meter" style="--m:var(--good)">
    <h3>Cash <span>drains three ways at once</span></h3>
    <p>A one-off place cost, a monthly bill charged continuously, and per-craft API spend debited the moment a craft <em>starts</em>.</p>
    <div class="fx">1 billing month = ${BALANCE.monthSeconds}s of play · $25/mo ≈ ${(2500 / BALANCE.monthSeconds).toFixed(0)}¢ per game-second</div>
    <ul><li>Start with ${money(BALANCE.startingCredits)}</li><li>Demolish refunds ${Math.round(BALANCE.refundRate * 100)}% of the place cost</li><li>Zero cash → node reads <b>Out of cash</b> and stops</li></ul>
  </div>
  <div class="meter" style="--m:var(--accent)">
    <h3>Compute <span>thousands of tokens / min</span></h3>
    <p>Every node draws it; only Capacity nodes supply it. Short of supply, everything runs at <b>supply ÷ demand</b> speed and reads <b>throttled (429)</b>.</p>
    <div class="fx">satisfaction = min(1, supply / demand) · draw = computeDraw × clock<sup>${BALANCE.clockExponent}</sup></div>
    <ul><li>It degrades smoothly — it never cliffs</li><li>Capacity nodes are exempt, so they always run</li><li>Overclocking to 2× costs ≈${(2 ** BALANCE.clockExponent).toFixed(1)}× the throughput</li></ul>
  </div>
  <div class="meter" style="--m:var(--bad)">
    <h3>Exposure <span>architectural, not behavioural</span></h3>
    <p>The sum of <code>dataRisk</code> across every enabled node that has a recipe assigned. Wiring a risky provider in exposes you whether or not it is mid-craft.</p>
    <div class="fx">breach/min = ${BALANCE.breachRatePerMinuteAt100} × (exposure / 100)²</div>
    <ul><li>Quadratic: 20 is nothing, 80 is fatal</li><li>A breach takes ${Math.round(BALANCE.breachCostFraction * 100)}% of cash (min ${money(BALANCE.breachCostMin)})</li><li>…and freezes every contract for ${BALANCE.breachFreezeSeconds}s</li><li>Each contract also refuses to run above its own ceiling</li></ul>
  </div>
</div>
<div class="panel" style="margin-top:2px">
  <h3>The rule that catches everyone <span>milestones</span></h3>
  <p style="font-size:13px;color:var(--ink-2)">Milestone progress records contract <b>inputs</b>, not production. A thousand answers you never route to a customer advance nothing. Links carry ${BALANCE.linkRatePerMin} units/min and each node holds ${BALANCE.bufferPerItem} units per slot, so a starved link and a backed-up buffer look identical until you read the status.</p>
</div>`;

// --- 2. the spine --------------------------------------------------------
function lane(name, steps) {
  const parts = steps.map((s) => (s.item
    ? `<span class="step">${chip(s.item)}</span>`
    : `<span class="arrow">→<em>${esc(s.via)}</em></span>`)).join('');
  return `<div class="lane"><span class="laneName">${name}</span>${parts}</div>`;
}
const spine = `<div class="spine">
${lane('Act I', [{ item: 'user_request' }, { via: 'draft model' }, { item: 'draft_answer' }, { via: 'judge' }, { item: 'answer' }, { via: 'eval gate' }, { item: 'verified_answer' }, { via: 'contract' }])}
${lane('Grounding', [{ item: 'document' }, { via: 'chunker' }, { item: 'chunk' }, { via: 'embedder' }, { item: 'embedding' }, { via: 'vector DB' }, { item: 'grounded_prompt' }])}
${lane('Agents', [{ item: 'grounded_prompt' }, { via: 'frontier' }, { item: 'reasoning_answer' }, { via: 'harness' }, { item: 'agent_run' }, { via: 'agent graph' }, { item: 'agent_workflow' }])}
${lane('Sovereign', [{ item: 'open_weights' }, { via: 'fine-tune' }, { item: 'tuned_model' }, { via: 'vLLM / air-gap' }, { item: 'sovereign_answer' }])}
${lane('Silicon', [{ item: 'polysilicon' }, { via: 'wafer fab' }, { item: 'blank_wafer' }, { via: 'EUV' }, { item: 'patterned_wafer' }, { via: 'die test' }, { item: 'logic_die' }, { via: 'CoWoS' }, { item: 'accelerator' }, { via: 'integration' }, { item: 'gpu_rack' }])}
</div>`;

// --- 3. contract ladder --------------------------------------------------
const contracts = RECIPES.filter((r) => typeof r.payout === 'number').sort((a, b) => a.payout - b.payout);
const contractRows = contracts.map((r) => {
  const b = BUILDING_BY_ID[r.buildingId];
  const ceil = r.maxExposure;
  return `<tr data-search="${esc([b?.name, r.name, ...r.inputs.map((i) => ITEM_BY_ID[i.itemId]?.name)].join(' ').toLowerCase())}">
    <td><div class="nm" style="--gc:${b?.color}"><span class="g">${esc(b?.icon ?? '')}</span>${esc(b?.name ?? r.buildingId)}</div>
        <div class="sub2" style="padding-left:23px">${esc(r.name)}</div></td>
    <td>${stacks(r.inputs)}</td>
    <td class="num">${money(r.payout)}</td>
    <td class="num">${money(Math.round(perMin(r.payout, r.seconds)))}</td>
    <td>${ceil == null
      ? '<span class="none">no audit</span>'
      : `<div class="ceil"><div class="track"><div class="fill" style="width:${Math.max(4, ceil)}%"></div></div><span class="v">${ceil}</span></div>`}</td>
  </tr>`;
}).join('');

const contractTable = `<div class="tablewrap"><table>
<thead><tr><th>Customer</th><th>Wants, per cycle</th><th class="num">Payout</th><th class="num">$ / min</th><th>Exposure ceiling</th></tr></thead>
<tbody>${contractRows}</tbody></table></div>`;

// --- 4. model catalog by role -------------------------------------------
function roleOf(r) {
  const b = BUILDING_BY_ID[r.buildingId];
  if (!b || b.tier !== 'Models') return null;
  const out = r.outputs.map((o) => o.itemId);
  const inp = r.inputs.map((i) => i.itemId);
  if (out.includes('reasoning_answer')) return 'reasoning';
  if (inp.includes('draft_answer')) return 'judge';
  if (out.includes('draft_answer')) return 'draft';
  if (out.includes('answer')) return 'answer';
  return null;
}
const ROLES = [
  ['draft', 'Draft', 'user_request → draft_answer. Cheap and ungraded; needs a judge before anyone will pay for it.'],
  ['judge', 'Judge', 'draft_answer → answer. An LLM grades the drafts. You lose some of them and you pay for the grading — and it is still far under frontier.'],
  ['answer', 'Answer', 'Straight to shippable in one hop. Most production traffic belongs here.'],
  ['reasoning', 'Reasoning', 'grounded_prompt → reasoning_answer. Frontier only. The only thing an agent can plan with.'],
];
const modelTables = ROLES.map(([role, label, blurb]) => {
  const rows = RECIPES.filter((r) => roleOf(r) === role)
    .map((r) => ({ r, b: BUILDING_BY_ID[r.buildingId], per: (r.cost ?? 0) / outQty(r) }))
    .sort((a, b) => a.per - b.per)
    .map(({ r, b, per }) => `<tr data-search="${esc(`${b.name} ${r.name} ${role}`.toLowerCase())}">
      <td><div class="nm" style="--gc:${b.color}"><span class="g">${esc(b.icon)}</span>${esc(b.name)}</div></td>
      <td class="sub2">${esc(r.name)}</td>
      <td class="num">${cents(r.cost ?? 0)}</td>
      <td class="num">${cents(per)}</td>
      <td class="num">${trim(perMin(outQty(r), r.seconds))}</td>
      <td class="num">${tpmLabel(b.computeDraw)}</td>
      <td class="num">${risk(b.dataRisk)}</td>
    </tr>`).join('');
  return `<div class="panel" style="padding:0;gap:0;overflow:hidden">
    <div style="padding:13px 16px 11px;border-bottom:1px solid var(--line);background:var(--surface-2)">
      <h3>${label} tier</h3><p style="font-size:12.5px;color:var(--muted);margin-top:3px">${blurb}</p></div>
    <div class="tablewrap" style="border:none;border-radius:0;box-shadow:none"><table>
      <thead><tr><th>Model</th><th>Recipe</th><th class="num">$ / craft</th><th class="num">$ / unit out</th><th class="num">Units / min</th><th class="num">Draw</th><th class="num">Risk</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
}).join('');

// --- 5. capacity ladder --------------------------------------------------
const capRows = BUILDINGS.filter((b) => b.kind === 'capacity').sort((a, b) => a.computeSupply - b.computeSupply)
  .map((b) => `<tr data-search="${esc(`${b.name} capacity`.toLowerCase())}">
    <td><div class="nm" style="--gc:${b.color}"><span class="g">${esc(b.icon)}</span>${esc(b.name)}</div></td>
    <td class="num">${tpmLabel(b.computeSupply)}</td>
    <td class="num">${money(b.cost)}</td>
    <td class="num">${money(b.monthlyCost)}</td>
    <td class="num">${b.monthlyCost ? money(b.monthlyCost / (b.computeSupply / 1000)) : '—'}</td>
    <td class="desc">${esc(b.description)}</td>
  </tr>`).join('');
const capTable = `<div class="tablewrap"><table>
<thead><tr><th>Node</th><th class="num">Supplies</th><th class="num">Place</th><th class="num">Per month</th><th class="num">Rent / 1M TPM</th><th>Why you would</th></tr></thead>
<tbody>${capRows}</tbody></table></div>`;

// --- 6. full node catalog ------------------------------------------------
function nodeCard(b) {
  const rs = RECIPES_BY_BUILDING[b.id] ?? [];
  const makes = [...new Set(rs.flatMap((r) => r.outputs.map((o) => o.itemId)))];
  const takes = [...new Set(rs.flatMap((r) => r.inputs.map((i) => i.itemId)))];
  const unlock = startSet.has(b.id) ? 'starting kit' : (unlockAt[b.id] ? unlockAt[b.id].m.name : 'not unlockable');
  const stat = [
    b.cost ? `<span>place <b>${money(b.cost)}</b></span>` : '',
    b.monthlyCost ? `<span>rent <b>${money(b.monthlyCost)}/mo</b></span>` : '',
    b.computeDraw ? `<span>draws <b>${tpmLabel(b.computeDraw)}</b></span>` : '',
    b.computeSupply ? `<span>supplies <b>${tpmLabel(b.computeSupply)}</b></span>` : '',
    `<span>risk ${risk(b.dataRisk)}</span>`,
    `<span>unlocked by <b>${esc(unlock)}</b></span>`,
    rs.length > 1 ? `<span><b>${rs.length}</b> recipes</span>` : '',
  ].filter(Boolean).join('');
  const io = [
    takes.length ? `<span class="io">takes ${stacks(takes.map((id) => ({ itemId: id })))}</span>` : '',
    makes.length ? `<span class="io">makes ${stacks(makes.map((id) => ({ itemId: id })))}</span>` : '',
  ].join('');
  const searchable = [b.name, b.id, b.tier, b.kind, b.description,
    ...rs.map((r) => r.name), ...[...makes, ...takes].map((id) => ITEM_BY_ID[id]?.name)].join(' ').toLowerCase();
  return `<div class="node" data-search="${esc(searchable)}">
    <div class="id">
      <div class="t" style="--gc:${b.color}"><span class="g">${esc(b.icon)}</span>${esc(b.name)}</div>
      <div class="m"><span class="kind">${kindLabel[b.kind]}</span> ${esc(b.id)}</div>
    </div>
    <div class="body">
      <p>${esc(b.description)}</p>
      <div class="stat">${stat}</div>
      ${io ? `<div style="display:flex;flex-direction:column;gap:5px">${io}</div>` : ''}
    </div>
  </div>`;
}
const catalog = TIER_ORDER.map((tier) => {
  const rows = BUILDINGS.filter((b) => b.tier === tier).map(nodeCard).join('');
  return `<div class="sec" data-group>
    <header style="border-top:none;padding-top:0">
      <p class="eyebrow">${esc(tier)} · ${BUILDINGS.filter((b) => b.tier === tier).length} nodes</p>
      <p class="lede">${esc(TIER_NOTE[tier] ?? '')}</p>
    </header>
    <div class="nodelist">${rows}</div>
    <p class="empty hidden">Nothing in ${esc(tier)} matches.</p>
  </div>`;
}).join('');

// --- 7. items ------------------------------------------------------------
const FORM_LABEL = {
  demand: 'Demand — what arrives at your door',
  data: 'Data — the answer pipeline',
  paper: 'Paper — what auditors want',
  model: 'Model — weights you control',
  silicon: 'Silicon — where compute comes from',
};
const itemsBlock = Object.entries(FORM_LABEL).map(([form, label]) => {
  const rows = ITEMS.filter((it) => it.form === form).map((it) => {
    const from = [...new Set(RECIPES.filter((r) => r.outputs.some((o) => o.itemId === it.id))
      .map((r) => BUILDING_BY_ID[r.buildingId]?.name).filter(Boolean))];
    return `<tr data-search="${esc(`${it.name} ${it.id} ${it.note}`.toLowerCase())}">
      <td>${chip(it.id)}</td>
      <td class="num">${it.value ? money(it.value) : '—'}</td>
      <td class="desc">${esc(it.note)}</td>
      <td class="sub2">${from.length ? esc(from.slice(0, 4).join(', ')) + (from.length > 4 ? ` +${from.length - 4}` : '') : '—'}</td>
    </tr>`;
  }).join('');
  return `<div class="sec" data-group>
    <header style="border-top:none;padding-top:0"><p class="eyebrow">${esc(label)}</p></header>
    <div class="tablewrap"><table>
      <thead><tr><th>Item</th><th class="num">Ref. price</th><th>What it is</th><th>Made by</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <p class="empty hidden">No match.</p>
  </div>`;
}).join('');

// --- 8. milestone track --------------------------------------------------
const msTrack = `<div class="panel"><div class="track2">${MILESTONES.map((m) => `
  <div class="ms">
    <div class="act">${esc(m.act ?? '')}</div>
    <div>
      <div class="name">${esc(m.name)}</div>
      <div class="req"><span class="lbl">sell</span>${stacks(Object.entries(m.requires).map(([itemId, qty]) => ({ itemId, qty })))}</div>
    </div>
    <div class="rw">+${money(m.reward)}</div>
  </div>`).join('')}</div></div>`;

// --- 9. opening, derived from the starting kit ---------------------------
const sR = STARTING_RECIPES.map((id) => D.RECIPE_BY_ID[id]).filter(Boolean);
const capR = sR.find((r) => BUILDING_BY_ID[r.buildingId]?.kind === 'capacity');
const srcR = sR.find((r) => BUILDING_BY_ID[r.buildingId]?.kind === 'source');
const facR = sR.find((r) => BUILDING_BY_ID[r.buildingId]?.kind === 'factory');
const conR = sR.find((r) => BUILDING_BY_ID[r.buildingId]?.kind === 'contract');
const bn = (r) => esc(BUILDING_BY_ID[r.buildingId]?.name ?? '?');
const shared = srcR?.outputs[0]?.itemId;
const srcRate = srcR ? perMin(srcR.outputs[0].qty, srcR.seconds) : 0;
const facRate = facR ? perMin(facR.inputs.find((i) => i.itemId === shared)?.qty ?? 0, facR.seconds) : 0;
const startDraw = STARTING_BUILDINGS.map((id) => BUILDING_BY_ID[id]).filter(Boolean)
  .reduce((n, b) => n + b.computeDraw, 0);
const startSupply = STARTING_BUILDINGS.map((id) => BUILDING_BY_ID[id]).filter(Boolean)
  .reduce((n, b) => n + b.computeSupply, 0);
const ms1 = MILESTONES[0];
const ms1Req = Object.entries(ms1.requires).map(([id, q]) => `${q} ${ITEM_BY_ID[id]?.name ?? id}`).join(', ');

const opening = `<div class="cols2">
  <div class="panel">
    <h3>Opening moves <span>you start with ${money(BALANCE.startingCredits)}</span></h3>
    <ol class="steps">
      <li><b>Place ${capR ? bn(capR) : 'a capacity node'} first</b> and give it the <em>${capR ? esc(capR.name) : ''}</em> recipe. Without capacity, satisfaction is 0 and every node reports 429 — which hides whatever is actually wrong.</li>
      <li>Place <b>${srcR ? bn(srcR) : ''}</b> → <em>${srcR ? esc(srcR.name) : ''}</em>, <b>${facR ? bn(facR) : ''}</b> → <em>${facR ? esc(facR.name) : ''}</em>, and <b>${conR ? bn(conR) : ''}</b> → <em>${conR ? esc(conR.name) : ''}</em>.</li>
      <li>Drag the <b>${ITEM_BY_ID[shared]?.name ?? ''}</b> output dot to ${facR ? bn(facR) : ''}, then its output dot to ${conR ? bn(conR) : ''}. Colours must match.</li>
      <li>Sell <b>${esc(ms1Req)}</b> to clear <em>${esc(ms1.name)}</em> — ${money(ms1.reward)} and ${ms1.unlocksBuildings.length} new nodes.</li>
    </ol>
    <p style="font-size:12.5px;color:var(--muted)">Known pacing quirk: one ${srcR ? bn(srcR) : 'source'} makes <b>${trim(srcRate)}/min</b> and one ${facR ? bn(facR) : 'model'} eats <b>${trim(facRate)}/min</b>, so a single source ${srcRate < facRate ? 'starves' : 'over-feeds'} a single model node. The starting kit draws ${tpmLabel(startDraw)} against ${tpmLabel(startSupply)} supplied — room for ${Math.max(0, Math.floor((startSupply - startDraw) / (BUILDING_BY_ID[facR?.buildingId]?.computeDraw || 1)))} more model node(s) before you need a bigger tier.</p>
  </div>
  <div class="panel">
    <h3>Four traps <span>each costs a run</span></h3>
    <ul class="traps">
      <li><b>Placing a model before capacity.</b> Everything reads 429 and you blame the model.</li>
      <li><b>Producing without selling.</b> Milestones read contract inputs only. Unsold output is a buffer, not progress.</li>
      <li><b>Adding a cheap high-risk provider late.</b> The per-craft saving is real; the +8 Exposure silently pushes you over an existing contract's ceiling and that contract quietly stops paying.</li>
      <li><b>Overclocking.</b> Draw scales as clock<sup>${BALANCE.clockExponent}</sup>, so 2× speed costs ${(2 ** BALANCE.clockExponent).toFixed(1)}× the throughput. Usually cheaper to place a second node.</li>
    </ul>
  </div>
</div>`;

// =========================================================================
// ASSEMBLE
// =========================================================================
const html = `<title>AIfor.study Field Guide</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>${CSS}${CSS2}</style>

<div class="wrap">
  <header class="mast">
    <div>
      <h1>AIfor.study Field Guide</h1>
      <p class="sub">Every node, price and exposure ceiling in the game, generated straight from <code>src/data/</code>. Money only ever comes from contract nodes; everything else is cost.</p>
    </div>
    <div class="stampline">
      <b>${ITEMS.length}</b> items · <b>${BUILDINGS.length}</b> buildings<br>
      <b>${RECIPES.length}</b> recipes · <b>${MILESTONES.length}</b> milestones · <b>${contracts.length}</b> contracts<br>
      generated ${stamp}${problems.length ? ` · <span style="color:var(--bad)">${problems.length} content problems</span>` : ''}
    </div>
  </header>

  <div class="searchbar">
    <input id="q" type="search" placeholder="Filter nodes and items — try “verified”, “deepseek”, “capacity”" autocomplete="off" aria-label="Filter the catalog">
    <span class="hint" id="qhint">${BUILDINGS.length} nodes · ${ITEMS.length} items</span>
  </div>

  ${section('The three meters', 'What you are actually playing against', 'Cash, compute and exposure move independently, and a node can be stopped by any one of them. The status label tells you which.', meters)}
  ${section('Production spine', 'What turns into what', 'Link colours are item colours: an output dot only drops onto an input dot of the same item.', spine)}
  ${section('Customers', 'The contract ladder', 'The better the customer, the less risk they tolerate. Read the ceiling column top to bottom — that column is the entire progression of the game.', contractTable)}
  ${section('Opening', 'First five minutes', '', opening)}
  ${section('Models', 'What a token actually costs you', 'Every model chassis is free to place and free per month. You pay only per craft, so the recipe you assign is the whole cost decision. Sorted cheapest first.', modelTables ? `<div class="cols2" style="grid-template-columns:1fr">${modelTables}</div>` : '')}
  ${section('Capacity', 'The throughput ladder', 'Capacity nodes are exempt from throttling, so they always run. The last column is what renting a million tokens per minute costs you each month.', capTable)}
  ${section('Catalog', 'Every node, and what it means', 'Grouped the way the build bar groups them. Risk is <code>dataRisk</code>: it lands on your Exposure the moment the node is enabled with a recipe assigned — negative values are the counter-play.', catalog)}
  ${section('Glossary', 'Every item', 'Reference prices are display only. All income comes from contract payouts, so there is no exploit in routing an expensive item somewhere generic.', itemsBlock)}
  ${section('Progression', 'The milestone track', 'Requirements count units <em>sold into contracts</em>, cumulatively. Milestones complete in order, one at a time.', msTrack)}

  <footer>
    <span>Generated by tools/build-reference-card.mjs — re-run after any content change</span>
    <span>one unit = 100 operations ≈ 10k in / 2k out tokens</span>
  </footer>
</div>

<script>
(function () {
  var q = document.getElementById('q');
  var hint = document.getElementById('qhint');
  var rows = Array.prototype.slice.call(document.querySelectorAll('[data-search]'));
  var groups = Array.prototype.slice.call(document.querySelectorAll('[data-group]'));
  var base = hint.textContent;
  function apply() {
    var term = q.value.trim().toLowerCase();
    var shown = 0;
    rows.forEach(function (r) {
      var hit = !term || r.getAttribute('data-search').indexOf(term) !== -1;
      r.classList.toggle('hidden', !hit);
      if (hit) shown++;
    });
    groups.forEach(function (g) {
      var any = g.querySelector('[data-search]:not(.hidden)');
      var list = g.querySelector('.nodelist, .tablewrap');
      var empty = g.querySelector('.empty');
      if (list) list.classList.toggle('hidden', !any);
      if (empty) empty.classList.toggle('hidden', !!any);
    });
    hint.textContent = term ? shown + ' matching' : base;
  }
  q.addEventListener('input', apply);
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== q) { e.preventDefault(); q.focus(); }
    if (e.key === 'Escape' && document.activeElement === q) { q.value = ''; apply(); q.blur(); }
  });
})();
</script>`;

const out = join(root, 'docs/reference-card.html');
writeFileSync(out, html);
console.log(`reference card → docs/reference-card.html  (${(html.length / 1024).toFixed(0)} KB, ${BUILDINGS.length} nodes, ${RECIPES.length} recipes, ${problems.length} content problems)`);
