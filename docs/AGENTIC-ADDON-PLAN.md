# Agentic Ops addon — plan

**Status:** built and shipped · 8 September 2026. Plan written 7 Sep 2026;
§10 records what the build changed.

Grounded in what's already shipped: `agent_run` and `agent_workflow`
([src/data/items.ts:58-59](../src/data/items.ts)) already exist, produced by
**Agent Harness** and **Multi-Agent Graph** ([src/data/buildings.ts:143-144](../src/data/buildings.ts))
and consumed by the Enterprise contracts. Milestone `ms_agents` (Act II,
"Agents In Production", 60 `agent_run`) and the "Own The Weights" milestone
(40 `agent_workflow`) are the two natural unlock points — this addon needs no
new milestone track, just two hooks into tracks that already exist.

## The pitch, in one line

Every other addon sells something. This one doesn't — **it automates the
selling**, and it never stops costing you money for the privilege.

## Decisions taken

| Decision | Choice |
| --- | --- |
| Scope | New **feature** addon (same shape as Venture Capital — `kind: 'feature'`, off by default), not a track. No addon-architecture change needed; the `kind: 'feature'` generalization already shipped |
| Unlock | Gated on existing milestones (`ms_agents` for tier 1, the Act III weights milestone for tier 2), not a new milestone chain |
| New `BuildingKind` | `'agent'` — a fifth kind alongside source/factory/capacity/contract |
| Revenue | **Zero, structurally.** No recipe on an `'agent'`-kind building may carry a `payout`. `validateContent()` enforces it |
| Fuel | Agents run on `agent_run` / `agent_workflow` as **catalysts** (held, never consumed) — reuses the exact idiom the BYO Rack Bay and local models already use, no new item economy |
| "Higher model, more success" | Encoded as *which* catalyst an agent tier requires, not a numeric slot — a Junior agent holds an `agent_run`, a Senior agent holds an `agent_workflow` (which itself only exists because a frontier model fed the harness). The quality ladder the player already built upstream is the ladder this addon reads |
| Targeting | One shared **Focus** dropdown on every targeting agent (Sales, Marketing, Support): All contracts / a whole track / **one named contract tier**, grouped by track, with a secondary rarity floor for the group options. See §1a |
| Sales action | Auto-calls the existing `signOffer()` ([src/engine/factory.ts:155](../src/engine/factory.ts)) against one matching board offer per success roll — no new placement path |
| Marketing action | Boosts the board's draw weights, not a flat timer — multiplies `effectiveWeight()` ([src/engine/market.ts:63](../src/engine/market.ts)) for listings matching the target, **+2.5% per enabled agent**, per the brief |
| Coding action | Auto-places and auto-links the minimal producer chain for one signed-but-unwired contract, over a long timer, spending cash exactly as manual placement would |
| Governance | New global stat, **Agent Drift** (0–100), mirrors Exposure/Slop. Unsupervised auto-actions raise it; a Reviewer agent (negative drift) is the only lever down |
| Save shape | New `BuildingKind`, new `GameState.agentDrift`, new `Machine` runtime fields → `STATE_VERSION` bump, old saves discarded, per house convention |

## 0. The lesson

The main game already teaches three things: rate limits are the constraint,
compliance costs money, capital isn't free. This addon teaches the fourth
one, and it's the one dominating industry conversation right now:

**Agentic automation is not a business model. It's overhead you pay so a
job gets done without you — and it keeps charging you whether or not the
job was worth doing.**

Every other addon's nodes eventually sell something: a contract payout, an
IP fine, a revenue share. Agent nodes never do. They have `monthlyCost` and
no `payout`, full stop. Their entire case for existing is *indirect* — they
close more contracts, wire more chains, catch more mistakes — and the player
has to keep believing that math holds, tick after tick, the same way a real
team has to keep justifying a tool subscription against what it actually
saved.

Two failure modes, both real:

- **An unsupervised agent can lose you money faster than a human ever
  could.** A Sales Agent with no budget sense will auto-sign a $150,000
  Regional MSP lead your compute can't service yet, and the chassis cost is
  gone the instant it does.
- **Automation compounds the thing it automates.** A Marketing Agent makes
  the board ring faster; a Sales Agent signs faster because of it; a Coding
  Agent burns cash building for what got signed. Three agents amplify each
  other in a loop that runs with nobody watching it, which is exactly the
  property that makes "agentic" the term of art in 2026 and exactly the
  property that makes it dangerous unmonitored.

