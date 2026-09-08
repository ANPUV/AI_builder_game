# ESG addon — plan

**Status:** built and shipped, 8 Sep 2026. Written and implemented the same day.

What changed on the way from plan to code is recorded in `## Built` at the foot of
this document — the plan is left as written so the two can be compared.

Grounded in what's already shipped. The capacity ladder already carries the physical numbers
this addon needs, as flavour text nothing reads: **Colo Rack Bay** is "~120kW each, liquid
cooling mandatory — air alone cannot cool it" and **Own Datacenter** is "10MW… Servers are 60%
of it; power only ~7%" ([src/data/buildings.ts:217-218](../src/data/buildings.ts)). The
`gpu_rack` item is priced at "~120kW, about $3M. Roughly $25,000 of capex per kW of rack load"
([src/data/items.ts:83](../src/data/items.ts)). **Data Curation** already says "dedupe and
filter or you train on slop" ([src/data/buildings.ts:224](../src/data/buildings.ts)). Every
one of those sentences is a mechanic that was written down and never wired up.

Two of the seven dependencies are already *partly* modelled and must be connected to rather
than duplicated. Metals and chips is the Silicon tier plus the hardware price index
([src/data/balance.ts:66-85](../src/data/balance.ts)) — the game already teaches that your own
buildout prices your own hardware. Quality data is the Slop Index, which is model collapse
under another name. This addon extends both; it does not restate them.

## The pitch, in one line

Every meter in the game so far measures something that lands on **your** invoice. This one
measures what lands on **somebody else's** — until a regulator, a neighbour or a procurement
officer sends it back to you.

## Decisions taken

| Decision | Choice |
| --- | --- |
| Scope | New **feature** addon (`kind: 'feature'`, `defaultOn: false`), same shape as Agentic Ops and Venture Capital. Not a track |
| Build-bar ownership | One new `BuildingTier`, `'Sustainability'`, registered in `TIER_TRACK` ([src/data/addons.ts:95](../src/data/addons.ts)). That is the whole ownership mechanism — no `Track` change, no `FocusTarget` change |
| New `BuildingKind` | **None.** Mitigation nodes reuse the Compliance-program shape: `kind: 'factory'` whose entire job is a negative risk number, exactly like `observability` at `dataRisk: -5` |
| Meter | One stat, **Footprint** 0–100, high is bad — consistent with Exposure / Slop / Drift. Composed of three sub-scores (E, S, G), broken out in the tooltip and the report, never as three top-bar stats |
| Power | A real recurring charge, on the rent idiom ([src/engine/simulate.ts:324](../src/engine/simulate.ts)), at a `gridIndex` that rises with the player's own provisioned load — the `priceIndex` construction, reused |
| Water | Not a declared number: a **consequence of the cooling mode** the player picks per capacity node. See §1a |
| Land | Not a bill. A **permit freeze** that refuses new capacity placements, on the `breachFreeze` shape |
| Contract gate | `Recipe.maxFootprint`, semantically identical to the shipped `maxExposure` ([src/data/recipes.ts:45](../src/data/recipes.ts)) — same `onHold` branch at [simulate.ts:409](../src/engine/simulate.ts), no new engine shape |
| The spine | A published **disclosure**, which the gate reads instead of the real number — so understating it is available, profitable, and audited |
| Incidents | Every one copies the breach roll ([simulate.ts:328-343](../src/engine/simulate.ts)): quadratic in the meter, `dt`-scaled, cumulative-loss counter, `TickEvents` bucket for the toast |
| Save shape | New `GameState.esg`, new `Machine.cooling`, two new `MachineStatus` members → `STATE_VERSION` 6 → 7, old saves discarded, per house convention |

## 0. The lesson

The game teaches four things now: rate limits are the real constraint, compliance is the sales
motion, capital is not free, and automation is overhead. This addon teaches the fifth, and it
is the one the supplied infographic is entirely about:

**The AI you are building runs on water, power, land, minerals and people, and none of those
appear on the bill you have been optimising.** They are externalities — right up to the moment
they are priced, rationed, litigated or asked about in a procurement questionnaire, at which
point they arrive all at once.

Three failure modes, all real:

- **The costs arrive as a step, not a slope.** A player who scales through Colo Rack Bay into
  Own Datacenter without a single sustainability node has been running a rising liability the
  whole time and paying nothing for it. When the permit freeze lands, the expansion they had
  already budgeted simply cannot be built, and no amount of cash fixes it that tick.
