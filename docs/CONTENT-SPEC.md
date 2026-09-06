# AIfor.study — Content Spec v2

**Building an AI company, one node at a time.**
Implemented and shipped · 5 September 2026 · `aifor-study`

The factory chain is gone. In its place: real API providers at real prices, a retrieval
and agent stack, customer contracts that audit you, and a late game that forks between
becoming a frontier lab and becoming its supplier.

Rendered version: https://claude.ai/code/artifact/b551d217-5b5d-4377-b76c-584597695efd

---

## 1. The reframe

The old game mined silica into wafers into GPUs into models. That is a real supply chain,
but it is not how anyone builds an AI company — you start by typing a credit card into a
provider's dashboard. The new content keeps the node-graph engine intact and remaps every
primitive onto how the industry actually works.

| Engine concept | Was | Now | Why it fits |
|---|---|---|---|
| Power | Megawatts from a grid tap | **Compute** — thousands of tokens/min | Rate limits are the real constraint. Over-demand returns a `429`, not a brownout. |
| Generator | Fuel-burning power plant | **Capacity** — API tiers, rented GPUs, your own datacenter | OpenAI Tier 1 is 500k TPM; Tier 5 is 40M. Tiers are earned by spending, not asking. |
| Extractor | Strip mine | **Demand** — landing page, ads, tickets, documents | Requests are your raw input, and paid acquisition is the first thing that ruins your margin. |
| Sink | Universal terminal paying item value | **Contract** — a recipe with a payout and an audit ceiling | Customers want specific deliverables and ask what you route through. Sinks removed entirely. |
| Item value | What a sink paid you | Reference price, display only | All income comes from contract payouts, so there is no exploit in dumping a $3M rack into a generic sink. |

> **Design principle.** Every node's description string carries a real, sourced figure —
> DeepSeek's actual $1.32/$3.96 per 1M tokens, ASML's $380M scanner, SK hynix's ~58% HBM
> share. The game economy is scaled for playability; the *ratios* and the *facts* are not.

---

## 2. Three acts, then a fork

Sixteen milestones, gated on work actually **sold to a customer** rather than merely
produced. Acts I and II are linear; Act III splits and the two halves feed each other.

The Act I spine:

```
Landing Page → Cheap model → Judge → Eval gate → Contract
user_request   draft_answer   answer  verified_answer  $ payout
```

Act II inserts retrieval before the model and agents after it.

### The fork

**Own the model** — be OpenAI / Anthropic

1. Rent H100s, pull open weights (free)
2. Curate a corpus, LoRA it, then domain-tune it
3. Serve on vLLM — **zero marginal cost per token**
4. Air-gap it for defense and health
5. Pretrain a frontier model of your own

Trades variable cost for fixed cost. Unlocks the sovereign contracts nobody else can bid on.

**Own the silicon** — be NVIDIA / TSMC / ASML

1. Polysilicon → blank wafers
2. EUV patterning (one $380M scanner)
3. Test & dice → logic dies at 70–80% yield
4. Stack HBM4, package on CoWoS
5. Integrate 72 accelerators into a rack

Sell racks to hyperscalers, or burn them in your own colo bay to power the other branch.

The interlock is deliberate: your racks feed your datacenter, your datacenter trains your
frontier model, your frontier model runs the API platform. Full vertical integration is the
endgame, and each half is playable alone.

---

## 3. Four systems the old engine did not have

**Recurring cost.** Buildings gained `monthlyCost`, charged continuously. One game-minute is
one billing month (`BALANCE.monthSeconds = 300`). Supabase Pro really is $25/mo; a rented
8×H100 node really is ~$15,100/mo. This is what makes renting tokens vs. renting GPUs legible.

**Per-craft API spend.** Recipes gained `cost`, debited when a craft starts. A node with no
cash shows *Out of cash* and stops. The single most important addition — it makes gross
margin a thing the player can watch decay in real time.

**Contracts replace sinks.** Recipes gained `payout` and `maxExposure`. Contract nodes are
ordinary factories whose recipes consume deliverables and emit nothing but money. Milestone
progress records contract *inputs*, so producing a thousand answers you never sell advances
nothing.