## 1. Data model

```ts
// buildings.ts
export type BuildingKind = 'source' | 'factory' | 'capacity' | 'contract' | 'agent';

// A new tier, distinct from 'Agents' (Harness/Multi-Agent Graph, which build
// the product). This tier runs the business.
// BuildingTier gains 'Agent Ops'
```

```ts
// types.ts, on Machine — only meaningful when buildingId is kind: 'agent'
focus?: FocusTarget;         // see §1a. Defaults to 'all' when unset.
rarityFloor?: Rarity;        // only meaningful when focus is 'all' or a track
project?: {                  // Coding Agent only
  contractMachineId: string;
  secondsRemaining: number;
  plan: { buildingId: string; x: number; y: number }[]; // remaining placements
};
```

```ts
// types.ts, on GameState — unconditional, like slop/priceIndex
agentDrift: number; // 0-100, defaults 0 regardless of whether the addon is on
```

No new items. No new `RecipeStack` shape. The only genuinely new engine
surface is the `'agent'` kind itself and the per-tick agent-action pass
described below.

## 1a. Focus — the contract-tier dropdown

The single control that makes an agent a *specialist*. One shared component
on Sales, Marketing and Support agents, so the player learns it once.

```ts
// A contract tier by name, a whole track, or everything.
export type FocusTarget =
  | 'all'
  | `track:${'main' | 'homelab' | 'slop'}`
  | `tier:${string}`;   // a contract chassis buildingId
```

The dropdown is built from `MARKET_LISTINGS` at render time — one
`<optgroup>` per track, in board order (cheapest/commonest first), so it
always matches the ladder the Contracts tab shows:

```
All contracts
── Online ────────────────────
   Any online contract
   Freemium Tier          Common
   Prosumer Subs          Common
   SMB Pilot              Uncommon
   Mid-Market SaaS        Uncommon
   Enterprise Seats       Rare
   Health / Finance       Rare
   Federal Program        Epic
   Hyperscaler            Epic
   API Platform           Legendary
── Home Lab ──────────────────
   Any Home Lab contract
   SME On-Prem Pilot      Common
   Managed On-Prem Fleet  Rare
   Regional MSP           Epic
── Slop ──────────────────────
   Any Slop contract
   Post To Feed           Common
   Content Mill Order     Common
   Programmatic SEO       Uncommon
   Adult Platform         Rare
```

Four rules, three of which the codebase already has precedent for:

1. **Rarity labels come from the data, not a second list.** Each row's
   badge is `rarityOf(listing.weight)` ([src/data/market.ts:94](../src/data/market.ts)),
   the same function the Contracts tab already uses — the label and the odds
   can never disagree.
2. **Locked tiers are shown and disabled, not hidden.** Exactly the
   treatment commit `f1c5a0e` gave contract rows in the quick-build popup:
   greyed at `opacity: 0.45`, with the reason in place of the rarity badge
   ("not unlocked yet") and a Tip on hover. Hiding them would make the
   dropdown's contents change under the player as they progress; showing
   them makes the tier ladder legible from the first agent they place.
3. **Tiers from a switched-off addon are hidden entirely** — consistent with
   `buildingEnabled()`, which already keeps Home Lab and Slop nodes out of
   the build bar when their track is off.
4. **The rarity floor is a secondary dropdown, enabled only when Focus is
   `all` or a track.** Picking a named tier already implies its rarity, so
   the control disables itself rather than offering a contradiction — this
   is where "rare online" and "rare on-prem" from the original brief live.

### What focus does to the Sales Agent's roll

`matchesFocus(offer, agent)` filters the offer list before the success roll:

```ts
const track = addonOfBuilding(offer.buildingId) ?? 'main';
switch (focus) {
  case 'all':           return meetsRarityFloor(offer);
  case `track:${track}`: return meetsRarityFloor(offer);
  default:              return focus === `tier:${offer.buildingId}`;
}
```

**A focused agent with no matching lead does nothing, and still bills its
`monthlyCost`.** That is the intended behaviour, not an oversight — a
Sales Agent pinned to Federal Program (weight 7, legendary) will sit idle
through long stretches of a run while charging $2,200/mo, and it should say
so on the node: a new status, `'unfocused'` → *"No matching leads"*, sitting
alongside the existing `awaiting` and `starved`. A specialist you're paying
to wait is a real cost, and it's the specific cost this dropdown lets the
player choose to take on.

