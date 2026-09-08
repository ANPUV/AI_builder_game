# Tech Era addon — plan

**Status:** planned, not built. 8 Sep 2026.

The first addon that is not a *branch* off the main spine but a **prologue in front of it**.
Home Lab and AI Slop run alongside Act I–III; Agentic Ops, ESG and Venture Capital layer new
mechanics onto whatever act you are in. This one moves where the run *starts*: switch it on
and a new game opens in 2005 with a LAMP box and a shared-hosting bill, and the game as it
exists today — the landing page, the free tier, `gpt_luna` — is what you unlock ten in-game
years later, at an event called **The Pivot**.

## Naming — settled

The addon is **Tech Era**, id `techEra`. The milestone timeline modal, renamed to "Tech era"
in `8ff0254`, goes back to **"Tech tree"** so the two do not collide — four strings in
`src/i18n/index.ts` (both languages) and one Coach title. **Done ahead of this plan;** the
routing fix and the responsive layout from that commit are untouched.

The build-bar tab is a separate name again, as it already is for ESG: the addon is
"ESG & Footprint" and its `BuildingTier` is `'Sustainability'`. Tech Era's tier is
**`'Old Stack'`** — a tab holding LAMP boxes and Hadoop clusters should say what is in it,
and every other tier name is content-descriptive (`Silicon`, `Retrieval`, `Compliance`).

## The pitch, in one line

You did not start in 2026. You started in 2005 with a hosting bill and a keyword list, and
the ten years of company you built is worth almost nothing on the day the models arrive —
except the concrete, the power contract and the racks, which are worth more than everything
else put together.

## Decisions taken

| Decision | Choice |
| --- | --- |
| Scope | New **track** addon (`kind: 'track'`, `defaultOn: false`), track id `'pre'`. Not a feature addon: it gates a content branch, and track membership derives from milestones automatically ([addons.ts:80](../src/data/addons.ts)) |
| `defaultOn: false` on a track | New. The two shipped tracks default ON because an old save must not silently lose Home Lab progress; a prologue has the opposite property — it must never appear in a run that did not start in it. `defaultOn` is already per-entry, so the shape allows it; the comment block at [addons.ts:19-23](../src/data/addons.ts) needs one sentence added |
| Where the era lives | **`GameState.era: 'pre' \| 'llm'`, run-scoped.** Set once at `createInitialState`, never re-read from the live toggle. Everything downstream reads `state.era` |
| Where it is chosen | **On a new-run setup screen**, not in Settings mid-run — see §3. Tech Era decides where the spine starts, which is a question that only has an answer at creation |
| Toggling mid-run | Refused. `setAddon('techEra', …)` on a run with `elapsed > 0` offers "start a new run" rather than silently rewriting the milestone order under a player in Act II |
| Gating the main spine | One rule in `checkMilestones`: skip `'main'` while `state.era === 'pre'`. One line, one comment |
| The handover | **The Pivot** — a choice dialog on the last prologue milestone, on the `VentureCapitalOffer` pattern. Three options, all with teeth. See §5 |
| Carried capital | Whatever the player *earned*. `milestoneRewardMultiplier` is 0 ([balance.ts:141](../src/data/balance.ts)) — milestones pay nothing — so there is no grant to design. The head start is ten years of contract revenue, minus what the Pivot choice costs |
| Carried hardware | Pre-era capacity nodes stay on the canvas and keep supplying. This is the whole point, and it needs a hard ceiling — see §6 |
| Retiring the old business | New `Building.withdrawnAtPivot?: boolean`, exact mirror of the shipped `withdrawnAtIndex` semantics ([buildings.ts:78-85](../src/data/buildings.ts)): leaves the build bar, already-placed nodes keep running |
| New `BuildingKind` | **None.** Every pre-era node is `source` / `factory` / `capacity` / `contract` |
| Save shape | `GameState.era` and `GameState.pivot`, both absent from old saves and both defaulting correctly through the existing `{...fresh, ...parsed}` spread ([save.ts:45](../src/engine/save.ts)). **No `STATE_VERSION` bump** — a run that predates the addon is by definition an LLM-era run, so `era: 'llm'` is the right value for every existing save. Departs from the ESG/VC precedent deliberately: nobody's factory needs to be discarded for this |

## 0. The lesson

The game teaches five things now: rate limits are the real constraint, compliance is the
sales motion, capital is not free, automation is overhead, and the externalities arrive all
at once. This addon teaches the sixth:

**A technology shift does not reward the company that was closest to it. It rewards whoever
happens to own the physical layer underneath it.**

Three failure modes, all real, all reachable in play:

- **The business you spent ten years building is the part that does not transfer.** Your SEO
  practice, your BI dashboards, your recommendation API — every one of those is a product
  built on an assumption the models delete. The player will have optimised that pipeline
  carefully, and at the Pivot it is worth its liquidation value.
- **The thing you bought almost by accident is the part that does.** A colo cage rented in
  2011 to run Hadoop is, in 2026, power, floor space, a landlord relationship and a rack of
  machines. The player who over-provisioned iron and under-invested in product arrives
  *ahead*. That inversion is the addon.
- **Old money does not buy you out of a new S-curve.** Act I milestones require units
  *delivered into contracts*, not dollars ([milestones.ts:33](../src/data/milestones.ts)) —
  cash cannot skip a single one. A rich player builds Act I's chain in one afternoon instead
  of over twenty minutes, and then hits exactly the same rate-limit wall as everyone else,
  holding a 2015 GPU cluster worth about 2% of what Act II wants.

## 1. Data model

Four additive fields, one new `Track` member, one new `BuildingTier`. Nothing existing changes shape.

```ts
// milestones.ts
export type Track = 'main' | 'homelab' | 'slop' | 'pre';
```

```ts
// buildings.ts
export type BuildingTier = /* … */ | 'Old Stack';

/**
 * Leaves the build bar at the Pivot: the market for it stopped existing.
 * Nodes already placed keep running, exactly like `withdrawnAtIndex` — the
 * people who already own one still own one.
 */
withdrawnAtPivot?: boolean;
```

```ts
// types.ts, on GameState
/**
 * Which era this RUN is in. Set once at creation from the addon and advanced
 * exactly once, at the Pivot. Deliberately not read from `addons.techEra`:
 * flipping a checkbox must never reorder the milestone spine under a run in
 * progress. Absent from a save that predates the addon, where the spread in
 * reviveState leaves 'llm' — which is what such a run is.
 */
era: 'pre' | 'llm';

/** Which Pivot option was taken, and when. Null until the Pivot, and forever in an LLM-era run. */
pivot: { choice: 'sell' | 'repurpose' | 'both'; at: number } | null;
```

```ts
// milestones.ts — the second seed
/** What a run that starts in 2005 opens with. A LAMP box and a keyword list. */
export const PRE_STARTING_BUILDINGS = ['lamp_box', 'seo_desk'];
export const PRE_STARTING_RECIPES = ['host_site', 'rank_keyword'];
```

## 2. Content

Track `'pre'`, registered in `TRACKS` with its own colour (amber — every other track colour
is cool, and the prologue should read as a different decade at a glance).

`TIER_TRACK['Old Stack'] = 'techEra'` is **required**, not belt-and-braces: the two starting
buildings are unlocked by no milestone at all, so the milestone-derived membership set misses
them and they would appear in the build bar of a player with the addon off. This is the exact
case the three-signal comment at [addons.ts:92-99](../src/data/addons.ts) was written for.

### Milestones — five, landing on the current game's opening

The timeline groups by `act` ([TechTree.tsx:207](../src/ui/TechTree.tsx)), so the `act` strings
become the era columns and the horizontal layout does the decade-scrolling for free.

| # | id | act | name | requires | teaches |
| --- | --- | --- | --- | --- | --- |
| 1 | `pre_hosting` | `Act 0 · 2005` | **Shared Hosting** | `page_view: 40` | Traffic is the product. Serving costs almost nothing and is worth almost nothing |
| 2 | `pre_data` | `Act 0 · 2010` | **Somebody Else's Log Files** | `report: 90` | The first thing you own outright: a colo cage, because the data will not fit on a shared host |
| 3 | `pre_gpu` | `Act 0 · 2014` | **It Sees Cats** | `prediction: 220` | GPUs, and labelled data — which is people, and which the ESG addon already knows how to bill you for |
| 4 | `pre_attention` | `Act 0 · 2018` | **Attention** | `translation: 500` | Fine-tuning something you did not train. The first recognisable ancestor of the whole main game |
| 5 | `pre_pivot` | `Act 0 · 2022` | **The Pivot** | `translation: 1200`, `prediction: 1600` | §5. Unlocks every id in `STARTING_BUILDINGS` / `STARTING_RECIPES` |