**Exposure and breach.** Buildings gained `dataRisk`, summed across every enabled node with a
recipe assigned. Risk is architectural: wiring DeepSeek in exposes you whether or not it
happens to be mid-craft. Controls carry *negative* risk — observability is −5, air-gapped
deploy is −6 — so the counter-play costs money rather than being a toggle.

---

## 4. Model catalog — September 2026 prices

Cheap models emit `draft_answer` and need a judge. Mid models emit `answer` directly. Only
frontier-class models emit `reasoning_answer`, the sole input an agent harness can plan with.
That is the mechanic that stops "route everything to Qwen" from being a winning strategy.

### Frontier & mid tier ($ per 1M input / output)

| Model | In | Out | $/craft | Risk | Grade |
|---|---:|---:|---:|---:|---|
| GPT-6 Astra `US` | 10.00 | 50.00 | 40.00 | +1 | reasoning |
| Claude Fable 5.1 `US` | 10.00 | 50.00 | 40.00 | +2 | reasoning · forced 30-day retention |
| Claude Opus 5 `US` | 5.00 | 25.00 | 20.00 | +1 | reasoning |
| Kimi K3 `CN` | 3.00 | 15.00 | 12.00 | +6 | reasoning · open weights |
| Gemini 3.1 Pro `US` | 2.00 | 12.00 | 8.80 | +1 | reasoning |
| Grok 4.6 `US` | 2.00 | 6.00 | 6.40 | +2 | reasoning + answer |
| GLM-5.3 `CN` | 1.40 | 4.40 | 4.60 | +7 | reasoning + answer |
| DeepSeek V4 Pro `CN` | 1.32 | 3.96 | 4.20 | +8 | reasoning + answer |
| GPT-5.6 Terra `US` | 2.00 | 12.00 | 13.20 | +1 | answer |
| Claude Sonnet 5 `US` | 2.00 | 10.00 | 12.00 | +1 | answer · the workhorse |
| Mistral Large 3 `EU` | 0.50 | 1.50 | 2.40 | +1 | answer · open weights |

### Draft & judge tier

| Model | In | Out | $/craft | Risk | Note |
|---|---:|---:|---:|---:|---|
| Claude Haiku 4.5 `US` | 1.00 | 5.00 | 8.00 | +1 | the default judge |
| Gemini 3.8 Flash `US` | 0.75 | 3.75 | 6.00 | +1 | promo — doubles 1 Jan 2027 |
| DeepSeek V4 Flash `CN` | 0.44 | 1.32 | 2.80 | +8 | — |
| GPT-5.6 Luna `US` | 0.20 | 1.20 | 1.76 | +1 | your starting model |
| MiniMax M3 `CN` | 0.23 | 0.96 | 1.60 | +7 | 1.05M context |
| Qwen3.7-Flash `CN` | 0.03 | 0.13 | 0.24 | +7 | the market floor — 300× under frontier |

> **The nuance worth keeping.** The famous 10× US/China price gap is really an
> *OpenAI/Anthropic premium*, not a geography. Gemini 3.1 Pro is within 2.3× of DeepSeek, and
> Kimi K3 is a Chinese model priced at US frontier levels. The catalog is built so a player
> who thinks "cheap = Chinese" gets a worse answer than one who reads the actual numbers.

---

## 5. The stack — retrieval, tools, agents, evals

Act II is where the game stops being an API wrapper. Each layer is a real product with real
pricing, and each has a genuine tradeoff rather than a strict upgrade path.