### The combo this creates deliberately

A Marketing Agent focused on `tier:federal` boosts that listing's draw
weight; a Sales Agent focused on the same tier is standing by when it
lands. **The pair is the intended strategy** — one manufactures the
opportunity, the other closes it, and neither is much use alone at the top
of the ladder. That's a better answer to "how do I ever see a legendary
lead" than raising the pity multiplier, because the player builds it and
pays for it rather than waiting for it.

The mirror risk is worth stating plainly: focusing both agents on one
expensive tier concentrates the entire budget risk on a chassis the player
may not be able to service. That's what the Reviewer Agent's spend veto
(§5) exists to insure against.

## 2. Sales Agent

Two tiers, each a distinct building:

| Node | Cost | Monthly | Catalyst held | Roll | Note |
|---|---:|---:|---|---:|---|
| Sales Agent (Junior) | $3,000 | $600 | `agent_run` ×1 | 6%/min per matching offer | Runs on whatever the Harness is currently outputting. Closes deals it doesn't understand. |
| Sales Agent (Senior) | $14,000 | $2,200 | `agent_workflow` ×1 | 16%/min per matching offer | Needs a Multi-Agent Graph actually running upstream — it is only as good as the planner behind it. |

Each tick, for every enabled Sales Agent: iterate open offers passing
`matchesFocus` (§1a), roll its success chance once per offer, and on the
first hit call `signOffer(state, offer.id, x, y)` at a free spot near the
agent node (reuses the exact function the "Sign" button calls, so nothing
about placement, unlock checks, or affordability is reimplemented). If
`state.credits` can't cover the chassis cost, `signOffer` already fails
cleanly — the agent just tries again next tick, no special-casing needed.

**This is the addon's whole point in miniature: nothing stops a Sales Agent
from signing something you can't afford to service.** A player who leaves
Junior agents focused on `all` overnight will wake up to three chassis they
have no chain built for, all burning `monthlyCost`, none producing a cent —
which is the honest shape of a sales team that closes deals engineering
can't ship.

## 3. Marketing Agent

| Node | Cost | Monthly | Catalyst held | Effect |
|---|---:|---:|---|---|
| Marketing Agent (Junior) | $2,200 | $450 | `agent_run` ×1 | +2.5% draw weight on matching listings |
| Marketing Agent (Senior) | $9,000 | $1,600 | `agent_workflow` ×1 | +6% draw weight on matching listings |

Per the brief: **+2.5% per agent, not per tier level** — a Senior agent's
higher number reflects it doing the work of several Juniors, not a
different formula. Implementation: before each tick's `spawnOffer` roll,
build a multiplier map from every enabled, non-broken Marketing Agent:

```ts
const boost: Record<string, number> = {}; // buildingId -> multiplier
for (const agent of marketingAgents) {
  for (const l of MARKET_LISTINGS.filter((l) => matchesFocus(l, agent))) {
    boost[l.buildingId] = (boost[l.buildingId] ?? 1) + agent.strength; // 0.025 or 0.06
  }
}
```

`effectiveWeight()` multiplies by `boost[l.buildingId] ?? 1` on top of the
existing pity multiplier. Marketing uses the **same Focus dropdown** as
Sales (§1a), so five Junior agents focused on `track:homelab` raise the
whole SME pipeline's draw weight by 12.5% while leaving everything else
exactly as rare as it was — and one focused on `tier:federal` puts all
2.5% on the single listing the player is actually hunting.

**No effect on `leadRate` itself** (offers-per-minute stays a function of
unlocked listing count, per `steadyLeadRate`) — Marketing changes *what*
rings, not *how often* the phone rings. That keeps the two knobs distinct:
Marketing skews the mix, more Marketing agents plus a wide board is what
actually raises absolute volume.

## 4. Coding Agent

The slow one, and the one that automates the game's actual verb — dragging
nodes onto the canvas and wiring belts.