### Items (~10)

`page_view`, `backlink`, `ad_impression`, `log_batch`, `report`, `labelled_image`,
`prediction`, `word_vector`, `translation`, `tuned_model`.

All `form: 'data'` except `page_view` / `ad_impression` (`'demand'`). None carry
`priceElasticity` — the DRAM spot market did not set a 2008 banner CPM.

### Buildings (~18, all `tier: 'Old Stack'`)

| Group | Nodes | Fate at the Pivot |
| --- | --- | --- |
| Web | `lamp_box`, `seo_desk`, `banner_network` | `withdrawnAtPivot` |
| Data | `hadoop_cluster`, `etl_job`, `bi_dashboard` | `withdrawnAtPivot` |
| ML | `label_farm`, `cnn_trainer`, `word2vec`, `bert_tune` | `withdrawnAtPivot` |
| **Iron** | `colo_cage`, `gpu_box`, `k80_rack`, `v100_rack` | **kept, buildable forever** |
| Contracts | `web_agency`, `bi_client`, `cv_licensee`, `mt_client` | listings retired; placed nodes settled by §5 |

The Iron row is the addon. Those four are `kind: 'capacity'`, carry `powerKw` and `landUse`
so the ESG addon meters them from 2005 onward, and carry `priceElasticity` so a player who
runs both addons watches their own later buildout price their own earlier hardware.

### Recipes (~24) and listings

Four contract chassis need `MARKET_LISTINGS` entries or they can never be signed —
`validateContent` already enforces exactly this ([index.ts:150](../src/data/index.ts)). Weights
sit in the `common`–`rare` bands: a 2008 web agency lead is not a legendary event.

## 3. Choosing the addons at the start of a run

Every addon so far could be switched on halfway through and mean something. Tech Era cannot:
it decides which milestone the spine opens on and which two buildings you own, and both are
answered once, at `createInitialState`. Burying that in a settings dialog a player finds forty
minutes in is the wrong place for it.

So a new run asks first. **New Run** is a modal on the `SettingsDialog` shape — the addon rows
already exist there, name plus blurb plus checkbox ([SettingsDialog.tsx:66-80](../src/ui/SettingsDialog.tsx))
— lifted into their own component so both screens render one list from `ADDONS` and neither
can drift from the other.

```
Start a new run
  ☐ Tech Era          Start in 2005… ten years before the models. ‹ pinned first, marked "changes where the run starts" ›
  ☑ Home Lab          Build your own machines…
  ☑ AI Slop           Content mills, pSEO and NSFW work…
  ☐ Agentic Ops       Hire agents to run the business…
  ☐ ESG & Footprint   The bill you have not been getting…
  ☐ Venture Capital   Milestones no longer pay a cash reward…
                                              [ Start ]
```

**When it shows.** When there is no save to load, and on Reset. `useGame` currently does
`loadState() ?? createInitialState()` in one expression at hook init
([useGame.ts:48](../src/ui/useGame.ts)), and `stateRef.current` is treated as non-null
everywhere downstream. Rather than make it nullable and ripple that through every consumer,
keep the eager construction and expose one flag:

```ts
const loaded = loadState();
stateRef.current = loaded ?? createInitialState();
const [setupOpen, setSetupOpen] = useState(loaded === null);
```

App renders `<NewRunDialog>` while `setupOpen`, over a game that is already running at speed
0. **Start** calls `reset(addons)` — the existing reset path ([useGame.ts:131](../src/ui/useGame.ts))
with the chosen settings threaded into `createInitialState` — and closes it. The throwaway
state costs one `seedMarket` call and buys back a nullable `GameState` in about thirty places.

**Settings keeps its addon list**, unchanged, for the five addons that can be toggled live.
Tech Era appears there too, disabled once `elapsed > 0`, with a line saying where it is chosen
and a button that opens New Run. A player who has not started yet can still flip it in either
place and get the same result.

**Reset** routes through the same dialog instead of resetting immediately: today it wipes and
restarts in one click, which with Tech Era in play would silently answer the run's most
important question with whatever was ticked last.

## 4. Engine changes — four, all small

**4.1 `createInitialState(addons)`.** Currently takes no arguments ([factory.ts:31](../src/engine/factory.ts)).
Takes an optional `AddonSettings`, seeds `era`, and picks the seed pair:

```ts
const pre = addons?.techEra === true;
era: pre ? 'pre' : 'llm',
unlockedBuildings: [...(pre ? PRE_STARTING_BUILDINGS : STARTING_BUILDINGS)],
```

Callers: `reviveState` (passes nothing — the spread restores the saved era) and `reset` in
`useGame.ts` (passes the live toggle). That is the whole change.

**4.2 The main-spine gate.** In `checkMilestones` ([simulate.ts:743](../src/engine/simulate.ts)),
alongside the existing `trackEnabled` skip:

```ts
// The prologue runs in front of the main spine, not beside it. Act I opens at
// the Pivot, which is the milestone that unlocks the LLM-era starting kit.
if (track === 'main' && state.era === 'pre') continue;
```

**4.3 `reset(addons)`.** `reset` in `useGame` currently takes no arguments and calls
`createInitialState()` bare. It takes the setup screen's selection and passes it through. One
line, and it is what makes §3 work at all.

**4.4 The Pivot.** `completeIfMet` gains one branch: when `next.id === 'pre_pivot'`, push a
`TickEvents.pivotReached` event rather than resolving it. `useGame` opens the dialog on that
event, exactly as it already does for `pendingRaise` / `pendingUnlock`. The state change
happens when the player chooses, in a new `engine/pivot.ts` — the same shape as
`engine/venture.ts`.

## 5. The Pivot

The last prologue milestone does not silently unlock things. It stops the run and asks one
question: **what happens to the company you just spent ten years building?**

| Choice | You get | You give up |
| --- | --- | --- |
| **Sell it** | `credits += pivotSaleMultiple × trailing revenue`. The largest cash number in the addon | Every pre-era node is removed, Iron included. You arrive in 2026 rich and renting, like everybody else |
| **Repurpose it** | Every Iron node stays, running, already powered and already on the ESG meter. Cash carried at `pivotRepurposeCashCarry` | The rest of the estate is refunded at `BALANCE.refundRate` and the product lines are gone |
| **Run both** | Everything stays exactly where it is | The old contracts are `withdrawnAtPivot` — no new leads, and every legacy node keeps billing `monthlyCost` against a demand curve that is now falling. It is a slow bleed you chose, and it is the option that looks free |

Constants for `balance.ts`, all under a `// --- Tech Era addon ---` block, initial values to
be tuned by §6:

```ts
pivotSaleMultiple: 40,            // months of trailing revenue, on the low end of a 2022 services multiple
pivotRepurposeCashCarry: 0.35,    // the rest went into the buildout you are keeping
pivotBothDemandDecayPerMonth: 0.12,
```

Three things carry across the Pivot regardless of choice, and each is worth a line of copy:

- **Venture Capital rounds.** `VentureState` is global and finite-by-repayment. A round
  signed in 2012 is still taking its share of revenue in 2026 — the two addons combine into a
  joke that writes itself, and it costs zero new code.
- **ESG state.** A player who ran a colo cage on evaporative cooling since 2011 arrives with
  Footprint already accrued and a `gridIndex` they built themselves. Also free.
- **`delivered`.** Record only, but it means the timeline shows a real ten-year tail behind
  the current objective.

## 6. The balance rule that must not be broken

The main game's central lesson is *rate limits are the real constraint*
([README.md:45](../README.md)). A prologue that hands the player meaningful Act II compute
deletes it.

**Hard rule: carried Iron must cover roughly the first two Act I milestones and be ~2% of
what Act II demands.** `v100_rack` is the top of the prologue ladder and it must be strictly
weaker than `colo_rack`, the Act III-B chassis it superficially resembles. The prologue never
unlocks `datacenter`, `gpu_rack` or anything in the Silicon tier — those stay behind
`ms_vertical` where they are.

Second rule: **carried cash builds Act I, it does not skip it.** Target handover is roughly
$60k–$150k depending on Pivot choice. Enough to stand up the whole Act I chain in one
sitting; nowhere near the $200k+ that Act II's first compute tier wants.

`tools/progression-test.mjs` is how both rules get verified rather than asserted — see §8.

## 7. Validation

Two new invariants in `validateContent()`, and one change to an existing walk.

**7.1 `unreachableMilestones()` must walk twice.** It seeds from `STARTING_BUILDINGS`
([index.ts:322](../src/data/index.ts)). Under the prologue seed that is the wrong opening
inventory, and every pre-track milestone would report as circular. Run the walk once per era
start: `STARTING_*` with `main` first, then `PRE_STARTING_*` with `pre` first and `main`
after, prefixing each problem with which run it came from.

