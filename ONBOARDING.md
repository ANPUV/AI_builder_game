# AIfor.study — developer onboarding

A node-graph builder game about running an AI company. You place providers,
retrieval, agents, compliance and silicon on a canvas, wire them together, and
a live simulation runs the business: nodes consume inputs, craft over time,
burn API spend per call, draw throughput against a rate limit, and sell
finished work to customers who audit what you route through.

TypeScript + React 19 + Vite. No backend, no accounts, no database — state
lives in the browser.

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # tsc --noEmit
npm run build      # tsc -b && vite build
```

---

## 1. The one architectural rule

**The engine never knows what the items *are*.** It reads ids and numbers.
Everything nameable — providers, prices, contracts, the tech tree — lives in
`src/data/` and can be replaced wholesale without touching simulation or UI.

```
src/data/     content + balance          <- the swappable layer
src/engine/   types, state, tick loop, save/load
src/ui/       canvas editor, node, panels, game-loop hook
```

The UI splits into the canvas and the two sidebars:

| File | Does |
| --- | --- |
| `Canvas.tsx` / `MachineNode.tsx` | the node graph: place, drag, wire, pan, zoom |
| `BuildDialog.tsx` | the ＋ dialog. Tabs per `tier`, plus a Contracts tab that renders `MarketplaceBody` |
| `Hotbar.tsx` | quick-build strip. Keys 1-9 then 0 arm `state.hotbar[slot]` |
| `Marketplace.tsx` | contract board. `MarketplaceBody` is the reusable half; the default export wraps it in a modal |
| `Inspector.tsx` | right sidebar. Recipe picker, clock, throughput, demolish |
| `TechTree.tsx` | right sidebar. Current milestone + the next `LOOKAHEAD` (3) shown locked, rest sealed |
| `Coach.tsx` | `nextStep(state)` — returns the single next action. The onboarding brain |
| `UnlockPanel.tsx` | modal on milestone completion, listing new buildings and recipes |
| `Tip.tsx` | hover tooltip, portalled to `body` because both sidebars clip |
| `format.ts` | `money`, `tpm`, `recipeFlow` |
| `useGame.ts` | the rAF loop, autosave, toasts, `pendingUnlock` / `freshUnlocks` |

**`Coach.tsx` is load-bearing for playability.** The tech tree states a goal
("80 Answer") but a player has no way to know which node produces it. `nextStep`
walks the world in blocking order — no capacity, throttled, out of cash,
security hold, node with no recipe, nothing makes the required item, nothing
sells it, starved — and names the specific buildings and recipes that fix it.
If you add content, that ordering is what keeps the game teachable.

If you find yourself writing `if (itemId === 'gpu')` anywhere outside
`src/data/`, that is the bug. Add a field to the data type instead.

---

## 2. The domain model

Four data types, in dependency order:

| Type | File | Key fields |
| --- | --- | --- |
| `Item` | `data/items.ts` | `form` (demand / data / model / silicon / paper / hardware / slop), `value` (reference price, **display only**), `color`, `note` |
| `Building` | `data/buildings.ts` | `kind`, `cost`, `monthlyCost`, `computeDraw`, `computeSupply`, `dataRisk`, `tier` |
| `Recipe` | `data/recipes.ts` | `buildingId`, `seconds`, `inputs[]`, `outputs[]`, `cost`, `payout`, `maxExposure`, `note` |
| `Milestone` | `data/milestones.ts` | `track`, `act`, `requires{}`, `unlocksBuildings[]`, `unlocksRecipes[]`, `reward` |

A **building** is a chassis; what it *makes* comes from the recipes that target
it, so one chassis can host many recipes. `kind` drives all special behaviour:

- `source` — recipes with no inputs. Demand, documents, open weights.
- `factory` — the normal case.
- `capacity` — supplies throughput (kTPM). **Exempt from throttling**, so it
  always runs. May burn a fuel item (a recipe with inputs and no outputs).
- `contract` — a customer. Recipes have a `payout` and no outputs.

### The reframe

The engine is a factory sim; the content maps it onto how AI companies work.

| Engine concept | Means here |
| --- | --- |
| Power | **Compute** — thousands of tokens/min. Over-demand is a 429, not a brownout. |
| Generator | **Capacity** — API tiers, rented GPUs, your own datacenter. |
| Extractor | **Demand** — landing page, ads, tickets, documents. |
| Sink | **Contract** — a recipe with a payout and an exposure ceiling. The chassis comes off the marketplace board, not the build bar. |
| Item value | **Reference price**, display only. All income comes from contracts. |

### Unit convention

**One unit = 100 operations.** A unit of any `data` item stands for 100 real
requests at roughly 10k in / 2k out tokens, so every dollar figure is the
published price of 100 such calls. Real per-request costs are fractions of a
cent and read as noise on screen; this scaling preserves every ratio between
providers exactly.

Every node description carries a real, sourced figure — DeepSeek's $1.32/$3.96
per 1M tokens, ASML's $380M scanner. The economy is scaled for playability; the
ratios and the facts are not. Keep it that way when you add content.

---

## 3. The four money/risk mechanics

These are what separate this from a generic factory sim. All four are in
`engine/simulate.ts`.

- **Recurring cost** — `building.monthlyCost`, charged continuously.
  `BALANCE.monthSeconds = 300`, so a $25/mo plan bills about 8¢ per
  game-second.
- **Per-craft API spend** — `recipe.cost`, debited when a craft *starts*. No
  cash → status `broke`, craft does not begin. This is what makes gross margin
  something you watch decay in real time.
- **Contracts** — `recipe.payout` credits cash on completion, and the recipe's
  **inputs** are what get recorded into `state.delivered`. Milestones read
  `delivered`, so producing a thousand answers you never sell advances nothing.
- **Exposure & breach** — `building.dataRisk` summed across every *enabled node
  that has a recipe assigned*. Risk is architectural: wiring DeepSeek in
  exposes you whether or not it happens to be mid-craft. Controls carry
  negative risk (observability −5, air-gapped deploy −6).

Breach probability is `BALANCE.breachRatePerMinuteAt100 * (exposure / 100) ** 2`
— quadratic, so a little risk is survivable and a lot is not. A breach takes
12% of cash (min $500) and puts every contract on a 20-second security hold.

---

## 4. How a tick works

`engine/simulate.ts` → `step(state, dt, events)`, fixed timestep
(`BALANCE.tickSeconds`, 1/20s). Order matters:

1. **Survey** — compute supply vs. demand **per pool** (`poolOf()` decides
   which); sum `dataRisk` into `state.exposure`. Each pool gets its own
   `satisfaction`, so a node is limited by its own provider rather than by the
   worst pool on the canvas. Free tiers are held back until the drawer count is
   known, then only count if `drawers <= servesNodes`.
2. **Rent** — charge `monthlyCost / monthSeconds * dt` for every enabled node.
3. **Breach roll** — quadratic in exposure; on a hit, take cash and set
   `breachFreeze`.
4. **Run nodes** — advance each craft at `clock * satisfaction` (capacity nodes
   are exempt). Debit `cost` and consume inputs at cycle *start*; credit
   `payout` and record contract inputs at cycle *end*.
5. **Move items** — links sharing a source output port split it proportionally
   to what each destination has room for, so a splitter behaves like one rather
   than starving whichever link came later in the map.
6. **Contract board** (`engine/market.ts`) — retire offers past their window,
   then roll for a new lead. The rate scales with how many contract tiers are
   unlocked, floors so a one-tier opening still rings, and jumps while the
   board is empty so the player is never waiting on a die roll.
7. **Milestones**, then EMA-smoothed finance for the top bar. Unlocking a
   contract tier forces one of its leads onto the board immediately, so the
   unlock panel never names a customer the player then waits minutes to meet.

`advance(state, seconds)` runs that in fixed slices and returns `TickEvents`
(`milestonesCompleted`, `breaches`, `offersArrived`, `offersExpired`). Catch-up is capped at 2 seconds per call
so a backgrounded tab does not freeze on resume.

### Statuses

`running · idle · disabled · starved · blocked · throttled (429) · broke ·
audited (security hold)` — labels in `simulate.statusLabel`.

Gotcha worth knowing: the audit/freeze gates apply when a craft *starts*, so
work already in flight is honoured — but the status is reported in both
branches, so a frozen contract shows "Security hold" rather than a green
"Running".

---

## 5. State handling

`engine/factory.ts` holds **every** state mutation and is the only place that
validates a change: `placeMachine`, `removeMachine`, `moveMachine`,
`setRecipe`, `setClock`, `setEnabled`, `addLink`, `removeLink`, plus `canLink`
for UI feedback. They return `Outcome` (`{ ok: true } | { ok: false, reason }`)
so the UI can toast the reason.

**The state object is mutated in place, not cloned.** `ui/useGame.ts` bumps a
revision counter to trigger React renders, and throttles sim-driven renders to
~20/sec. Cloning the world 20 times a second would be the obvious thing and the
wrong thing. So:

- Never hold a stale reference to a `Machine` across a tick.
- Do mutations through `factory.ts` helpers, then let `act()` repaint.

Saves go to `localStorage` under `aifor-study/save/v1`. `STATE_VERSION` is
2 and is checked inside the payload — the `v1` in the *key* is just the storage
slot and does not track `STATE_VERSION`; mismatched saves are discarded on
load. `save.ts` also prunes anything pointing at content that no longer exists
(machines with deleted buildings removed, unknown recipes nulled, dangling
links dropped) so a stale save degrades instead of crashing. That matters here
— the whole point of the data layer is that it gets swapped.

---

## 6. Making common changes

**Add an item** → append to `ITEMS` in `data/items.ts`. Give it a `form`, a
`color` (it becomes the link colour), and a `note` with the real figure behind
it.

**Add a building** → append to `BUILDINGS`. Pick a `kind`, set `tier` (that is
the build-bar grouping), and give it `computeDraw` or `computeSupply`. Then
write at least one recipe targeting it, or it can never do anything.

**Add a recipe** → append to `RECIPES` with `buildingId`, `seconds`, `inputs`,
`outputs`. Add `cost` for API spend; add `payout` + `maxExposure` to make it a
contract.

**Add a milestone** → append to `MILESTONES`. `requires` counts units *sold
into contracts*, not produced. Milestones complete in array order **within their
`track`**, one at a time; the three tracks (`main`, `homelab`, `slop`) advance
independently, so an untouched side track never blocks the spine. A milestone
with no `track` counts as `main`.

**Retune the economy** → `data/balance.ts` only.

**Change the starting kit** → `STARTING_BUILDINGS` / `STARTING_RECIPES` at the
top of `data/milestones.ts`.

After any content edit, `validateContent()` (in `data/index.ts`) runs on boot
in dev and logs every recipe or milestone pointing at an id that does not
exist. Check the console.

It also runs `unreachableMilestones()`, which walks the unlock order and catches
**circular gates** — a milestone requiring an item that only a contract unlocked
by that same milestone can buy. Because milestones count units *sold*, that
combination leaves the player permanently stuck with no error anywhere. Four of
these shipped in the original tree and made the game unwinnable past milestone 4.
If you reorder unlocks, watch this warning.

---

## 7. The balancing console

In dev, `window.__ai` exposes `{ data, factory, simulate, state }`. `state` is
the **live** world — mutate it with the `factory` helpers and the UI picks it
up on the next frame.

Better, you can run the whole simulation headlessly with no UI at all. This is
the fastest way to test a chain or a balance change:

```js
const { factory, simulate } = window.__ai;
const s = factory.createInitialState();
const P = (b, x, y, r) => { const m = factory.placeMachine(s, b, x, y); factory.setRecipe(s, m.id, r); return m.id; };