| Node | Cost | Monthly | Catalyst held | Build time | Note |
|---|---:|---:|---|---:|---|
| Coding Agent (Junior) | $6,000 | $900 | `agent_run` ×1 | 90s per chain | One contract in flight at a time. Builds the cheapest working chain, not the best one. |
| Coding Agent (Senior) | $28,000 | $3,400 | `agent_workflow` ×1 | 45s per chain, 2 in flight | Reuses whatever compatible nodes already exist on the canvas before placing new ones. |

When idle, a Coding Agent scans for a signed contract chassis with
`recipeId: null` or missing an upstream producer for its inputs, matching
its `target`. On finding one, it locks that machine's id into `project` and
spends `secondsRemaining` counting down (scaled by the agent's `clock`, like
any other timer in the engine). On completion, it walks a precomputed
shopping list — one `placeMachine` call per node the chain needs, laid out
in a line toward the contract — paying full price for each exactly as the
player would, then wires the links and assigns the contract's recipe.

If credits run out mid-build, the project **pauses** (not cancels) and
resumes when cash allows — mirroring how a starved node in the main game
sits and waits rather than being destroyed. A half-built chain sitting
paused, in full view, is the tell that this addon needs supervision, not a
silent failure.

Junior agents deliberately build the *cheapest* legal chain (lowest total
node cost satisfying the recipe's inputs) rather than the best margin —
that's the gap a Senior agent (or a player's own manual rewiring) closes,
and it's an honest model of what junior engineering output actually looks
like against a well-scoped ticket.

## 5. Suggested additional content

Three agents were specified; a full addon wants a few more roles and one
genuine risk mechanic to make "leave it unsupervised" a real decision
instead of a free lunch.

### Support Agent — closes a real open question

`docs/CONTENT-SPEC.md` §12 has stood open since the base game shipped:
*"Contracts don't churn. A contract that expires and must be re-won would
stop the late game from being pure accumulation."* This addon is the
natural place to finally add it — churn is exactly an "unsupervised thing
gets worse without agentic attention" story:

- New per-tick roll on every signed contract machine: `p = churnBaseRate ×
  (1 - engagementScore)`, where `engagementScore` starts at 0 and rises
  toward 1 the longer the contract has run cleanly (no strikes, no
  starvation) — so a healthy, long-served customer is nearly sticky and a
  neglected one genuinely isn't.
- On a churn roll, the contract machine is removed exactly like a lost slop
  contract (§C11 of the base addons spec) — no refund, the board doesn't
  get the slot back for a while.
- **Support Agent** (one tier, $8,000/$1,400mo, holds `agent_run`): takes
  the same Focus dropdown (§1a), and for every signed contract matching it
  adds a flat `-0.4` to `churnBaseRate`'s effective roll while enabled —
  so "who do we actually look after" is the same decision, on the same
  control, as "who do we chase." It is the only node in the addon whose job is to
  *prevent* a bad outcome rather than *cause* a good one, which is a
  different shape of automation worth the player noticing.

### QA / Reviewer Agent — the counter-play to Drift

- **Reviewer Agent** ($10,000/$1,800mo, holds `agent_workflow`): contributes
  `agentDrift: -8` while enabled (same summation idiom as `dataRisk` and
  `slopRisk`). Its actual gameplay effect: it inspects a Sales Agent's
  pending sign before it fires and vetoes it if the chassis cost would drop
  `state.credits` below a safety floor (`0`, or a configurable buffer) —
  turning "the Sales Agent bankrupted me overnight" from a certainty into
  something a Reviewer node specifically insures against.
- This is the addon's version of the eval gate / Legal Desk / Observability
  pattern the base game and other addons already lean on: **oversight is
  its own line item**, and skipping it is a choice with a name attached.

### Agent Ops Console — the hub, and the headcount cap

- One-of, $5,000, $300/mo, `maxCount: 1`. Required before any other
  `'agent'`-kind building can be placed (`placeMachine` gains one more
  precondition check, mirroring how `requiresOnSite` already gates
  contracts on hardware). Its own description is the tutorial: *"Someone
  has to own the agents. This is that someone."*
- Raises the addon's headcount cap: `maxAgents = 2 + floor(completedMilestones.length / 2)`,
  read wherever `placeMachine` currently checks `b.maxCount` for a
  `kind: 'agent'` building — the total count across all agent buildings,
  not per-building. This is the same "cap grows with progress" shape as the
  bank loan draw cap in the Venture Capital addon and the price index's
  milestone term — the codebase already has a house style for "this number
  should grow because you earned it," and this reuses it rather than
  inventing a fourth version.