- **The cheap answer to a footprint problem is a document, not a change.** Publishing a
  flattering number costs a fraction of what actually cutting the number costs, and it works —
  the contracts open, the revenue lands. That is not a cynical mechanic invented for this
  addon; it is the observed behaviour of the sector the addon is about.
- **Mitigation trades one externality for another.** Evaporative cooling is the cheapest way
  to cut your power draw and it is also how a data centre ends up drinking a town's water.
  There is no button marked "sustainable"; there is a cooling dropdown with four wrong answers
  and a budget.

## 1. Data model

```ts
// buildings.ts — all optional, so no existing node changes and no per-node migration
/** Continuous electrical draw, kW. The one physical number; carbon and the power bill both derive from it. */
powerKw?: number;
/** 0-10 site pressure. Only nodes that occupy real estate carry one. Never negative — land does not come back. */
landUse?: number;
/** 0-10 into the Social score: invisible human labour this node leans on. NEGATIVE on the nodes that pay for it properly. */
laborLoad?: number;
/** 0-10 into the Governance score: undisclosed provenance, restricted-origin supply. NEGATIVE on the ledger and audit nodes. */
provenanceRisk?: number;
/** Fraction of this node's power covered by a contracted clean supply. Set by a PPA, not by the chassis. */
cleanFraction?: number;
```

```ts
// recipes.ts — the contract gate
/** Contract refuses to run above this DISCLOSED Footprint. Mirrors maxExposure exactly. */
maxFootprint?: number;
/** Contract will not run at all without a currently-valid published disclosure. */
requiresDisclosure?: boolean;
/** Litres of water per craft, for a recipe whose water use is not a function of cooling (the wafer fab). */
waterLitres?: number;
```

```ts
// types.ts, on Machine — only meaningful on a node with powerKw
cooling?: CoolingMode;   // see §1a. Defaults to 'air' when unset.
```

```ts
// types.ts, on GameState — present even when the addon is off, like `vc`.
// Cheap, and it avoids a nullable check in every consumer.
export interface EsgState {
  /** The three pillars, each 0-100, recomputed every tick from running nodes. */
  environmental: number;
  social: number;
  governance: number;
  /** The headline: a weighted blend of the three. 0-100, high is bad. */
  footprint: number;

  /** Live physical totals, for the report. */
  powerKw: number;
  waterLitresPerMonth: number;
  landUse: number;

  /** Rises with progress and with the player's own provisioned load. 1.0 -> gridIndexMax. */
  gridIndex: number;

  /** What the last published disclosure claims, and when. null = nothing published. */
  disclosure: Disclosure | null;

  /** Seconds remaining on a permit freeze: no new Capacity / Silicon / Sustainability placements. */
  permitFreeze: number;
  /** Seconds remaining on a water restriction: capacity supply curtailed. */
  waterFreeze: number;

  /** Cumulative $, for the report and the tooltips. */
  powerPaid: number;
  waterPaid: number;
  fines: number;
  heatRevenue: number;
}

export interface Disclosure {
  /** The number the player published. May be lower than the real Footprint. That is the mechanic. */
  claimed: number;
  /** True Footprint at the moment of publication, kept so the audit has something to compare against. */
  actual: number;
  /** `state.elapsed` when published. Disclosures go stale; see §5. */
  publishedAt: number;
  /** An audited disclosure survives the roll for a while; a self-certified one does not. */
  audited: boolean;
}
```

```ts
// types.ts — two new MachineStatus members. The union is closed and `statusLabel`
// (simulate.ts:731) is a Record over it, so both must be added in the same commit
// or the build fails.
| 'curtailed'   // a capacity node throttled by a water restriction
| 'disclosed';  // a contract refusing: no valid disclosure, or Footprint over its ceiling
```

New `ItemForm` member: `'energy'`. New items in §6.

## 1a. Cooling — the one new control

The single decision that makes the Environmental pillar a strategy rather than a tax. A
dropdown on any node with `powerKw`, chosen after placement — the same "pick it once it is on
the canvas" pattern as `vendorScoped` capacity nodes.

```ts
export type CoolingMode = 'air' | 'evaporative' | 'closed_loop' | 'immersion';
```

```
Cooling
┌──────────────────────────────────────────────────────────┐
│ Air                        PUE 1.55   ·  0 L/kWh         │
│ Evaporative                PUE 1.15   ·  1.8 L/kWh       │
│ Closed loop        +$$$    PUE 1.20   ·  0.1 L/kWh       │
│ Immersion          +$$$$   PUE 1.03   ·  0 L/kWh    🔒   │
└──────────────────────────────────────────────────────────┘
Evaporative — cheapest to run, and the reason a data centre shows up
in a drought story. 1.8 litres per kWh is roughly the industry mean.
```

