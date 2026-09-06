/**
 * BUILDINGS -------------------------------------------------------------
 * A building is a chassis. What it *makes* comes from the recipes that
 * target it (recipes.ts), so one chassis can host many recipes.
 *
 * kind:
 *   'source'   — recipes with no inputs. Demand, documents, open weights.
 *   'factory'  — the normal case; consumes inputs, emits outputs.
 *   'capacity' — supplies throughput (kTPM). Exempt from throttling.
 *                May burn a fuel item (a recipe with inputs and no outputs).
 *   'contract' — a customer. Recipes have a `payout` and no outputs.
 *
 * ECONOMICS
 *   cost         one-off $ to place. Refunds BALANCE.refundRate on demolish.
 *   monthlyCost  $ per billing month. One game-minute = one billing month.
 *   computeDraw  throughput consumed, in thousands of tokens/minute (kTPM).
 *   computeSupply throughput supplied, same units, for kind 'capacity'.
 *   dataRisk     0-10. Summed across running nodes into global Exposure.
 *                Exposure drives breach probability and locks contracts.
 */
import type { Vendor } from './vendors';

export type BuildingKind = 'source' | 'factory' | 'capacity' | 'contract';

export interface Building {
  id: string;
  name: string;
  icon: string;
  kind: BuildingKind;
  cost: number;
  monthlyCost: number;
  computeDraw: number;
  computeSupply: number;
  dataRisk: number;
  color: string;
  description: string;
  /**
   * Which provider this node talks to. Model nodes draw from this vendor's
   * rate-limit pool; everything else draws from the shared pool.
   */
  vendor?: Vendor;
  /**
   * True for capacity nodes that buy a rate limit from one provider. The node
   * picks which provider after you place it. Hardware nodes leave this unset
   * and feed the shared pool instead.
   */
  vendorScoped?: boolean;
  /**
   * Cap on how many nodes this capacity may serve in its pool. A free tier
   * covers exactly one node, which is what makes the first paid tier matter.
   */
  servesNodes?: number;
  /** Grouping label in the build bar. */
  tier: BuildingTier;
  /**
   * How hard this chassis's place cost tracks the hardware price index. Same
   * scale as Item.priceElasticity: 0 never moves, 1.0 is DRAM. Only hardware
   * you buy outright should carry one.
   */
  priceElasticity?: number;
  /**
   * Past this price index the product is withdrawn from sale and leaves the
   * build bar for good. Nodes already placed keep running, because the people
   * who bought one still have it.
   *
   * Apple withdrew the 512GB Mac Studio in March 2026 rather than reprice it:
   * it disappeared from the store between the 4th and the 6th, unannounced.
   */
  withdrawnAtIndex?: number;
  /** 0-10, summed into the global Slop Index while this node runs. */
  slopRisk?: number;
  /**
   * Hard cap on how many of this node may exist at once. Reaching it greys the
   * card out in the build bar and `placeMachine` refuses — the bar is only the
   * hint, the engine is the rule, so the quick-build keys cannot go around it.
   *
   * The free tier carries one: it is the allowance every provider hands out,
   * and being able to paper over a rate limit with a stack of them would
   * remove the reason the first paid tier costs $200.
   */
  maxCount?: number;
}

export type BuildingTier =
  | 'Demand' | 'Online Models' | 'Local Models' | 'Home Lab' | 'Retrieval'
  | 'Agents' | 'Slop' | 'Compliance' | 'Capacity' | 'Training' | 'Silicon'
  | 'Contracts';

const B = (b: Building): Building => b;