### Agent Drift — the risk stat

`state.agentDrift`, computed in the same survey pass as `exposure`,
`slop`, and `priceIndex`: sum `agentDriftRisk` across every enabled,
non-broken `'agent'`-kind machine (Sales/Marketing/Coding contribute
positive; Reviewer contributes negative), floored at 0.

| Drift | Effect |
|---:|---|
| 0–20 | Nominal. Agents behave as specced above. |
| 20–50 | Sales Agent ignores its **Focus** one roll in five — it signs off-brief, which is both the most legible symptom of drift and the one the player set a dropdown specifically to prevent |
| 50–80 | Coding Agent's shopping list has a chance per node to place the *wrong* item, wasting that node's cost outright |
| 80+ | A "Runaway Spend" incident can fire: one active agent project instantly completes at 3× its listed cost, no output check |

This is deliberately the same shape as Exposure and Slop — a single number,
summed from declared fields, that a player can read as "how much of this
addon is running without me." A run with one Reviewer per five other agents
never sees Drift above 20; a run with none does, and the incident table is
where that finally costs something instead of being decoration.

## 6. UI additions

- New build-bar section, **Agent Ops**, gated the same way Home Lab and Slop
  tabs already are.
- Each targeting agent's inspector gets the **Focus** dropdown from §1a
  (All / a track / a named contract tier, grouped, with rarity badges and
  greyed locked rows) plus the secondary rarity floor, surfaced as ordinary
  Inspector fields rather than new dialog chrome. One component, shared by
  Sales, Marketing and Support.
- Both dropdowns need i18n keys in `en` **and** `vi` — tier names come from
  the building data, but the group headers, "Any … contract", "not unlocked
  yet" and the no-matching-leads status are new strings, and
  `npm run check:i18n` will fail the build without them.
- The node itself should show its focus under the name (e.g. `→ Federal
  Program`), the way a vendor-scoped capacity node already shows its
  provider — an agent whose whole configuration is one dropdown should not
  require opening the Inspector to read it.
- A `Drift` readout in the top bar, same shape as Exposure and Slop — this
  addon's top-bar cost is one number, not a new panel.
- The Coding Agent's `project` state (which contract, how long left, paused
  or running) is worth a small progress ring on the node itself, the same
  affordance Home Lab's repair timer already uses.

## 7. Engine changes, in build order

1. `BuildingKind` gains `'agent'`; `BuildingTier` gains `'Agent Ops'`;
   `BuildBar.ORDER` updated.
2. `GameState.agentDrift: number`, summed in the existing exposure/slop/
   price-index survey pass in `simulate.ts`.
3. `Machine` gains `focus`, `rarityFloor`, `project` (all optional/agent-only);
   `MachineStatus` gains `'unfocused'`.
4. `FocusTarget` + `matchesFocus()` + the shared Focus dropdown (§1a),
   including its i18n keys. Built before any agent reads it, since all three
   targeting roles depend on it.
5. Agent Ops Console + headcount cap check in `placeMachine`.
6. Sales Agent pass: iterate enabled Sales Agents each tick, roll per
   focus-matching offer, call the existing `signOffer`.
7. Marketing Agent pass: build the weight-boost map before `spawnOffer`
   rolls in `tickMarket`; thread it into `effectiveWeight()`.
8. Coding Agent pass: project pickup, countdown, shopping-list execution via
   the existing `placeMachine` + link-creation helpers, pause-on-broke.
9. Support Agent + churn roll (closes CONTENT-SPEC §12).
10. Reviewer Agent + the sign-veto hook into step 6.
11. Drift thresholds wired into steps 6–8; Runaway Spend incident.
11. `validateContent()`: no `'agent'`-kind recipe may declare `payout`; every
    `agentDriftRisk` field sums correctly; Agent Ops Console is the sole
    `requiresOnSite`-style gate for every other agent building.
12. `STATE_VERSION` bump; addon entry in `ADDONS` (`kind: 'feature'`,
    `defaultOn: false`, same shape as Venture Capital).
13. `npm run card` — regenerate the reference card.

## 8. Balance risks

