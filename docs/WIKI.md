# AIfor.study — Player Wiki

Everything you need to play, in the order you will need it. This is the
hand-written companion to the [Field Guide](reference-card.html), which is
generated from the content files and lists every node, recipe and price
exactly. When the two disagree, **the Field Guide is right** — it is derived
from the same data the game runs on.

Two other docs exist and are for designers, not players:
[`CONTENT-SPEC.md`](CONTENT-SPEC.md) (the Act I–III design) and
[`ADDONS-SPEC.md`](ADDONS-SPEC.md) (the Home Lab and AI Slop builds).

**Current content:** 57 items, 125 buildings, 160 recipes, 24 milestones across
3 tracks, 16 contract types, 5 optional addons.

---

## Contents

1. [The premise](#1-the-premise)
2. [Your first five minutes](#2-your-first-five-minutes)
3. [Nodes, links and recipes](#3-nodes-links-and-recipes)
4. [Compute and rate limits](#4-compute-and-rate-limits)
5. [Money](#5-money)
6. [Contracts and the marketplace](#6-contracts-and-the-marketplace)
7. [Exposure and breaches](#7-exposure-and-breaches)
8. [The tech tree — three acts](#8-the-tech-tree--three-acts)
9. [Track: Home Lab](#9-track-home-lab)
10. [Track: AI Slop](#10-track-ai-slop)
11. [Addon: Agentic Ops](#11-addon-agentic-ops)
12. [Addon: ESG & Footprint](#12-addon-esg--footprint)
13. [Addon: Venture Capital](#13-addon-venture-capital)
14. [Reference tables](#14-reference-tables)
15. [Playing well](#15-playing-well)
16. [Controls](#16-controls)

---

## 1. The premise

You are running an AI company. You place nodes on a canvas, wire them
together, and a live simulation runs the business: nodes consume inputs, craft
over time, burn API spend per call, draw throughput against a rate limit, and
sell finished work to customers who audit what you route through.

It is a factory game whose map is not a supply chain but the actual shape of
the industry. The translations that matter:

| If you know factory games as… | Here it is… |
| --- | --- |
| Power | **Compute** — thousands of tokens per minute (kTPM), and it is *per provider* |
| Generators | **Capacity** — API tiers, rented GPUs, machines you own, a datacenter |
| Extractors | **Demand** — a landing page, ad spend, a support desk, documents |
| Sinks | **Contracts** — customers with a payout and an audit |
| Brownout | **A 429** — you do not go dark, you get slower |

The arc is three acts. You start as a thin wrapper around somebody else's
model. You become a platform. Then you fork: become a lab that owns its own
weights, become a supplier that owns its own silicon, or do both and close the
loop.

Every node's description carries a real, sourced figure. The economy is scaled
for playability; the ratios between providers are not.

**One unit = 100 operations.** A unit of any `data` item stands for 100 real
requests at roughly 10k in / 2k out tokens, so every dollar figure you see is
the published price of 100 such calls. Real per-request costs are fractions of
a cent and would read as noise.

---

## 2. Your first five minutes

You start with **$2,000** and four unlocked nodes: a Landing Page, GPT-5.6
Luna, a Consumer App, and a Free Tier.

### The opening chain

Place them left to right and wire them in this order:

```
Free Tier  ──(supplies 150 kTPM to ONE provider)
Landing Page ──user requests──> GPT-5.6 Luna ──draft answers──> Consumer App
```

1. **Place the Free Tier first.** Every node draws throughput. With no
   capacity node at all, everything runs at a 429 and nothing moves. After you
   place it, **pick a provider** — a Free Tier supplies nothing until you do.
   Choose **OpenAI**, because Luna is an OpenAI model.
2. **Landing Page** ($120, no monthly). Runs `organic`: nothing in, 3 user
   requests out, every 6 seconds.
3. **GPT-5.6 Luna** (free to place). Set its recipe to `d_luna`: 4 user
   requests in, 4 draft answers out, 5 seconds, **$1.76 of API spend per
   craft**.
4. **Consumer App** ($100). Runs `c_consumer_raw`: 8 draft answers in, nothing
   out, **$9 paid** every 12 seconds. Exposure ceiling 90 — very forgiving,
   which is the point of a consumer product.

Drag a coloured **output dot** onto a matching **input dot** to run a link.

### The first thing that will go wrong

One Landing Page makes 30 user requests a minute. One Luna node eats 48 a
minute. **A single source starves a single model node.** You need roughly two
Landing Pages per model node, or the model sits idle half the time reading
*Starved*. The coach will tell you this; it is still the most common early
stall.

### The first milestone

**First Users** wants 40 draft answers *delivered into a contract*. Producing
them is not enough — milestone progress records contract **inputs**, so a
thousand answers piling up in a buffer advance nothing. Sell them.

It unlocks Claude Haiku 4.5, Qwen3.7-Flash, API Tier 1, and the entire Home
Lab entry ramp.

### What to do with the next $200

Buy **API Tier 1**. A Free Tier covers exactly **one node** (`servesNodes: 1`)
and you may only ever own one. Put a second node on the same provider and the
allowance stops counting entirely. That cliff is what makes the first paid
tier worth $200.

---

## 3. Nodes, links and recipes

### The five node kinds

| Kind | What it does |
| --- | --- |
| **source** | Recipes with no inputs. Demand, documents, open weights, parts, GPUs. |
| **factory** | The normal case. Consumes inputs, emits outputs. |
| **capacity** | Supplies throughput in kTPM. Exempt from throttling — a capacity node never runs slow because capacity is short. |
| **contract** | A customer. Consumes deliverables, pays money, emits nothing. |
| **agent** | Agentic Ops only. Produces nothing, pays nothing, acts on the game itself. |

A building is a **chassis**. What it *makes* comes from the recipes that target
it, so one chassis often hosts many recipes — GPT-5.6 Luna can draft answers
(`d_luna`) or judge draft answers into finished ones (`j_luna`), and you choose
which per node.

### Links

A link carries **240 units per minute** (4/sec). That is the ceiling on every
connection in the game, regardless of what it carries.

When several links share one source output, the source **splits its output
proportionally to how much room each destination has**. A backed-up destination
therefore stops pulling and the others get more, which is usually what you
want and occasionally a trap.

### Buffers

Every input and output buffer holds **400 units** of an item. A full output
buffer blocks the node: it will not start another craft with nowhere to put the
result. *Blocked* on a node almost always means the thing downstream is too
slow or is not wired up.

### Catalysts

Some recipes need an item present but do not consume it. Model weights are the
main case: serving a quantized model requires a Quantized GGUF sitting in the
input buffer, and it is still there afterwards. Weights are a tool, not an
ingredient.

### Clock

Each node has a clock from **0.25× to 2.5×**. Overclocking is deliberately
expensive: compute draw scales as `clock ^ 1.6`, so running a node at 2× costs
about 3× the throughput. Underclocking a node you cannot feed is a real way to
cut its draw.

---

## 4. Compute and rate limits

Throughput is measured in **kTPM** — thousands of tokens per minute. It is not
FLOP/s, on purpose: Tier 1 = 500k TPM and Tier 5 = 40M TPM are published,
citable figures, and nobody sells FLOPs on an API.

### Limits do not pool

This is the single most important mechanic in the game.

**Every provider has its own pool.** An OpenAI Tier 5 buys you nothing on
Anthropic. Each model node draws on *its own vendor's* pool, and a
vendor-scoped capacity node (Free Tier, API Tiers, Batch Lane) serves **one**
provider, picked after you place it.

Ten vendors are modelled: OpenAI, Anthropic, Google, xAI, Mistral, DeepSeek,
Alibaba, Zhipu, Moonshot, MiniMax.

### The shared pool

Everything you run yourself draws on a single **shared** pool: retrieval,
evals, agents, self-hosted serving, the silicon branch, the Home Lab. It starts
at **600 kTPM** of ordinary servers and grows with the Prompt Cache and any
hardware you rent or own.

Hardware capacity — rented H100s, a colo rack, your own datacenter, a Gaming PC
— is *not* vendor-scoped. It feeds the shared pool, because your own machines
genuinely are fungible across your own workloads.

### What happens when you run short

Nothing cliffs. Each pool computes `satisfaction = supply / demand`, capped at
1, and every non-capacity node in that pool runs at `clock × satisfaction`.
Measured behaviour: satisfaction 0.47 gives 12 answers/min where full speed
gives 25; 0.16 gives 9; 0.08 gives 0. It degrades.

Because satisfaction is per-pool, **a starved OpenAI pool does not slow your
Anthropic nodes down**. Check which pool is tight before buying capacity.

---

## 5. Money

You start with **$2,000**. There are three ways money leaves you and one way
it arrives.

### Out: one-off place cost

Paid when you place a node. Deleting one refunds **50%**.

### Out: monthly cost

Charged continuously at `monthlyCost / 300` per game-second. **A billing month
is 300 game-seconds — five game-minutes.** A $25/mo plan really does bill about
8¢ a second. This is what makes an idle node genuinely expensive: subscriptions
do not care whether you wired it up.

### Out: per-craft API spend

Recipes carry a `cost`, debited the moment a craft **starts**. This is the
line that makes gross margin something you watch decay in real time. A node
with no cash reads **Out of cash** and simply stops.

### In: contract payouts

All income comes from contracts. Item `value` is a **reference price, display
only** — routing an expensive item somewhere generic is not an exploit, it just
does nothing.

### Milestones pay a quarter

`milestoneRewardMultiplier` is **0.25**, so clearing a milestone hands you a
quarter of its authored `reward` in cash. That is a grant, not a living: the
rest has to come out of contracts — or, with the Venture Capital addon on, be
raised against the milestone you just cleared, which offers **three times** the
full reward for a slice of revenue.

---

## 6. Contracts and the marketplace

**You cannot buy a customer off a shelf.** Contract chassis are not stocked in
the build bar. A lead turns up on the marketplace board, gives you a window to
sign, and walks if you miss it. The board is your pipeline and the only place
a contract node can come from.

### How the board behaves

| Knob | Value | Meaning |
| --- | --- | --- |
| Leads per minute | 0.8 **per unlocked contract type** | Your pipeline widens as you climb the ladder |
| …but never below | 1.5/min | So the opening board is not empty while the game tells you to go sell |
| Empty board | 6/min | Nothing in this game should be waiting on a die roll with no work to do |
| Slots | 3 + 1 per unlocked type, max 9 | |
| Copies of one listing | 3 max | |
| Opening offers | 2 | The board is not empty on turn one |
| Pity timer | 240s, up to 4× | A listing that has not been drawn in a while gets a multiplier |

**Rarity is derived from draw weight**, so the label and the odds cannot
disagree.

**Big deals stay open longer, not shorter.** The median B2B sales cycle is 84
days and rising, and that window is the only way you can save up for a $2M
lead. Every listed window is multiplied by **2** in play — a Consumer App lead
authored at 100s is actually signable for 200s.

### The contract ladder

Payout, exposure ceiling, and what it takes to run one. `Fp` is the ESG
Footprint ceiling and only applies with that addon on.

| Contract | Needs | Cycle | Pays | Max Exposure | Max Fp |
| --- | --- | --- | --- | --- | --- |
| Consumer App (raw) | 8 draft answers | 12s | $9 | 90 | — |
| Consumer App | 6 answers | 12s | $17 | 70 | — |
| SMB Pilot | 8 verified answers | 16s | $56 | 45 | — |
| Mid-Market SaaS | 20 verified + 1 SOC 2 | 30s | $270 | 30 | 72 |
| Enterprise | 24 verified + 4 agent runs + 1 ISO 42001 | 40s | $1,050 | 18 | 55 † |
| Enterprise (agentic) | 6 agent workflows + 1 ISO 42001 | 40s | $1,800 | 18 | 55 † |
| Health / Finance | 40 verified + 1 HIPAA BAA + 1 SOC 2 | 45s | $5,400 | 10 | 42 † |
| Federal / DoD | 60 sovereign answers + 1 FedRAMP | 60s | $22,000 | 4 | 30 † |
| Hyperscaler (chips) | 40 packaged GPUs | 25s | $1,500,000 | — | — |
| Hyperscaler (racks) | 1 NVL72 rack | 30s | $3,100,000 | — | — |
| API Platform | 1 frontier model ‡ + 300 sovereign answers | 60s | $11,000,000 | 20 | 50 † |

† also requires a currently-valid ESG disclosure on file.
‡ the frontier model is a catalyst — it comes back out.

Home Lab and AI Slop have their own ladders; see those sections.

### Contracts run a term, then freeze

**A contract is a term, not a marriage.** When it runs out the node freezes
where it stands: it stops delivering and stops paying, but keeps its position,
its links and its buffers. Re-signing costs **25% of what the chassis costs to
place today** — at today's price index, not what you paid originally — and it
picks up mid-chain.

Term length follows **what the deal pays**, on a log scale, because payouts
span six orders of magnitude. Each 10x on the cheque buys about 0.85 more
billing months of runway:

| Contract | Pays | Term |
| --- | --- | --- |
| Post To Feed | $0 | **never expires** |
| Consumer App | $17 | 5.2 min |
| SMB Pilot | $56 | 7.4 min |
| Mid-Market SaaS | $270 | 10.3 min |
| Enterprise | $1,800 | 13.8 min |
| Federal / DoD | $22,000 | 18.5 min |
| API Platform | $11M | 29.9 min |

So the cheap high-volume work comes back around constantly and the rare deals
are stable — which is the right way round, because a $2M lead you had to save
up for should not evaporate while you are still wiring it.

**A contract that pays nothing has no term.** Post To Feed is the case: it is
not a customer, it is you posting into the void, and putting that on a renewal
clock would charge rent on a lesson.

### Human Ops — the early answer to renewals

Contracts start freezing about five minutes in, long before you can afford an
agent to handle it. The **Human Ops Desk** ($1,200, $260/mo, unlocked at
**First Users**) is a desk with people at it: every 90-second cycle it wins
back whichever contract has been frozen longest, paying the same 25% fee you
would pay by hand.

It needs **no addon, no console and no agent runs** — just a salary. That is
the whole comparison:

| | Human Ops Desk | Support Agent |
| --- | --- | --- |
| Unlocks at | Milestone 1 | Act II, milestone 9 |
| Costs | $1,200 + $260/mo | $8,000 + $1,400/mo |
| Needs | nothing | Agentic Ops addon, a console, a headcount slot, agent runs |
| Speed | one account per 90s | every eligible account, the tick a term ends |

The desk carries a **labour load of 4**, so it is the first thing most players
own that registers on the ESG addon's Social pillar — and a **labour dispute
stops it dead** while your agents carry on working. The meter computes that
number whether or not the addon is on, so switching ESG on later shows you
something that was already true.

**A frozen contract never disappears.** It sits on the canvas, wired as you
left it, until you re-sign it or demolish it. A term ending is not the same
event as a customer walking out — and not renewing already costs you
everything the contract was earning.

**Churn ends a contract the same way.** With the Agentic Ops addon on, a live
contract nobody is looking after can walk — 4% a minute, less loyalty — and
when it does, the node freezes exactly as an expired one does. You win the
customer back for the same quarter-price fee. Note that loyalty caps at 85%,
never 100%, so even a contract you are serving perfectly carries a small
residual chance; that is why it costs you revenue rather than your factory.

The one thing that still removes a contract outright is **three quality
strikes**, on **Slop contracts only** — the recipes carrying a slop sale.
There the strike is a rolling reputation that decays with clean deliveries,
and running out of patience really does lose you the customer for good.

### Exposure ceilings are the real gate

A contract **refuses to run** above its ceiling and reads **Security hold**
rather than a green *Running*. It pays $0 while held. This is what makes the
cheap Chinese providers a genuine decision rather than a free win: DeepSeek is
frontier-class at a tenth of the price and carries 8 points of `dataRisk`
each, so eight DeepSeek nodes put you at exposure 64 and every contract above
SMB Pilot stops.

---

## 7. Exposure and breaches

**Exposure** is the sum of `dataRisk` across every enabled node that has a
recipe assigned. Risk is **architectural** — wiring DeepSeek in exposes you
whether or not it is mid-craft. You cannot dodge it by pausing.

Controls carry **negative** risk, so the counter-play costs money rather than
being a toggle:

| Control | Exposure | Cost |
| --- | --- | --- |
| Observability | −5 | $600 + $199/mo |
| Air-Gapped Deploy | −6 | $45,000 + $18,000/mo |
| FedRAMP Program | −4 | $900,000 + $25,000/mo |
| SOC 2 / ISO 42001 Program | −3 each | $30,000 / $85,000 |
| vLLM Server | −3 | $3,000 |
| Eval & Guardrails | −2 | $800 + $29/mo |

### The breach roll

```
probability per minute = 2.4 × (exposure / 100)²
```

Quadratic on purpose: a little risk is survivable and a lot is not. Exposure
20 is roughly one breach every ten minutes; exposure 64 is about one a minute.

A breach takes **12% of your cash** (minimum $500) and puts **every contract on
a 20-second security hold**. The cash hit scales, so it hurts a large company
as much as a small one.

---

## 8. The tech tree — three acts

The unlock tree is laid out as a **horizontal timeline**, one column per era,
with a tab per track. A milestone completes once the listed amounts have been
**consumed by contract recipes** — sold, not merely produced. Milestones
complete in order, and only the next incomplete one on each track is active.

The three tracks advance **in parallel**. Taking one never stalls another.

### Act I — The Wrapper

One model, one contract, negative margin if you are careless.

| # | Milestone | Requires | Opens |
| --- | --- | --- | --- |
| 1 | **First Users** | 40 draft answers | Haiku, Qwen Flash, API Tier 1, the whole Home Lab ramp |
| 2 | **Product-Market Fit** | 80 answers | Ad spend, support desk, Sonnet, Mistral, Eval Gate, SMB Pilot, the Slop ramp |
| 3 | **Shipping Quality** | 60 verified answers | Document Ingest, Chunker, Embedder, pgvector, API Tier 3, GPT-5.6 Terra |

The lesson: a judge model on top of a cheap one still beats frontier tokens by
about 6×. Businesses will not buy raw model output.

### Act II — The Platform

| # | Milestone | Requires | Opens |
| --- | --- | --- | --- |
| 4 | **Retrieval** | 220 verified answers | Search API, Pinecone, Prompt Cache, Observability, Grok, SOC 2 Program, Mid-Market |
| 5 | **The Security Review** | 4 SOC 2 | turbopuffer, DeepSeek Flash, and the ESG entry ramp |
| 6 | **Frontier Reasoning** | 600 verified answers | Gemini Pro, Opus, API Tier 5, MCP, agent harness, ISO 42001, Enterprise |
| 7 | **Agents In Production** | 60 agent runs | GPT-6, Claude Fable, Multi-Agent Graph, the Agent Ops console and first three agents |
| 8 | **The Cheap Provider** | 4 ISO 42001 | DeepSeek V4 Pro, GLM, Kimi, Batch Lane |

Certification is not overhead here — it is the sales motion. The median B2B
sales cycle is 84 days and the delay is due diligence.

Milestone 8 is the game asking you a real question. DeepSeek V4 Pro is
frontier-class at a tenth of the price, stored in the PRC, banned by a dozen US
states, and will cost you every contract with a low Exposure ceiling.

### Act III — The Fork

Two branches that feed each other. **Lab** is owning the weights; **Fab** is
owning the silicon.

| # | Branch | Milestone | Requires | Opens |
| --- | --- | --- | --- | --- |
| 9 | Lab | **Own The Weights** | 40 agent workflows | Weights mirror, rented H100s, fine-tuning, vLLM, FedRAMP, Federal, senior agents, ESG audit |
| 10 | Lab | **Sovereign Inference** | 200 sovereign answers | HIPAA, Health/Finance, air-gapped deploy, B200 pods, renewable PPA |
| 11 | Lab | **Cleared** | 4 HIPAA BAA + 800 sovereign answers | — |
| 12 | Fab | **Going Upstream** | 4 FedRAMP | Polysilicon, wafer fab, HBM stacking, die test |
| 13 | Fab | **The Chokepoint** | 3,000 sovereign answers | EUV lithography, CoWoS packaging, rack integration, colo, Hyperscaler |
| 14 | Fab | **Vertical Integration** | 400 packaged GPUs | Own Datacenter, Pretraining Cluster |
| 15 | Fab | **Frontier Lab** | 12 NVL72 racks | API Platform |
| 16 | Endgame | **Takeoff** | 3 frontier models | — |

Sovereign answers are produced on hardware you control and never leave your
perimeter. Health and defence buy **only** this, and they pay roughly 180× what
a consumer does.

The chokepoint is real: one company on earth makes EUV scanners, and one
process packages the result.

---

## 9. Track: Home Lab

*On by default. Four milestones, parallel to the main spine.*

**The lesson:** buy the hardware instead of renting the rate limit, and
discover that capex is not the same as free. Per-token cost goes to zero. What
you bought instead is a card whose replacement price is already climbing, a
power supply that can take the rig down with it, and — with **ESG & Footprint**
switched on — a metered electricity bill that arrives whether or not the
machine is doing anything.

Home lab machines carry **no `monthlyCost` of their own**. Their running cost
is electricity, and electricity is the ESG addon's job: `powerKw` times the
grid price, which climbs as you build out. With that addon off, hardware you
own is genuinely free to keep — the trade is capex, breakage and the index.

| # | Milestone | Requires | Opens |
| --- | --- | --- | --- |
| 1 | **Weights On Your Desk** | 150 draft answers | Mac Mini M4 Pro, Qwen3 Local 32B, SME On-Prem Pilot |
| 2 | **The Box In The Corner** | 200 on-prem answers | Parts distributor, PSU shelf, bench build, BYO bay, Framework Desktop, DGX Spark, Managed On-Prem |
| 3 | **Somebody Else's Server** | 900 on-prem answers | Mac Studio 256/512GB, gpt-oss-120b Local, self-hosted Qdrant |
| 4 | **The Rack In The Basement** | 2,400 on-prem answers | DGX Station GB300, Homelab Rack, DeepSeek-R1 Local, Regional MSP |

### The price index

Hardware gets more expensive as you play. A price index rises with your
progress (70% weight) and your buildout (30%), up to a ceiling of **4.2×**, and
each item tracks it by its own `priceElasticity`:

| Item | Elasticity | Why |
| --- | --- | --- |
| 32GB DDR5-6000 | **1.00** | The reference component, by definition — about $95 in mid-2024, $375 minimum by 2026 |
| 2TB NVMe | 0.70 | Consumer NAND fell from 45% of the market to 32% |
| RTX 5090 | 0.39 | $1,999 MSRP, about $4,500 on the street |
| RTX PRO 6000 | 0.27 | $8,565 at launch, $16,000 by August 2026 |
| Used RTX 3090 | 0.22 | It went *up*. Still the best VRAM per dollar you can buy |
| Case & cooling | 0.028 | Copper and tin, not memory. Up 6–10% and no further |
| CPU + motherboard | 0.03 | Logic silicon never joined the shortage |

Some products are **withdrawn from sale** past a given index and leave the
build bar for good. Nodes you already placed keep running, because the people
who bought one still have it. (Apple withdrew the 512GB Mac Studio in March
2026 rather than reprice it — it vanished from the store between the 4th and
the 6th, unannounced.)

### Power supplies matter

Recipes carry a `failureRatePerMin`. A no-name 850W PSU with no ATX 3.1
excursion rating, behind a card that spikes past twice its rating for
microseconds, is the whole of that number. A blown build stops supplying
compute and costs 60% of its value to repair over 30 seconds.

This becomes a revenue problem, not an inconvenience: SME contracts carry
`requiresOnSite` — the customer sends someone to look, and the contract will
not run unless you have enough **working** machines placed.

### The Home Lab contract ladder

| Contract | Needs | Cycle | Pays | Max Exposure |
| --- | --- | --- | --- | --- |
| SME On-Prem Pilot | 10 on-prem answers | 20s | $190 | 65 |
| Managed On-Prem | 30 on-prem + 6 verified | 35s | $1,150 | 45 |
| Regional MSP | 80 on-prem answers | 45s | $6,400 | 32 |

The end of the road is honest about itself: four decommissioned A100s in a
basement rack are the best dollars-per-kTPM in the game, and you cannot scale a
basement to a federal contract.

---

## 10. Track: AI Slop

*On by default. Four milestones.*

**The lesson:** content is trivially cheap to make and worth nothing.
Everything after that is the hard part.

| # | Milestone | Requires | Opens |
| --- | --- | --- | --- |
| 1 | **Content Is Free** | 80 generated text + 30 generated images | Video Gen, Content Mill |
| 2 | **Somebody Pays For This** | 200 generated images | Content Packager, Programmatic SEO, Legal Desk |
| 3 | **Ablated** | 150 content packs | Abliteration Rig, NSFW Studio, Adult Platform |
| 4 | **The Slop Machine** | 400 adult content | — |

Milestone 1 pays nothing and says so. You spend real money generating text and
images, post all of it to a feed, and are paid exactly zero. That *is* the
milestone.

### The Slop Index

Slop nodes carry `slopRisk`, summed into a global Slop Index the same way
`dataRisk` sums into Exposure. It drives four risks:

- **Distraction** — a base 4% chance per craft, plus 0.25% per point of Slop
  Index, that a `slopGenerated` craft produces **nothing at all**.
- **IP fines** — $220 per unit, from takedown notices.
- **Quality misses** — a missed craft pays only 35% of the contract payout,
  and three strikes loses you the contract. Strikes decay at a 1-in-6 chance.
- **Legal action** — 8% of cash (minimum $25,000), plus **+15 Exposure for 60
  seconds**, which will take every gated contract offline at once.

Two nodes push back: the **Legal Desk** (−6 Slop) and, with the ESG addon on,
the **Trust & Safety Desk** (−3 Slop, −2 Exposure).

### Manual crafts

The Content Mill's contract recipe is **manual**: it never auto-starts. One
craft per press of *Generate*, with no way around it. That is your finger on
the button, forever — and it is the argument for building the pipeline you
have been avoiding.

### The Slop contract ladder

| Contract | Needs | Cycle | Pays | Slop risk |
| --- | --- | --- | --- | --- |
| Post To Feed | 10 text + 4 images | 14s | **$0** | 2 |
| Content Mill | 12 text + 3 images (manual) | 10s | $340 | 3 |
| Programmatic SEO | 6 content packs | 26s | $780 | 4 |
| Adult Platform | 20 adult content | 22s | $4,200 | 6 |

The NSFW Studio carries **9 points of Exposure** on its own. Nine points means
the regulated contracts will not take your call. You are choosing one business
over the other, and the game does not pretend otherwise.

---

## 11. Addon: Agentic Ops

*Off by default. A feature addon — it has no track of its own; the nodes
unlock on the main spine at milestones 7 and 9.*

Agents are the first nodes in the game that **produce nothing and pay
nothing**. They consume agent runs — the same units an Enterprise contract buys
at $1,050 a delivery — and spend them acting on the game itself.

### The roles

| Agent | Cost | Monthly | Does |
| --- | --- | --- | --- |
| **Agent Ops Console** | $5,000 | $300 | The hub. Required before any other agent. Max 1. |
| Sales Agent | $3,000 | $600 | Signs matching leads off the board by itself, with your money |
| Marketing Agent | $2,200 | $450 | Skews *which* listings the board draws. Never the rate. |
| Coding Agent | $6,000 | $900 | Builds the producer chain for a signed contract nobody wired up |
| Support Agent | $8,000 | $1,400 | Keeps matching customers from churning — **and re-signs them when their term ends**, out of your cash, without asking. The Human Ops Desk does the same job from milestone 1, slowly and without the addon |
| Reviewer Agent | $10,000 | $1,800 | Oversight: negative Drift, and a veto on a sign you cannot afford |

Senior variants of Sales, Marketing and Coding unlock at milestone 9 and cost
roughly 4–5× as much.

### Headcount

You may run **3 agents**, plus 1 more per 2 milestones cleared. That cap is
what stops the addon from being "place twenty and alt-tab".

### Drift

Every agent acting on its own adds to a global **Agent Drift**. The Reviewer is
the only thing that brings it down. Three thresholds:

| Drift | Effect |
| --- | --- |
| 20+ | **Focus loss** — 1% per point, up to 35%, of agent effort goes nowhere |
| 50+ | **Waste** — 1% per point, up to 30%, of spend produces nothing |
| 80+ | **Runaway** — an agent spends 6% of your cash (min $2,000) on something you did not ask for |

### Churn

This is the part that changes the base game. With the addon on, **contracts
churn**: 4% per minute, reduced by loyalty that builds over 7 minutes to a
maximum 85% reduction, after a 2-minute grace period on a new signing. A
Support Agent watching a customer stops it.

So Agentic Ops is not a pure upgrade. It is overhead you buy, and switching it
on introduces a decay the base game does not have.

The Support Agent is the addon's answer to contract terms: it renews any
account it is watching the moment the term lapses, holding back the same cash
floor a Sales Agent does. Below that floor it declines and the contract stays
frozen — an agent will not bankrupt you to keep a customer.

The Coding Agent will place and wire up to **6 nodes** for a contract you
signed and never built. The Sales Agent will not sign below a cash floor of
$0 — or $25,000 if a Reviewer is watching, which is the Reviewer earning its
salary.

---

## 12. Addon: ESG & Footprint

*Off by default. Nodes unlock on the main spine at milestones 5, 6, 9 and 10.*

Every other meter in the game measures something that lands on your invoice.
This one measures what lands on **somebody else's** — the power, the water, the
land, the people and the provenance the factory has been externalising since
the first Gaming PC — and then charges you for it.

The meter computes whether the addon is on or off. Switching it on mid-run
shows you a number that was already true.

### Three pillars, three shapes of consequence

**Environmental (50% of the headline)** is a bill and a restriction.

- **Power (55% of E)** is priced at a grid index that rises with your own
  buildout, exactly like the hardware index — base $0.09/kWh, up to 3.0×,
  730 hours a month. Cooling sets your PUE: air 1.55, evaporative 1.15,
  closed-loop 1.20, immersion 1.03.
- **Water (25% of E)** is nearly free and gets **rationed** instead. Past a
  threshold, restrictions cut a capacity node to 50% supply for 45 seconds.
  Costs throughput, not cash. Evaporative cooling drinks 1.8 litres per kWh;
  immersion and air drink none.
- **Land (20% of E)** is not billed at all. Past a threshold it simply **stops
  you building** — a 90-second permit freeze.

**Social (20%)** feeds the quality system that already exists. A company
running on unpaid annotation ships worse work and loses customers for it. The
Annotation Co-op ($22,000 + $6,000/mo) is the fix.

**Governance (30%)** is provenance, and it is what the audit reads. Provenance
risk is set **per recipe**, not per chassis — where the training corpus came
from is a choice you make per craft.

### The disclosure, and the lie

This is the spine of the addon. Big contracts gate on the number you
**published**, not the number that is true. Publishing nothing is honest by
default — the gate falls back to your real Footprint. **The lie has to be
chosen.**

| Option | Cost | Time |
| --- | --- | --- |
| Self-certify | $2,000 | Instant |
| Commissioned audit | $45,000 | 60-second observation window |

Then the audit rolls on the **gap** between what you published and what is
true:

```
probability per minute = 3.0 × (gap / 100)²
```

A commissioned audit is not immunity — it is a **0.15× multiplier**, because
the number was true when it was signed. Getting caught costs **14% of cash**
(minimum $20,000) and spikes Exposure by 20, which stops every gated contract
in the same tick.

Measured: publishing 5 against a real 61 was caught in 24 of 40 runs within 90
seconds. An honest filing: 0 of 40.

### Carbon credits are not a fix

$12,000 buys 6 points of relief, capped at 24 total, decaying 1.5 points a
month — and the auditor only allows **35%** of your credit relief. A 2023
investigation into one major registry's rainforest credits concluded the large
majority represented no real reduction, and the auditor has read it.

### The one thing that pays

**Heat Recovery Loop** ($26,000 + $1,200/mo) turns waste heat into a sellable
item, and **District Heat Offtake** buys 10 waste heat for $120 every 18
seconds. Nearly all the electricity a rack draws leaves it again as heat; the
only question is whether anybody catches it.

### The incidents

| Incident | Rolls on | Effect |
| --- | --- | --- |
| Water restriction | Environmental | Capacity node to 50% for 45s |
| Permit freeze | Land past threshold 8 | Cannot build for 90s |
| Labour dispute | Social | Costs 40s of time, not cash |
| Export-control shock | Governance | +0.8 on the hardware price index, decaying over 90s |
| Audit fine | The disclosure gap | 14% of cash, +20 Exposure |

---

## 13. Addon: Venture Capital

*Off by default.*

Milestones never pay cash (see [§5](#5-money)). With this addon on, you can
**raise against each milestone you clear** instead.

### A raise

Never has to be repaid, but it is permanent — a fixed slice of revenue,
forever, taken on at whatever the cap table happened to cost at the time.

| Term | Value |
| --- | --- |
| Capital offered | milestone `reward` × **3** |
| Revenue share | **priced against what the company is worth**, not against which round it is |
| Valuation | `revenue/min × 2,200`, floored at **$120,000** so a pre-revenue round still has a price |
| Share sold | `capital / (valuation + capital)` — post-money, so a round can never sell more than 100% |
| Cumulative share cap | **30%**, plus **2% per milestone cleared** |
| Repayment cap | 2.0× the capital, after which the round retires |

Pricing rounds against the business rather than against a flat percentage is
what stops five small Act I raises from spending the whole cap table before the
two rounds that actually carry money are ever offered. The ceiling grows with
milestones for the same reason: at these capital sizes a round takes thousands
of sim-minutes to repay its cap, so it barely ever retires, and a fixed ceiling
would lock a company out of funding for the rest of the run.

Raising while the company is weak is a **down round**: 1.5× the share, a 3.0×
repayment cap, and +30 Exposure. The game prices your weakness rather than
hiding it.

There is also an on-demand raise outside milestones, starting at $8,000 and
growing 50% per milestone cleared.

### A loan

Comes back to zero, but interest accrues on a clock that does not pause for a
bad quarter the way a revenue share does.

| Term | Value |
| --- | --- |
| Rate | 1% per month |
| Origination fee | 1.5% |
| Term | **18 months** |
| Cap | $5,000, growing 40% per milestone cleared |

Eighteen rather than six: at six, principal alone on a $19,000 draw came to
$633 a sim-minute against an Act II operating income nearer $400, so the bank
was decorative. Eighteen sim-months is still the short end of real venture debt
(24–48), and still short enough that a careless draw is felt inside the act
that took it.

---

## 14. Reference tables

For exact per-node numbers, use the [Field Guide](reference-card.html). These
are orientation tables.

### Items by form (57 total)

| Form | Count | What it is |
| --- | --- | --- |
| **demand** | 4 | What arrives at your door. Worthless until answered. |
| **data** | 14 | The answer pipeline, from draft to sovereign. |
| **model** | 6 | Weights: open, quantized, LoRA, tuned, frontier, abliterated. |
| **paper** | 7 | What auditors want. SOC 2, ISO 42001, HIPAA, FedRAMP, ESG disclosure, carbon credits, takedown notices. |
| **silicon** | 7 | Polysilicon → wafer → die → HBM → packaged GPU → rack. |
| **hardware** | 12 | Parts you buy and assemble. Where the price index bites. |
| **slop** | 6 | Cheap to make, hard to sell. |
| **energy** | 1 | Waste heat. |

The answer ladder, in the order you will build it:

`draft answer` ($0.80) → `answer` ($3) → `verified answer` ($8) →
`on-prem answer` ($11) → `sovereign answer` ($22) → `reasoning answer` ($26) →
`agent run` ($90) → `agent workflow` ($420)

### Buildings by tier (124 total)

| Tier | Count | Notes |
| --- | --- | --- |
| Demand | 5 | Landing page, ads, support desk, doc ingest, search API |
| Online Models | 17 | Ten vendors. `dataRisk` 1–2 for Western labs, 6–8 for Chinese ones |
| Local Models | 4 | Llama 8B, Qwen 32B, gpt-oss-120b, DeepSeek-R1 — all draw the shared pool |
| Home Lab | 15 | Parts, PSUs, prebuilt machines, racks |
| Retrieval | 7 | Chunker, embedder, four vector stores, prompt cache |
| Agents | 8 | Human Ops Desk, MCP, SaaS connectors, harness, multi-agent, evals, observability |
| Agent Ops | 9 | Console + 5 roles + 3 senior variants |
| Slop | 8 | Prompt/text/image/video, packager, legal desk, abliteration, NSFW |
| Compliance | 4 | SOC 2 → ISO 42001 → HIPAA → FedRAMP |
| Sustainability | 10 | ESG addon |
| Capacity | 9 | Free tier → Tier 1/3/5 → batch → rented → colo → datacenter |
| Training | 6 | Weights mirror, curation, fine-tune, vLLM, air-gap, pretraining |
| Silicon | 7 | Polysilicon → EUV → die test → HBM → CoWoS → rack integration |
| Contracts | 16 | Never in the build bar. Signed off the marketplace board. |

### The capacity ladder

| Node | Place | Monthly | Supplies | Scoped? |
| --- | --- | --- | --- | --- |
| Free Tier | $0 | $0 | 150 kTPM, **1 node only**, max 1 owned | Per vendor |
| API Tier 1 | $200 | $0 | 500 kTPM | Per vendor |
| API Tier 3 | $1,800 | $0 | 5,000 kTPM | Per vendor |
| API Tier 5 | $14,000 | $0 | 40,000 kTPM | Per vendor |
| Batch Lane | $900 | $0 | 9,000 kTPM | Per vendor |
| Gaming PC | $1,200 | **$0** | 90 kTPM | Shared |
| Homelab Rack | $22,000 | **$0** | 6,200 kTPM | Shared |
| Rented H100 Node | $0 | $15,100 | 24,000 kTPM | Shared |
| Rented B200 Pod | $0 | $39,600 | 70,000 kTPM | Shared |
| Colo Rack Bay | $250,000 | $42,000 | 130,000 kTPM | Shared |
| Own Datacenter | $380,000,000 | $7,080,000 | 2,600,000 kTPM | Shared |

Plus **600 kTPM** of ordinary servers you always have.

Note the zeroes: hardware you **own outright** carries no subscription. You
paid for the box, and with the ESG addon on its electricity bill arrives
through the footprint meter instead — which is the honest place for it. Rented
and vendor-scoped capacity still bills monthly, because that is what renting
is.

### Key constants

| Constant | Value |
| --- | --- |
| Starting cash | $2,000 |
| Tick rate | 20/sec, fixed timestep |
| Game speeds | 0×, 1×, 2×, 4× |
| Link throughput | 240 units/min |
| Buffer per item | 400 units |
| Demolish refund | 50% |
| Contract re-sign | 25% of today's place cost |
| Contract term | ~0.85 billing months per 10x of payout; $0 payouts never expire |
| Clock range | 0.25× – 2.5×, draw scales `clock ^ 1.6` |
| Billing month | 300 game-seconds |
| Breach rate at exposure 100 | 2.4/min, quadratic below |
| Breach cost | 12% of cash, min $500 |
| Breach freeze | 20 seconds, all contracts |
| Shared pool baseline | 600 kTPM |
| Hardware price index ceiling | 4.2× |
| Grid price index ceiling | 3.0× |
| Autosave | every 10 seconds |

---

## 15. Playing well

### The five things that stall a run

1. **No capacity node.** Everything runs at a 429 and you cannot tell why.
   Place a Free Tier and *pick its provider*.
2. **Starved model nodes.** One Landing Page feeds 30 requests/min; one Luna
   eats 48. Build sources in pairs.
3. **Producing without selling.** Milestones count contract *inputs*. A full
   buffer advances nothing.
4. **Subscriptions on idle nodes.** Monthly cost is charged whether or not the
   node is wired up, every 300 seconds, forever. Delete what you are not using
   — you get half back.
5. **Exposure creep.** You add one DeepSeek node for the margin, then another,
   and at 30 your Mid-Market contract quietly goes to Security hold and stops
   paying. Watch the ceiling, not the average.

### The shape of the economy

- Margin is the whole game in Act I. A judge model on a cheap one beats
  frontier tokens by about 6×.
- Certification is a **sales unlock**, not overhead. SOC 2 opens Mid-Market;
  ISO 42001 opens Enterprise; FedRAMP opens Federal.
- Rate limits are per provider, so **spreading across vendors is a real
  strategy** — it is also how you accidentally end up paying for five tiers.
- Capex versus opex is the Home Lab's entire argument, and it is a genuine
  trade. Rented capacity never inflates. Hardware you own does — and you
  already bought it.
- Every addon that pays well introduces a decay: Slop brings fines and quality
  misses, Agentic Ops brings churn and drift, ESG brings a bill you were
  already incurring, VC brings a permanent slice of revenue.

### Known rough edges

- **Act I pacing is slow** and the source-to-model ratio is unforgiving.
- **The frontier pretraining run needs 3,000 training tokens** against a
  default buffer of 400. The engine raises the cap for that one recipe;
  `validateContent()` reports it as the game's one known content warning.

---

## 16. Controls

- Click a building in the left bar, then click the canvas to place it. Hold
  <kbd>Shift</kbd> to keep placing.
- Drag a coloured **output dot** onto a matching **input dot** to run a link.
- Drag a node to move it, drag the background to pan, scroll to zoom.
- <kbd>Del</kbd> removes the selection, <kbd>Esc</kbd> cancels.
- Keys <kbd>1</kbd>–<kbd>9</kbd> then <kbd>0</kbd> arm the hotbar slots.
- Box selection, copy/paste and port-drag quick building all work on the 2D
  canvas.

### The 3D floor

Use the **2D editor / 3D floor** button to switch views without losing
progress. Drag to orbit, right-drag to pan, scroll to zoom, **Fit factory** to
recenter. Choose a building with **+**, then click the floor to place it. Click
a building to inspect it; <kbd>Shift</kbd>-drag moves it. Select an output
under **Connect**, then click its destination to create a belt. Requires WebGL2;
its labels are currently English-only.

### Settings

The top bar carries only what you use while playing: the readouts, pause and
the speed buttons. Everything else lives behind the gear, on three tabs.

| Tab | Holds |
| --- | --- |
| **Addons** | The five on/off switches below |
| **Connections** | Belt routing: curve, straight or elbow |
| **Others** | Language, light/dark, save, export, import, and reset |

The language control is a single flag button showing the flag of the language
you would switch *to*.

### Addons

Toggle any of the five in **Settings → Addons**. Tracks (Home Lab, AI Slop) default
**on**; features (Agentic Ops, ESG, Venture Capital) default **off**. Turning a
track off hides its nodes and milestones; turning a feature off removes its
mechanic from the simulation entirely.

---

*Numbers in this wiki are read from `src/data/` as of the current build. The
[Field Guide](reference-card.html) is regenerated from the same files with
`npm run card` and is the authority on any individual node.*
