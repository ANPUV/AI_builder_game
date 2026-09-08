# AIfor.study — Addons Spec v1

**Two side branches off the main spine.**
Built and shipped · 6 September 2026 · `aifor-study`

Addon A — **Home Lab**: stop renting someone else's rate limit. Buy hardware, run open
weights on it, discover that capex is not the same as free.

Addon B — **AI Slop**: generating content is trivially cheap and worth nothing. Turning it
into revenue means either clicking forever or building a pipeline, and both routes carry
four distinct ways to lose money.

Both branches are **optional tracks**, not new acts. The main spine (Act I → II → III) is
unchanged; these run alongside it and rejoin it at defined points.

---
## 0. What this costs, up front

| | Items | Buildings | Recipes | Milestones | Engine changes |
|---|---|---|---|---|---|
| Home Lab | +14 | +22 | +36 | +4 (own track) | 6 |
| AI Slop | +8 | +12 | +22 | +4 (own track) | 4 |
| Shared | — | — | — | — | 1 (parallel tracks) |
| **Total** | **+22** | **+34** | **+58** | **+8** | **11** |

Post-addon totals **as built**: **53 items, 103 buildings, 135 recipes, 24 milestones** —
against 31 / 69 / 87 / 16 before. `validateContent()` reports one problem, the pre-existing
`pretrain` buffer note.

Of the eleven engine changes, exactly one is structural (parallel milestone tracks). The rest
are additive fields on existing types plus one new derived stat. Nothing in `simulate.ts`
gets restructured.

---

# Addon A — Home Lab

## A1. The lesson

The main game teaches *rate limits are the constraint*. Home Lab teaches the two things
that sit underneath it:

**You can escape the rate limit entirely, and the escape is a capital expense with a
failure mode.**

**And the capital expense is going up, because of you.** Every kTPM the player provisions
in the main game is a share of the same DRAM, NAND and GDDR7 supply their home rig needs.
The AI buildout the player is participating in is what makes their own hardware expensive.
That is not a game conceit — it is what actually happened between 2024 and 2026, and it is
the spine of this addon.

Four beats:

1. **Prebuilt.** Buy a machine, pull weights off Hugging Face, serve them. Per-token cost
   goes to zero. Throughput is pitiful, and with **ESG & Footprint** on, the electricity
   bill never stops — the machines carry no rent of their own, only watts.
2. **Parts.** Assemble your own for less per kTPM. The power supply is the cheapest
   component and the only one that can destroy every other component.
3. **Customers.** SME B2B contracts that will only buy from a box in their own building.
   This is where the track starts paying for itself.
4. **Rack.** Used enterprise gear at a price per kTPM that finally competes with rented
   H100s — the on-ramp back into the main game's Act III.

> **Design principle, inherited.** Every node still carries a sourced figure. The RTX PRO
> 6000 Blackwell really did launch at $8,565 in March 2025 and really does list at $16,000
> as of August 2026. Apple really did withdraw the 512GB Mac Studio in March 2026 rather
> than reprice it. The game economy is scaled for playability; the ratios and the facts
> are not.

## A2. Renames

`Models` becomes **`Online Models`**. New tiers: `Local Models`, `Home Lab`.

Two-line content change with one trap: `validateContent()` currently asserts that every
building in tier `Models` names a vendor, and local models legitimately have none — they
draw the shared pool. The check must become:

```ts
if (b.tier === 'Online Models' && !b.vendor) problems.push(...)
if (b.tier === 'Local Models' && b.vendor) problems.push(`"${b.id}" is local but names a vendor`)
```

`BuildBar`'s `ORDER` array needs the rename plus the new tiers, or the sections silently
vanish from the build bar.

## A3. Hugging Face

| Node | Kind | Cost | $/mo | Makes | Note |
|---|---|---|---|---|---|
| Hugging Face Hub | source | $0 | $9 | `local_weights` ×2 / 25s | Well past a million models hosted. Pro is $9/mo. The download is free; the disk it lands on is now the expensive part. |
| Quantization Bench | factory | $400 | $0 | `open_weights` → `local_weights` ×3 | Q4_K_M lands near 4.8 bits per weight. A 70B drops from 140GB to about 40GB and loses a few points of benchmark. |

`local_weights` (Quantized GGUF) is a new item, distinct from `open_weights`. The
distinction is the point: `open_weights` is what a datacenter serves at BF16,
`local_weights` is what fits in 24GB. Act III's `weights_mirror` keeps producing
`open_weights` and the Quantization Bench bridges the two, so the branches interlock
rather than duplicate.

---

## A4. The price index — hardware gets more expensive as you play

**This is the addon's signature mechanic and it is the one genuinely new system in the
plan.**

### What actually happened, 2024 → September 2026