**The free-labor hole, this addon's version of it.** If Sales + Marketing +
Coding agents compound faster than their combined `monthlyCost`, "build
five agents and alt-tab" becomes strictly dominant over playing the game.
The brakes are the headcount cap, the Coding Agent's one-project-at-a-time
limit on the cheap tier, and Drift's escalating failure modes — this wants
the same headless-run treatment the Home Lab free-inference hole got before
it shipped.

**Sales Agent bankruptcy is a feature until it's a softlock.** An
unsupervised Sales Agent draining `credits` to zero mid-game, with every
other node then `broke`, is the intended lesson — but if it can happen
before the player has any way to place a Reviewer Agent (which needs
`agent_workflow`, a later unlock than `agent_run`), the early tier needs a
hard per-tick spend cap or it's just a trap with no lever, the same failure
mode the VC plan flagged for loan interest.

**A single-tier focus can be strictly better than it looks, or strictly
worse.** Pinning Sales + Marketing to one legendary listing turns a rare
lead into a semi-reliable one, and at the top of the ladder (API Platform,
$11M payout) that may be worth almost any amount of idle salary — which
would make "focus everything on the biggest number" the only sensible
configuration and the dropdown a formality. The counterweight is that the
chassis cost at that tier is enormous and an idle specialist bills the
whole time; whether those two actually balance is the single number in this
addon most worth a headless run.

**Marketing's weight boost interacts with pity.** `effectiveWeight()` already
multiplies by up to 4× for a listing that hasn't shown in a while; stacking
several Senior Marketing agents on one rare listing could push its
effective draw chance well past what `boardSlots()` and `maxPerListing` were
tuned against. Needs a combined-multiplier cap, probably around the same
4× ceiling pity already uses, so the two systems don't multiply into
something neither was calibrated for.

**Coding Agent chain quality vs. the main game's actual teaching tool.**
Manually wiring a chain — choosing the cheap cascade over the frontier
model, deciding where the eval gate goes — is arguably the core lesson of
the whole game. An addon that fully automates it needs to stay clearly
worse than a competent player at both speed *and* margin, or it quietly
tells the player their own skill doesn't matter. The "cheapest legal chain,
not best margin" rule for the Junior tier is the intended guardrail; it
wants a headless comparison against a hand-optimized chain before the
Senior tier's number gets finalized.

**Four risk stats is a lot of top bar.** Exposure, Slop, price index, and
now Drift, on top of compute/burn/revenue/COGS/cash. This was flagged as a
risk in the base addons spec already (§D) and this addon makes it worse,
not better — the top bar redesign that spec deferred is no longer
optional once this ships.

## 9. Open questions

1. **Should Drift decay on its own, or only via a Reviewer Agent?** Exposure
   and Slop are both pure sums with no decay term. A pure sum keeps Drift
   legible but means the *only* way down is buying oversight outright —
   which may be exactly the point (the same way Legal Desk is the only
   lever on the IP fine), or may be too punishing for a player who built
   agents early and only later can afford a Reviewer.
2. **Should a focused Sales Agent fall back when its tier is dry?** As
   specced it waits, bills, and shows *"No matching leads"* — the honest
   model of a specialist. The alternative (fall back to anything in the
   same track after N idle minutes) is friendlier and quietly deletes the
   decision the dropdown exists to make. Leaning towards no fallback, with
   the idle status made loud enough that the player fixes it themselves.
3. **Does the Coding Agent need to be smarter about existing nodes?** As
   specced it always builds fresh rather than routing through spare
   capacity the player already placed. Reuse-awareness (specced as a Senior
   perk) is more interesting and considerably harder to get right — a
   Junior agent that ignores a perfectly good idle model two nodes away
   because it doesn't "see" it is either a joke or a bug, and playtesting
   will decide which it reads as.
4. **Should agents be visible on the canvas at all, or a separate panel?**
   Every other building lives on the canvas and belts connect it to
   everything else. Agents don't consume or produce belted items — they act
   on game *state* (the board, other machines). Placing them on the canvas
   anyway (as specced) keeps one placement mental model for the whole game;
   a dedicated "Agent Ops" side panel would read more like a management
   screen and less like a factory, which may undersell how physical the
   rest of the game is.