| Node | Place | Monthly | The real tradeoff it encodes |
|---|---:|---:|---|
| pgvector | $300 | $25 | Free vectors on Postgres you already run — until indexes cap at 2,000 dims and filters run after the scan |
| Pinecone | $400 | $50 | ~$16 per 1M read units: query traffic is the bill, not storage |
| turbopuffer | $500 | $256 | $1/PB scanned — wins only once volume is serious |
| Prompt Cache | $250 | $20 | Cache reads bill at 10% of input, so it is modeled as *capacity*, not a factory |
| MCP Tool Server | $350 | — | N×M integrations become N+M. Free standard, +3 exposure |
| Agent Harness | $900 | — | 1 reasoning + 4 answers + 2 tool results per 2 runs. The harness is free; the loop is the bill |
| Multi-Agent Graph | $2,400 | $39 | LangGraph free, LangSmith $39/seat. Quality up, token burn up faster |
| Eval & Guardrails | $800 | $29 | 5 answers in, 4 verified out. Costs 20% of throughput, −2 exposure |
| Observability | $600 | $199 | Produces nothing. Buys −5 exposure. The purest "controls cost money" node |

**Compliance is time-gated, not money-gated.** Four programs emit attestation items that
contracts consume on every craft, so compliance is ongoing rather than one-time. SOC 2 Type II
costs $30,000 to stand up and $1,200/mo to hold, and its 60-second production cycle stands in
for an observation window you cannot buy past.

---

## 6. Exposure & breach

Exposure is a single global number. Breach probability is **quadratic** in it, so a little
risk is survivable and a lot is not:

    breaches/min = 2.4 × (exposure ÷ 100)²

| Exposure | Typical build | Breaches/min | Contracts still open |
|---:|---|---:|---|
| 4 | All-Western, air-gapped, observed | 0.004 | Everything, incl. Federal |
| 10 | Western stack with tools | 0.024 | Up to Health / Finance |
| 18 | + MCP, Stripe, unmonitored | 0.078 | Up to Enterprise |
| 30 | One Chinese provider wired in | 0.216 | Up to Mid-Market |
| 64 | Eight DeepSeek nodes | 0.98 | Prosumer only |

A breach takes 12% of cash (min $500) and freezes *every* contract for 20 seconds while you
respond. Verified in a headless run: 8 DeepSeek nodes at exposure 64 produced 7 breaches and
$583k of losses in ten minutes.

> **Grounded in real incidents.** Wiz found 1M+ plaintext log records on an unauthenticated
> DeepSeek ClickHouse instance in January 2025. Cisco measured a 100% jailbreak success rate on
> R1. Twelve-plus US states and five national governments banned it; Italy's ban still stands.
> Korea's PIPC found prompts transferred to Beijing Volcano Engine without consent. None of that
> is invented for the game — it is why the exposure ceilings exist.

The counter-play is not "avoid Chinese models." It is to route them where exposure doesn't
matter — the freemium tier has a ceiling of 90 — and buy controls where it does.

---

## 7. Contracts — the revenue ladder

| Contract | Consumes | Pays | $/s | Exp. ceiling |
|---|---|---:|---:|---:|
| Freemium Tier | 8 draft_answer | $9 | 0.7 | 90 |
| Prosumer Subs | 6 answer | $17 | 1.4 | 70 |
| SMB Pilot | 8 verified | $56 | 3.5 | 45 |
| Mid-Market SaaS | 20 verified + SOC 2 | $270 | 9.0 | 30 |
| Enterprise Seats | 24 verified + 4 agent runs + ISO 42001 | $1,050 | 26 | 18 |
| Enterprise Agents | 6 agent workflows + ISO 42001 | $1,800 | 45 | 18 |
| Health / Finance | 40 verified + HIPAA + SOC 2 | $5,400 | 120 | 10 |
| Federal Program | 60 sovereign + FedRAMP | $22,000 | 367 | 4 |
| Sell Accelerators | 40 packaged GPUs | $1.5M | 54k | — |
| Sell Racks | 1 NVL72 rack | $3.1M | 93k | — |
| API Platform | 1 frontier model + 300 sovereign | $11M | 183k | 20 |

Note the inverse relationship: as payout climbs, the exposure ceiling falls. Federal at $367/s
demands an exposure of 4, achievable only by running your own weights on your own hardware with
observability and compliance buying the number down.

---

## 8. Silicon branch — where GPUs actually come from

The old game had you mine silica and get a GPU. The new chain teaches the thing almost everyone
gets backwards: **the logic die is under 13% of a GPU's bill of materials.** Memory and
packaging are the cost, and packaging — not lithography — is the supply ceiling.