| Mode | Power multiplier (PUE) | Water | Capex | Unlock |
| --- | ---: | ---: | ---: | --- |
| Air | ×1.55 | none | — | always |
| Evaporative | ×1.15 | ~1.8 L/kWh | — | always |
| Closed loop | ×1.20 | ~0.1 L/kWh | retrofit node | `Closed-Loop Retrofit` placed |
| Immersion | ×1.03 | none | high | Act III |

The shape of the trade is the point: **air is expensive and drinks nothing, evaporative is
cheap and drinks, and buying your way out of both costs capital.** A player optimising the
power bill alone will pick evaporative every time and walk straight into the water restriction.

Implementation: a new `src/ui/CoolingPicker.tsx` modelled on `FocusPicker.tsx` — own file, doc
comment stating the design rule, `useLang` + `useContent`, a `<div className="field">` holding
a `<select>` and a `hintline`, locked options rendered `disabled` rather than hidden, plus an
exported `useCoolingLabel()` so the canvas node badge and the inspector agree without
duplicating logic. `setCooling(state, id, mode)` in `factory.ts` returns an `Outcome`, guarded
by a `if (!building(m.buildingId)?.powerKw) return fail(...)` check, exactly like `setFocus`
([src/engine/factory.ts:325](../src/engine/factory.ts)).

## 2. Environmental — power, water, land

### 2.1 Power

Summed in phase 1 of `step()` alongside exposure / slop / drift
([simulate.ts:259-263](../src/engine/simulate.ts)):

```ts
powerKw += (b.powerKw ?? 0) * PUE[m.cooling ?? 'air'] * m.clock;
```

Charged in phase 2, one line, on the rent idiom at [simulate.ts:324](../src/engine/simulate.ts):

```ts
state.credits -= powerKw * gridPricePerKwh(state) * BALANCE.kwhPerSimSecond * dt;
```

`gridIndex` is built exactly like `priceIndex` ([simulate.ts:313-321](../src/engine/simulate.ts)):
a progress term plus the player's own provisioned load, both saturating, both clamped. It is
the same lesson in a second register — *your buildout is what makes your power expensive* —
and the tooltip can say so with a real figure: PJM's capacity auction cleared near $28.92/MW-day
for 2024/25 and about $269.92/MW-day for 2025/26, and data centre load is what everyone
involved blames.

The E score takes the log of power, not power itself. Own Datacenter is 10 MW against a Gaming
PC's half-kilowatt; a linear sum makes every other node round to zero. See §9.

### 2.2 Water

`waterLitresPerMonth = powerKw × hoursPerMonth × waterPerKwh[cooling]`, plus any recipe's
explicit `waterLitres` — the wafer fab uses ultrapure water regardless of how the building is
cooled. Billed like power, at a much smaller rate, because in reality water is not priced to
hurt. What hurts is the restriction:

```
p = BALANCE.waterRestrictionRateAt100 * (esg.environmental / 100) ** 2   per minute
```

On a hit, `esg.waterFreeze = BALANCE.waterRestrictionSeconds`. While it runs, every capacity
node with `powerKw` reports `'curtailed'` and its `computeSupply` is multiplied by
`BALANCE.waterCurtailmentFactor`. This is deliberately the nastiest event in the addon: it does
not take money, it takes throughput, which starves the entire factory downstream. Real anchor:
Google reported roughly 6.1 billion gallons of water consumed across its data centres in 2023,
and a single large site can draw one to five million litres a day.

### 2.3 Land

`landUse` summed the same way. Past `BALANCE.landPermitThreshold`, a roll on the same quadratic
shape sets `esg.permitFreeze`, and `placeMachine` refuses any node in the Capacity, Silicon or
Sustainability tiers while it runs — a new guard next to the `buildingEnabled` check at
[factory.ts:132](../src/engine/factory.ts), because the standing rule in that file is that the
build bar is only a hint and the engine is the rule, so the quick-build keys cannot go around
it. `pasteClipboard` ([factory.ts:592](../src/engine/factory.ts)) needs the same guard.

Real anchor: over 7,000 data centres are built or in development worldwide; Dublin has been
under an effective connection moratorium, Amsterdam paused new permits, and Loudoun County —
which carries a large share of the world's internet traffic — has spent years rezoning around
them.

## 3. Social — the people the maze runs on

This is the pillar most easily made glib, and the plan should say so rather than paper over it.
The mechanic is deliberately narrow: **the game already has a quality system, and
under-resourcing the human layer degrades quality.** No new incident table.

