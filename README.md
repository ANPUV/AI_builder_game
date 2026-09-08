# AIfor.study

A node-graph builder game about running an AI company. You place providers,
retrieval, agents, compliance and silicon on a canvas, wire them together, and
a live simulation runs the business: nodes consume inputs, craft over time,
burn API spend per call, draw throughput against a rate limit, and sell
finished work to customers who audit what you route through.

Content spec: [`docs/CONTENT-SPEC.md`](docs/CONTENT-SPEC.md) (v2, 5 Sep 2026)
covers the main Act I–III spine; [`docs/ADDONS-SPEC.md`](docs/ADDONS-SPEC.md)
(v1, 6 Sep 2026) adds the Home Lab and AI Slop side tracks. Together:
53 items, 103 buildings, 135 recipes, 24 milestones, 15 contracts.

```bash
npm install
npm run dev
```

## Local 3D preview

Run `npm run dev:ui` and open `http://localhost:5173/preview` to play locally
without the auth Worker. This route exists only in Vite development mode;
production keeps the normal sign-in flow.

The Three.js factory floor uses the existing simulation and save format. Use
the **2D editor / 3D floor** button to switch views without losing progress.
Drag to orbit, right-drag to pan, scroll to zoom, and **Fit factory** to recenter.
Choose a building with **+**, then click the floor to place it. Click a building
to inspect it; **Shift-drag** moves it. Select an output under **Connect**, then
click its destination to create a belt. Click a belt to inspect or delete it.
Recipes, manual generation, contracts, and economy use the existing engine.
The 2D editor retains box selection, copy/paste, and port-drag quick building.
The new 3D controls currently use English labels and require WebGL2.

## The reframe

The engine is a factory sim; the content maps it onto how AI companies
actually work rather than onto a supply chain.

| Engine concept | Means |
| --- | --- |
| Power | **Compute** — thousands of tokens/min, **per provider**. Over-demand is a 429, not a brownout. |
| Generator | **Capacity** — API tiers (one provider each), rented GPUs, your own datacenter. |

### Rate limits are per provider

Limits do not pool. An OpenAI Tier 5 buys you nothing on Anthropic, so every
model node draws on its own vendor's pool and a vendor-scoped capacity node
(free tier, API tiers, batch lane) picks **one** provider to serve. Ten vendors
are modelled; a model building declares its `vendor`, a capacity building
declares `vendorScoped`.

Everything you run yourself — retrieval, evals, agents, self-hosted serving,
the silicon branch — draws on the **shared** pool, which starts with
`BALANCE.ownServersKtpm` of ordinary servers and grows with the prompt cache and
rented or owned hardware.

A **Free Tier covers exactly one node** (`servesNodes: 1`). Put a second node on
the same provider and the allowance stops counting, which is what makes the
first paid tier worth $200.

Units stay **TPM, not FLOP/s** — deliberately. Tier 1 = 500k TPM and Tier 5 =
40M TPM are published, citable figures; nobody sells FLOPs on an API, and
converting would need an invented tokens↔FLOPs factor that varies by model size.
FLOPS belong in the hardware node descriptions as sourced colour, not as the
mechanic.
| Extractor | **Demand** — landing page, ads, tickets, documents. |
| Sink | **Contract** — a recipe with a payout and an exposure ceiling. Contract chassis are not stocked in the build bar; they arrive as timed offers on the marketplace board. |
| Item value | **Reference price**, display only. All income comes from contracts. |

Every node description carries a real, sourced figure — DeepSeek's $1.32/$3.96
per 1M tokens, ASML's $380M scanner, SK hynix's ~58% HBM share. The economy is
scaled for playability; the ratios are not.

## Four mechanics the base engine did not have

- **Recurring cost** — buildings have `monthlyCost`, charged continuously.
  `BALANCE.monthSeconds = 300`, so a $25/mo plan bills about 8¢ per game-second.
- **Per-craft API spend** — recipes have `cost`, debited when a craft *starts*.
  A node with no cash reads **Out of cash** and stops. This is what makes gross
  margin something you watch decay in real time.
- **Contracts** — recipes with `payout` and `maxExposure`, consuming
  deliverables and emitting money. Milestone progress records contract
  *inputs*, so producing a thousand answers you never sell advances nothing.