| Component | Mid-2024 | Sept 2026 | Multiple |
|---|---|---|---|
| DDR5 32GB kit (DDR5-6000) | ~$95 | ~$400 | **4.2×** |
| 2TB NVMe SSD | ~$120 | ~$379 | **3.2×** |
| RTX 5090 32GB | $1,999 MSRP (Jan '25) | ~$4,500 street | **2.25×** |
| RTX PRO 6000 96GB | $8,565 MSRP (Mar '25) | $16,000 list | **1.87×** |
| Used RTX 3090 24GB | ~$700 | ~$1,000–1,400 | **1.7×** |
| Used RTX 4090 24GB | $1,599 new (Oct '22) | ~$2,050 | **1.3×** |
| CPU + motherboard | ~$480 | ~$530 | 1.10× |
| Case + cooling | ~$160 | ~$175 | 1.09× |
| 1000W 80+ Gold ATX 3.1 PSU | ~$150 | ~$162 | **1.08×** |

Cause, in one line: manufacturers moved capacity to server DRAM and HBM. Consumer NAND fell
from 45% of the market in 2024 to 32% in 2026. Micron discontinued its consumer Crucial line
outright. TrendForce revised its Q1 2026 DRAM contract forecast to **+90–95% quarter over
quarter**. PSUs and coolers went up 6–10%, and that was copper and tin, not memory.

### The mechanic

```ts
// balance.ts
priceIndexMax: 4.2,          // the 2024 dollar against the 2026 dollar
priceIndexProgressWeight: 0.7,
priceIndexBuildoutWeight: 0.3,
priceIndexSaturationKtpm: 200_000,
```

```ts
// simulate.ts, in the same pass that sums exposure
const progress = state.completedMilestones.length / 12;
const buildout = state.compute.supplyKtpm / BALANCE.priceIndexSaturationKtpm;
state.priceIndex = 1 + (BALANCE.priceIndexMax - 1) * clamp01(
  BALANCE.priceIndexProgressWeight * progress +
  BALANCE.priceIndexBuildoutWeight * buildout
);
```

Milestone-driven, so it tracks *progress* rather than wall-clock — a slow, careful player
is not punished for thinking. The buildout term is the player's own contribution and it is
what makes the tooltip line land: **"You are why this costs what it costs."**

### Per-component elasticity

New field: `Item.priceElasticity` and `Building.priceElasticity`, both defaulting to 0
(the main game's nodes do not move at all — Anthropic's per-token price is not set by the
DRAM spot market).

```ts
cost = base * (1 + elasticity * (priceIndex - 1))
```

Elasticity 1.0 is DRAM by definition. Everything else is calibrated against the table above
at `priceIndex = 4.2`:

| Component | Elasticity | At index 4.2 |
|---|---|---|
| RAM kit | 1.00 | 4.20× |
| NVMe | 0.70 | 3.24× |
| RTX 5090 | 0.39 | 2.25× |
| RTX PRO 6000 | 0.27 | 1.86× |
| Used RTX 3090 | 0.22 | 1.70× |
| Used RTX 4090 | 0.10 | 1.32× |
| Prebuilt machines | 0.20–0.35 | 1.6–2.1× |
| CPU + motherboard | 0.03 | 1.10× |
| Case & cooling | 0.028 | 1.09× |
| PSU (any grade) | 0.025 | 1.08× |

### Three consequences, all of them good

**1. The budget PSU gets worse over time, on its own.** The PSU is the least elastic
component in the build and the GPU it protects is one of the most. At index 1.0 a no-name
unit saves you 7% of build cost. At index 4.2 it saves 3% — and the card behind it is worth
2.25× more. The risk/reward on cheaping out inverts without a single balance number
changing. That falls straight out of the real data and it is the best thing in this section.

**2. Hardware appreciates.** `removeMachine` should refund `refundRate × currentCost`, not
`refundRate × base`. A rig bought at index 1.2 and stripped at index 3.5 returns more than
half of a much larger number. Used 3090s genuinely went *up* between 2024 and 2026, and a
player who over-buys early is rewarded for it — which is exactly what happened to everyone
who bought GPUs in 2024.

**3. Things get delisted.** New field `Building.withdrawnAtIndex?: number`. Past that
threshold the building leaves the build bar permanently. Already-placed nodes keep running,
because in reality the people who bought one still have it.

The canonical case: **Apple withdrew the 512GB Mac Studio in March 2026 rather than
reprice it.** The base M3 Ultra went $3,999 → $5,299 and the 96GB→256GB upgrade went
$1,600 → $2,000, but the 512GB configuration simply disappeared from the store between
4 and 6 March with no announcement.

In-game that means: **the only machine that runs DeepSeek-R1 671B locally stops being
purchasable partway through the run.** A player who saw it and waited has missed it. That
is a real event, it is a genuinely great game moment, and it costs one optional field.

### UI

A small index readout in the top bar — `HW ×2.4 ▲` — and every hardware price in the build
bar shows the current figure with the base struck through once the index passes 1.15. The
tooltip carries the cause, and the cause names the player.

---

## A5. GPU generations

Four cards, unlocking in order across the Home Lab track, each with real launch and current
pricing. These are **items** bought from a GPU Market source node, consumed by the BYO Rack
Bay alongside a bare rig and a PSU.

| Item | VRAM | Launch | Base cost | At index 4.2 | $/GB then | Unlocked at |
|---|---|---|---|---|---|---|
| `gpu_3090` — Used RTX 3090 | 24GB GDDR6X | Sep 2020, $1,499 | $700 | $1,190 | $50 | HL-1 |
| `gpu_4090` — Used RTX 4090 | 24GB GDDR6X | Oct 2022, $1,599 | $1,580 | $2,086 | $87 | HL-2 |
| `gpu_5090` — RTX 5090 | 32GB GDDR7 | Jan 2025, $1,999 | $2,000 | $4,500 | $141 | HL-3 |
| `gpu_6000` — RTX PRO 6000 | 96GB GDDR7 | Mar 2025, $8,565 | $8,565 | $15,930 | $166 | HL-4 |

**The progression teaches something uncomfortable: VRAM per dollar gets worse every
generation.** The used 3090 remains the best VRAM-per-dollar card in the game at every
index value, and it is still the best VRAM-per-dollar card in reality in September 2026.
The newer cards buy speed and capability, not capacity — and capacity is what decides
which models you can run at all.

Each card sets the throughput of the BYO Bay recipe it feeds:

| Card | kTPM | Largest model it holds |
|---|---|---|
| 3090 | 90 | 8B at Q4, or 32B badly |
| 4090 | 150 | 32B at Q4 |
| 5090 | 260 | 32B comfortably; 70B does not fit |
| PRO 6000 | 900 | 120B at Q4 on one card |

The RTX PRO 6000's 96GB is the first card in the ladder that runs `gpt-oss-120b` without
splitting it, which is why it is worth eight 3090s' money for one card's throughput.

---

## A6. Prebuilt machines

All `kind: 'capacity'`, all feeding the **shared** pool, `computeSupply` set by memory
bandwidth rather than FLOPS — at batch size 1, bandwidth is what sets tokens per second,
and a home lab is always batch size 1.

These nodes carry **no `monthlyCost`**. They cost electricity, not rent, and electricity is
metered by the **ESG & Footprint** addon off each node's `powerKw` at the live grid price —
so billing it here as well would charge the player twice for the same watt. With ESG off,
owned hardware has no recurring cost at all, and the trade is capex, the price index and
the blowout risk. The `kW` column is what the meter reads; the old `$/mo` column is gone.

Base costs are at index 1.0; the "Sept 2026" column is what the player actually pays late
in the run.

| Node | Base | At index 4.2 | kW | kTPM | Memory | The real figure |
|---|---|---|---|---|---|---|
| Gaming PC (used 3090) | $1,200 | $2,040 | 0.5 | 90 | 24GB | The cheapest way to run an 8B at speed. 24GB is the wall every hobbyist hits. |
| Mac Mini M4 Pro 64GB | $2,199 | $3,430 | 0.15 | 70 | 64GB unified | 273 GB/s. Slow, silent, and it holds models the 5090 cannot. |
| Framework Desktop 128GB | $1,999 | $3,120 | 0.25 | 95 | 128GB unified | Strix Halo, 96GB allocatable to the GPU, 256 GB/s. Best dollars-per-gigabyte on the list. |
| DGX Spark | $3,999 | $5,600 | 0.24 | 130 | 128GB unified | Launched at $3,999; **repriced to $4,699 in February 2026** on memory supply alone. ~1 PFLOP of FP4 against 273 GB/s of feed. |
| Mac Studio M3 Ultra 512GB | $9,499 | — | 0.27 | 420 | 512GB unified | 819 GB/s. Runs a 671B model in 4-bit off a wall socket. **Withdrawn at index 3.4.** |
| Mac Studio M3 Ultra 256GB | $7,499 | $10,900 | 0.27 | 380 | 256GB unified | What is left after the withdrawal. The 96→256GB upgrade went $1,600 → $2,000 the same week. |
| DGX Station GB300 | $79,000 est. | $118,000 | 1.6 | 3,400 | 784GB coherent | A datacenter node in a deskside box. Price is not officially published; treat it as an estimate. |

Two pairings the build bar should place adjacently, because each is an argument:

- **DGX Spark vs Mac Studio.** Eight times the compute against a third of the memory
  bandwidth. The cheaper machine wins on the workload the tier is about.
- **Mac Studio 512GB vs 256GB.** The good one is gone. This is the only place in the game
  where a node is taken away from the player by the world rather than by their own
  decisions, and the Coach should say so when it happens.

---

## A7. Local models

`kind: 'factory'`, `tier: 'Local Models'`, **no vendor** → shared pool. Defining property:
**`cost: 0` on every recipe.** No per-token spend, ever. What they draw instead is
`computeDraw` on the shared pool, sized by parameter count, which the rigs above must cover.

| Node | Draw | Makes | Needs | Note |
|---|---|---|---|---|
| Llama Local 8B | 60 | `draft_answer` ×4 / 6s | 24GB | Runs on the gaming PC. Free forever, and about as good as a 2024 mid-tier. |
| Qwen3 Local 32B | 140 | `onprem_answer` ×3 / 8s | 32GB | Best capability-per-gigabyte on the open list. Chinese weights, running locally — `dataRisk: 0`, because nothing leaves. |
| gpt-oss-120b Local | 300 | `onprem_answer` ×4 / 8s | 80GB+ | Apache 2.0, MoE, fits on one 96GB card. An American lab's open weights, which is what makes it procurement-safe. |
| DeepSeek-R1 671B Local | 900 | `reasoning_answer` ×2 / 14s | 400GB+ | Frontier-class reasoning off one desktop. Slowly. This is the node that justified the Mac Studio, before the Mac Studio went away. |

**`onprem_answer` is a new item and it is the addon's product.** Only Local Model nodes
can make it. That provenance is the whole mechanism behind the SME contracts below: you
cannot buy it from an API, because no API building has a recipe that emits it.

It is deliberately *not* `sovereign_answer`. Those are different products at different
scales — `sovereign_answer` is air-gapped datacenter output for federal buyers,
`onprem_answer` is a box in a ten-person office. The rejoin is that late in the track the
eval gate learns `onprem_answer` ×6 → `sovereign_answer` ×5, at which point Home Lab feeds
Act III directly.

**The `dataRisk: 0` point matters.** DeepSeek's API carries `dataRisk: 8` in the main game
because prompts land in the PRC. The identical weights running in your spare room carry
zero. That comparison is the strongest thing this addon teaches, and it is true.

---

## A8. The parts chain — group nodes

**Items (10):** `cpu_mobo`, `ram_kit`, `nvme`, `chassis`, `bare_rig`, `psu_budget`,
`psu_gold`, `psu_titanium`, plus the four GPUs from §A5.

**Chain:**

```
Parts Distributor ─┬─ cpu_mobo ─┐
                   ├─ ram_kit ──┼─► Bench Build ──► bare_rig ──┐
                   ├─ nvme ─────┤                              │
                   └─ chassis ──┘                              ├─► BYO Rack Bay
GPU Market ──────────  gpu_[gen] ─────────────────────────────┤    (capacity)
PSU Shelf ───────────  psu_[grade] ───────────────────────────┘
```

Three feeds into one capacity node. Both real decisions — **which card** and **which power
supply** — are visible as separate links on the canvas rather than buried in a dropdown.
That is what makes this a group chain rather than a single node with options.

### Component prices, and how they move

| Item | Base | At index 4.2 | Elasticity | Note |
|---|---|---|---|---|
| `cpu_mobo` — CPU + Motherboard | $480 | $528 | 0.03 | A Ryzen 7 was ~$310 in mid-2024 and is roughly that now. Silicon logic did not join the shortage. |
| `ram_kit` — 32GB DDR5-6000 | $95 | $399 | **1.00** | The reference component. $95 in mid-2024, $375 minimum by 2026. Micron killed its consumer line entirely. |
| `nvme` — 2TB NVMe | $120 | $389 | 0.70 | Consumer NAND fell from 45% of the market to 32%. A 2TB drive went $175 → $379 in four months. |
| `chassis` — Case & Cooling | $160 | $174 | 0.028 | Copper and tin, not memory. Up 6–10% and no more. |
| `psu_budget` — No-name 850W | $45 | $49 | 0.025 | No ATX 3.1 excursion rating. **0.9% failure per minute.** |
| `psu_gold` — 1000W 80+ Gold ATX 3.1 | $150 | $162 | 0.025 | ~90% efficient at half load. **0.08% failure per minute.** |
| `psu_titanium` — 1600W 80+ Titanium | $450 | $486 | 0.025 | ~94% at half load, so it also cuts `monthlyCost`. **0.01% failure per minute.** |

A `bare_rig` at index 1.0 costs about $855 in parts. At index 4.2 it costs about $1,490 —
and **83% of that increase is the RAM and the SSD alone.**

### Why the PSU is the risk node, factually

ATX 3.1 requires a supply to survive power excursions to 200% of rating; a modern GPU spikes
past twice its rated draw for microseconds at a time. A no-name unit without that headroom
either trips or dies, and the 12VHPWR / 12V-2x6 connector has a documented history of
melting under exactly this class of load on the 4090 and 5090. Cheap PSU, expensive GPU,
one connector between them.

### Group nodes and blowouts

A rig is a set of placed nodes sharing a `groupId`: the BYO Bay plus whatever local-model
nodes the player pins to it. The canvas draws a hull around the group. When a blowout fires:

- the BYO Bay goes `broken` — supplies nothing, **still bills electricity** until disabled;
- every node in the same `groupId` goes `broken` with it;
- the consumed `gpu_[gen]` is **destroyed**, at whatever the index says it is worth now;
- repair costs `0.6 × currentCost` and takes 30s of downtime, or the player rebuilds.

The group is what makes the blowout land. A single node failing is an inconvenience; a hull
of six nodes greying out at once, having just eaten a $15,930 card, is a lesson.

---

## A9. SME B2B contracts — the track's own revenue

The gap in the first draft: Home Lab was pure cost reduction with no customers of its own.
These are its customers, and they are the reason the branch exists.

**The constraint that defines them:** an SME with a real confidentiality obligation — a
two-partner law firm, a clinic, a small accountancy — cannot put client data through
someone else's API, and is too small to negotiate a BAA or a zero-retention agreement. What
they can do is buy a box. GDPR fines run to 4% of global annual turnover, and a firm of ten
people has attorney-client privilege to lose and no DPO to lose it with.

| Contract | Base cost | On-site requirement | Consumes | Payout | maxExposure |
|---|---|---|---|---|---|
| **SME On-Prem Pilot** | $2,500 | 1 Home Lab node running | `onprem_answer` ×10 / 20s | $190 | 55 |
| **Managed On-Prem Fleet** | $25,000 | 3 Home Lab nodes running | `onprem_answer` ×30 + `verified_answer` ×6 / 35s | $1,150 | 35 |
| **Regional MSP** | $150,000 | 6 Home Lab nodes + 1 Homelab Rack | `onprem_answer` ×80 / 45s | $6,400 | 25 |

Notes that should ship on the nodes:

- *SME On-Prem Pilot* — "One to ten concurrent users needs a 24GB card. That is the entire
  hardware specification, and it is why this business exists."
- *Managed On-Prem Fleet* — "You are not selling answers any more. You are selling
  someone else's server, and you are on the hook when it dies."
- *Regional MSP* — "Every box you have sold is a box you now maintain. The margin is real
  and so is the pager."

### The on-site audit

New optional field, and the second-smallest engine change in the plan:

```ts
// recipes.ts
requiresOnSite?: { tier: Building['tier']; count: number };
```

In `step()`, a contract with `requiresOnSite` counts placed, enabled, non-broken machines of
that tier. Below the count, the node reports `audited` — a status that already exists, whose
label widens from "Security hold" to "Audit hold". About eight lines.

Three things fall out of it for free:

1. **You cannot fake it with an API.** `onprem_answer` has no API producer, and the audit
   re-checks continuously.
2. **Selling your rigs breaks your contracts.** Strip the hardware and the revenue stops
   the same tick. The `refundRate × currentCost` appreciation from §A4 makes that a real
   temptation late in the run, which is exactly the trap it should be.
3. **A blowout cascades into revenue.** Broken nodes do not count toward the audit. A
   budget PSU letting go on a Friday takes the Regional MSP offline until it is repaired —
   which is precisely what an MSP's actual risk register looks like.

This tier is also where the track's difficulty comes from. Fleet and MSP payouts are large
enough to fund Act II comfortably, and both sit under Exposure ceilings tight enough that
a player running DeepSeek's API anywhere on the canvas loses them.

---

## A10. The rack, and the rejoin

| Node | Base cost | At index 4.2 | $/mo | kTPM | $/kTPM/mo |
|---|---|---|---|---|---|
| **Homelab Rack** (used A100 40GB ×4) | $22,000 | $35,600 | $780 | 6,200 | **$0.13** |
| — vs. Rented H100 Node *(existing)* | $0 | $0 | $15,100 | 24,000 | $0.63 |
| — vs. Colo Rack Bay *(existing)* | $250,000 | $250,000 | $42,000 | 130,000 | $0.32 |

Ex-datacenter 40GB A100s at roughly $5,000 each — three years old, fully depreciated, still
faster than anything consumer. The Homelab Rack is deliberately the best dollars-per-kTPM in
the game, because used enterprise hardware genuinely is.

What it costs instead: a wall of capex before it earns a cent — **and that wall grows while
you play**, from $22,000 to $35,600 — plus a `failureRatePerMin` no rented node carries, and
a hard ceiling. You cannot scale a basement to a federal contract.

Note the shape of that comparison: **rented capacity does not inflate.** A rented H100 is
priced in dollars per hour and the provider eats the hardware cost. As the index climbs,
renting gets *relatively* cheaper — which is both the correct economics and the mechanical
reason the Home Lab branch has to hand the player back to Act III eventually.

That is the rejoin: **Home Lab is the cheap way through Acts I and II and a dead end for
Act III**, and the price index is what closes the door. A player who takes it arrives at
`ms_frontier` with more cash, real customers, and no compliance posture at all.

---

## A11. Home Lab track — four milestones

`track: 'homelab'`, running parallel to the main spine.

| # | Name | Requires (delivered) | Unlocks | Reward |
|---|---|---|---|---|
| **HL-1** | **Weights On Your Desk** | `draft_answer` 120 | HF Hub, Quantization Bench, Gaming PC, Mac Mini, Llama Local, Qwen3 Local, GPU Market (3090), SME On-Prem Pilot | $6,000 |
| **HL-2** | **The Box In The Corner** | `onprem_answer` 200 | Parts Distributor, PSU Shelf, Bench Build, BYO Bay, 4090, Framework Desktop, DGX Spark, Managed On-Prem Fleet | $60,000 |
| **HL-3** | **Somebody Else's Server** | `onprem_answer` 900 | 5090, Mac Studio *(both configs — the 512GB withdraws at index 3.4)*, gpt-oss-120b Local, Legal-grade eval recipe | $450,000 |
| **HL-4** | **The Rack In The Basement** | `onprem_answer` 2,400 | RTX PRO 6000, DGX Station, Homelab Rack, DeepSeek-R1 Local, Regional MSP, `onprem_answer` → `sovereign_answer` gate | $2,400,000 |

HL-1 requires `draft_answer`, which the main track already sells, so the track can be
entered from a standing start. Everything after it requires `onprem_answer`, which the SME
Pilot unlocked at HL-1 buys — so the track is self-contained from that point and
`unreachableMilestones()` will pass once it walks per-track (§C1).

The milestone names track the business the player is actually in: a hobbyist, then a
supplier, then a managed service provider, then infrastructure.

---

# Addon B — AI Slop

## B1. The lesson

Three beats, and the arc is deliberately the opposite shape of Home Lab's:

1. **Free and worthless.** Generate poems, images, video. It costs real tokens. It earns
   exactly zero. The player does it anyway because the milestone demands it, which is a
   fairly precise model of the entire content-marketing industry.
2. **Money, badly.** Two routes to revenue that are mechanically opposed: a manual node
   that pays well per click and cannot be automated, or an API chain that automates and
   pays less per unit.
3. **Money, dangerously.** NSFW contracts and abliterated models pay several times more and
   attach the two risks that can end a run.

## B2. Tier 1 — generation that earns nothing

| Node | Kind | Cost | Recipe | $/craft | Note |
|---|---|---|---|---|---|
| Prompt Bench | factory | $150 | `user_request` ×2 → `slop_prompt` ×4 / 5s | $0 | The prompt is the cheapest part and everyone treats it as the whole job. |
| Text Mill | factory | $200 | `slop_prompt` ×6 → `slop_text` ×6 / 6s | $1.20 | Roughly 57% of sentences on the open web are already machine-translated. The slop is not coming; it arrived. |
| Image Gen | factory | $400 | `slop_prompt` ×4 → `slop_image` ×4 / 8s | $16 | About $0.04 an image at standard quality, $0.05 for the good open model. Four cents is below the cost of deciding whether you want it. |
| Video Gen | factory | $2,000 | `slop_prompt` ×2 + `slop_image` ×2 → `slop_video` ×1 / 20s | $45 | Roughly $0.75 per second of generated video at launch pricing. One minute is $45. This is the only node in the addon where the token bill is frightening. |

And the tier-1 contract, which is the trick:

| Contract | Cost | Recipe | Payout | Note |
|---|---|---|---|---|
| Post To Feed | $0 | `slop_text` ×10 + `slop_image` ×4 → — | **$0** | You spent real money to produce this and no one paid you for it. Deliveries still count toward the tech tree, because attention is the thing you were actually buying. |

**Zero engine work.** A contract recipe with `payout: 0` already credits nothing and still
increments `state.delivered`, which is exactly the semantics needed. The milestone track
advances; the bank balance does not.

## B3. Tier 2 — the two routes

This is the mechanical heart of the addon.

### Route 1 — Ready To Serve (manual)

| Contract | Cost | Recipe | Payout | Note |
|---|---|---|---|---|
| Content Mill Order | $900 | `slop_text` ×12 + `slop_image` ×3 → — | $340 | Over a thousand unreliable AI-generated news sites were being tracked by 2025. They pay per piece and they pay on delivery. |

One node, no upstream wiring beyond the generators, and the best payout-per-second in the
early midgame — **as long as you keep clicking.** `manual: true` on the recipe means the
node will not start a craft on its own. It sits at `awaiting` until the player presses
Generate on it.

This is the honest model of a person running a content business out of a chat window. It
works, it pays, and it does not scale past your own attention.

### Route 2 — Programmatic SEO (automated)

| Contract | Cost | Recipe | Payout | Note |
|---|---|---|---|---|
| Programmatic SEO Platform | $12,000 | `content_pack` ×6 → — | $780 | Lower per unit, and it runs while you are asleep. |

`content_pack` is a **new item** produced by a Content Packager factory that consumes text,
images and video together — so Route 2 requires actually building the pipeline the main
game teaches, including a demand source, models and links. Higher capex, more nodes, more
throughput, and no clicking.

The two routes should be balanced so that Route 1 wins for the first ~4 minutes of game
time and Route 2 has overtaken it by ~10. A player who never builds the chain hits a
ceiling made of their own mouse.

## B4. Tier 3 — abliteration and NSFW

| Node | Kind | Cost | Recipe | Risk | Note |
|---|---|---|---|---|---|
| Abliteration Rig | factory | $8,000 | `local_weights` ×2 → `abliterated_model` ×1 / 40s | `dataRisk: 6` | Refusal behaviour in an aligned model is mediated by a single direction in activation space; ablate it and the refusals stop. Published research, freely reimplemented, and it needs no retraining. |
| NSFW Studio | factory | $15,000 | `abliterated_model` ×1 + `slop_prompt` ×20 → `nsfw_content` ×16 + `abliterated_model` ×1 / 18s | `dataRisk: 9` | The weights come back out — an abliterated model is a tool, not a consumable. |
| Adult Platform | contract | $40,000 | `nsfw_content` ×20 → — | payout **$4,200**, `maxExposure: 60` | Pays like a regulated contract with none of the paperwork, and every incentive in the payment stack is pointed at you. |

The Abliteration Rig requires `local_weights`, which means **Addon B's endgame is gated on
Addon A**. That is intentional: you cannot ablate a model you only reach through an API,
and the two addons are more interesting when the second one needs the first.

`dataRisk: 9` on the NSFW Studio pushes global Exposure past the ceilings on Mid-Market,
Enterprise, Health/Finance and Federal simultaneously. **Running the profitable end of
Addon B locks you out of the profitable end of the main game.** No new mechanic — the
existing `maxExposure` does all of it.

## B5. The four risks

One new global stat and one generalized incident roll.

**`state.slop`** — the Slop Index, 0–100, computed like Exposure: the sum of a new
`slopRisk` field across running nodes, minus what quality gates remove. Displayed in the
top bar next to Exposure.

| Risk | Fires on | Effect | Anchor |
|---|---|---|---|
| **IP fine** | Each delivery to a slop contract. `p ∝ slop × volume` | Cash fine of $3,000 per work, scaled to units delivered. Emits a `dmca_notice` item. | An AI lab settled a training-data class action for $1.5B over roughly 500,000 works — about $3,000 each. |
| **Slop distraction** | Per craft on any slop generator. `p = 0.04 + slop/400` | The craft completes, the output is voided. Tokens spent, nothing produced. | The failure mode is not that the model refuses. It is that it produces something and no one wants it. |
| **Bad quality** | Per contract delivery. `p ∝ slop`, reduced by an eval gate upstream | Payout × 0.35. Three misses on one contract node and the node is **lost** — removed from the canvas, no refund. | Losing a contract for quality is the only way to lose a placed node in the game. It should feel like it. |
| **Legal fine** | Per NSFW delivery. `p ∝ nsfw volume`, reduced by compliance nodes | Fine of 8% of cash on hand, min $25,000. Exposure +15 for 60s. | Age-assurance regimes went live in the UK and were upheld for Texas at the US Supreme Court in 2025. Payment processors moved on storefronts the same summer. |

**Legal Desk** (factory, $6,000, $2,400/mo) consumes `dmca_notice` and cuts IP fine
probability by half while it has work — the player's one lever against risk 1. It is the
slop track's equivalent of `observability`, and it should be introduced one milestone
*after* the fines start, so the player feels the problem before they are handed the fix.

## B6. AI Slop track — four milestones

`track: 'slop'`.

| # | Name | Requires | Unlocks | Reward |
|---|---|---|---|---|
| 1 | **Content Is Free** | `slop_text` 80, `slop_image` 30 | Video Gen, Content Mill Order (manual) | $0 |
| 2 | **Somebody Pays For This** | `slop_image` 200 | Content Packager, Programmatic SEO, Legal Desk | $45,000 |
| 3 | **Ablated** | `content_pack` 150 | Abliteration Rig, NSFW Studio | $400,000 |
| 4 | **The Slop Machine** | `nsfw_content` 400 | — | $6,000,000 |

Milestone 1's reward is **$0**, deliberately. It is the only milestone in the game that
pays nothing, and the blurb should say so.

---
# C. Engine work

Eleven changes. One structural, ten additive. Listed in build order.

## C1. Parallel milestone tracks — `simulate.ts`, `milestones.ts`

**The only structural change, and both addons need it.** Today `checkMilestones` takes the
first incomplete milestone in array order and nothing else can progress. A side branch is
impossible to express.

```ts
export type Track = 'main' | 'homelab' | 'slop';
// Milestone gains: track?: Track   (default 'main')
```

`checkMilestones` iterates the distinct tracks and advances the first incomplete milestone
*per track*. Roughly ten lines. `UnlockPanel` and `TechTree` gain a track selector.

`unreachableMilestones()` must walk per track with the main track's unlocks merged in at
each step, or it will report false circularity on every addon milestone. This is the single
most likely thing to go wrong in the whole plan.

## C2. Price index and dynamic costs — `types.ts`, `balance.ts`, `simulate.ts`, `factory.ts`, `BuildBar.tsx`, `TopBar.tsx`

The largest of the additive changes, and the one carrying the most design weight (§A4).

- `GameState.priceIndex: number`, recomputed each tick alongside `exposure`
- `Item.priceElasticity?: number` and `Building.priceElasticity?: number`, default 0
- `currentCost(state, b): number` in `factory.ts` — **every read of `b.cost` must go
  through it.** There are four: `placeMachine`, `removeMachine`'s refund, `BuildBar`'s
  affordability check, and `BuildTip`. Missing one produces a build bar that shows a price
  the player is not charged, which is the worst class of bug this change can create.
- Recipe `cost` for parts sources scales the same way, via the item's elasticity

Refund at `refundRate × currentCost` is a deliberate call, not an oversight: hardware
appreciates, and the player should be able to profit from having bought early.

## C3. Withdrawn buildings — `buildings.ts`, `BuildBar.tsx`

`Building.withdrawnAtIndex?: number`. Past the threshold the building is filtered out of the
build bar. Placed nodes keep running. One line of data, one filter, one Coach line when it
fires — and it buys the Mac Studio 512GB moment described in §A4.

## C4. On-site audit — `recipes.ts`, `simulate.ts`

```ts
requiresOnSite?: { tier: Building['tier']; count: number };
```

Contracts with it count placed, enabled, non-broken machines of that tier and report
`audited` when short. Reuses the existing status; its label widens from "Security hold" to
"Audit hold". About eight lines, and it is what makes the SME contracts (§A9) mean anything.

## C5. Broken nodes — `types.ts`, `simulate.ts`, `factory.ts`, `MachineNode.tsx`

- `Machine.broken: boolean`
- `MachineStatus` gains `'broken'` → label "Blown", colour red
- `Recipe.failureRatePerMin?: number`, rolled per tick exactly like the breach roll
- `repairMachine(state, id)`: costs `0.6 × currentCost`, 30s of downtime

A broken node supplies nothing, produces nothing, fails every on-site audit it counted
toward, and **still bills `monthlyCost`** until the player disables or repairs it. That last
detail is the point.

## C6. Group nodes — `types.ts`, `factory.ts`, `Canvas.tsx`

- `Machine.groupId?: string`
- `groupMachines(state, ids)` / `ungroup(state, groupId)`
- A blowout breaks every node sharing the `groupId`
- Canvas draws a rounded hull behind grouped nodes; dragging any member drags the group

## C7. Recipe-level compute supply — `recipes.ts`, `simulate.ts`

`Recipe.computeSupply?: number`, overriding the building's when present. The BYO Rack Bay
needs it: one chassis, twelve builds (four GPUs × three PSU grades), each supplying a
different throughput. Two lines in the compute survey.

## C8. Manual crafts — `types.ts`, `simulate.ts`, `factory.ts`, `MachineNode.tsx`

- `Recipe.manual?: boolean`, `Machine.armed?: boolean`
- `MachineStatus` gains `'awaiting'` → "Waiting for you"
- `triggerCraft(state, id): Outcome`; `step()` skips auto-start when `r.manual && !m.armed`

The Generate button belongs on the node on the canvas, not in the inspector — the click
*is* the mechanic.

## C9. Slop index — `types.ts`, `buildings.ts`, `simulate.ts`, `TopBar.tsx`

`Building.slopRisk?: number`, `GameState.slop: number`, summed in the same pass as
`exposure` and `priceIndex`. Top-bar readout.

## C10. Incident table — `simulate.ts`

Generalize the breach roll into one loop over a declared incident table so the breach, the
blowout, the IP fine, the quality miss and the legal fine share a code path. Without it,
five near-identical `Math.random()` blocks accumulate in `step()` and the balance becomes
impossible to reason about.

Each incident declares trigger scope (per-tick / per-craft / per-delivery), a probability
function of state, and an effect. The existing breach becomes row one, which is also how
the refactor is verified: behaviour must not change.

## C11. Contract loss — `factory.ts`, `simulate.ts`

`Machine.strikes: number`. Three quality misses on one contract node removes it. Needs a
prominent toast; a node silently vanishing is a bug report, not a mechanic.

## C12. Content, tiers, save version — `data/*`, `BuildBar.tsx`, `factory.ts`

- `Building.tier` union gains `'Home Lab'`, `'Local Models'`, `'Slop'`; `'Models'` → `'Online Models'`
- `BuildBar.ORDER` updated to match, or the new sections silently vanish
- `validateContent()`: tier assertions per §A2, plus — every recipe with
  `failureRatePerMin` belongs to a repairable building; no `manual` recipe is a milestone's
  only source of a required item; every `requiresOnSite` tier actually exists; every item
  with `priceElasticity > 0` is reachable from a building the player can buy
- `STATE_VERSION` 3 → 4. `loadState` returns `null` on mismatch, so **every existing save
  is discarded.** Current behaviour, acceptable, but it should be a deliberate call.

## C13. Build order

1. **C1** tracks — nothing else can be reached without it
2. **C12** content scaffold — tiers, renames, validator, empty catalogs
3. **C2 + C3** price index, elasticity, dynamic costs, withdrawal
4. Home Lab content §A3, §A5–A7 — Hugging Face, GPU ladder, prebuilts, local models
5. **C4** on-site audit + §A9 SME contracts — *the track starts paying here*
6. **C5 + C6 + C7** broken nodes, groups, recipe compute supply
7. Home Lab parts chain §A8, rack §A10, milestones §A11
8. **C8** manual crafts
9. Slop content tiers 1–2 §B2–B3
10. **C9 + C10 + C11** slop index, incident table, contract loss
11. Slop tier 3 §B4–B5
12. `npm run card` — regenerate the reference card, republish to the existing artifact URL

**Steps 1–5 are the smallest shippable slice** and they are a complete product on their
own: a price index that climbs while you play, a GPU ladder, local models at zero marginal
cost, and SME customers who will only buy from hardware you own. If scope needs cutting,
cut from step 8 down and ship Addon A alone.

---

## D. Balance risks

**The free-inference hole.** Local models have `cost: 0` per craft. If the player can place
enough of them, marginal cost across the factory goes to zero and the main game's central
tension evaporates. The brakes are: kTPM supply hard-capped by hardware bought outright;
high `computeDraw` relative to output; rigs billing `monthlyCost` whether busy or not; and
now the price index, which makes each additional rig cost more than the last. **This wants
a headless run before anything else in the addon is tuned.**

**The price index is the riskiest number in the plan.** Set the curve too steep and the
player is locked out of the hardware the track is about; too shallow and the mechanic is
decoration. Milestone-weighting means it also couples to main-track pacing, so tuning one
moves the other. Ship it behind a `BALANCE` constant that can be set to `priceIndexMax: 1`
to disable the whole system, and playtest both.

**Delisting can strand a player.** If the Mac Studio 512GB is the only route to a milestone
requirement and it withdraws before the player can afford it, the run is dead with no error
anywhere. `validateContent()` must assert that **no withdrawn building is the sole producer
of any item a milestone requires.** DeepSeek-R1 Local is the specific hazard: it must remain
reachable via the DGX Station and the Homelab Rack.

**The Homelab Rack is still too good.** $0.13/kTPM/mo against the rented H100's $0.63.
Justified in reality, but if it stacks freely it obsoletes Act III capacity. Mitigations: a
placement cap of 2, framed as the electrical panel in a residential building; a
`failureRatePerMin` no rented node carries; and the index, which inflates the rack's capex
while leaving rented capacity flat.

**SME contracts may over-fund Act II.** Regional MSP at $6,400 per 45s is Act III money
arriving in Act II. Either the payout drops or HL-4 gates later. Watch for the degenerate
line: six gaming PCs, one MSP contract, and no reason to ever touch the main game again.

**Slop cash-outs the early game.** Content Mill Order at $340 per manual craft may hand a
player enough cash in Act I to skip the cost-optimization lesson entirely.

**Manual clicking is a trap if it is optimal.** If Route 1 beats Route 2 at any point past
the tier-2 milestone, the addon rewards clicking over building — the opposite of the
intended lesson. The crossover point is the single number in Addon B most worth testing.

**Three new readouts, one top bar.** Exposure, Slop, price index, compute, burn, revenue,
COGS and cash. The top bar needs a second row or a collapse before this ships.

---

## E. Open questions

1. **Should Home Lab be discoverable, or offered?** Nothing in the current UI announces a
   parallel track. A track selector on the milestone panel is the cheap answer; a Coach line
   at `ms_pmf` is the better one.
2. **Does the price index apply to the main game's hardware too?** The colo rack, the
   datacenter and the silicon branch are all made of the same DRAM. Applying it there is
   more honest and considerably harder to balance, since Act III capex is already the
   largest number in the game. Suggested resolution: apply it at a low elasticity (0.15) to
   Act III capacity only, and not at all to the silicon branch, which sells into the
   shortage rather than buying from it.
3. **Should the index ever fall?** Every forecast in the sources says relief is not expected
   before late 2026 at the earliest and a return to 2024 levels is unlikely inside 18
   months. A monotonic index is defensible and much simpler. A late-game dip would be a
   nice surprise and a balance nightmare.
4. **Repair versus rebuild.** Cash is simpler; rebuilding from parts is better teaching and
   requires the player to hold spare components in a buffer — a genuinely new supply-chain
   behaviour, and possibly the best thing in Addon A.
5. **Does taking the slop track visibly cost you the main track?** The coupling is currently
   implicit, through Exposure. It may want to be explicit: a warning on the NSFW Studio
   naming exactly which contracts it will lock.
6. **Should abliteration be buildable at all?** It is real, published and freely
   reimplemented, and the game's posture is that it names real things. The counter-argument
   is that a node called Abliteration Rig with a large payout reads as endorsement rather
   than description. Suggested resolution: keep it, and let `dataRisk: 6` and the
   legal-fine table carry the argument — the game already does this with DeepSeek.
7. **Is the DGX Station worth including?** At an estimated $79,000 it is the only unsourced
   price in the addon, and the ladder reads fine without it.

---

## G. What changed during the build

Eight things the plan got wrong, found by building it.

1. **Capacity nodes cannot eat their own hardware.** The BYO Rack Bay was specced with the
   rig, GPU and PSU as *inputs* on a 1-second cycle — it consumed an entire PC every second.
   They are **catalysts** now (§G.2), held and never spent.

2. **The engine had no concept of a held-but-not-consumed input.** Local models need their
   weights present without using them up, and a node cannot link to itself, so the
   "emit the weights back out" idiom deadlocks once the output buffer fills. Added
   `Recipe.catalysts`. This also fixes the same latent deadlock in the pre-existing
   `serve_local` and `serve_airgap` recipes.

   The exception is `c_api`: the endgame milestone counts `frontier_model` **delivered**,
   and only `inputs` count as delivered, so making it a catalyst quietly made the last
   milestone in the game unwinnable. It keeps the original in-and-out form, and
   `validateContent()` now has a check for exactly this mistake.

3. **A zero-payout contract is invisible to a truthiness check.** `Post To Feed` pays $0 by
   design, and three separate places tested `r.payout &&` — so the validator called the slop
   track circular, the board would not quote it, and the Coach could not explain it. All
   three now test `r.payout !== undefined`.

4. **The on-site audit counted shops as hardware.** Every Home Lab building shares one tier,
   so the Hugging Face Hub satisfied "1 machine on site" and the audit never failed.
   `onSiteCount` now counts **capacity** nodes only.

5. **The failure rates were about 25x too rare.** At the specced 0.9%/min a budget PSU had a
   mean time to failure of 111 minutes — most players would never see one. Retuned to
   0.22/min: measured mean 186s across 12 runs, against 0 failures in 12 runs of 30 game-
   minutes for the Gold unit. The lesson now lands inside one session.

6. **Strikes needed to be a reputation, not a tally.** As specced they never decayed, so
   every slop contract eventually died to chance alone however well it was run. A clean
   delivery now works one off (1-in-6). That first swung too far — contract loss stopped
   happening at all — so `qualityMissRateAt100` went to 1.2, putting the drift threshold at
   Slop ≈ 35, which is roughly the whole content stack running at once. Measured across 10
   runs: low slop 0/10 contracts lost, medium 1/10, high 3/10.

7. **A rig repairs as one unit.** Repairing node-by-node through six pieces of collateral is
   busywork, not a decision. `repairMachine` quotes and repairs the whole group.

8. **The Managed On-Prem contract had no local route to its own inputs.** It asks for
   `verified_answer`, and every producer of `answer` is an Online Models node — so the
   contract whose entire premise is "our data cannot leave the building" could only be
   satisfied by sending data out of the building. The local path existed
   (`onprem_answer → sovereign_answer → verified_answer`) but unlocked two milestones and
   a whole act too late.

   Fixed by adding **`verify_onprem`** on the eval gate — `onprem_answer ×6 →
   verified_answer ×4`, $14, unlocked at HL-2 alongside the contract, with `eval_gate`
   itself added to that milestone so a pure-homelab run can reach it. An eval harness is
   your own code checking your own output; it calls nobody, so grading on-prem work is
   honestly local. The stingier yield (6-in, 4-out against `verify`'s 5-in, 4-out) is the
   smaller model failing more of its own checks.

   **It does not widen the free-inference hole.** Measured API spend per verified answer:
   local $3.50, cheapest online cascade (Luna draft → Luna judge → verify) $2.88, Sonnet
   route $6.50. Local lands *between* them — it is not the cheap option, it is the only
   option with the right provenance, and it costs capex the rented routes do not. That is
   also true outside the game: local inference in 2026 does not beat the cheapest API tier
   on price.

Also corrected: the NSFW Studio's description claimed 9 Exposure locks Mid-Market through
Federal. Measured, the full ladder lands at 15–18 — over the ceiling on Health/Finance and
Federal, level with Enterprise, and *under* Mid-Market. The description now says that.

### Verified by headless run

| | Result |
|---|---|
| Home Lab chain end to end | 30 `onprem_answer` delivered in 150s, SME contract paying |
| On-site audit | `running` → sell the rig → `audited` → replace → `running` → blow it up → `audited` |
| Budget vs Gold PSU | 12/12 runs blew (mean 186s) vs 0/12 over 30 game-minutes |
| Price index | ×1.00 → ×3.24 on progress; API tiers flat; DDR5 $95 → $399 |
| Mac Studio 512GB | placeable at ×3.0, refused at ×3.5 |
| Slop tier 1 | delivers to the tree, net cash **negative** |
| Manual crafts | node sits `awaiting`, one craft per press |
| NSFW ladder | +$27k mean over 15 game-min at a $300k bankroll, with breaches and fines firing |
| Parallel tracks | all three advanced in one tick |
| Managed On-Prem, pure local | paid out with **zero** online nodes placed |

---

## F. Sources

Component pricing and the 2024 → 2026 shortage:

- [32GB of DDR5 now costs $375 minimum — AI shortage continues to squeeze PC building](https://www.tomshardware.com/pc-components/ddr5/32gb-of-ddr5-now-costs-usd375-minimum-ai-shortage-continues-to-squeeze-pc-building) — Tom's Hardware
- [RAM price tracking 2026](https://www.tomshardware.com/pc-components/ram/ram-price-index-2026-lowest-price-on-ddr5-and-ddr4-memory-of-all-capacities) — Tom's Hardware
- [DDR5 Memory Prices Up 5x in a Year](https://xenospectrum.com/en/ddr5-prices-5x-ai-hbm-memory-shortage-2026/) — XenoSpectrum
- [The NVMe Shortage Nobody Budgeted For](https://datastorage.com/articles/the-nvme-shortage-nobody-budgeted-for-why-storage-prices-tripled-and-what-to-do-before-2027/) — Data Storage
- [SSD Prices Double as NAND Shortage Hits Gaming PCs](https://tech-insider.org/ssd-prices-nand-shortage-2026/) — Tech Insider
- [Power supplies and CPU coolers may be next for price increases (6–10%)](https://videocardz.com/newz/power-supplies-and-cpu-coolers-may-be-next-for-price-increases-distributor-letter-claims) — VideoCardz
- [PSU and CPU cooler prices to rise in 2026, distributor warns](https://overclock3d.net/news/misc/psu-and-cpu-cooler-prices-to-rise-in-2026-distributor-warns/) — OC3D

GPUs:

- [Nvidia doubles RTX PRO 6000 Blackwell's MSRP to a staggering $16,000](https://www.tomshardware.com/pc-components/gpus/nvidia-doubles-rtx-pro-6000-blackwells-msrp-to-a-staggering-usd16-000-96gb-card-started-pre-orders-below-usd8-000-last-year) — Tom's Hardware
- [NVIDIA's 96GB RTX PRO 6000 Blackwell price hits $13,250](https://wccftech.com/nvidia-96-gb-rtx-pro-6000-blackwell-price-hits-13250-over-50-percent-hike/) — Wccftech
- [NVIDIA RTX PRO 6000 Blackwell pricing, September 2026](https://www.thundercompute.com/blog/nvidia-rtx-pro-6000-pricing) — Thunder Compute
- [A used RTX 3090 is still the best GPU for local AI in 2026](https://www.xda-developers.com/used-rtx-3090-still-best-for-local-ai-in-value/) — XDA
- [RTX 3090 price history and specs](https://bestvaluegpu.com/history/new-and-used-rtx-3090-price-history-and-specs/) — BestValueGPU

Prebuilt machines:

- [Apple pulls $4,000 512GB Mac Studio upgrade option as AI RAM squeeze continues](https://www.tomshardware.com/tech-industry/apple-pulls-512-mac-studio-upgrade-option) — Tom's Hardware
- [Apple removes 512GB memory option from Mac Studio M3 Ultra](https://videocardz.com/newz/apple-removes-512gb-memory-option-from-mac-studio-m3-ultra) — VideoCardz
- [Nvidia DGX Spark gets $700 price hike as memory shortages bite](https://www.tomshardware.com/desktops/mini-pcs/nvidia-dgx-spark-gets-18-percent-price-increase-as-memory-shortages-bite-founders-edition-now-usd4-699-up-from-usd3-999) — Tom's Hardware

SME on-premise demand:

- [On-Premise LLM Deployment](https://www.truefoundry.com/blog/on-prem-llms) — TrueFoundry
- [LLM Deployment in Regulated Industries: the HIPAA, SOC2 & GDPR playbook for 2026](https://www.truefoundry.com/blog/llm-deployment-in-regulated-industries-hipaa-soc2-and-gdpr-playbook-for-2026) — TrueFoundry
- [Private LLM Deployment: Enterprise Self-Hosted AI](https://petronellatech.com/blog/private-ai-deployment-guide-enterprise/) — Petronella
- [GDPR for Small Businesses](https://www.recordinglaw.com/world-laws/world-data-privacy-laws/eu-data-privacy-laws/gdpr-for-small-businesses/) — Recording Law
