/**
 * RECIPES ---------------------------------------------------------------
 * One craft cycle: pay `cost`, consume every `input`, wait `seconds`, emit
 * every `output`, then collect `payout`.
 *
 * Conventions:
 *   - no inputs                -> a source (runs forever, free input)
 *   - no inputs and no outputs -> a capacity node just running
 *   - `payout` set             -> a contract. Inputs count toward milestones.
 *   - `maxExposure`            -> the customer refuses to run while your
 *                                 global Exposure is above this. This is the
 *                                 security-review gate, and it is why cheap
 *                                 providers cost you the good contracts.
 *
 * MONEY: one unit of a data item = 100 real operations, so `cost` is the real
 * published price of 100 requests at roughly 10k input / 2k output tokens.
 * The ratios between providers are real. The absolute scale is compressed.
 */
export interface RecipeStack {
  itemId: string;
  qty: number;
}

export interface Recipe {
  id: string;
  name: string;
  buildingId: string;
  seconds: number;
  inputs: RecipeStack[];
  outputs: RecipeStack[];
  /**
   * Present but never consumed. Model weights are a tool, not an ingredient:
   * serving a model does not use it up. A catalyst must be sitting in the input
   * buffer for the craft to start, and it is still there afterwards.
   *
   * Without this a serving node has to emit its own weights back out, which it
   * cannot link to itself — so the output buffer fills and the node blocks.
   */
  catalysts?: RecipeStack[];
  /** $ debited when the craft starts. Per-token API spend. */
  cost?: number;
  /** $ credited when the craft finishes. Contracts only. */
  payout?: number;
  /** Contract refuses to run above this global Exposure. */
  maxExposure?: number;
  /** Shown in the inspector. Teach something true. */
  note?: string;

  // --- Home Lab -----------------------------------------------------------
  /**
   * Chance per minute that this build simply lets go. A no-name power supply
   * without ATX 3.1 excursion headroom, behind a card that spikes past twice
   * its rating for microseconds, is the whole of this number.
   */
  failureRatePerMin?: number;
  /** Overrides the chassis's computeSupply. One bay, many builds. */
  computeSupply?: number;
  /**
   * This customer sends someone to look. The contract will not run unless you
   * have `count` working machines of `tier` placed — and a blown one does not
   * count, which is how a power supply failure becomes a revenue failure.
   */
  requiresOnSite?: { tier: BuildingTier; count: number };

  // --- Slop ---------------------------------------------------------------
  /** Never auto-starts. One craft per press of Generate, and no way around it. */
  manual?: boolean;
  /** Marks a contract as a slop sale, and which incident table it draws. */
  slopSale?: 'generic' | 'nsfw';
  /** This craft can produce nothing at all — the distraction risk. */
  slopGenerated?: boolean;

  // --- ESG addon ----------------------------------------------------------
  /**
   * Contract refuses to run above this Footprint. Mirrors `maxExposure`, with
   * one difference that is the whole point of the addon: it reads the number
   * you PUBLISHED, falling back to the real one when you have published
   * nothing. Not disclosing is honest by default; the lie has to be chosen.
   */
  maxFootprint?: number;
  /**
   * Contract will not run at all without a currently-valid disclosure on file.
   * Only ever put on a contract unlocked AFTER the Sustainability Officer, or
   * the gate shuts before the player owns the tool that opens it.
   */
  requiresDisclosure?: boolean;
  /**
   * Added to the Governance score while this recipe is the one selected. Where
   * the training corpus came from is a choice made per craft, not per chassis.
   */
  provenanceRisk?: number;
  /** Litres per craft, for water that is not a function of how a building is cooled. */
  waterLitres?: number;
}

import type { BuildingTier } from './buildings';

const i = (itemId: string, qty: number): RecipeStack => ({ itemId, qty });