`laborLoad` sits on the nodes that lean on invisible human work — Data Curation, the content
mill, the pSEO platform, the adult platform, Support Desk at volume — and is **negative** on
the two nodes that pay for it: the Annotation Co-op and the Trust & Safety Desk.

Two effects, both reusing shipped machinery:

1. **Quality.** `esg.social` is added into the quality-miss roll at
   [simulate.ts:502](../src/engine/simulate.ts) — the same strike ladder, the same
   `strikesBeforeLoss` cliff, the same reputation decay. A company running on unpaid annotation
   ships worse work and loses customers for it.
2. **Labour dispute.** On the breach shape: a hit stops one random high-`laborLoad` node for
   `BALANCE.disputeSeconds` and pushes a `TickEvents` entry. No cash penalty — the cost is the
   stoppage.

Real anchors for the node text: content moderators on an outsourced OpenAI contract in Nairobi
were reported at roughly $1.32–$2 an hour, and a Kenyan court ruled in 2025 that moderators
could bring their claims there. Both figures need the verification pass in §10.5 before they
ship in a `description`.

## 4. Governance — provenance and sourcing

### 4.1 Where the data came from

Three recipe variants on the existing `data_curation` chassis, replacing the single `curate`
recipe ([src/data/recipes.ts:203](../src/data/recipes.ts)):

| Recipe | Cost | `provenanceRisk` | Note |
| --- | ---: | ---: | --- |
| Crawl the Open Web | low | +6 | Common Crawl is free, and free is what a lawsuit gets priced against |
| Licensed Corpus | very high | 0 | $10M–250M annual lump sums, not a per-token price — already this node's own description |
| Synthetic Generation | mid | +3 | Cheap, scales, and it feeds the **existing Slop Index** |

The synthetic path adding `slopRisk` is the infographic's "quality data" arrow closing a loop
the game already built: training on generated output raises the Slop Index, which raises the
quality-miss rate, which is model collapse expressed in mechanics that already exist. Nothing
new is required for it. Epoch's estimate that the usable public text corpus runs out somewhere
between 2026 and 2032 is the note text.

### 4.2 Where the silicon came from

`provenanceRisk` on the Silicon and Home Lab source nodes, and one new rare event: an
**export-control shock**. On a hit it spikes `priceIndex` by `BALANCE.exportShockIndex` for
`BALANCE.exportShockSeconds`, reusing the `slopExposureSpike` decay pattern at
[simulate.ts:304](../src/engine/simulate.ts) verbatim with `priceIndex` in place of exposure.

The probability rises with `esg.governance` — which is to say, with how much of your supply
chain you cannot account for. Real anchors: China's 2023 gallium and germanium export controls
and the December 2024 ban on their export to the US; high-purity quartz for crucibles coming
overwhelmingly from one district in North Carolina, which a hurricane shut down in 2024. Both
sit inside the infographic's "kim loại, chips" arrow.

## 5. The disclosure, and lying on it

The spine of the addon, and the reason it is a strategy rather than a tax.

**Publishing.** A **Sustainability Officer** node must be placed first — the Console pattern
from Agentic Ops, for the same reason: somebody has to sign the document. With one placed, the
ESG Report dialog offers two actions:

| Action | Cost | Time | `audited` | What it claims |
| --- | ---: | ---: | :---: | --- |
| Commission an audit | high | an observation window, like SOC 2 | `true` | the real Footprint, and nothing else |
| Self-certify | low | instant | `false` | **any number the player types**, up to the real one |

**The gate.** `requiresDisclosure` and `maxFootprint` on the top of the contract ladder —
`c_mid`, `c_ent`, `c_ent_agents`, `c_reg`, `c_fed`, `c_api`
([src/data/recipes.ts:228-235](../src/data/recipes.ts)) — evaluated in the existing `onHold`
branch, reading `esg.disclosure?.claimed`, **not** `esg.footprint`. A contract held for this
reason reports `'disclosed'` rather than `'audited'`, so the inspector can say which of the two
gates is shut.

**The audit roll.** Per minute, on the shape every other incident uses:

```ts
const gap = Math.max(0, esg.footprint - d.claimed);
const p = BALANCE.esgAuditRateAt100 * (gap / 100) ** 2 * (d.audited ? BALANCE.auditedShield : 1);
```

Caught: a fine on the `legalFine` shape (a fraction of cash, floored), an Exposure spike reusing
`slopExposureSpike`, `esg.disclosure = null`, and **every gated contract stops in the same
tick**. That last clause is the teeth. The fine is survivable; losing the entire top of the
contract ladder until a fresh audit clears is not.