```
Polysilicon → Blank wafer → EUV pattern → 60 logic dies → + 8 HBM4 → CoWoS → ×72 = rack
    $3            $45         $30,000        ~$850 ea      $550 ea   accelerator   ~$3M
```

| Node | Capex | Monthly | Real anchor |
|---|---:|---:|---|
| Wafer Fab | $400k | $60k | Ingot growth, slicing, polish |
| EUV Lithography | $380M | $4M | ASML EXE:5200B — 150 tonnes, 250 crates, one supplier on earth |
| Die Test & Dicing | $900k | $120k | TSMC N2 yields 70–80% on logic test chips |
| HBM Stacking | $2.4M | $300k | SK hynix sold out its entire 2026 HBM production |
| CoWoS Packaging | $6M | $700k | 52–78 week booking window; 85%+ of 2026–27 capacity pre-locked |
| Rack Integration | $3M | $400k | NVIDIA captures ~90% of system value |
| Own Datacenter (10MW) | $380M | $7.08M | $30–45M/MW all-in; servers are 60% of TCO, energy only ~7% |

---

## 9. Tech tree — sixteen milestones

Requirements count units *sold*, so the tree can only advance through a working business.
Rewards are the funding rounds.

| # | Milestone | Gate | Reward | Opens up |
|---:|---|---|---:|---|
| 1 | First Users | 40 draft_answer | $1.5k | Haiku, Qwen, judges, Tier 1 |
| 2 | Product-Market Fit | 80 answer | $4k | Sonnet, ads, support desk, eval gate, SMB |
| 3 | Shipping Quality | 60 verified | $12k | Docs, chunker, embedder, pgvector, Tier 3 |
| 4 | Retrieval | 220 verified | $35k | Search, Pinecone, cache, observability, SOC 2 |
| 5 | The Security Review | 4 SOC 2 | $80k | Mid-Market, turbopuffer |
| 6 | Frontier Reasoning | 600 verified | $200k | Gemini Pro, Opus, Tier 5, MCP, harness |
| 7 | Agents In Production | 60 agent runs | $500k | GPT-6, Fable, ISO 42001, Enterprise, multi-agent |
| 8 | The Cheap Provider | 4 ISO 42001 | $1.2M | DeepSeek Pro, GLM, Kimi, batch lane |
| 9 | Own The Weights | 40 workflows | $3M | Open weights, H100s, fine-tuning, vLLM |
| 10 | Sovereign Inference | 200 sovereign | $9M | HIPAA, Health/Finance, air-gap, B200s |
| 11 | Cleared | 4 HIPAA + 800 sovereign | $30M | FedRAMP, Federal |
| 12 | Going Upstream | 4 FedRAMP | $80M | Polysilicon, wafer fab, HBM, die test |
| 13 | The Chokepoint | 3,000 sovereign | $400M | EUV, CoWoS, racks, colo, hyperscaler |
| 14 | Vertical Integration | 400 accelerators | $2B | Datacenter, pretraining cluster |
| 15 | Frontier Lab | 12 racks | $8B | API platform |
| 16 | Takeoff | 3 frontier models | $50B | — |

Milestone 8 is the deliberate cruelty of the tree: you unlock the cheap Chinese providers
*immediately after* committing to ISO 42001 and enterprise contracts with an exposure ceiling
of 18. The temptation arrives exactly when it is most expensive to give in to.

---

## 10. Economy math

> **One unit = 100 operations.** A unit of any data item stands for 100 real requests at
> roughly 10k input / 2k output tokens. Every `cost` is therefore the published price of 100
> such calls. Real per-request costs are fractions of a cent, which reads as noise on screen;
> this scaling keeps the numbers legible while preserving every ratio between providers exactly.

### What an answer costs, by route

| Route | $ / answer unit | Cost |
|---|---:|---|
| Qwen draft → Luna judge | 0.63 | Two nodes, extra latency, 20% yield loss |
| Luna draft → Luna judge | 2.75 | The starting route |
| Sonnet direct | 4.00 | One node, no loss, higher grade |
| Verified (cheap route) | 2.28 | 5 answers → 4 verified, plus $6 gate |