- **Exposure & breach** — buildings have `dataRisk`, summed across every
  enabled node that has a recipe assigned. Risk is architectural: wiring
  DeepSeek in exposes you whether or not it is mid-craft. Controls carry
  negative risk (observability −5, air-gapped deploy −6), so the counter-play
  costs money rather than being a toggle.

Breach probability is `2.4 × (exposure / 100)²` per minute — quadratic, so a
little risk is survivable and a lot is not. A breach takes 12% of cash
(min $500) and puts every contract on a 20-second security hold.

## Swapping content and balance

All content lives in `src/data/`. Nothing outside that directory knows what the
items *are*; the engine reads ids and numbers only.

| File | What it holds |
| --- | --- |
| [`items.ts`](src/data/items.ts) | 53 items across 7 forms (demand / data / model / silicon / paper / hardware / slop), each with a teaching note. |
| [`buildings.ts`](src/data/buildings.ts) | 103 buildings. `kind` is source / factory / capacity / contract; plus `monthlyCost`, `computeDraw`, `computeSupply`, `dataRisk`, `tier`. |
| [`recipes.ts`](src/data/recipes.ts) | 135 recipes. `inputs → outputs` over `seconds`, plus `cost`, `payout`, `maxExposure`, `note`. |
| [`milestones.ts`](src/data/milestones.ts) | 24 milestones across three parallel tracks (16 main spine, 4 Home Lab, 4 AI Slop), each with an act label, plus the starting kit. |
| [`market.ts`](src/data/market.ts) | The contract board. One listing per contract chassis: draw `weight`, window `ttl`, and the lead lines. Rarity is derived from weight, so the label and the odds cannot disagree. |
| [`balance.ts`](src/data/balance.ts) | Tick rate, link throughput, buffers, starting cash, refund, clock bounds, `clockExponent`, `monthSeconds`, breach tuning. |

`validateContent()` runs on boot in dev and logs any recipe or milestone
pointing at an id that does not exist. Saves are pruned the same way on load,
so a stale save degrades instead of crashing. `STATE_VERSION` is 2; v1 saves
are discarded.

**One unit = 100 operations.** A unit of any `data` item stands for 100 real
requests at roughly 10k in / 2k out tokens, so every dollar figure is the
published price of 100 such calls. Real per-request costs are fractions of a
cent and read as noise on screen; this preserves every ratio between providers
exactly.

## How a tick works

`src/engine/simulate.ts`, fixed timestep (`BALANCE.tickSeconds`, 1/20s):

1. **Survey** — compute supply vs. demand, and sum `dataRisk` into Exposure.
2. **Rent** — charge `monthlyCost / monthSeconds` for every enabled node.
3. **Breach roll** — quadratic in Exposure; on a hit, take cash and freeze
   contracts.
4. **Run nodes** — advance each craft at `clock × satisfaction` (capacity nodes
   are exempt). Debit API spend and consume inputs at cycle start; credit
   payouts and record contract inputs at cycle end.
5. **Move items** — links sharing a source output split it proportionally to
   what each destination has room for.
6. **Contract board** — retire lapsed leads, roll for a new one.
7. **Milestones**, then EMA-smoothed finance for the top bar.

Catch-up is capped at 2 seconds per frame so a backgrounded tab does not freeze
on resume.

## Controls

- Click a building in the left bar, then click the canvas to place it. Hold
  <kbd>Shift</kbd> to keep placing.
- Drag a coloured **output dot** onto a matching **input dot** to run a link.
- Drag a node to move it, drag the background to pan, scroll to zoom.
- <kbd>Del</kbd> removes the selection, <kbd>Esc</kbd> cancels.
- Place a **Free Tier** first — every node draws throughput, and without
  capacity everything runs at a 429.

## Balancing console

In dev, `window.__ai` exposes `{ data, factory, simulate, state }`. `state` is
the live world; mutate it with the `factory` helpers and the UI picks it up on
the next frame. To test a chain headlessly:

```js
const { factory, simulate } = window.__ai;
const s = factory.createInitialState();
const P = (b, x, y, r) => { const m = factory.placeMachine(s, b, x, y); factory.setRecipe(s, m.id, r); return m.id; };
const ft = P('free_tier', 0, -300, 'cap_free');
factory.setVendor(s, ft, 'openai');   // vendorScoped capacity supplies nothing until you pick a provider
const lp = P('landing_page', 0, 0, 'organic');
const lu = P('gpt_luna', 300, 0, 'd_luna');
const ca = P('consumer_app', 600, 0, 'c_consumer_raw');
factory.addLink(s, lp, 'user_request', lu);
factory.addLink(s, lu, 'draft_answer', ca);
for (let i = 0; i < 600; i++) simulate.advance(s, 0.5);   // 5 simulated minutes
console.log(s.credits, s.delivered, s.exposure, s.finance);
```

## Verified behaviour

Measured through the console above, not asserted:

| Check | Result |
| --- | --- |
| Act I spine, 5 min | $1,780 → $3,370; 136 draft answers sold; milestone 1 cleared; revenue $38.99/min against COGS $10.66/min |
| Exposure sums as designed | 8 DeepSeek nodes → exposure exactly **64**, matching the spec's table |
| Breach cadence | 12 breaches in 10 min at exposure 64 (expected value 9.8) |
| Contract audit ceiling | exposure 33 vs ceiling 45 → running, paid $56. Exposure 65 → **Security hold**, paid $0 |
| Security hold mid-craft | reports the hold rather than a green "Running" |
| Rate limiting | satisfaction 0.47 → 12 answers/min; 0.16 → 9; 0.08 → 0. Degrades, does not cliff |
| Out of cash | zero cash → status `broke`, craft does not start |
| Content integrity | `validateContent()` returns 1 problem (the known `pretrain` buffer note) across 53/103/135/24 |
| ESG power anchor | Own Datacenter bills 10,000 kW x 730 h x $0.09 = ~$657k/mo against its $7.08M cost — 9.3%, matching the "power only ~7%" its own description claims |
| ESG scale | Gaming PC (0.5 kW) scores ~1 on the power term, Own Datacenter (10 MW) ~97. Logarithmic, so neither end of the ladder rounds away |
| Greenwashing is a real gamble | Publishing 5 against a real 61: caught in 24/40 runs within 90s. An honest filing: 0/40. The audit rolls on the gap, never on the footprint |
| ESG leaves the base game alone | With the addon off: no power bill, no events, `burnPerMonth` exactly the chassis subscriptions, no placement blocked — and the meter still computes, so switching it on mid-run shows a number that was already true |

## Known rough edges

- **Act I pacing is slow**, as the spec's own open questions predict. One
  Landing Page produces 30 user requests/min; one GPT-5.6 Luna consumes 48/min,
  so a single source starves a single model node. The coach now calls this out,
  but the underlying ratio is still unforgiving.
- **The tech tree had four circular gates** — milestones requiring an item that
  only a contract unlocked by that same milestone could buy, which made the game
  unwinnable past #4. Fixed by moving each buyer earlier (Mid-Market to #4,
  ISO 42001 + Enterprise to #6, FedRAMP + Federal to #9). `validateContent()`
  now audits for this class of bug at boot.
- **The frontier pretraining run needs 3,000 training tokens** against a
  default `bufferPerItem` of 400. The engine now raises a node's input cap to
  fit one craft (`inputCap()` in `simulate.ts`), because a flat cap below a
  recipe's requirement makes that recipe impossible to start — it deadlocked
  milestone 16 completely. `validateContent()` warns when the two disagree.
- **Cash can go negative and rent is charged regardless.** An over-subscribed
  factory bleeds while idle: paid recipes stop below their cost, revenue goes to
  zero, subscriptions do not. It is escapable — demolishing rent-bearing nodes
  refunds half the place cost and stops the drain — but there is no bankruptcy
  state, and switching a node off does *not* cancel its subscription.
- **Off-peak pricing is unmodelled.** DeepSeek is 50% off outside Beijing
  business hours. A day/night cycle would give the batch lane a reason to exist.
- **Contracts do not churn.** Real pilots convert at 10–15%; a contract that
  expires and must be re-won would stop the late game being pure accumulation.
- **Export controls are absent.** B200 and Rubin are banned to China; H200 is
  conditionally allowed with a 25% tariff.
- **Prices need a refresh pass** every few months. Two changes are already
  known: Gemini Flash doubles on 1 Jan 2027, and OpenAI stops accepting new
  fine-tuning jobs on 6 Jan 2027.