**Staleness is the trap.** A disclosure records the footprint *at publication*. An honest player
who publishes a true number at Footprint 30 and then builds a datacenter is running a gap of
exactly the same kind as a liar's, without ever having chosen to lie — and the roll does not
care about intent. The report dialog must therefore show the live gap prominently, because the
failure this models is drift, not fraud.

**Offsets.** The Carbon Credits Desk lowers `esg.environmental` for money. It is the cheapest
lever in the addon by a wide margin, and `BALANCE.offsetAuditDiscount` means credits count for
markedly less in the auditor's arithmetic than in the player's. Anchor: a 2023 investigation
into one major registry's rainforest credits concluded the large majority represented no real
emissions reduction.

## 6. New content

### Nodes — tier `'Sustainability'`

| Node | Cost | Monthly | Effect |
| --- | ---: | ---: | --- |
| Sustainability Officer | $12,000 | $2,400 | `maxCount: 1`. The hub. Required before any disclosure can be published, and before any other node in the tier |
| Renewable PPA | $0 | high | Sets `cleanFraction` across the estate. Cuts E, not the bill — a PPA is a price hedge, not a discount |
| Demand Response | $18,000 | low | Cuts the power *bill* at peak `gridIndex`, and nothing else. The honest one: it saves money and saves no carbon |
| Closed-Loop Retrofit | high | mid | Unlocks the `closed_loop` cooling option estate-wide |
| Heat Offtake | $9,000 | $600 | `kind: 'contract'`. Buys `waste_heat`. See below |
| Carbon Credits Desk | $4,000 | mid | Converts cash into a lower E score, at a rate the auditor discounts |
| Annotation Co-op | $22,000 | high | `laborLoad: -6` |
| Trust & Safety Desk | $15,000 | high | `laborLoad: -4`, `slopRisk: -3` |
| Provenance Ledger | $30,000 | mid | `provenanceRisk: -6`. C2PA manifests and data cards. Required for a *clean* audit |
| ESG Audit | $40,000 | $0 | `kind: 'factory'`. Consumes the ledger's output, emits `esg_report` |

**Heat Offtake** is the piece that makes this something other than a tax. Capacity nodes with
`powerKw` emit `waste_heat` as a second output; a district heating contract buys it. The payout
is small — it will never rival an Enterprise seat — but it converts the largest liability in the
addon into a revenue line, which is exactly the argument the real projects make. Anchors:
Stockholm Exergi's data-park heat recovery, and Meta's Odense site feeding local district heat.

### Items

| Item | Form | Note |
| --- | --- | --- |
| `waste_heat` | `'energy'` (new form) | Very nearly all of the electricity a rack draws leaves it as heat. The only question is whether anyone catches it |
| `esg_report` | `'paper'` | What a disclosure is made of. Sits beside `soc2` and `iso42001` |
| `carbon_credit` | `'paper'` | Priced anywhere from a few dollars a tonne to fifty, for reasons with little to do with tonnes |
| `annotated_data` | `'data'` | Output of the Annotation Co-op. Feeds Data Curation at better quality than crawling |

### Unlocks

No new milestone track. Hooks onto milestones that already exist: `ms_soc2` (the player has just
learned that paperwork is the sales motion — the natural place to introduce a second kind of
paperwork), then `ms_weights` and `ms_upstream` for the heavy end, since that is where the
Capacity and Silicon tiers get large enough for the meter to matter.

## 7. UI additions

**Top bar** — one new stat, between Slop and the hardware index, gated on
`featureEnabled('esg', state.addons)`. Copies the Drift block at
[src/ui/TopBar.tsx:240-289](../src/ui/TopBar.tsx) exactly: `<Tip>` wrapper, `tip-title`,
`tip-body`, `tip-kv` rows, colour ramp on the value. The tooltip carries the E/S/G split, the
live power bill in $/min, and the disclosure line — *Disclosed 24 · actual 61 · gap 37*, in
`var(--bad)` whenever a gap exists.

**ESG Report dialog** — a new `src/ui/EsgDialog.tsx` on the `BankDialog` pattern: local
`useState` in `GameShell`, a leaf icon button in `TopBar` gated on the addon, rendered at the
bottom of `App.tsx`. Standard modal chrome (`.modal-backdrop > .modal.wide > .modal-head >
.badge + h2`). Contents: the three pillar scores with their physical totals underneath (kW,
litres/month, land), the cumulative spend rows, the disclosure panel with both publish actions
and the claim input, the live gap, and an incident log.