const ft = P('free_tier', 0, -300, 'cap_free');      // place capacity FIRST
factory.setVendor(s, ft, 'openai');                  // ...and give it a vendor
const lp = P('landing_page', 0, 0, 'organic');
const lu = P('gpt_luna', 300, 0, 'd_luna');
const ca = P('consumer_app', 600, 0, 'c_consumer_raw');
factory.addLink(s, lp, 'user_request', lu);
factory.addLink(s, lu, 'draft_answer', ca);

for (let i = 0; i < 600; i++) simulate.advance(s, 0.5);   // 5 simulated minutes
console.log(s.credits, s.delivered, s.exposure, s.finance, s.status);
```

Two traps that cost real debugging time:

- **Place a capacity node first.** Without one, supply is 0, satisfaction is 0,
  and *everything* reports `throttled` — which masks whatever you were actually
  testing.
- **Set the vendor on a `vendorScoped` capacity node.** `setRecipe` alone is not
  enough: a Free Tier with no vendor supplies *nothing*, the provider's pool
  stays at `supplyKtpm: 0`, and every model node on it reads `throttled` — the
  same symptom as having no capacity at all. `factory.setVendor(s, id, 'openai')`.
  The UI hides this trap because the Inspector makes you pick a provider.
- **Give contracts enough exposure headroom**, or they sit at `audited` and you
  will think the payout logic is broken.

---

### Overlays on the canvas

`Canvas` captures the pointer (`setPointerCapture`) on every left-press that
reaches its handler. Once it does, `pointerup` and the synthesized `click`
retarget to the canvas, so a button inside the canvas never fires its `onClick`.
Anything floating over the canvas therefore goes inside `.canvas-overlay`, which
stops `pointerdown` from bubbling and is itself `pointer-events: none` so the
canvas stays draggable around it.

This also breaks naive tests: calling `el.click()` bypasses pointer events
entirely and passes even when a real click is dead. Dispatch a genuine
`pointerdown` → `pointerup` → `click` sequence when testing canvas controls.

## 8. Repo gotchas

- **There is no git repo here.** An overwrite is unrecoverable from version
  control. Read a file before you replace it. If you do clobber something, the
  data survives as string literals in `dist/assets/*.js` — extract it *before*
  running another build, because Vite cleans `dist`.
- **Other sessions edit this repo between turns.** Check `ls -la` mtimes
  against what you expect before writing.
- **The simulation runs on a `setInterval`, not `requestAnimationFrame.**
  rAF is *suspended entirely* when the tab or preview pane is hidden, which
  froze the world and made pause/unpause appear broken. The loop also reads
  speed from a ref (`speedRef`) so changing speed never tears the timer down.
  Browsers still throttle background timers to ~1s, so multipliers above 1x
  compress while hidden — the catch-up cap in `advance()` is what stops a
  backgrounded tab from fast-forwarding.

---

## 9. Where the design comes from

[`docs/CONTENT-SPEC.md`](docs/CONTENT-SPEC.md) (v2, 5 Sep 2026) is the content spec
(`docs/content-spec.html` is the same document rendered):
the reframe, the model catalog at September 2026 prices, the contract ladder,
the exposure table, the silicon chain, and the 16-milestone tech tree.

It is written in the past tense ("implemented + shipped") but is a *target*,
not a description of disk. Its acceptance criteria are the counts — **31 items,
69 buildings, 87 recipes, 16 milestones, 11 contracts** — which the repo met
before the addons.

[`docs/ADDONS-SPEC.md`](docs/ADDONS-SPEC.md) (v1, 6 Sep 2026) then added the two
optional side tracks, Home Lab and AI Slop, taking the repo to its current
**53 items, 103 buildings, 135 recipes, 24 milestones, 15 contracts**. The 24
milestones run as three parallel tracks (16 main spine, 4 Home Lab, 4 AI Slop),
so `MILESTONES` is no longer a single ordered chain.

Its tables are internally approximate: the cost-ladder rows and the catalog's
$/craft column only reconcile if mid-tier crafts yield 3 answers. The standing
ruling is **sourced catalog prices win, craft yields are derived to fit**,
because the spec's own stated design principle is that the real vendor figures
stay real.

Known rough edges are listed at the bottom of `README.md` — Act I pacing is
slow, off-peak pricing is unmodelled, contracts do not churn, export controls
are absent, and prices need a refresh pass every few months.