export const RECIPES: Recipe[] = [
  // ======================================================================
  // DEMAND
  // ======================================================================
  { id: 'organic',      name: 'Organic Signups', buildingId: 'landing_page', seconds: 6,  inputs: [], outputs: [i('user_request', 3)], note: 'Free, slow, and it compounds. The only demand you keep when the ad budget stops.' },
  { id: 'buy_traffic',  name: 'Buy Traffic',     buildingId: 'ad_spend',     seconds: 4,  inputs: [], outputs: [i('user_request', 6)], note: 'Instant volume for $900/mo. Stop paying and it goes to zero the same day.' },
  { id: 'take_tickets', name: 'Take Tickets',    buildingId: 'support_desk', seconds: 8,  inputs: [], outputs: [i('support_ticket', 3)], note: 'Work that already has a customer attached.' },
  { id: 'parse_docs',   name: 'Parse Documents', buildingId: 'doc_ingest',   seconds: 10, inputs: [], outputs: [i('document', 2)], cost: 3, note: 'Unstructured is $0.015/page. LlamaParse basic is ~$0.00125/page — a 12x spread on the same job.' },
  { id: 'web_search',   name: 'Web Search',      buildingId: 'search_api',   seconds: 6,  inputs: [], outputs: [i('web_page', 4)], cost: 2.8, note: 'Exa $7 per 1k queries. SerpApi Starter is $25. Retrieval source is a real optimisation.' },

  // ======================================================================
  // MODELS — reasoning tier (frontier only). Feeds agents.
  // ======================================================================
  { id: 'r_gpt6',       name: 'Astra Reasoning',   buildingId: 'gpt6',         seconds: 8, inputs: [i('grounded_prompt', 2)], outputs: [i('reasoning_answer', 2)], cost: 40.0, note: '$10/$50 per 1M. The most expensive tokens on the market, and sometimes the only ones that finish the job.' },
  { id: 'r_fable',      name: 'Fable Reasoning',   buildingId: 'claude_fable', seconds: 8, inputs: [i('grounded_prompt', 2)], outputs: [i('reasoning_answer', 2)], cost: 40.0, note: 'A Covered Model: 30-day retention is mandatory. The best model costs you your zero-retention posture.' },
  { id: 'r_opus',       name: 'Opus Reasoning',    buildingId: 'claude_opus',  seconds: 7, inputs: [i('grounded_prompt', 2)], outputs: [i('reasoning_answer', 2)], cost: 20.0, note: '$5/$25 per 1M. Half the price of the top tier for most of the capability.' },
  { id: 'r_gemini',     name: 'Gemini Reasoning',  buildingId: 'gemini_pro',   seconds: 7, inputs: [i('grounded_prompt', 2)], outputs: [i('reasoning_answer', 2)], cost: 8.8,  note: '$2/$12 per 1M — the cheapest Western frontier tier by a wide margin.' },
  { id: 'r_grok',       name: 'Grok Reasoning',    buildingId: 'grok',         seconds: 8, inputs: [i('grounded_prompt', 2)], outputs: [i('reasoning_answer', 2)], cost: 6.4,  note: '$2/$6 per 1M. Cheapest output tokens of any Western frontier-adjacent model.' },
  { id: 'r_kimi',       name: 'Kimi Reasoning',    buildingId: 'kimi',         seconds: 8, inputs: [i('grounded_prompt', 2)], outputs: [i('reasoning_answer', 2)], cost: 12.0, note: 'A Chinese model priced at US frontier levels — and open weights. Geography is not the whole story.' },
  { id: 'r_glm',        name: 'GLM Reasoning',     buildingId: 'glm',          seconds: 8, inputs: [i('grounded_prompt', 2)], outputs: [i('reasoning_answer', 2)], cost: 4.6,  note: '$1.40/$4.40 per 1M with a 1.31M window. Frontier capability at mid-tier prices.' },
  { id: 'r_deepseek',   name: 'DeepSeek Reasoning',buildingId: 'deepseek_pro', seconds: 8, inputs: [i('grounded_prompt', 2)], outputs: [i('reasoning_answer', 2)], cost: 4.2,  note: '10x under GPT-6 for frontier-class output. Off-peak (most hours) halves it again. Your prompts are stored in the PRC.' },

  // ======================================================================
  // MODELS — answer tier. The workhorse traffic.
  // ======================================================================
  { id: 'a_sonnet',     name: 'Sonnet Serve',   buildingId: 'claude_sonnet', seconds: 6, inputs: [i('user_request', 3)], outputs: [i('answer', 3)], cost: 12.0, note: '$2/$10 per 1M. Most production traffic belongs here, not at the frontier.' },
  { id: 'a_sonnet_rag', name: 'Sonnet + Context',buildingId:'claude_sonnet', seconds: 6, inputs: [i('grounded_prompt', 3)], outputs: [i('answer', 4)], cost: 12.0, note: 'Same spend, more usable output. Grounding is the cheapest quality upgrade there is.' },
  { id: 'a_tickets',    name: 'Ticket Triage', buildingId: 'claude_sonnet', seconds: 6, inputs: [i('support_ticket', 3)], outputs: [i('answer', 4)], cost: 12.0, note: 'A ticket carries its own context, so the same spend buys more usable output than a cold request.' },
  { id: 'a_terra',      name: 'Terra Serve',    buildingId: 'gpt_terra',     seconds: 6, inputs: [i('user_request', 3)], outputs: [i('answer', 3)], cost: 13.2, note: '$2/$12 per 1M. Tier 1 caps you at 500k TPM; Tier 5 gives 40M.' },
  { id: 'a_grok',       name: 'Grok Serve',     buildingId: 'grok',          seconds: 6, inputs: [i('user_request', 3)], outputs: [i('answer', 3)], cost: 9.6 },
  { id: 'a_mistral',    name: 'Mistral Serve',  buildingId: 'mistral_large', seconds: 6, inputs: [i('user_request', 3)], outputs: [i('answer', 3)], cost: 2.4,  note: '$0.50/$1.50 per 1M, open weights, EU residency available. Absurdly underrated.' },
  { id: 'a_deepseek',   name: 'DeepSeek Serve', buildingId: 'deepseek_pro',  seconds: 6, inputs: [i('user_request', 3)], outputs: [i('answer', 3)], cost: 6.3 },
  { id: 'a_glm',        name: 'GLM Serve',      buildingId: 'glm',           seconds: 6, inputs: [i('user_request', 3)], outputs: [i('answer', 3)], cost: 6.9 },
  { id: 'a_kimi',       name: 'Kimi Serve',     buildingId: 'kimi',          seconds: 6, inputs: [i('user_request', 3)], outputs: [i('answer', 3)], cost: 18.0 },

  // ======================================================================
  // MODELS — draft tier. Cheap, ungraded, needs a judge.
  // ======================================================================
  { id: 'd_haiku',      name: 'Haiku Draft',     buildingId: 'claude_haiku',   seconds: 5, inputs: [i('user_request', 4)], outputs: [i('draft_answer', 4)], cost: 8.0 },
  { id: 'd_flash',      name: 'Flash Draft',     buildingId: 'gemini_flash',   seconds: 5, inputs: [i('user_request', 4)], outputs: [i('draft_answer', 4)], cost: 6.0, note: 'Promo pricing through 2026. It doubles on 1 Jan 2027 — plan the migration now.' },
  { id: 'd_luna',       name: 'Luna Draft',      buildingId: 'gpt_luna',       seconds: 5, inputs: [i('user_request', 4)], outputs: [i('draft_answer', 4)], cost: 1.76 },
  { id: 'd_minimax',    name: 'MiniMax Draft',   buildingId: 'minimax',        seconds: 5, inputs: [i('user_request', 4)], outputs: [i('draft_answer', 4)], cost: 1.6 },
  { id: 'd_dsflash',    name: 'DeepSeek Draft',  buildingId: 'deepseek_flash', seconds: 5, inputs: [i('user_request', 4)], outputs: [i('draft_answer', 4)], cost: 2.8 },
  { id: 'd_qwen',       name: 'Qwen Draft',      buildingId: 'qwen_flash',     seconds: 5, inputs: [i('user_request', 4)], outputs: [i('draft_answer', 4)], cost: 0.24, note: '$0.03/$0.13 per 1M. The floor of the entire market — roughly 300x under frontier.' },
  { id: 'd_mistral',    name: 'Mistral Draft',   buildingId: 'mistral_large',  seconds: 5, inputs: [i('user_request', 4)], outputs: [i('draft_answer', 4)], cost: 3.2 },

  // ======================================================================
  // JUDGES — turn cheap drafts into shippable answers. Model cascade.
  // ======================================================================
  { id: 'j_haiku',      name: 'Haiku Judge',    buildingId: 'claude_haiku', seconds: 6, inputs: [i('draft_answer', 5)], outputs: [i('answer', 4)], cost: 10.0, note: 'LLM-as-judge. You lose 20% of drafts and you pay for the grading. Still far under frontier.' },
  { id: 'j_flash',      name: 'Flash Judge',    buildingId: 'gemini_flash', seconds: 6, inputs: [i('draft_answer', 5)], outputs: [i('answer', 4)], cost: 7.5 },
  { id: 'j_luna',       name: 'Luna Judge',     buildingId: 'gpt_luna',     seconds: 6, inputs: [i('draft_answer', 5)], outputs: [i('answer', 4)], cost: 2.2 },
  { id: 'j_minimax',    name: 'MiniMax Judge',  buildingId: 'minimax',      seconds: 6, inputs: [i('draft_answer', 5)], outputs: [i('answer', 4)], cost: 2.0 },
  { id: 'j_qwen',       name: 'Qwen Judge',     buildingId: 'qwen_flash',   seconds: 6, inputs: [i('draft_answer', 5)], outputs: [i('answer', 3)], cost: 0.3, note: 'A cheap judge is a bad judge: you lose 40% instead of 20%. Grading quality is quality.' },

  // ======================================================================
  // RETRIEVAL
  // ======================================================================
  { id: 'chunk_docs',   name: 'Chunk Documents', buildingId: 'chunker',  seconds: 6, inputs: [i('document', 1)], outputs: [i('chunk', 8)], note: 'Free to run. Chunking strategy is most of RAG quality, and nobody budgets for it.' },
  { id: 'chunk_web',    name: 'Chunk Web Pages', buildingId: 'chunker',  seconds: 6, inputs: [i('web_page', 2)], outputs: [i('chunk', 8)] },
  { id: 'embed',        name: 'Embed Chunks',    buildingId: 'embedder', seconds: 5, inputs: [i('chunk', 8)], outputs: [i('embedding', 8)], cost: 0.16, note: 'text-embedding-3-small is $0.02 per 1M tokens. The cheapest model call in the whole stack.' },

  { id: 'rag_pg',       name: 'pgvector RAG',    buildingId: 'pgvector',    seconds: 8, inputs: [i('embedding', 6),  i('user_request', 3)], outputs: [i('grounded_prompt', 3)], cost: 0.5, note: 'Free vectors on the Postgres you already run — until filters bite. Approximate indexes filter AFTER the scan.' },
  { id: 'rag_pine',     name: 'Pinecone RAG',    buildingId: 'pinecone',    seconds: 7, inputs: [i('embedding', 8),  i('user_request', 5)], outputs: [i('grounded_prompt', 5)], cost: 2.0, note: '~$16 per 1M read units. Query traffic is the bill, not storage.' },
  { id: 'rag_tpuf',     name: 'turbopuffer RAG', buildingId: 'turbopuffer', seconds: 8, inputs: [i('embedding', 12), i('user_request', 9)], outputs: [i('grounded_prompt', 9)], cost: 3.0, note: '$1 per PB scanned. Object storage wins on price exactly when volume gets serious.' },
  { id: 'rag_qdrant',   name: 'Qdrant RAG',     buildingId: 'qdrant_local', seconds: 9, inputs: [i('embedding', 7),  i('user_request', 4)], outputs: [i('grounded_prompt', 4)], note: 'No per-query fee and nothing to list as a subprocessor — the vectors never leave the machine you already run.' },
  { id: 'cache_run',    name: 'Serve Cache',     buildingId: 'redis_cache', seconds: 1, inputs: [], outputs: [], note: 'Cache reads bill at 10% of input. Repeat prefixes are throughput you did not have to buy.' },

  // ======================================================================
  // AGENTS
  // ======================================================================
  { id: 'mcp_tools',    name: 'MCP Tool Calls',  buildingId: 'mcp_server',  seconds: 6, inputs: [i('user_request', 3)], outputs: [i('tool_result', 3)], cost: 0.3, note: 'N x M integrations become N + M. Also: four of six documented MCP incidents arrived via an issue, ticket, PR or email.' },
  { id: 'saas_actions', name: 'Workspace Actions',buildingId:'saas_notion', seconds: 6, inputs: [i('user_request', 3)], outputs: [i('tool_result', 4)], note: 'APIs are free with the seat. You pay per human, not per call.' },
  { id: 'money_actions',name: 'Billing Actions', buildingId: 'saas_stripe', seconds: 5, inputs: [i('user_request', 2)], outputs: [i('tool_result', 3)], cost: 0.6, note: '2.9% + $0.30 per charge. Letting an agent touch money is where blast radius stops being theoretical.' },

  { id: 'run_agent',    name: 'Run Agent',       buildingId: 'harness',     seconds: 12, inputs: [i('reasoning_answer', 1), i('answer', 4), i('tool_result', 2)], outputs: [i('agent_run', 2)], cost: 1.0, note: 'One task = one plan plus many calls. The harness is free; the loop iterations are the entire bill.' },
  { id: 'run_swarm',    name: 'Run Agent Graph', buildingId: 'multi_agent', seconds: 20, inputs: [i('agent_run', 3), i('reasoning_answer', 2)], outputs: [i('agent_workflow', 2)], cost: 4.0, note: 'Planner, workers, critic. Quality goes up; token burn goes up faster.' },

  { id: 'verify',       name: 'Evaluate & Gate', buildingId: 'eval_gate',     seconds: 8, inputs: [i('answer', 5)], outputs: [i('verified_answer', 4)], cost: 6.0, note: 'Turns output into output you will sign a contract about. Also drops Exposure.' },
  { id: 'verify_sov',   name: 'Gate Sovereign',  buildingId: 'eval_gate',     seconds: 8, inputs: [i('sovereign_answer', 5)], outputs: [i('verified_answer', 5)], cost: 4.0 },
  { id: 'observe',      name: 'Trace Everything',buildingId: 'observability', seconds: 2, inputs: [], outputs: [], note: '68% of breached organisations had no AI governance at all; 92% of AI breaches lacked access controls.' },
  // Consumes nothing and emits nothing: what it spends is 90 seconds and a
  // salary. Every completed cycle re-signs whichever lapsed contract has been
  // sitting frozen longest, at the same quarter-price fee you would pay by
  // hand. A Support Agent does this the tick a term ends; a person takes a
  // minute and a half and can only do one at a time.
  { id: 'human_renew',  name: 'Win Them Back',   buildingId: 'human_ops', seconds: 90, inputs: [], outputs: [], note: 'Renewal is a phone call, an apology and a discount. Gainsight and its competitors sell software to make this faster; none of them make it instant.' },

  // ======================================================================
  // AGENT OPS — work cycles that produce nothing and pay nothing
  //
  // Every recipe here consumes agent runs and emits an empty output list. The
  // agent runs are the point: the same units an Enterprise contract would have
  // bought at $1,050 a delivery are being spent on your own back office
  // instead. That opportunity cost IS the price of automation.
  // ======================================================================
  { id: 'ops_console',  name: 'Run Agent Ops',   buildingId: 'agent_console',     seconds: 10, inputs: [], outputs: [], note: 'The seat, the audit log, the person who gets paged. No tokens, and no output anyone can sell.' },
  { id: 'sell_junior',  name: 'Work The Board',  buildingId: 'sales_agent',       seconds: 25, inputs: [i('agent_run', 2)], outputs: [], cost: 6, note: 'One close attempt per cycle against whatever matches its focus. A dry focus costs nothing in tokens and bills the full subscription anyway.' },
  { id: 'sell_senior',  name: 'Work The Board',  buildingId: 'sales_agent_sr',    seconds: 15, inputs: [i('agent_workflow', 1)], outputs: [], cost: 20, note: 'Planner, worker, critic — pointed at a customer instead of a task. Roughly twice the close rate at four times the running cost.' },
  { id: 'market_junior',name: 'Run Campaigns',   buildingId: 'marketing_agent',   seconds: 20, inputs: [i('agent_run', 1)], outputs: [], cost: 4, note: 'Demand generation is not lead generation. This changes the mix of who calls, and the board still rings at the rate your unlocked tiers set.' },
  { id: 'market_senior',name: 'Run Campaigns',   buildingId: 'marketing_agent_sr',seconds: 18, inputs: [i('agent_workflow', 1)], outputs: [], cost: 16 },
  { id: 'code_junior',  name: 'Build A Chain',   buildingId: 'coding_agent',      seconds: 90, inputs: [i('agent_run', 4)], outputs: [], cost: 25, note: 'Ninety seconds per contract wired end to end, paying full price for every node it places. It will not think about your margin.' },
  { id: 'code_senior',  name: 'Build A Chain',   buildingId: 'coding_agent_sr',   seconds: 45, inputs: [i('agent_workflow', 3)], outputs: [], cost: 90, note: 'Reuses spare capacity already on the canvas before buying more of it, which is most of what separates a senior engineer from a fast one.' },
  { id: 'support_run',  name: 'Keep Customers',  buildingId: 'support_agent',     seconds: 24, inputs: [i('agent_run', 2)], outputs: [], cost: 8, note: 'Renewal is cheaper than acquisition in every business ever measured, and it is the half nobody automates first.' },
  { id: 'review_run',   name: 'Review Actions',  buildingId: 'review_agent',      seconds: 20, inputs: [i('agent_workflow', 1)], outputs: [], cost: 18, note: 'Oversight is a line item. Skipping it is a choice, and Drift is the number that tells you what it cost.' },

  // ======================================================================
  // COMPLIANCE — recurring attestations. Contracts consume them.
  // ======================================================================
  // --- ESG addon: overhead bought against a number that was already running.
  { id: 'esg_own',      name: 'Own The Number',  buildingId: 'sustainability_officer', seconds: 20, inputs: [], outputs: [], note: 'Reads every meter in the company and writes it down. Publishing what it finds is a separate decision, and it is yours.' },
  { id: 'esg_ppa',      name: 'Contract Clean Supply', buildingId: 'renewable_ppa', seconds: 30, inputs: [], outputs: [], note: 'Annual matching against hourly consumption is the whole argument about corporate clean power. This buys the matching, not the hours.' },
  { id: 'esg_dr',       name: 'Shed On Signal',  buildingId: 'demand_response', seconds: 20, inputs: [], outputs: [], note: 'The utility pays you to be somewhere else when the grid is tight. Nothing about your carbon changes; the invoice does.' },
  { id: 'esg_retrofit', name: 'Run Sealed',      buildingId: 'closed_loop', seconds: 40, inputs: [], outputs: [], note: 'Sealed loop, dry coolers, no evaporation. Unlocks closed-loop cooling on every node you own.' },
  { id: 'esg_heat',     name: 'Recover Heat',    buildingId: 'heat_recovery', seconds: 14, inputs: [], outputs: [i('waste_heat', 6)], cost: 8, requiresOnSite: { tier: 'Capacity', count: 2 }, note: 'A rack rejects heat at about 30C and a district network wants 70C, so the heat pump is most of the cost. Needs real capacity on site — there is nothing to recover from a rate limit.' },
  { id: 'esg_credits',  name: 'Retire Tonnes',   buildingId: 'carbon_desk', seconds: 25, inputs: [], outputs: [i('carbon_credit', 1)], cost: 12000, note: 'A 2023 investigation into one major registry concluded the large majority of its rainforest credits represented no real reduction. The auditor has read it; the relief here is discounted accordingly.' },
  { id: 'esg_annotate', name: 'Label Properly',  buildingId: 'annotation_coop', seconds: 16, inputs: [i('document', 3)], outputs: [i('annotated_data', 4)], cost: 40, note: 'A living wage, a contract, and somebody to talk to after a shift on the moderation queue. A Kenyan court ruled in 2025 that moderators could bring their claims there.' },
  { id: 'esg_ts',       name: 'Review The Queue',buildingId: 'trust_safety', seconds: 12, inputs: [], outputs: [], note: 'Looks at what the pipeline is about to ship, and at what looking at it does to the people doing the looking.' },
  { id: 'esg_ledger',   name: 'Track Provenance',buildingId: 'provenance_ledger', seconds: 18, inputs: [], outputs: [], note: 'C2PA manifests out, data cards in. Unglamorous, and the only thing that survives an audit.' },
  { id: 'esg_assure',   name: 'Commission Assurance', buildingId: 'esg_auditor', seconds: 45, inputs: [], outputs: [i('esg_report', 1)], cost: 3000, note: 'An assurance firm puts its own name on your number. That signature is what a procurement officer is actually buying.' },

  { id: 'run_soc2',     name: 'Maintain SOC 2',   buildingId: 'soc2_program',   seconds: 60, inputs: [], outputs: [i('soc2', 2)], note: 'The 3-12 month observation window is the point. You cannot pay to skip time.' },
  { id: 'run_iso',      name: 'Maintain ISO 42001',buildingId:'iso_program',    seconds: 60, inputs: [], outputs: [i('iso42001', 2)], note: 'The only AI framework that produces a certificate a procurement officer accepts.' },
  { id: 'run_hipaa',    name: 'Maintain HIPAA',   buildingId: 'hipaa_program',  seconds: 60, inputs: [], outputs: [i('hipaa_baa', 2)] },
  { id: 'run_fedramp',  name: 'Maintain FedRAMP', buildingId: 'fedramp_program',seconds: 90, inputs: [], outputs: [i('fedramp', 2)], note: '528 services are certified today; 30 of them came through the 20x fast lane.' },

  // ======================================================================
  // CAPACITY
  // ======================================================================
  { id: 'cap_free',   name: 'Free Tier',     buildingId: 'free_tier',   seconds: 1, inputs: [], outputs: [] },
  { id: 'cap_t1',     name: 'Tier 1',        buildingId: 'api_tier1',   seconds: 1, inputs: [], outputs: [] },
  { id: 'cap_t3',     name: 'Tier 3',        buildingId: 'api_tier3',   seconds: 1, inputs: [], outputs: [] },
  { id: 'cap_t5',     name: 'Tier 5',        buildingId: 'api_tier5',   seconds: 1, inputs: [], outputs: [] },
  { id: 'cap_batch',  name: 'Batch Queue',   buildingId: 'batch_lane',  seconds: 1, inputs: [], outputs: [], note: 'Half price at OpenAI, Anthropic, Google and Fireworks. You trade latency for throughput.' },
  { id: 'cap_h100',   name: 'Serve on H100', buildingId: 'rented_h100', seconds: 1, inputs: [], outputs: [] },
  { id: 'cap_b200',   name: 'Serve on B200', buildingId: 'rented_b200', seconds: 1, inputs: [], outputs: [] },
  { id: 'cap_colo',   name: 'Run Rack',      buildingId: 'colo_rack',   seconds: 240, inputs: [i('gpu_rack', 1)], outputs: [], note: '~120kW a rack. Air cooling cannot do this; direct-to-chip liquid is mandatory.' },
  { id: 'cap_dc',     name: 'Run Datacenter',buildingId: 'datacenter',  seconds: 1, inputs: [], outputs: [], note: 'Servers are 60% of annualised TCO. Energy is about 7%. Everyone gets this backwards.' },

  // ======================================================================
  // TRAINING — Act III-A
  // ======================================================================
  { id: 'get_weights', name: 'Pull Weights',   buildingId: 'weights_mirror', seconds: 20, inputs: [], outputs: [i('open_weights', 2)], note: 'Llama, Qwen, DeepSeek, Mistral Large 3. Free to download; the GPUs to serve them are not.' },
  { id: 'curate',      name: 'Curate Corpus',  buildingId: 'data_curation',  seconds: 12, inputs: [i('web_page', 6), i('document', 2)], outputs: [i('training_tokens', 6)], cost: 4, provenanceRisk: 6, note: 'Common Crawl is free, and free is what a lawsuit gets priced against. Scrape it, dedupe it, and hope nobody asks where any particular sentence came from.' },
  { id: 'curate_licensed',name:'Licensed Corpus',buildingId: 'data_curation',  seconds: 12, inputs: [i('web_page', 4), i('document', 4)], outputs: [i('training_tokens', 7)], cost: 260, provenanceRisk: 0, note: 'A $10M-250M annual lump sum, not a per-token price. Everything in the pile has a name and a signature behind it, and the price is what that costs.' },
  { id: 'curate_annotated',name:'Annotated Corpus',buildingId:'data_curation', seconds: 12, inputs: [i('annotated_data', 4)], outputs: [i('training_tokens', 9)], cost: 30, provenanceRisk: 0, note: 'Labelled by people who were paid for it. The best tokens per craft in the game, and the co-op that makes them costs more per month than most contracts pay.' },
  { id: 'curate_synth', name: 'Synthetic Corpus',buildingId: 'data_curation',  seconds: 9,  inputs: [i('draft_answer', 10)], outputs: [i('training_tokens', 8)], cost: 12, provenanceRisk: 3, note: 'Generate your own training data. Epoch puts the exhaustion of usable public text somewhere between 2026 and 2032, so everyone is trying it — and a model trained on model output drifts. This raises the Slop Index for exactly that reason.' },
  { id: 'lora',        name: 'LoRA Fine-Tune', buildingId: 'finetune_job',   seconds: 30, inputs: [i('open_weights', 1), i('training_tokens', 20)], outputs: [i('lora_adapter', 1)], cost: 300, note: 'Together: $0.48 per 1M tokens under 16B. Adapters are megabytes and hot-swap onto one served base.' },
  { id: 'full_tune',   name: 'Domain Tune',    buildingId: 'finetune_job',   seconds: 60, inputs: [i('open_weights', 1), i('training_tokens', 60), i('lora_adapter', 2)], outputs: [i('tuned_model', 1)], cost: 1500, note: 'OpenAI stops accepting new fine-tuning jobs on 6 Jan 2027. Open weights are the only path left.' },

  { id: 'serve_local', name: 'Self-Host Serve',buildingId: 'vllm_server',    seconds: 20, inputs: [i('user_request', 20)], catalysts: [i('tuned_model', 1)], outputs: [i('sovereign_answer', 20)], note: 'Zero marginal token cost — you already bought the GPUs. Weights come back out; they are not consumed.' },
  { id: 'serve_airgap',name: 'Air-Gapped Serve',buildingId:'airgap_deploy',  seconds: 24, inputs: [i('grounded_prompt', 24)], catalysts: [i('tuned_model', 1)], outputs: [i('sovereign_answer', 26)], note: 'Nothing crosses the boundary. Ops headcount runs 2-3x and models arrive quarterly on physical media.' },
  { id: 'pretrain',    name: 'Pretrain Frontier',buildingId:'pretrain_rig',  seconds: 180, inputs: [i('training_tokens', 3000)], outputs: [i('frontier_model', 1)], cost: 8000000, note: 'Chinchilla says ~20 tokens per parameter. Frontier runs blow past it because serving cost outlives training cost.' },

  // ======================================================================
  // SILICON — Act III-B
  // ======================================================================
  { id: 'mine_poly',   name: 'Refine Polysilicon',buildingId:'poly_supply',    seconds: 10, inputs: [], outputs: [i('polysilicon', 10)] },
  { id: 'slice',       name: 'Slice Wafers',      buildingId: 'wafer_slicer',  seconds: 12, inputs: [i('polysilicon', 8)], outputs: [i('blank_wafer', 4)], cost: 200 },
  { id: 'litho',       name: 'EUV Patterning',    buildingId: 'euv_litho',     seconds: 20, inputs: [i('blank_wafer', 4)], outputs: [i('patterned_wafer', 3)], cost: 60000, note: 'TSMC N2 is ~$30,000 a wafer. One scanner is ~$380M and there is exactly one company that makes them.' },
  { id: 'dice',        name: 'Test & Dice',       buildingId: 'die_test',      seconds: 15, inputs: [i('patterned_wafer', 1)], outputs: [i('logic_die', 60)], cost: 4000, note: 'N2 yields 70-80% on logic test chips. The dies you throw away are priced into the ones you keep.' },
  { id: 'stack_hbm',   name: 'Stack HBM4',        buildingId: 'hbm_stacker',   seconds: 18, inputs: [i('blank_wafer', 2)], outputs: [i('hbm_stack', 12)], cost: 3000, note: '30-64% of accelerator BOM. SK hynix sold out its entire 2026 HBM production.' },
  { id: 'package',     name: 'CoWoS Package',     buildingId: 'cowos_pack',    seconds: 14, inputs: [i('logic_die', 1), i('hbm_stack', 8)], outputs: [i('accelerator', 1)], cost: 1200, note: 'This node, not lithography, is why GPUs are scarce. 85%+ of 2026-27 capacity was booked in advance.' },
  { id: 'build_rack',  name: 'Integrate Rack',    buildingId: 'rack_integrator',seconds: 40, inputs: [i('accelerator', 72)], outputs: [i('gpu_rack', 1)], cost: 60000, note: '72 GPUs, ~$3M, ~120kW. NVIDIA keeps ~90% of the system value; integrators keep the rest.' },

  // ======================================================================
  // CONTRACTS — the only source of revenue in the game
  // ======================================================================
  { id: 'c_consumer_raw',name:'Freemium Tier',   buildingId: 'consumer_app', seconds: 12, inputs: [i('draft_answer', 8)], outputs: [], payout: 9,   maxExposure: 90, note: 'Ship ungraded output to free users. It pays almost nothing and it is how most products start.' },
  { id: 'c_consumer',   name: 'Prosumer Subs',   buildingId: 'consumer_app',  seconds: 12, inputs: [i('answer', 6)], outputs: [], payout: 17, maxExposure: 70, note: '$3 an answer-unit. Consumers never run a security review — and never pay enterprise money either.' },
  { id: 'c_smb',        name: 'SMB Pilot',       buildingId: 'smb_pilot',     seconds: 16, inputs: [i('verified_answer', 8)], outputs: [], payout: 56, maxExposure: 45, note: 'ACV under $15k, closes in 14-30 days. Roughly 10-15% of pilots ever reach production.' },
  { id: 'c_mid',        name: 'Mid-Market SaaS', buildingId: 'midmarket',     seconds: 30, inputs: [i('verified_answer', 20), i('soc2', 1)], outputs: [], payout: 270, maxExposure: 30, maxFootprint: 72, note: 'They will not sign without SOC 2, and they will ask who your subprocessors are.' },
  { id: 'c_ent',        name: 'Enterprise Seats',buildingId: 'enterprise',    seconds: 40, inputs: [i('verified_answer', 24), i('agent_run', 4), i('iso42001', 1)], outputs: [], payout: 1050, maxExposure: 18, maxFootprint: 55, requiresDisclosure: true, note: 'Median B2B cycle is 84 days and rising — the delay is security due diligence, which is to say Exposure.' },
  { id: 'c_ent_agents', name: 'Enterprise Agents',buildingId:'enterprise',    seconds: 40, inputs: [i('agent_workflow', 6), i('iso42001', 1)], outputs: [], payout: 1800, maxExposure: 18, maxFootprint: 55, requiresDisclosure: true, note: 'Outcome pricing. You get paid for work delivered, and you eat the cost of every failed attempt.' },
  { id: 'c_reg',        name: 'Health / Finance',buildingId: 'regulated',     seconds: 45, inputs: [i('verified_answer', 40), i('hipaa_baa', 1), i('soc2', 1)], outputs: [], payout: 5400, maxExposure: 10, maxFootprint: 42, requiresDisclosure: true, note: 'HIPAA, HITRUST, FFIEC, SR 11-7. Pays extremely well and will not let your data leave the building.' },
  { id: 'c_fed',        name: 'Federal Program', buildingId: 'federal',       seconds: 60, inputs: [i('sovereign_answer', 60), i('fedramp', 1)], outputs: [], payout: 22000, maxExposure: 4, maxFootprint: 30, requiresDisclosure: true, note: 'DoD took 98.9% of $91.8B in 2026 federal AI award value. Sovereign output only — no exceptions.' },
  { id: 'c_hw_chips',   name: 'Sell Accelerators',buildingId:'hyperscaler',   seconds: 25, inputs: [i('accelerator', 40)], outputs: [], payout: 1500000, note: 'BOM on a GB200-class part is ~$14,200 against a ~$65,000 street price. 78% gross margin.' },
  { id: 'c_hw_racks',   name: 'Sell Racks',      buildingId: 'hyperscaler',   seconds: 30, inputs: [i('gpu_rack', 1)], outputs: [], payout: 3100000, note: 'Hyperscaler capex for 2026 is guided near $710B across the big four. They are buying everything you can build.' },
  { id: 'c_api',        name: 'Run API Platform',buildingId: 'api_platform',  seconds: 60, inputs: [i('frontier_model', 1), i('sovereign_answer', 300)], outputs: [i('frontier_model', 1)], payout: 11000000, maxExposure: 20, maxFootprint: 50, requiresDisclosure: true, note: 'Anthropic reported a $65B run rate; OpenAI $40B+. Pure token resale earns 0% — OpenRouter takes no markup at all.' },

  // ======================================================================
  // HOME LAB — weights, parts, and throughput you own
  // ======================================================================
  { id: 'hf_pull',     name: 'Pull from the Hub', buildingId: 'hf_hub',      seconds: 25, inputs: [], outputs: [i('local_weights', 2)], note: 'Well past a million models, free to download, $9/mo for Pro. Nobody charges you for the weights — they charge you for somewhere to put them.' },
  { id: 'quantize',    name: 'Quantize to Q4',    buildingId: 'quant_bench', seconds: 12, inputs: [i('open_weights', 1)], outputs: [i('local_weights', 3)], note: 'A 70B at BF16 is 140GB and needs two datacenter cards. At Q4_K_M it is 40GB and fits on one desk.' },

  { id: 'buy_parts',   name: 'Order Components',  buildingId: 'parts_shop',  seconds: 14, inputs: [], outputs: [i('cpu_mobo', 1), i('ram_kit', 2), i('nvme', 1), i('chassis', 1)], note: 'The CPU has barely moved since 2024. The memory is up more than fourfold. Same order, same shop.' },
  { id: 'buy_3090',    name: 'Source a 3090',     buildingId: 'gpu_market',  seconds: 16, inputs: [], outputs: [i('gpu_3090', 1)], note: '24GB for about $700 in 2024. It has gone UP since — the only card in the game whose second-hand price beat inflation.' },
  { id: 'buy_4090',    name: 'Source a 4090',     buildingId: 'gpu_market',  seconds: 18, inputs: [], outputs: [i('gpu_4090', 1)], note: 'Newer, faster, and exactly as much VRAM as the card below it. Capacity is what decides which models you can run at all.' },
  { id: 'buy_5090',    name: 'Order a 5090',      buildingId: 'gpu_market',  seconds: 20, inputs: [], outputs: [i('gpu_5090', 1)], note: '$1,999 MSRP in January 2025, about $4,500 on the street now. 32GB still will not hold a 70B.' },
  { id: 'buy_6000',    name: 'Order an RTX PRO 6000', buildingId: 'gpu_market', seconds: 24, inputs: [], outputs: [i('gpu_6000', 1)], note: '96GB. $8,565 at launch, $13,250 in June 2026, $16,000 in August. GDDR7 supply, not silicon, set every one of those numbers.' },
  { id: 'buy_psu_b',   name: 'Grab a Cheap PSU',  buildingId: 'psu_shelf',   seconds: 8,  inputs: [], outputs: [i('psu_budget', 1)], note: 'No excursion rating, no over-current protection worth the name. It saves you $105 against the Gold unit.' },
  { id: 'buy_psu_g',   name: 'Buy a Gold PSU',    buildingId: 'psu_shelf',   seconds: 8,  inputs: [], outputs: [i('psu_gold', 1)], note: 'ATX 3.1, about 90% efficient at half load. The cheapest insurance in the entire build.' },
  { id: 'buy_psu_t',   name: 'Buy a Titanium PSU',buildingId: 'psu_shelf',   seconds: 10, inputs: [], outputs: [i('psu_titanium', 1)], note: 'About 94% at half load, so it pays some of itself back in power every month it runs.' },

  { id: 'assemble',    name: 'Assemble Bare Rig', buildingId: 'bench_build', seconds: 14, inputs: [i('cpu_mobo', 1), i('ram_kit', 2), i('nvme', 1), i('chassis', 1)], outputs: [i('bare_rig', 1)], note: 'Everything but the two decisions that matter. About 83% of what this has cost you since 2024 is the memory and the SSD.' },

  // BYO bay: which card sets throughput, which power supply sets the risk.
  { id: 'byo_3090_b',  name: '3090 · Cheap PSU',  buildingId: 'byo_bay', seconds: 1, inputs: [], catalysts: [i('bare_rig', 1), i('gpu_3090', 1), i('psu_budget', 1)], outputs: [], computeSupply: 300, failureRatePerMin: 0.22, note: 'Saves you $105. Puts a card that has appreciated since 2024 behind a supply with no excursion headroom.' },
  { id: 'byo_3090_g',  name: '3090 · Gold PSU',   buildingId: 'byo_bay', seconds: 1, inputs: [], catalysts: [i('bare_rig', 1), i('gpu_3090', 1), i('psu_gold', 1)],   outputs: [], computeSupply: 300, failureRatePerMin: 0.0008 },
  { id: 'byo_4090_b',  name: '4090 · Cheap PSU',  buildingId: 'byo_bay', seconds: 1, inputs: [], catalysts: [i('bare_rig', 1), i('gpu_4090', 1), i('psu_budget', 1)], outputs: [], computeSupply: 500, failureRatePerMin: 0.22, note: 'The 12VHPWR connector has a documented history of melting on exactly this card under exactly this class of supply.' },
  { id: 'byo_4090_g',  name: '4090 · Gold PSU',   buildingId: 'byo_bay', seconds: 1, inputs: [], catalysts: [i('bare_rig', 1), i('gpu_4090', 1), i('psu_gold', 1)],   outputs: [], computeSupply: 500, failureRatePerMin: 0.0008 },
  { id: 'byo_5090_g',  name: '5090 · Gold PSU',   buildingId: 'byo_bay', seconds: 1, inputs: [], catalysts: [i('bare_rig', 1), i('gpu_5090', 1), i('psu_gold', 1)],   outputs: [], computeSupply: 870, failureRatePerMin: 0.012, note: '575W sustained and transients well past that. ATX 3.1 asks a supply to survive 200% excursions; this one does.' },
  { id: 'byo_5090_t',  name: '5090 · Titanium',   buildingId: 'byo_bay', seconds: 1, inputs: [], catalysts: [i('bare_rig', 1), i('gpu_5090', 1), i('psu_titanium', 1)], outputs: [], computeSupply: 910, failureRatePerMin: 0.002, note: 'Higher efficiency shows up as thermal headroom, so the same parts do slightly more work for slightly less power.' },
  { id: 'byo_6000_g',  name: 'PRO 6000 · Gold',   buildingId: 'byo_bay', seconds: 1, inputs: [], catalysts: [i('bare_rig', 1), i('gpu_6000', 1), i('psu_gold', 1)],   outputs: [], computeSupply: 2900, failureRatePerMin: 0.0008 },
  { id: 'byo_6000_t',  name: 'PRO 6000 · Titanium',buildingId:'byo_bay', seconds: 1, inputs: [], catalysts: [i('bare_rig', 1), i('gpu_6000', 1), i('psu_titanium', 1)], outputs: [], computeSupply: 3050, failureRatePerMin: 0.002, note: '96GB of GDDR7 behind the best supply money buys. At current prices the card is worth 33 of the power supply.' },

  { id: 'run_gaming_pc',name:'Run Gaming PC',     buildingId: 'gaming_pc',    seconds: 1, inputs: [], outputs: [], note: 'One used 3090. Still the best VRAM per dollar you can buy in 2026, which says more about the newer cards than about this one.' },
  { id: 'run_mac_mini', name:'Run Mac Mini',      buildingId: 'mac_mini',     seconds: 1, inputs: [], outputs: [] },
  { id: 'run_framework',name:'Run Framework',     buildingId: 'framework_pc', seconds: 1, inputs: [], outputs: [] },
  { id: 'run_spark',    name:'Run DGX Spark',     buildingId: 'dgx_spark',    seconds: 1, inputs: [], outputs: [], note: 'Eight times the compute of the Mac Studio and a third of its memory bandwidth. At batch size 1, bandwidth is the only number that matters.' },
  { id: 'run_studio512',name:'Run Mac Studio',    buildingId: 'mac_studio_512',seconds: 1, inputs: [], outputs: [], note: '819 GB/s and 512GB. Apple withdrew this configuration in March 2026 without an announcement.' },
  { id: 'run_studio256',name:'Run Mac Studio',    buildingId: 'mac_studio_256',seconds: 1, inputs: [], outputs: [] },
  { id: 'run_station',  name:'Run DGX Station',   buildingId: 'dgx_station',  seconds: 1, inputs: [], outputs: [] },
  { id: 'run_hl_rack',  name:'Run Homelab Rack',  buildingId: 'homelab_rack', seconds: 1, inputs: [], outputs: [], failureRatePerMin: 0.008, note: 'Four decommissioned A100s. $0.13 per kTPM per month against a rented H100 at $0.63 — and rented capacity never inflates.' },

  // ======================================================================
  // LOCAL MODELS — cost: 0, forever
  // ======================================================================
  { id: 'l_llama',     name: 'Llama Local',      buildingId: 'llama_local', seconds: 6,  inputs: [i('user_request', 4)], catalysts: [i('local_weights', 1)], outputs: [i('draft_answer', 4)], note: 'No cost line at all. You paid for the GPU; the tokens are free. The weights come back out — they are a tool, not a consumable.' },
  { id: 'l_qwen',      name: 'Qwen3 Local',      buildingId: 'qwen_local',  seconds: 8,  inputs: [i('user_request', 3)], catalysts: [i('local_weights', 1)], outputs: [i('onprem_answer', 3)], note: 'The API version of these weights carries dataRisk 8, because prompts land in the PRC. Running in your spare room it carries zero. Same model.' },
  { id: 'l_gptoss',    name: 'gpt-oss Local',    buildingId: 'gptoss_local',seconds: 8,  inputs: [i('grounded_prompt', 3)], catalysts: [i('local_weights', 1)], outputs: [i('onprem_answer', 4)], note: 'Apache 2.0 and 120B of mixture-of-experts on one 96GB card. Procurement can read the licence.' },
  { id: 'l_deepseek',  name: 'DeepSeek-R1 Local',buildingId: 'ds_local',    seconds: 14, inputs: [i('grounded_prompt', 2)], catalysts: [i('local_weights', 2)], outputs: [i('reasoning_answer', 2)], note: '671B of frontier-class reasoning off one desk. Slowly, and for nothing per token.' },
  { id: 'verify_onprem',name:'Gate On-Prem',    buildingId:'eval_gate',   seconds: 10, inputs: [i('onprem_answer', 6)], outputs: [i('verified_answer', 4)], cost: 14, note: 'An eval harness is your own code checking your own output — it calls nobody, so grading on-prem work never leaves the building. A smaller model fails more of its own checks, so six units in buys four out where a frontier answer buys five.' },
  { id: 'l_sovereign', name: 'Harden for Federal',buildingId:'eval_gate',   seconds: 9,  inputs: [i('onprem_answer', 6)], outputs: [i('sovereign_answer', 5)], cost: 3, note: 'A box in an office is not an air-gapped enclave, but the gate is the same gate. This is where the home lab hands off to Act III.' },

  // ======================================================================
  // SLOP — tier 1: costs money, earns nothing
  // ======================================================================
  { id: 's_prompt',    name: 'Write Prompts',    buildingId: 'prompt_bench',seconds: 5,  inputs: [i('user_request', 2)], outputs: [i('slop_prompt', 4)], note: 'The cheapest part of the job.' },
  { id: 's_text',      name: 'Generate Text',    buildingId: 'text_mill',   seconds: 6,  inputs: [i('slop_prompt', 6)], outputs: [i('slop_text', 6)], cost: 1.2, slopGenerated: true, note: 'Roughly 57% of sentences on the open web are already machine-translated. You are not starting a trend, you are joining one.' },
  { id: 's_image',     name: 'Generate Images',  buildingId: 'image_gen',   seconds: 8,  inputs: [i('slop_prompt', 4)], outputs: [i('slop_image', 4)], cost: 16, slopGenerated: true, note: 'About $0.04 an image at standard quality, $0.05 for the good open model. Cheap enough that nobody asks whether they wanted it.' },
  { id: 's_video',     name: 'Generate Video',   buildingId: 'video_gen',   seconds: 20, inputs: [i('slop_prompt', 2), i('slop_image', 2)], outputs: [i('slop_video', 1)], cost: 45, slopGenerated: true, note: '$0.75 a second at launch pricing. This one craft is a minute of video and $45 of somebody else\'s GPUs.' },
  { id: 's_pack',      name: 'Package Content',  buildingId: 'packager',    seconds: 12, inputs: [i('slop_text', 10), i('slop_image', 4), i('slop_video', 1)], outputs: [i('content_pack', 2)], cost: 2, note: 'The difference between a hobby and a business is whether anyone can take delivery of it.' },
  { id: 's_legal',     name: 'Answer Takedowns', buildingId: 'legal_desk',  seconds: 10, inputs: [i('dmca_notice', 1)], outputs: [], note: 'One AI lab settled a training-data class action for $1.5B over roughly 500,000 works. This desk is what stands between you and the arithmetic.' },
  { id: 's_ablit',     name: 'Ablate Refusals',  buildingId: 'ablit_rig',   seconds: 40, inputs: [i('local_weights', 2)], outputs: [i('abliterated_model', 1)], cost: 40, note: 'One direction in activation space, identified and removed. The paper is public and the method needs no retraining — which is exactly the problem.' },
  { id: 's_nsfw',      name: 'Adult Generation', buildingId: 'nsfw_studio', seconds: 18, inputs: [i('slop_prompt', 20)], catalysts: [i('abliterated_model', 1)], outputs: [i('nsfw_content', 16)], cost: 30, slopGenerated: true, note: 'Nine points of Exposure while this runs. Check what that does to your Mid-Market and Enterprise ceilings before you wire it up.' },

  // ======================================================================
  // CONTRACTS — SME on-prem. The audit is the mechanic.
  // ======================================================================
  { id: 'c_heat',      name: 'District Heat',    buildingId: 'heat_offtake', seconds: 18, inputs: [i('waste_heat', 10)], outputs: [], payout: 120, maxExposure: 95, note: 'Stockholm Exergi has been buying data centre heat into the city network for years, and Meta hands Odense its waste heat for nothing. It pays badly, it never churns, and it is the only node in this addon that pays at all.' },
  { id: 'c_sme_pilot', name: 'SME On-Prem Pilot', buildingId: 'sme_pilot', seconds: 20, inputs: [i('onprem_answer', 10)], outputs: [], payout: 190, maxExposure: 65, requiresOnSite: { tier: 'Home Lab', count: 1 }, note: 'They will send someone to look at the machine. One to ten concurrent users needs a 24GB card — that is the entire hardware specification, and it is why this business exists.' },
  { id: 'c_sme_fleet', name: 'Managed On-Prem',   buildingId: 'sme_fleet', seconds: 35, inputs: [i('onprem_answer', 30), i('verified_answer', 6)], outputs: [], payout: 1150, maxExposure: 45, requiresOnSite: { tier: 'Home Lab', count: 3 }, note: 'You are not selling answers any more. You are selling someone else\'s server, and you are on the hook when it dies.' },
  { id: 'c_sme_msp',   name: 'Regional MSP',      buildingId: 'sme_msp',   seconds: 45, inputs: [i('onprem_answer', 80)], outputs: [], payout: 6400, maxExposure: 32, requiresOnSite: { tier: 'Home Lab', count: 6 }, note: 'Every box you have sold is a box you now maintain. GDPR fines reach 4% of global annual turnover, and that is the number that pays your invoice.' },

  // ======================================================================
  // CONTRACTS — slop. One pays nothing, one needs your finger, one scales.
  // ======================================================================
  { id: 'c_feed',      name: 'Post To Feed',      buildingId: 'feed_post',    seconds: 14, inputs: [i('slop_text', 10), i('slop_image', 4)], outputs: [], payout: 0, slopSale: 'generic', note: 'Payout: nothing. You spent real money on this and no one is paying you for it — attention was what you were buying, and it still counts toward the tree.' },
  { id: 'c_mill',      name: 'Content Mill Order',buildingId: 'content_mill', seconds: 10, inputs: [i('slop_text', 12), i('slop_image', 3)], outputs: [], payout: 340, maxExposure: 75, manual: true, slopSale: 'generic', note: 'Best money per second in the early game, and it will never start on its own. Over a thousand unreliable AI news sites were tracked by 2025; every one of them has somebody clicking.' },
  { id: 'c_pseo',      name: 'Programmatic SEO',  buildingId: 'pseo_platform',seconds: 26, inputs: [i('content_pack', 6)], outputs: [], payout: 780, maxExposure: 60, slopSale: 'generic', note: 'Less per unit than clicking Generate yourself. It runs while you are asleep, which is the whole of the argument.' },
  { id: 'c_adult',     name: 'Adult Platform',    buildingId: 'adult_platform',seconds: 22, inputs: [i('nsfw_content', 20)], outputs: [], payout: 4200, maxExposure: 60, slopSale: 'nsfw', note: 'Age-assurance regimes went live in the UK and were upheld for Texas at the US Supreme Court in 2025. Payment processors moved on storefronts the same summer.' },
];