Making the report a game object rather than a panel is the answer to the crowding problem the
Agentic Ops plan flagged: one number in the top bar, everything else behind a button the player
has a mechanical reason to open.

**Inspector** — the cooling picker on any node with `powerKw`, plus a physical line in the
summary card next to the existing `dataRisk` row at
[src/ui/Inspector.tsx:289](../src/ui/Inspector.tsx): draw in kW, water in L/mo, land. Contract
nodes gain a Footprint ceiling row beside the Exposure ceiling row already there.

**Build dialog** — `'Sustainability'` appended to `TABS`
([src/ui/BuildDialog.tsx:27](../src/ui/BuildDialog.tsx)). Tabs already auto-hide when nothing in
them is unlocked, so no further work.

**i18n** — an `esg.*` block plus `top.footprint` appended to the end of **both** dictionaries in
[src/i18n/index.ts](../src/i18n/index.ts), and `VI_BUILDINGS` / `VI_ITEMS` entries in
`content.vi.ts`. `npm run check:i18n` fails the build without them.

## 8. Engine changes, in build order

1. **`data/buildings.ts`** — the five optional fields, `'Sustainability'` on `BuildingTier`, the
   ten nodes. Backfill `powerKw` / `landUse` onto the existing Capacity, Silicon and Home Lab
   nodes from the numbers already sitting in their own descriptions.
2. **`data/items.ts`** — `'energy'` on `ItemForm`, the four new items.
3. **`data/recipes.ts`** — `maxFootprint`, `requiresDisclosure`, `waterLitres` on the interface;
   the three Data Curation variants; `waste_heat` as a second output on capacity recipes; the
   gate values on `c_mid` through `c_api`. Then **`data/market.ts`**: Heat Offtake is
   `kind: 'contract'`, and a contract node can only come from the board, so it needs a
   `MARKET_LISTINGS` entry with a weight, a ttl and its own `leads` lines — a municipal heat
   utility calling, not a customer for answers.
4. **`data/balance.ts`** — a `// --- ESG addon ---` block: `gridIndexMax` and its two weights,
   `gridPriceBasePerKwh`, `kwhPerSimSecond`, the PUE and L/kWh tables,
   `waterRestrictionRateAt100` / `waterRestrictionSeconds` / `waterCurtailmentFactor`,
   `landPermitThreshold` / `permitFreezeSeconds`, `disputeRatePerMin` / `disputeSeconds`,
   `esgAuditRateAt100` / `auditedShield` / `offsetAuditDiscount`, `exportShockIndex` /
   `exportShockSeconds`, the pillar weights, and the E-score log scale.
5. **`data/addons.ts`** — the `ADDONS` entry and `TIER_TRACK['Sustainability'] = 'esg'`.
6. **`engine/types.ts`** — `EsgState`, `Disclosure`, `CoolingMode`, `GameState.esg`,
   `Machine.cooling`, the two `MachineStatus` members.
7. **`engine/esg.ts`** (new) — `tickEsg(state, dt, events)`, `publishDisclosure`,
   `esgScores(state)`, `gridPricePerKwh(state)`, `coolingOf(m)`. The permit-freeze predicate
   `placeMachine` needs lives in a small `esgRules.ts` instead, for the reason `agentRules.ts`
   exists: `esg.ts` will want `factory.ts`, and `factory.ts` needs the predicate.
8. **`engine/simulate.ts`** — phase 1 sums; write `state.esg` next to line 306; the power and
   water charges in phase 2; the `onHold` clause for `maxFootprint` / `requiresDisclosure`; the
   `'curtailed'` cap on capacity supply; `tickEsg` as phase **4d**, after `tickAgents` and
   before `transfer`; two entries in `statusLabel`; the new `TickEvents` buckets, initialised in
   `advance`.
9. **`engine/factory.ts`** — the permit-freeze guard in `placeMachine` and `pasteClipboard`, the
   Sustainability Officer prerequisite, `setCooling`, and `STATE_VERSION` 6 → 7 with the
   changelog comment. `save.ts` needs nothing: the default-merge at
   [save.ts:48](../src/engine/save.ts) already lands a new addon key on its own default.
10. **`ui/`** — `TopBar.tsx`, `EsgDialog.tsx`, `CoolingPicker.tsx`, `Inspector.tsx`,
    `BuildDialog.tsx`, `App.tsx`, `useGame.ts` (a `publishDisclosure` action and the new toasts).