export const BUILDINGS: Building[] = [
  // ======================================================================
  // DEMAND — where work comes from
  // ======================================================================
  B({ id: 'landing_page',  name: 'Landing Page',    icon: '◌', kind: 'source', tier: 'Demand', cost: 120,    monthlyCost: 0,     computeDraw: 2,   computeSupply: 0, dataRisk: 0, color: '#5b7fa8', description: 'Free organic signups. Slow, but it costs you nothing and never churns.' }),
  B({ id: 'ad_spend',      name: 'Paid Acquisition',icon: '⌁', kind: 'source', tier: 'Demand', cost: 400,    monthlyCost: 900,   computeDraw: 2,   computeSupply: 0, dataRisk: 0, color: '#7a5ba8', description: 'Buy demand. Works instantly, stops the moment you stop paying.' }),
  B({ id: 'support_desk',  name: 'Support Desk',    icon: '✉', kind: 'source', tier: 'Demand', cost: 700,    monthlyCost: 300,   computeDraw: 3,   computeSupply: 0, dataRisk: 1, color: '#8a7f6b', description: 'Inbound tickets from paying customers. Higher value work, real SLAs.' }),
  B({ id: 'doc_ingest',    name: 'Document Ingest', icon: '▤', kind: 'source', tier: 'Demand', cost: 900,    monthlyCost: 150,   computeDraw: 4,   computeSupply: 0, dataRisk: 2, color: '#9e8a6b', description: 'Customer corpora. Unstructured charges $0.015/page; LlamaParse ~$0.00125.' }),
  B({ id: 'search_api',    name: 'Search API',      icon: '⌘', kind: 'source', tier: 'Demand', cost: 300,    monthlyCost: 200,   computeDraw: 4,   computeSupply: 0, dataRisk: 1, color: '#5f8a7a', description: 'Exa $7/1k queries, Tavily $8/1k, Brave $5/1k, SerpApi up to $25/1k. A 25x spread.' }),

  // ======================================================================
  // ONLINE MODELS — US / Western frontier
  // ======================================================================
  B({ id: 'gpt6',          name: 'GPT-6 Astra',     icon: '⬢', kind: 'factory', tier: 'Online Models', vendor: 'openai', cost: 0, monthlyCost: 0, computeDraw: 900, computeSupply: 0, dataRisk: 1, color: '#10a37f', description: 'OpenAI frontier. $10/$50 per 1M tokens, 1.05M context. Over 272k input tokens bills at 2x.' }),
  B({ id: 'claude_fable',  name: 'Claude Fable 5.1',icon: '✳', kind: 'factory', tier: 'Online Models', vendor: 'anthropic', cost: 0, monthlyCost: 0, computeDraw: 900, computeSupply: 0, dataRisk: 2, color: '#d97757', description: 'Anthropic frontier. $10/$50 per 1M, 1M context. A Covered Model: 30-day retention is mandatory, no zero-retention option.' }),
  B({ id: 'claude_opus',   name: 'Claude Opus 5',   icon: '✦', kind: 'factory', tier: 'Online Models', vendor: 'anthropic', cost: 0, monthlyCost: 0, computeDraw: 620, computeSupply: 0, dataRisk: 1, color: '#e08a5c', description: 'Anthropic high-end. $5/$25 per 1M. Cache reads at 10% of input make repeat context nearly free.' }),
  B({ id: 'gemini_pro',    name: 'Gemini 3.1 Pro',  icon: '◈', kind: 'factory', tier: 'Online Models', vendor: 'google', cost: 0, monthlyCost: 0, computeDraw: 560, computeSupply: 0, dataRisk: 1, color: '#4285f4', description: 'Google frontier. $2/$12 per 1M, doubling above 200k context. Cheapest credible frontier tier.' }),

  // ONLINE MODELS — US mid and cheap
  B({ id: 'claude_sonnet', name: 'Claude Sonnet 5', icon: '◆', kind: 'factory', tier: 'Online Models', vendor: 'anthropic', cost: 0, monthlyCost: 0, computeDraw: 380, computeSupply: 0, dataRisk: 1, color: '#c96442', description: 'The workhorse. $2/$10 per 1M, 1M context. Most production traffic should live here.' }),
  B({ id: 'gpt_terra',     name: 'GPT-5.6 Terra',   icon: '◇', kind: 'factory', tier: 'Online Models', vendor: 'openai', cost: 0, monthlyCost: 0, computeDraw: 380, computeSupply: 0, dataRisk: 1, color: '#1a9f7a', description: 'OpenAI mid tier. $2/$12 per 1M. Tier 1 gives you 500k TPM; Tier 5 gives you 40M.' }),
  B({ id: 'grok',          name: 'Grok 4.6',        icon: '✕', kind: 'factory', tier: 'Online Models', vendor: 'xai', cost: 0, monthlyCost: 0, computeDraw: 340, computeSupply: 0, dataRisk: 2, color: '#888888', description: 'xAI. $2/$6 per 1M, 500k context. Cheaper output than any other Western frontier-adjacent model.' }),
  B({ id: 'claude_haiku',  name: 'Claude Haiku 4.5',icon: '·', kind: 'factory', tier: 'Online Models', vendor: 'anthropic', cost: 0, monthlyCost: 0, computeDraw: 180, computeSupply: 0, dataRisk: 1, color: '#e0a878', description: 'Anthropic cheap tier. $1/$5 per 1M. The default judge model for grading cheaper output.' }),
  B({ id: 'gemini_flash',  name: 'Gemini 3.8 Flash',icon: '⌁', kind: 'factory', tier: 'Online Models', vendor: 'google', cost: 0, monthlyCost: 0, computeDraw: 150, computeSupply: 0, dataRisk: 1, color: '#5e97f6', description: 'Google cheap tier. $0.75/$3.75 per 1M on promo — scheduled to double on 1 Jan 2027.' }),
  B({ id: 'gpt_luna',      name: 'GPT-5.6 Luna',    icon: '˙', kind: 'factory', tier: 'Online Models', vendor: 'openai', cost: 0, monthlyCost: 0, computeDraw: 120, computeSupply: 0, dataRisk: 1, color: '#3ab88f', description: 'OpenAI nano tier. $0.20/$1.20 per 1M. 50x cheaper than Astra, and it shows.' }),
  B({ id: 'mistral_large', name: 'Mistral Large 3', icon: '▲', kind: 'factory', tier: 'Online Models', vendor: 'mistral', cost: 0, monthlyCost: 0, computeDraw: 200, computeSupply: 0, dataRisk: 1, color: '#fa5210', description: 'EU-headquartered, open weights, $0.50/$1.50 per 1M. api.eu.mistral.ai gives you EU residency.' }),

  // ONLINE MODELS — China. Cheap, capable, and a procurement problem.
  B({ id: 'deepseek_pro',  name: 'DeepSeek V4 Pro', icon: '⏻', kind: 'factory', tier: 'Online Models', vendor: 'deepseek', cost: 0, monthlyCost: 0, computeDraw: 320, computeSupply: 0, dataRisk: 8, color: '#4d6bfe', description: 'Frontier-class at $1.32/$3.96 per 1M — 10x under GPT-6. Off-peak halves it again. Data is stored in the PRC by policy.' }),
  B({ id: 'deepseek_flash',name: 'DeepSeek V4 Flash',icon: '⏼',kind: 'factory', tier: 'Online Models', vendor: 'deepseek', cost: 0, monthlyCost: 0, computeDraw: 160, computeSupply: 0, dataRisk: 8, color: '#6b84fe', description: '$0.44/$1.32 per 1M. Wiz found 1M+ plaintext log records on an unauthenticated DeepSeek database in 2025.' }),
  B({ id: 'qwen_flash',    name: 'Qwen3.7-Flash',   icon: '⊙', kind: 'factory', tier: 'Online Models', vendor: 'alibaba', cost: 0, monthlyCost: 0, computeDraw: 90,  computeSupply: 0, dataRisk: 7, color: '#615ced', description: 'Alibaba. $0.03/$0.13 per 1M — the price floor of the entire market. Roughly 300x under frontier.' }),
  B({ id: 'glm',           name: 'GLM-5.3',         icon: '⊛', kind: 'factory', tier: 'Online Models', vendor: 'zhipu', cost: 0, monthlyCost: 0, computeDraw: 300, computeSupply: 0, dataRisk: 7, color: '#2f6ee0', description: 'Zhipu frontier at $1.40/$4.40 per 1M, 1.31M context. Z.ai reports $1.6B ARR.' }),
  B({ id: 'kimi',          name: 'Kimi K3',         icon: '⊕', kind: 'factory', tier: 'Online Models', vendor: 'moonshot', cost: 0, monthlyCost: 0, computeDraw: 520, computeSupply: 0, dataRisk: 6, color: '#1f4fd8', description: 'Moonshot. $3/$15 per 1M — a Chinese model priced like a US one, and open weights. Breaks the geography framing.' }),
  B({ id: 'minimax',       name: 'MiniMax M3',      icon: '⊚', kind: 'factory', tier: 'Online Models', vendor: 'minimax', cost: 0, monthlyCost: 0, computeDraw: 130, computeSupply: 0, dataRisk: 7, color: '#3d5fd0', description: '$0.23/$0.96 per 1M with a 1.05M window. Absurd value; $800M ARR against Anthropic’s $65B.' }),

  // ======================================================================
  // RETRIEVAL — the platform layer
  // ======================================================================
  B({ id: 'chunker',       name: 'Chunker',         icon: '▪', kind: 'factory', tier: 'Retrieval', cost: 200,   monthlyCost: 0,    computeDraw: 20,  computeSupply: 0, dataRisk: 0, color: '#7a6b9e', description: 'Splits documents for embedding. Free to run, and chunking strategy is most of RAG quality.' }),
  B({ id: 'embedder',      name: 'Embedding Model', icon: '⌗', kind: 'factory', tier: 'Retrieval', cost: 150,   monthlyCost: 0,    computeDraw: 60,  computeSupply: 0, dataRisk: 1, color: '#c957a8', description: 'text-embedding-3-small at $0.02/1M tokens. The cheapest model call you will ever make.' }),
  B({ id: 'pgvector',      name: 'pgvector',        icon: '◱', kind: 'factory', tier: 'Retrieval', cost: 300,   monthlyCost: 25,   computeDraw: 40,  computeSupply: 0, dataRisk: 1, color: '#336791', description: 'Supabase Pro is $25/mo. Free-ish vectors, but indexes cap at 2,000 dimensions and filters run AFTER the scan.' }),
  B({ id: 'pinecone',      name: 'Pinecone',        icon: '◲', kind: 'factory', tier: 'Retrieval', cost: 400,   monthlyCost: 50,   computeDraw: 90,  computeSupply: 0, dataRisk: 1, color: '#3d8fc4', description: 'Standard $50/mo minimum, $0.33/GB-mo, ~$16 per 1M read units. Query traffic, not storage, is the bill.' }),
  B({ id: 'turbopuffer',   name: 'turbopuffer',     icon: '◳', kind: 'factory', tier: 'Retrieval', cost: 500,   monthlyCost: 256,  computeDraw: 200, computeSupply: 0, dataRisk: 1, color: '#2fb0a8', description: 'Object-storage-backed. $1/PB scanned, Scale tier $256/mo minimum. Cheap per query at real volume.' }),
  B({ id: 'redis_cache',   name: 'Prompt Cache',    icon: '◷', kind: 'capacity', tier: 'Retrieval', cost: 250,   monthlyCost: 20,   computeDraw: 0,  computeSupply: 900, dataRisk: 0, color: '#dc382d', description: 'Cache reads bill at 10% of input across every major provider — 3.3% on DeepSeek. Repeat prefixes become free throughput.' }),

  // ======================================================================
  // AGENTS — orchestration, tools, evals
  // ======================================================================
  B({ id: 'mcp_server',    name: 'MCP Tool Server', icon: '⚙', kind: 'factory', tier: 'Agents', cost: 350,  monthlyCost: 0,   computeDraw: 40,  computeSupply: 0, dataRisk: 3, color: '#c49a3d', description: 'One socket for every SaaS system: N x M integrations become N + M. Open standard, no licence fee.' }),
  B({ id: 'saas_notion',   name: 'Notion + Slack',  icon: '▦', kind: 'factory', tier: 'Agents', cost: 400,  monthlyCost: 340, computeDraw: 30,  computeSupply: 0, dataRisk: 3, color: '#000000', description: 'Notion Plus $10/user/mo, Slack Pro $8.75. APIs are free with the seat — you pay per human, not per call.' }),
  B({ id: 'saas_stripe',   name: 'Stripe + Billing',icon: '▧', kind: 'factory', tier: 'Agents', cost: 300,  monthlyCost: 0,   computeDraw: 20,  computeSupply: 0, dataRisk: 4, color: '#635bff', description: '2.9% + $0.30 per charge, no monthly fee. Letting an agent touch money is where blast radius gets real.' }),
  B({ id: 'harness',       name: 'Agent Harness',   icon: '✦', kind: 'factory', tier: 'Agents', cost: 900,  monthlyCost: 0,   computeDraw: 260, computeSupply: 0, dataRisk: 2, color: '#e08a3c', description: 'The loop: call model, parse tool calls, execute, feed back, repeat. The harness is free — the loop iterations are not.' }),
  B({ id: 'multi_agent',   name: 'Multi-Agent Graph',icon: '✧',kind: 'factory', tier: 'Agents', cost: 2400, monthlyCost: 39,  computeDraw: 700, computeSupply: 0, dataRisk: 2, color: '#f26d3d', description: 'LangGraph is free; LangSmith is $39/seat/mo. Planner, workers, critic. Quality up, token burn up faster.' }),
  B({ id: 'eval_gate',     name: 'Eval & Guardrails',icon: '⌾',kind: 'factory', tier: 'Agents', cost: 800,  monthlyCost: 29,  computeDraw: 120, computeSupply: 0, dataRisk: -2, color: '#35c9c0', description: 'Langfuse Core $29/mo. Turns output into output you are willing to sign a contract about.' }),
  B({ id: 'observability', name: 'Observability',   icon: '◔', kind: 'factory', tier: 'Agents', cost: 600,  monthlyCost: 199, computeDraw: 30,  computeSupply: 0, dataRisk: -5, color: '#4a8f8f', description: 'Langfuse Pro $199/mo, Braintrust Pro $249/mo. Cuts Exposure: you cannot contain what you cannot see.' }),

  // ======================================================================
  // COMPLIANCE — slow, expensive, and the only way into the big money
  // ======================================================================
  B({ id: 'soc2_program',  name: 'SOC 2 Program',   icon: '⛊', kind: 'factory', tier: 'Compliance', cost: 30000,    monthlyCost: 1200,  computeDraw: 5, computeSupply: 0, dataRisk: -3, color: '#a8a05b', description: 'Type II is $15k-50k in audit fees, but the 3-12 month observation window cannot be bought past. All-in first year ~$147k.' }),
  B({ id: 'iso_program',   name: 'ISO 42001 Program',icon: '⌸',kind: 'factory', tier: 'Compliance', cost: 85000,    monthlyCost: 2500,  computeDraw: 5, computeSupply: 0, dataRisk: -3, color: '#b0904a', description: '$85k-150k from scratch, 4-9 months — but 40-60% cheaper if you already hold SOC 2 discipline.' }),
  B({ id: 'hipaa_program', name: 'HIPAA Program',   icon: '✚', kind: 'factory', tier: 'Compliance', cost: 60000,    monthlyCost: 3000,  computeDraw: 5, computeSupply: 0, dataRisk: -2, color: '#c46f6f', description: 'A BAA plus the controls behind it. Azure OpenAI includes one by default; DeepSeek offers none at all.' }),
  B({ id: 'fedramp_program',name:'FedRAMP Program', icon: '★', kind: 'factory', tier: 'Compliance', cost: 900000,   monthlyCost: 25000, computeDraw: 5, computeSupply: 0, dataRisk: -4, color: '#6f8fc4', description: 'Legacy Rev 5: $250k-2M and 12-18 months. The 20x fast lane cut agency review to about five weeks.' }),

  // ======================================================================
  // CAPACITY — throughput. Everything else throttles without it.
  // ======================================================================
  B({ id: 'free_tier',     name: 'Free Tier',       icon: '○', kind: 'capacity', vendorScoped: true, servesNodes: 1, maxCount: 1, tier: 'Capacity', cost: 0,     monthlyCost: 0,     computeDraw: 0, computeSupply: 150,      dataRisk: 0, color: '#5b7f5b', description: 'Enough to prove the idea works and nothing more. Every provider gives you one.' }),
  B({ id: 'api_tier1',     name: 'API Tier 1',      icon: '①', kind: 'capacity', vendorScoped: true, tier: 'Capacity', cost: 200,   monthlyCost: 0,     computeDraw: 0, computeSupply: 500,     dataRisk: 0, color: '#4a8f4a', description: 'Unlocked at $5 paid. 500k TPM, $100/mo spend cap. The real first wall you hit.' }),
  B({ id: 'api_tier3',     name: 'API Tier 3',      icon: '③', kind: 'capacity', vendorScoped: true, tier: 'Capacity', cost: 1800,  monthlyCost: 0,     computeDraw: 0, computeSupply: 5000,    dataRisk: 0, color: '#4a9f5a', description: 'Unlocked at $100 paid. $1,000/mo cap. Tiers are earned by spending, not by asking.' }),
  B({ id: 'api_tier5',     name: 'API Tier 5',      icon: '⑤', kind: 'capacity', vendorScoped: true, tier: 'Capacity', cost: 14000, monthlyCost: 0,     computeDraw: 0, computeSupply: 40000,   dataRisk: 0, color: '#4aaf6a', description: 'Unlocked at $1,000 paid. 40M TPM and a $200,000/mo cap. The ceiling of renting someone else’s compute.' }),
  B({ id: 'batch_lane',    name: 'Batch Lane',      icon: '◫', kind: 'capacity', vendorScoped: true, tier: 'Capacity', cost: 900,   monthlyCost: 0,     computeDraw: 0, computeSupply: 9000,    dataRisk: 0, color: '#3a8f7a', description: 'Batch APIs are 50% off at OpenAI, Anthropic, Google and Fireworks. Half price, but you wait.' }),
  B({ id: 'rented_h100',   name: 'Rented H100 Node',icon: '▣', kind: 'capacity', tier: 'Capacity', cost: 0,     monthlyCost: 15100, computeDraw: 0, computeSupply: 24000,   dataRisk: 0, color: '#76b900', description: '8x H100 at RunPod ~$2.59/hr. Median across 40 providers is $3.32/hr; GCP charges $11.07. Unlocks self-hosting.' }),
  B({ id: 'rented_b200',   name: 'Rented B200 Pod', icon: '▩', kind: 'capacity', tier: 'Capacity', cost: 0,     monthlyCost: 39600, computeDraw: 0, computeSupply: 70000,   dataRisk: 0, color: '#8fd400', description: '8x B200 at ~$6.79/hr. Spot cuts it 60-75% but interrupts; 3-year reserved is ~45% off and does not.' }),
  B({ id: 'colo_rack',     name: 'Colo Rack Bay',   icon: '⛁', kind: 'capacity', tier: 'Capacity', cost: 250000,monthlyCost: 42000, computeDraw: 0, computeSupply: 130000,  dataRisk: 0, color: '#5a8f3a', description: 'Burns your own NVL72 racks. ~120kW each, liquid cooling mandatory — air alone cannot cool it.' }),
  B({ id: 'datacenter',    name: 'Own Datacenter',  icon: '▰', kind: 'capacity', tier: 'Capacity', cost: 380000000, monthlyCost: 7080000, computeDraw: 0, computeSupply: 2600000, dataRisk: 0, color: '#3a6f2a', description: '10MW. All-in capex runs $30-45M per MW, annualised TCO ~$8.5M/MW/yr. Servers are 60% of it; power only ~7%.' }),

  // ======================================================================
  // TRAINING — Act III-A, become the lab
  // ======================================================================
  B({ id: 'weights_mirror',name: 'Open Weights Mirror',icon:'⬡',kind: 'source',  tier: 'Training', cost: 200,     monthlyCost: 0,     computeDraw: 5,     computeSupply: 0, dataRisk: 0, color: '#8a8f9e', description: 'Llama, Qwen, DeepSeek, Mistral Large 3, Kimi K2. Downloading them is free. Serving them is not.' }),
  B({ id: 'data_curation', name: 'Data Curation',   icon: '≋', kind: 'factory', tier: 'Training', cost: 4000,    monthlyCost: 800,   computeDraw: 200,   computeSupply: 0, dataRisk: 3, color: '#6b7f6b', description: 'Common Crawl is free; licensed corpora are $10M-250M annual lump sums. Dedupe and filter or you train on slop.' }),
  B({ id: 'finetune_job',  name: 'Fine-Tune Job',   icon: '⟐', kind: 'factory', tier: 'Training', cost: 2000,    monthlyCost: 0,     computeDraw: 1400,  computeSupply: 0, dataRisk: 1, color: '#7ce04c', description: 'Together charges $0.48 per 1M tokens for a <=16B LoRA. A 7B run on 10M tokens costs about $5.' }),
  B({ id: 'vllm_server',   name: 'vLLM Server',     icon: '⬒', kind: 'factory', tier: 'Training', cost: 3000,    monthlyCost: 0,     computeDraw: 11000,  computeSupply: 0, dataRisk: -3, color: '#4ce07a', description: 'Zero marginal token cost — you already paid for the GPUs. Zero data egress. This is the sovereignty node.' }),
  B({ id: 'airgap_deploy', name: 'Air-Gapped Deploy',icon: '⛨',kind: 'factory', tier: 'Training', cost: 45000,   monthlyCost: 18000, computeDraw: 13000,  computeSupply: 0, dataRisk: -6, color: '#3fc46a', description: 'IL5/IL6 and CMMC territory. Ops teams run 2-3x larger and models ship quarterly on physical media.' }),
  B({ id: 'pretrain_rig',  name: 'Pretraining Cluster',icon:'⛃',kind:'factory', tier: 'Training', cost: 12000000,monthlyCost: 900000,computeDraw: 1900000,computeSupply: 0, dataRisk: 1, color: '#ffd24a', description: 'Llama 3.1 405B took 30.8M H100-hours. DeepSeek V3 took 2.66M on a fleet that still cost ~$1.6B to assemble.' }),

  // ======================================================================
  // SILICON — Act III-B, become the supplier
  // ======================================================================
  B({ id: 'poly_supply',   name: 'Polysilicon Supply',icon:'◆',kind: 'source',  tier: 'Silicon', cost: 60000,      monthlyCost: 9000,     computeDraw: 30,   computeSupply: 0, dataRisk: 0, color: '#9e8a6b', description: 'The cheapest input in the entire chain, and the start of every chip on earth.' }),
  B({ id: 'wafer_slicer',  name: 'Wafer Fab',       icon: '▬', kind: 'factory', tier: 'Silicon', cost: 400000,     monthlyCost: 60000,    computeDraw: 200,  computeSupply: 0, dataRisk: 0, color: '#d8b04a', description: 'Grow the ingot, slice, polish. 300mm blanks are ~$45 before anyone interesting touches them.' }),
  B({ id: 'euv_litho',     name: 'EUV Lithography', icon: '▭', kind: 'factory', tier: 'Silicon', cost: 380000000,  monthlyCost: 4000000,  computeDraw: 900,  computeSupply: 0, dataRisk: 0, color: '#e0d13c', description: 'ASML EXE:5200B is ~$380M, weighs 150 tonnes and ships in 250 crates. No EUV, no sub-7nm. This is the chokepoint.' }),
  B({ id: 'die_test',      name: 'Die Test & Dicing',icon: '◫',kind: 'factory', tier: 'Silicon', cost: 900000,     monthlyCost: 120000,   computeDraw: 400,  computeSupply: 0, dataRisk: 0, color: '#e08a3c', description: 'TSMC N2 yields 70-80% on logic test chips. Yield loss here is why the last 20% of a node takes years.' }),
  B({ id: 'hbm_stacker',   name: 'HBM Stacking',    icon: '▥', kind: 'factory', tier: 'Silicon', cost: 2400000,    monthlyCost: 300000,   computeDraw: 500,  computeSupply: 0, dataRisk: 0, color: '#f26d3d', description: '12-Hi HBM4 runs ~$550 a stack and SK hynix took ~$560/device from NVIDIA. 2026 supply is sold out.' }),
  B({ id: 'cowos_pack',    name: 'CoWoS Packaging', icon: '▤', kind: 'factory', tier: 'Silicon', cost: 6000000,    monthlyCost: 700000,   computeDraw: 700,  computeSupply: 0, dataRisk: 0, color: '#ff6d3d', description: 'The real ceiling on GPU supply. Booking window 52-78 weeks; 85%+ of 2026-27 capacity is already locked.' }),
  B({ id: 'rack_integrator',name:'Rack Integration',icon: '⛁', kind: 'factory', tier: 'Silicon', cost: 3000000,    monthlyCost: 400000,   computeDraw: 600,  computeSupply: 0, dataRisk: 0, color: '#ffd24a', description: '72 accelerators, ~120kW, ~$3M a rack. NVIDIA captures ~90% of system value; integrators keep the scraps.' }),

  // ======================================================================
  // CONTRACTS — customers. This is the only place money comes from.
  // ======================================================================
  B({ id: 'consumer_app',  name: 'Consumer App',    icon: '◎', kind: 'contract', tier: 'Contracts', cost: 100,     monthlyCost: 0,    computeDraw: 4,  computeSupply: 0, dataRisk: 1, color: '#8a8f9e', description: 'Prosumer subscriptions. Pays little per answer, never does security review, churns constantly.' }),
  B({ id: 'smb_pilot',     name: 'SMB Pilot',       icon: '◐', kind: 'contract', tier: 'Contracts', cost: 600,     monthlyCost: 0,    computeDraw: 6,  computeSupply: 0, dataRisk: 1, color: '#7a9fb8', description: 'ACV under $15k, closes in 14-30 days. About 10-15% of pilots ever reach production.' }),
  B({ id: 'midmarket',     name: 'Mid-Market SaaS', icon: '◑', kind: 'contract', tier: 'Contracts', cost: 5000,    monthlyCost: 0,    computeDraw: 10, computeSupply: 0, dataRisk: 1, color: '#5f8fc4', description: 'ACV $50-100k, 60-90 day cycle. Will not sign without SOC 2, and will ask who your subprocessors are.' }),
  B({ id: 'enterprise',    name: 'Enterprise',      icon: '◒', kind: 'contract', tier: 'Contracts', cost: 40000,   monthlyCost: 0,    computeDraw: 20, computeSupply: 0, dataRisk: 0, color: '#4a6fa8', description: 'ACV $100k+, 90-180+ days. Median B2B cycle is 84 days and rising, driven by security due diligence.' }),
  B({ id: 'regulated',     name: 'Health / Finance',icon: '✚', kind: 'contract', tier: 'Contracts', cost: 120000,  monthlyCost: 0,    computeDraw: 30, computeSupply: 0, dataRisk: 0, color: '#c46f6f', description: 'HIPAA, HITRUST, FFIEC, SR 11-7. Pays extremely well and will not let your data leave the building.' }),
  B({ id: 'federal',       name: 'Federal / DoD',   icon: '★', kind: 'contract', tier: 'Contracts', cost: 600000,  monthlyCost: 0,    computeDraw: 40, computeSupply: 0, dataRisk: 0, color: '#6f8fc4', description: 'DoD took 98.9% of $91.8B in 2026 federal AI award value. CDAO ceilings were $200M each to four labs.' }),
  B({ id: 'hyperscaler',   name: 'Hyperscaler Deal',icon: '⛁', kind: 'contract', tier: 'Contracts', cost: 2000000, monthlyCost: 0,    computeDraw: 50, computeSupply: 0, dataRisk: 0, color: '#ffb03d', description: 'Sell racks instead of tokens. NVIDIA runs 75% gross margin because HBM and packaging cost belong to someone else.' }),
  B({ id: 'api_platform',  name: 'API Platform',    icon: '⬢', kind: 'contract', tier: 'Contracts', cost: 8000000, monthlyCost: 0,    computeDraw: 80, computeSupply: 0, dataRisk: 2, color: '#ffd24a', description: 'Be the provider. Anthropic reported a $65B run rate; OpenAI $40B+. Pure token resale earns 0% — OpenRouter proves it.' }),

  // ======================================================================
  // HOME LAB — hardware you own. Zero marginal cost, real capital cost,
  // and a capital cost that goes up while you play.
  // ======================================================================
  B({ id: 'hf_hub',      name: 'Hugging Face Hub', icon: '🤗', kind: 'source',  tier: 'Home Lab', cost: 0,     monthlyCost: 9,   computeDraw: 4,  computeSupply: 0, dataRisk: 0, color: '#f5b942', description: 'Well past a million models hosted, Pro is $9/mo, and the download is free. The disk it lands on is now the expensive part.' }),
  B({ id: 'quant_bench', name: 'Quantization Bench',icon: '⬓', kind: 'factory', tier: 'Home Lab', cost: 400,   monthlyCost: 0,   computeDraw: 90, computeSupply: 0, dataRisk: 0, color: '#e0a03c', description: 'Q4_K_M lands near 4.8 bits per weight. A 70B drops from 140GB to about 40GB and loses a few points of benchmark.' }),

  B({ id: 'parts_shop',  name: 'Parts Distributor',icon: '▦', kind: 'source',  tier: 'Home Lab', cost: 250,   monthlyCost: 0,   computeDraw: 2,  computeSupply: 0, dataRisk: 0, color: '#8a94a8', description: 'CPU, memory, storage, a box to put them in. Two of those four have quadrupled since 2024 and two have not moved.' }),
  B({ id: 'gpu_market',  name: 'GPU Market',       icon: '◨', kind: 'source',  tier: 'Home Lab', cost: 300,   monthlyCost: 0,   computeDraw: 2,  computeSupply: 0, dataRisk: 0, color: '#76b900', description: 'New, used, and whatever a data centre is decommissioning this quarter. VRAM per dollar has got worse every generation since 2020.' }),
  B({ id: 'psu_shelf',   name: 'PSU Shelf',        icon: '⚡', kind: 'source',  tier: 'Home Lab', cost: 100,   monthlyCost: 0,   computeDraw: 1,  computeSupply: 0, dataRisk: 0, color: '#c9a13d', description: 'The cheapest component in the build, and the only one that can destroy every other component in the build.' }),
  B({ id: 'bench_build', name: 'Bench Build',      icon: '⚒', kind: 'factory', tier: 'Home Lab', cost: 200,   monthlyCost: 0,   computeDraw: 3,  computeSupply: 0, dataRisk: 0, color: '#9aa4b8', description: 'Parts in, bare rig out. Everything except the two decisions that matter: which card, and which power supply.' }),
  B({ id: 'byo_bay',     name: 'BYO Rack Bay',     icon: '▣', kind: 'capacity',tier: 'Home Lab', cost: 350,   monthlyCost: 34,  computeDraw: 0,  computeSupply: 0, dataRisk: 0, color: '#7fa860', description: 'A bare rig, a graphics card and a power supply. Cheapest throughput you can own — until the power supply decides otherwise.' }),

  B({ id: 'gaming_pc',   name: 'Gaming PC',        icon: '▤', kind: 'capacity',tier: 'Home Lab', cost: 1200,  monthlyCost: 28,  computeDraw: 0, computeSupply: 90,   dataRisk: 0, color: '#5b8f4a', priceElasticity: 0.25, description: 'One used 3090 and 24GB of VRAM. The cheapest way to run an 8B at speed, and 24GB is the wall every hobbyist hits.' }),
  B({ id: 'mac_mini',    name: 'Mac Mini M4 Pro',  icon: '▢', kind: 'capacity',tier: 'Home Lab', cost: 2199,  monthlyCost: 9,   computeDraw: 0, computeSupply: 70,   dataRisk: 0, color: '#a8a8b0', priceElasticity: 0.20, description: '64GB unified at 273 GB/s. Slow, silent, and it holds models a 5090 cannot.' }),
  B({ id: 'framework_pc',name: 'Framework Desktop',icon: '▥', kind: 'capacity',tier: 'Home Lab', cost: 1999,  monthlyCost: 14,  computeDraw: 0, computeSupply: 95,   dataRisk: 0, color: '#e07a3c', priceElasticity: 0.28, description: 'Strix Halo, 128GB unified with 96GB allocatable to the GPU, 256 GB/s. Best dollars per gigabyte on the shelf.' }),
  B({ id: 'dgx_spark',   name: 'DGX Spark',        icon: '◧', kind: 'capacity',tier: 'Home Lab', cost: 3999,  monthlyCost: 16,  computeDraw: 0, computeSupply: 130,  dataRisk: 0, color: '#76b900', priceElasticity: 0.30, description: 'About 1 PFLOP of FP4 against 273 GB/s of feed. Launched at $3,999 and was repriced to $4,699 in February 2026 on memory supply alone.' }),
  B({ id: 'mac_studio_512',name:'Mac Studio 512GB',icon: '◫', kind: 'capacity',tier: 'Home Lab', cost: 9499,  monthlyCost: 22,  computeDraw: 0, computeSupply: 420,  dataRisk: 0, color: '#c8c8d0', priceElasticity: 0.22, withdrawnAtIndex: 3.4, description: '512GB unified at 819 GB/s — the only machine here that runs a 671B model in 4-bit, off a wall socket. Apple withdrew this configuration in March 2026 rather than reprice it.' }),
  B({ id: 'mac_studio_256',name:'Mac Studio 256GB',icon: '◪', kind: 'capacity',tier: 'Home Lab', cost: 7499,  monthlyCost: 20,  computeDraw: 0, computeSupply: 380,  dataRisk: 0, color: '#b8b8c0', priceElasticity: 0.26, description: 'What is left after the withdrawal. The 96GB to 256GB upgrade went from $1,600 to $2,000 the same week.' }),
  B({ id: 'dgx_station', name: 'DGX Station GB300',icon: '▰', kind: 'capacity',tier: 'Home Lab', cost: 79000, monthlyCost: 340, computeDraw: 0, computeSupply: 3400, dataRisk: 0, color: '#4a8f2a', priceElasticity: 0.32, description: '784GB coherent memory — a datacenter node in a deskside box. The price is an estimate; NVIDIA has never published one.' }),
  B({ id: 'homelab_rack',name: 'Homelab Rack',     icon: '⛁', kind: 'capacity',tier: 'Home Lab', cost: 22000, monthlyCost: 780, computeDraw: 0, computeSupply: 6200, dataRisk: 0, color: '#5a9f3a', priceElasticity: 0.20, description: 'Four ex-datacenter A100 40GB at about $5,000 each. Three years old, fully depreciated, and still the best dollars per kTPM in the game.' }),

  // ======================================================================
  // LOCAL MODELS — no vendor, no per-token cost, no data leaving the room
  // ======================================================================
  B({ id: 'llama_local', name: 'Llama Local 8B',   icon: '⬡', kind: 'factory', tier: 'Local Models', cost: 0, monthlyCost: 0, computeDraw: 60,  computeSupply: 0, dataRisk: 0, color: '#7a8fd8', description: 'Runs on one 24GB card. Free forever, and about as good as a 2024 mid-tier model.' }),
  B({ id: 'qwen_local',  name: 'Qwen3 Local 32B',  icon: '⊙', kind: 'factory', tier: 'Local Models', cost: 0, monthlyCost: 0, computeDraw: 140, computeSupply: 0, dataRisk: 0, color: '#8f7fd8', description: 'Best capability per gigabyte on the open list. Chinese weights — and dataRisk 0, because nothing leaves the building. The API version carries 8.' }),
  B({ id: 'gptoss_local',name: 'gpt-oss-120b Local',icon:'⬣', kind: 'factory', tier: 'Local Models', cost: 0, monthlyCost: 0, computeDraw: 300, computeSupply: 0, dataRisk: 0, color: '#3ab88f', description: 'Apache 2.0, mixture-of-experts, fits on one 96GB card. An American lab\'s open weights, which is what gets it past procurement.' }),
  B({ id: 'ds_local',    name: 'DeepSeek-R1 Local',icon: '⏻', kind: 'factory', tier: 'Local Models', cost: 0, monthlyCost: 0, computeDraw: 900, computeSupply: 0, dataRisk: 0, color: '#4d6bfe', description: '671B of frontier-class reasoning off one desktop. Slowly. This is the model that justified the 512GB Mac Studio, before it went away.' }),

  // ======================================================================
  // SLOP — generating content is trivial. Selling it is the hard part.
  // ======================================================================
  B({ id: 'prompt_bench',name: 'Prompt Bench',     icon: '❝', kind: 'factory', tier: 'Slop', cost: 150,   monthlyCost: 0,   computeDraw: 20,  computeSupply: 0, dataRisk: 0, slopRisk: 1, color: '#8a7f9e', description: 'The cheapest part of the job, and the part everyone mistakes for the whole job.' }),
  B({ id: 'text_mill',   name: 'Text Mill',        icon: '≡', kind: 'factory', tier: 'Slop', cost: 200,   monthlyCost: 0,   computeDraw: 90,  computeSupply: 0, dataRisk: 1, slopRisk: 4, color: '#9e8fa8', description: 'Roughly 57% of sentences on the open web are already machine-translated. You are not starting a trend.' }),
  B({ id: 'image_gen',   name: 'Image Gen',        icon: '▩', kind: 'factory', tier: 'Slop', cost: 400,   monthlyCost: 0,   computeDraw: 220, computeSupply: 0, dataRisk: 2, slopRisk: 5, color: '#c47fd0', description: 'About four cents an image at standard quality. Cheap enough that nobody stops to ask whether they wanted it.' }),
  B({ id: 'video_gen',   name: 'Video Gen',        icon: '▶', kind: 'factory', tier: 'Slop', cost: 2000,  monthlyCost: 0,   computeDraw: 900, computeSupply: 0, dataRisk: 2, slopRisk: 7, color: '#d0607f', description: 'Roughly $0.75 per second at launch pricing. One minute of video is $45 — the only node here where the token bill is frightening.' }),
  B({ id: 'packager',    name: 'Content Packager', icon: '❑', kind: 'factory', tier: 'Slop', cost: 1200,  monthlyCost: 120, computeDraw: 60,  computeSupply: 0, dataRisk: 1, slopRisk: 2, color: '#c98a3d', description: 'Text, images and video assembled into something a buyer takes delivery of. This is the node that makes the difference between a hobby and a business.' }),
  B({ id: 'legal_desk',  name: 'Legal Desk',       icon: '⚖', kind: 'factory', tier: 'Slop', cost: 6000,  monthlyCost: 2400,computeDraw: 20,  computeSupply: 0, dataRisk: 0, slopRisk: -6, color: '#8a9ec4', description: 'Answers the takedown notices. Halves your IP fine odds while it has work, which is the only lever you get against the first of the four risks.' }),
  B({ id: 'ablit_rig',   name: 'Abliteration Rig', icon: '⊘', kind: 'factory', tier: 'Slop', cost: 8000,  monthlyCost: 0,   computeDraw: 1400,computeSupply: 0, dataRisk: 6, slopRisk: 5, color: '#a03d6f', description: 'Refusal behaviour is mediated by a single direction in activation space. Ablate it and the refusals stop. No retraining, and the research is public.' }),
  B({ id: 'nsfw_studio', name: 'NSFW Studio',      icon: '◉', kind: 'factory', tier: 'Slop', cost: 15000, monthlyCost: 900, computeDraw: 700, computeSupply: 0, dataRisk: 9, slopRisk: 9, color: '#b03d5f', description: 'Nine points of Exposure, and the abliteration rig it needs adds six more. Fifteen is over the ceiling on Health/Finance and Federal, and level with Enterprise — read the ceilings before you wire this up.' }),

  // ======================================================================
  // CONTRACTS — SME and slop customers. Signed from the board, like the rest.
  // ======================================================================
  B({ id: 'sme_pilot',   name: 'SME On-Prem Pilot',icon: '◍', kind: 'contract',tier: 'Contracts', cost: 2500,  monthlyCost: 0, computeDraw: 6,  computeSupply: 0, dataRisk: 0, color: '#4a9f6a', description: 'A ten-person firm with client confidentiality and no DPO. They cannot use an API and they can afford one box. One to ten concurrent users needs a 24GB card — that is the whole specification.' }),
  B({ id: 'sme_fleet',   name: 'Managed On-Prem',  icon: '◎', kind: 'contract',tier: 'Contracts', cost: 25000, monthlyCost: 0, computeDraw: 14, computeSupply: 0, dataRisk: 0, color: '#3f9f8a', description: 'You are not selling answers any more. You are selling someone else\'s server, and you are on the hook when it dies.' }),
  B({ id: 'sme_msp',     name: 'Regional MSP',     icon: '◉', kind: 'contract',tier: 'Contracts', cost: 150000,monthlyCost: 0, computeDraw: 30, computeSupply: 0, dataRisk: 0, color: '#3a8fa8', description: 'Every box you have sold is a box you now maintain. The margin is real and so is the pager. GDPR fines reach 4% of global annual turnover.' }),
  B({ id: 'feed_post',   name: 'Post To Feed',     icon: '⌇', kind: 'contract',tier: 'Contracts', cost: 0,     monthlyCost: 0, computeDraw: 2,  computeSupply: 0, dataRisk: 0, slopRisk: 2, color: '#7d8b9c', description: 'You spent real money to make this and nobody is going to pay you for it. Attention was the thing you were buying.' }),
  B({ id: 'content_mill',name: 'Content Mill',     icon: '✍', kind: 'contract',tier: 'Contracts', cost: 900,   monthlyCost: 0, computeDraw: 4,  computeSupply: 0, dataRisk: 1, slopRisk: 3, color: '#c98a5f', description: 'Over a thousand unreliable AI-generated news sites were being tracked by 2025. They pay per piece, on delivery, and they will not automate for you.' }),
  B({ id: 'pseo_platform',name:'Programmatic SEO', icon: '⌸', kind: 'contract',tier: 'Contracts', cost: 12000, monthlyCost: 0, computeDraw: 10, computeSupply: 0, dataRisk: 1, slopRisk: 4, color: '#b8923d', description: 'Less per unit than clicking Generate yourself, and it runs while you are asleep. That is the entire argument for building a pipeline.' }),
  B({ id: 'adult_platform',name:'Adult Platform',  icon: '◐', kind: 'contract',tier: 'Contracts', cost: 40000, monthlyCost: 0, computeDraw: 12, computeSupply: 0, dataRisk: 2, slopRisk: 6, color: '#a03d5f', description: 'Age-assurance regimes went live in the UK and were upheld for Texas at the US Supreme Court in 2025. Payment processors moved on storefronts the same summer.' }),
];