5. **Is three roles (Sales/Marketing/Coding) plus two (Support/Reviewer)
   too many buildings for what should read as a lean, focused addon?** Home
   Lab shipped 22 buildings and AI Slop shipped 12; this plan's core-plus-
   suggested content lands at 9 (2+2+2 tiers, plus Support, Reviewer, and
   the Console). That's on the small side by this repo's own precedent,
   which argues for keeping all of §5 rather than cutting it — but it's
   worth deciding deliberately rather than by default.

## 10. What changed during the build

Built in the order given in §7. Eight things the plan got wrong, found by
building it.

1. **Catalysts became consumption, and it is a better mechanic.** §1 specced
   agents *holding* an `agent_run` as a catalyst — a licence check. They now
   **consume** agent runs every work cycle, which means a Sales Agent is
   spending the same units an Enterprise contract buys at $1,050 a delivery.
   The opportunity cost is the honest price of automation and it teaches far
   more than a held token would. The tier ladder survives intact: Junior roles
   eat `agent_run`, Senior roles eat `agent_workflow`.

2. **`Machine.project` was unnecessary — the craft cycle IS the timer.** The
   plan specced a bespoke `{ contractMachineId, secondsRemaining, plan[] }`
   runtime field for the Coding Agent. The engine already runs a per-node
   timer with a progress bar on the node, so `seconds: 90` on the recipe does
   the whole job: the build progress the player watches is the same bar every
   other node uses. One less runtime field and one less thing to migrate.

3. **`unfocused` needed a sibling.** With only the one status, an agent with no
   Console read as merely idle and nothing said why. `unmanaged` ("No Ops
   Console") is now its own status.

4. **Churn needed an onboarding grace, and the test suite is what found it.**
   As specced, a contract could churn before the player had wired it — a tax
   on signing rather than a lesson about neglect. A headless run deleted a
   contract out from under the Coding Agent mid-test, which is how it
   surfaced. `BALANCE.churnGraceSeconds: 120` (two billing months) fixes it,
   and `Machine.signedAt` is what it reads.

5. **The chain planner has to be addon-aware.** The first version picked the
   globally cheapest producer of an item, which could be a Home Lab node with
   Home Lab switched off — `placeMachine` refused it and the agent abandoned
   the whole chain over one node. `cheapestProducer` now filters candidates
   through `buildingEnabled`.

6. **The Focus dropdown surfaced a pre-existing leak.** Post To Feed is a Slop
   contract unlocked on the MAIN spine (the Slop track's first milestone
   requires work only that contract buys, so gating it behind its own track
   would be circular). `addonOfBuilding` therefore read it as a main-game
   customer: it filed under "Online" in the dropdown and — the real bug, older
   than this addon — kept ringing on the board for a player who had switched
   Slop off. Fixed with an explicit `Building.addon` claim as a third
   classification signal, plus an addon filter in `unlockedListings`.

7. **`factory.ts` and `agents.ts` wanted to import each other.** `placeMachine`
   needs the headcount rule; the agent behaviour needs `placeMachine`,
   `addLink` and `signOffer`. The four placement predicates live in
   `agentRules.ts` now, which neither file has to import in a circle.

8. **The statistical checks needed a seeded RNG.** Churn is a ~20% event over
   40 runs and the sample swung far enough to fail a correct implementation
   about one run in three. `tools/agent-test.mjs` seeds `Math.random` for
   those blocks, so a red run means a regression rather than a bad afternoon.

### Verified

| | Result |
|---|---|
| `tsc --noEmit`, `npm run build` | clean |
| `npm run check:i18n` | 113/113 building names and descriptions, 0 missing figures |
| `npm run check:agents` | 35/35, stable across six consecutive runs |
| `npm run progression` | 2/24 milestones in 9 sim-min — unchanged from before the addon, with it off by default |
| Sales Agent, live | signed Managed On-Prem for $25k on its own, toast and all |
| Coding Agent, live | wired a 4-node chain into an unbuilt contract and assigned its recipe |
| Focus dropdown, live | grouped by track with rarity badges; rarity floor disables against a named tier |
| Browser console | clean on a fresh load (the addon's UI, the 3D view, the settings toggle, the Agent Ops tab) |

Not verified: any of the balance numbers against a real playthrough. The close
rates, the drift thresholds and the churn rate are all first guesses in
`BALANCE`, and §8's risks — agents compounding faster than their subscriptions,
and a single-tier focus on the top of the ladder being strictly dominant — are
exactly the things a headless long-run would need to settle.