11. **`i18n/`** — both dictionaries, then `npm run check:i18n`.
12. **`data/index.ts`** — `validateContent()` rules: a Sustainability node needs
    `monthlyCost > 0`; exactly one `maxCount: 1` officer; no node carries `waterLitres` without
    `powerKw` unless it is the fab; `maxFootprint` only on recipes with a `payout`;
    `requiresDisclosure` implies `maxFootprint`.
13. **`tools/esg-test.mjs`** and an `npm run test:esg` script — the agentic test takes the repo
    root as `process.argv[2]` with no script, which is worth improving on here. Sections: gating,
    the power bill, cooling trade-offs, the water restriction, the permit freeze, the disclosure
    gate, the audit roll over 40 runs compared relatively, heat revenue, and the mandatory
    closing **"the base game is untouched"** block asserting zero footprint, zero charges and
    zero events with the addon off.
14. **`npm run card`** — regenerate `docs/reference-card.html`, and extend the README's
    "Verified behaviour" table.

## 9. Balance risks

**Five top-bar stats is past the limit.** The Agentic Ops plan already called the top-bar
redesign "no longer optional"; this addon is the one that forces it. The mitigation here is
architectural rather than cosmetic — one composite number up top, the entire breakdown behind
the report dialog — but the redesign should land alongside this, not after it.

**The addon can read as a pure tax.** Every mechanic above except Heat Offtake takes something
away. If the heat revenue and the contract gate are not worth more than the power bill and the
mitigation subscriptions, no player switches the addon on twice. This is the number that most
needs a headless run rather than a guess: place the standard Act II factory, run it twenty
minutes with the addon off and on, and compare net.

**Greenwashing may be the dominant strategy.** If `esgAuditRateAt100` is too low, self-certify
is simply correct and the addon teaches the opposite of what it means to. The target is that a
*small* understatement is a genuinely reasonable risk and a large one is ruinous — which the
quadratic gives for free, provided the constant is tuned against the actual revenue the gated
contracts unlock rather than chosen for feel.

**Scale.** Own Datacenter draws 10 MW; a Gaming PC draws about half a kilowatt. Any linear E
score makes every Home Lab node exactly zero and pins the meter the instant a datacenter lands.
A log or saturating curve is required, and the constant needs checking at three points on the
ladder: an Act I factory, a Colo Rack Bay build, and a full datacenter.

**The Social pillar is the easiest thing here to get wrong.** Modelling annotation labour as a
number that trades money against quality is defensible; letting the node text be flippant about
it is not. Every string in §3 wants a second read, and the two mitigating nodes should be
genuinely good buys rather than a token gesture priced out of reach.

**A recipe-level `waterLitres` may be redundant.** It exists for the wafer fab. If nothing else
ends up using it, delete it and put the water on the chassis.

## 10. Open questions

1. **The Internet arrow.** The infographic's seventh dependency — traffic doubling every five
   years — has an obvious game expression: a per-link egress charge, since links already have a
   rate and egress is the classic cloud bill nobody forecasts. It is left out of this plan
   because it touches the transfer phase ([simulate.ts:615](../src/engine/simulate.ts)), which
   nothing else in the addon does, and because a charge on every link is felt everywhere at
   once. Leaning toward: ship without it, add it as a Phase 2 item once the meter is tuned.
2. **Should Footprint be visible before the player owns a single sustainability node?** Exposure
   is always visible; Slop and Drift appear only once non-zero. Footprint is non-zero from the
   first Gaming PC, so the Slop rule would show it immediately anyway. Leaning toward: show it
   from the start — the point of the addon is that the number was always running.
3. **Should carbon credits lower the *disclosed* number below the real one without counting as
   understatement?** That is precisely the real accounting argument, and it may be one subtlety
   too many for a dropdown. Leaning toward: credits lower the real E score at a discount, and
   the disclosure only ever reports the post-credit number. One lie mechanic is enough.
4. **`gridIndex` and `priceIndex` are two very similar numbers.** They could share a
   construction, or be one index with two prices hanging off it. Leaning toward: keep them
   separate — hardware and electricity move for related but distinct reasons, and one of them is
   already load-bearing for the Home Lab track.
5. **Heat Offtake lands in the Agentic Ops focus dropdown under the wrong heading.** A new
   contract listing is picked up automatically by `FocusPicker` via the `tier:${string}` arm of
   `FocusTarget`, so no type changes — but grouping comes from `trackOf()`
   ([src/ui/FocusPicker.tsx:36-37](../src/ui/FocusPicker.tsx)), which falls back to `'main'`
   because `addonOfBuilding` only ever returns a *track*, never a feature addon. A Sales Agent
   would therefore offer "Heat Offtake" under Online. Options: teach `addonOfBuilding` about
   feature addons (it is exported and used elsewhere, so this is not free), add a fourth
   `optgroup` keyed off the tier, or accept it. Leaning toward: accept it for the first cut and
   note it, since it only appears with both addons enabled.