**7.2 The Pivot must open the door it is standing in.** The single most important new check:

```ts
// A pre-era run reaches 2026 with only what the prologue unlocked. If the Pivot
// does not hand over the LLM-era opening kit, that run arrives unable to build a
// landing page and nothing anywhere says why.
for (const id of STARTING_BUILDINGS) {
  if (!pivot.unlocksBuildings.includes(id)) problems.push(`the Pivot does not unlock starting building "${id}"`);
}
```

...and the same for `STARTING_RECIPES`.

**7.3 No pre-era node may be the only producer of anything a later milestone needs** — the
`withdrawnAtIndex` stranding check ([index.ts:166](../src/data/index.ts)) generalised to
`withdrawnAtPivot`.

## 8. Tooling

- **`tools/progression-test.mjs`** — teach `nextOf` the fourth track and add `--era pre`, so
  the auto-player can be run from 2005. Its per-milestone timing table is how §6's two rules
  get checked: the run should reach the Pivot in a sane number of sim-minutes, and Act I's
  timings *after* a Pivot should compress but not collapse to zero.
- **`tools/check-translations.mjs`** — no change needed; it walks `src/data` and picks up the
  new content automatically, failing until `content.vi.ts` covers it.
- **`tools/build-reference-card.mjs`** — regenerate; the card gains an Act 0 column.

## 9. i18n

- `src/i18n/index.ts`: settings row name and blurb, the Pivot dialog (title, the three option
  cards, the confirm), the "Act I opens at the Pivot" line on the locked main-track tab, and
  the era tab label. ~14 keys, both languages.
- `src/i18n/content.vi.ts`: ~10 items, ~18 buildings, ~24 recipes. `npm run check:i18n` gates
  it, and the two rules in [content.ts:14-24](../src/i18n/content.ts) apply — figures copied
  never restated, proper nouns kept. "AlexNet", "Hadoop", "word2vec" and "BERT" stay.

## 10. Build order

Each phase leaves the game shippable.

1. **Content, no engine.** Track, tier, items, buildings, recipes, milestones, listings, both
   validator walks. The addon appears in settings and its column appears in the timeline;
   nothing gates anything yet. Reviewable as pure data.
2. **The setup screen.** `NewRunDialog`, the shared addon-row component, `reset(addons)`,
   Reset routed through it. Ships on its own merit before any Tech Era content is playable —
   the other five addons get a front door too.
3. **The era.** `GameState.era`, `createInitialState(addons)`, the `checkMilestones` skip, the
   `setAddon` guard, `withdrawnAtPivot` in the build bar. A pre-era run is now playable end to
   end, arriving in 2026 with everything intact — no write-down yet.
4. **The Pivot.** `engine/pivot.ts`, the `TickEvents` bucket, `PivotDialog.tsx`, the three
   outcomes, the `balance.ts` block.
5. **Balance and translation.** §6 verified with `npm run progression -- --era pre`,
   Vietnamese content, reference card, README section.

## 11. Cost

| | Items | Buildings | Recipes | Milestones | Listings | Engine changes |
| --- | --- | --- | --- | --- | --- | --- |
| Tech Era | +10 | +18 | +24 | +5 | +4 | 4 |

Post-addon totals against today's 53 / 103 / 135 / 24: **63 items, 121 buildings, 159 recipes,
29 milestones**. Four engine changes, one of them a single `continue`. No new `BuildingKind`,
no new `MachineStatus`, no `STATE_VERSION` bump, no save discarded.

## 12. Open questions

1. **Does the prologue get its own Coach line set?** Coach currently narrates milestone
   completion ([Coach.tsx](../src/ui/Coach.tsx)); ten years of prologue in the 2026 coach's
   voice would be odd. Cheapest answer: the same coach, with era-aware copy on the five
   prologue milestones only.
2. **Home Lab and Slop during the prologue.** Both tracks are on by default and their first
   milestones require `draft_answer` / `slop_text`, which no 2005 node produces — so they sit
   visibly at 0 for the whole prologue. Options: hide non-`pre` tabs in the timeline while
   `era === 'pre'` (recommended, one filter in the existing `visibleTracks` computation), or
   suspend them the way `main` is suspended.
3. **Should the Pivot be skippable?** A player who wants the head start without the ten years
   is asking for a cheat, and the honest answer is no. Worth confirming.