The cascade is genuinely 6× cheaper, which is true to life — and it costs two extra nodes, two
extra recipes' worth of throughput, and a chunk of your compute budget. Model routing is a real
optimisation puzzle rather than a dominant strategy.

### Why margins land where they do

Gross margin on the cheap route looks absurd — 90%+ — until fixed costs arrive. Paid acquisition
at $900/mo is $3 per game-second against Act I revenue of $1.4–3.5/s per contract node. That is
customer acquisition cost eating the business, which is exactly the real reason AI
application-layer margins sit around 45% rather than SaaS's 70–80%. The top bar therefore
reports **net** margin, subscriptions included, not gross.

| Starting cash | Free tier | Billing month | Breach cost |
|---|---|---|---|
| $2,000 | 150k TPM | 300s | 12% of cash |

---

## 11. What changed in the repo

Typecheck and production build both clean.

| File | Change |
|---|---|
| `data/items.ts` | Rewritten. 31 items across 5 forms (demand / data / model / silicon / paper), each with a teaching note |
| `data/buildings.ts` | Rewritten. 69 buildings; new fields `monthlyCost`, `computeDraw`, `computeSupply`, `dataRisk`, `tier`. Kinds are now source / factory / capacity / contract |
| `data/recipes.ts` | Rewritten. 87 recipes; new fields `cost`, `payout`, `maxExposure`, `note` |
| `data/milestones.ts` | Rewritten. 16 milestones with an `act` label |
| `data/balance.ts` | `monthSeconds`, breach tuning, `clockExponent` rename, start cash $2,000 |
| `engine/types.ts` | `ComputeReport`, `FinanceReport`, exposure/breach state, three new statuses |
| `engine/simulate.ts` | Rent charging, per-craft debit, payout credit, exposure survey, breach roll, contract audit gate, EMA-smoothed finance |
| `engine/factory.ts` | Sink special-casing removed; `STATE_VERSION` → 2 so v1 saves are discarded cleanly |
| `ui/format.ts` | New. Money and TPM formatting across seven orders of magnitude |
| `ui/TopBar.tsx` | Cash, net/min, net margin, exposure + breach count, compute load |
| `ui/Inspector.tsx` | Compute draw, subscription, data risk, API spend, contract payout, exposure ceiling, recipe note |
| `ui/BuildBar.tsx` | Grouped by `tier` instead of kind |
| `ui/MachineNode.tsx`, `Milestones.tsx`, `Canvas.tsx`, `useGame.ts` | Status colors, act label, new tutorial hint, breach toasts |

---

## 12. Open questions

- **Pacing in Act I is slow.** A minimal four-node build takes ~23 minutes to clear milestone 3.
  Either raise early payouts or let organic demand compound.
- **Off-peak pricing is unmodeled.** DeepSeek is 50% off outside Beijing business hours, which is
  most of the week. A day/night cycle would make that a real scheduling decision — and would give
  the batch lane a reason to exist beyond raw capacity.
- **Contracts don't churn.** Real pilots convert to production at 10–15%. A contract that expires
  and must be re-won would stop the late game from being pure accumulation.
- **Export controls aren't in.** B200 and Rubin are banned to China; H200 is conditionally allowed
  with a 25% tariff. A natural constraint on the silicon branch.
- **Power as a second constraint.** Only 13% of US grid-interconnection projects reach operation and
  large gas turbines have 5–7 year lead times. A datacenter that needs a power contract before it
  can run would be very true to life.

> **On the price data.** Everything was fetched live on 5 September 2026 from vendor pricing pages.
> A few figures are from aggregators rather than primary sources — ByteDance Doubao and Qwen pricing
> in particular, since Alibaba's Model Studio and Volcengine pages don't render prices. Two scheduled
> changes are already known: Gemini Flash doubles on 1 Jan 2027, and OpenAI stops accepting new
> fine-tuning jobs on 6 Jan 2027. Prices in the node descriptions need a refresh pass every few
> months to stay honest.

---

*31 items · 69 buildings · 87 recipes · 16 milestones · 11 contracts*