6. **Every real-world figure in this document needs a verification pass before it lands in a
   `description` or `note` string.** The house style is that each one is checkable, and several
   above are from memory: the PJM clearing prices, Google's 2023 water figure, the Nairobi
   moderator pay band, the export-control dates, and the Odense district-heating claim in
   particular.

---

## Built

Shipped 8 Sep 2026. `npm run check:esg` covers it: 64 assertions, including the
mandatory closing block proving the base game is untouched with the addon off.

### What the plan got right

The whole spine survived contact with the code. The addon is a `kind: 'feature'`
entry owning the `Sustainability` tier through `TIER_TRACK`; no `Track` change and
no `FocusTarget` change were needed. `maxFootprint` reuses the `maxExposure`
`onHold` branch verbatim, the power bill rides the rent line, and every incident is
the breach roll with a different meter in it.

### What changed

- **`Building.addon` already existed.** The plan proposed putting the heat contract
  in the `Sustainability` tier and teaching `BuildDialog` to skip contract-kind
  cards. Unnecessary: the repo had since grown an explicit per-building addon
  override for exactly this case (the entry-level Slop contract). District Heat
  Offtake is `tier: 'Contracts', addon: 'esg'`, and `unlockedListings` already
  filters the board by `buildingEnabled`.
- **Waste heat is a node, not a capacity output.** The plan had capacity nodes emit
  `waste_heat` as a second output. That would have let an unwired output buffer
  fill and block a capacity node — taking the factory's throughput with it. Instead
  a **Heat Recovery Loop** produces it, gated by `requiresOnSite: { tier: 'Capacity',
  count: 2 }`, which reuses the shipped site-audit mechanism and touches no capacity
  recipe at all.
- **`provenanceRisk` is on recipes as well as buildings.** The corpus choice is made
  per craft, so the chassis alone could not carry it. `surveyNode` sums both.
- **A third status, `'disputed'`.** The plan named two. A labour dispute needed its
  own, rather than borrowing `'audited'` and lying about why a node stopped.
- **`BuildDialog.TABS` is now exhaustiveness-checked.** Adding the tier without
  adding its tab was a silent failure — the nodes existed, validated and placed from
  the hotbar, but had no card anywhere. Caught by looking at the running game, not by
  the type checker, so there is now a `MissingTab` type that stops compiling if the
  two lists ever disagree again.

### Numbers the headless run settled

- **The power anchor holds.** Own Datacenter bills `10,000 kW x 730 h x $0.09` =
  about $657k against its $7.08M monthly cost — 9.3%, against the "power only ~7%"
  its own description has claimed since long before this addon existed.
- **Live, an air-cooled datacenter on a saturated grid pays 24.6%** of its monthly
  cost in electricity. Every multiple over the anchor is a choice: 55% for air
  cooling, and a grid index that is the player's own buildout coming back at them.
- **The E score had to be logarithmic.** A Gaming PC is 0.5 kW and Own Datacenter is
  10 MW. Linear, the home rig rounds to zero and one datacenter pins the meter
  forever. `logScore` puts a Gaming PC at ~1 and a datacenter at ~97 on the power
  term.
- **A lone datacenter scores 61, not 90.** It is an environmental problem and
  nothing else — it employs nobody and buys nothing untraceable — so the blend sits
  well below the pillar. A realistic Act III estate (datacenter + colo + curation +
  slop) clears the Enterprise ceiling of 55, which is the assertion that actually
  protects the gate.
- **The audit is calibrated.** Publishing 5 against a real 61 is caught in 24 runs
  out of 40 within 90 seconds; an honest filing is caught 0 times out of 40. The
  quadratic does the work — a small understatement is a genuine gamble and a large
  one is not.
- **Being caught shuts the door twice.** The Exposure spike closes the security gate
  in the same tick the voided disclosure closes the ESG one. Emergent, not designed,
  and worth keeping.

### Still open

Everything in §10 stands. The Internet arrow is still deferred, and §10.6 is the one
that matters before this goes in front of anybody: **the real-world figures in the
node descriptions are from memory and have not been fact-checked.** The PJM clearing
prices, Google's 2023 water figure, the Nairobi pay band, the export-control dates
and the Odense district-heating claim all need verifying against a source, per the
house rule that every number in a `description` is checkable.
