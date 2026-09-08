/**
 * MILESTONES ------------------------------------------------------------
 * The unlock tree. A milestone completes once the cumulative amounts listed
 * in `requires` have been consumed by CONTRACT recipes (i.e. actually sold to
 * a customer, not merely produced). Milestones unlock in array order; only
 * the next incomplete one is active at a time.
 *
 * The arc, in three acts:
 *   I   THE WRAPPER    — one model, one contract, negative margin if careless
 *   II  THE PLATFORM   — RAG, tools, agents, evals, and the compliance wall
 *   III THE FORK       — own the model (become a lab) and/or own the silicon
 *                        (become a supplier). They feed each other.
 */
/**
 * Which spine a milestone sits on. The main track is the game's three acts;
 * the other two are optional branches that progress in parallel, so taking one
 * never stalls the other.
 */
export type Track = 'main' | 'homelab' | 'slop';

export const TRACKS: { id: Track; name: string; blurb: string; color: string }[] = [
  { id: 'main',    name: 'The Company', blurb: 'Wrapper, platform, then the fork: become a lab, or become its supplier.', color: '#4aa3d8' },
  { id: 'homelab', name: 'Home Lab',    blurb: 'Buy the hardware instead of renting the rate limit. Capex is not the same as free.', color: '#76b900' },
  { id: 'slop',    name: 'AI Slop',     blurb: 'Content is trivially cheap to make and worth nothing. Everything after that is the hard part.', color: '#c47fd0' },
];

export interface Milestone {
  id: string;
  /** Defaults to 'main'. Each track advances independently. */
  track?: Track;
  name: string;
  blurb: string;
  /** itemId -> total units that must be delivered into contracts. */
  requires: Record<string, number>;
  unlocksBuildings: string[];
  unlocksRecipes: string[];
  /** One-off cash grant on completion. Your funding rounds. */
  reward: number;
  /** Flavour label shown on the milestone card. */
  act?: string;
}

/** Available before the first milestone — a laptop and a free tier. */
export const STARTING_BUILDINGS = ['landing_page', 'gpt_luna', 'consumer_app', 'free_tier'];
export const STARTING_RECIPES = ['organic', 'd_luna', 'c_consumer_raw', 'cap_free'];

export const MILESTONES: Milestone[] = [
  // ===================== ACT I — THE WRAPPER ==============================
  {
    id: 'ms_users', act: 'Act I',
    name: 'First Users',
    blurb: 'A landing page, the cheapest model on the market, and a free tier. Ship ungraded output and see if anyone cares.',
    requires: { draft_answer: 40 },
    unlocksBuildings: ['claude_haiku', 'qwen_flash', 'api_tier1', 'hf_hub', 'quant_bench', 'gpu_market', 'gaming_pc', 'llama_local'],
    unlocksRecipes: ['d_haiku', 'd_qwen', 'j_luna', 'j_qwen', 'j_haiku', 'c_consumer', 'cap_t1', 'hf_pull', 'quantize', 'buy_3090', 'run_gaming_pc', 'l_llama'],
    reward: 1500,
  },
  {
    id: 'ms_pmf', act: 'Act I',
    name: 'Product-Market Fit',
    blurb: 'People are paying. Now the bill arrives: a judge model on top of a cheap one still beats frontier tokens by 6x.',
    requires: { answer: 80 },
    unlocksBuildings: ['ad_spend', 'support_desk', 'gemini_flash', 'minimax', 'claude_sonnet', 'mistral_large', 'eval_gate', 'smb_pilot', 'prompt_bench', 'text_mill', 'image_gen', 'feed_post'],
    unlocksRecipes: ['buy_traffic', 'take_tickets', 'd_flash', 'd_minimax', 'd_mistral', 'j_flash', 'j_minimax', 'a_sonnet', 'a_tickets', 'a_mistral', 'verify', 'c_smb', 's_prompt', 's_text', 's_image', 'c_feed'],
    reward: 4000,
  },
  {
    id: 'ms_quality', act: 'Act I',
    name: 'Shipping Quality',
    blurb: 'Businesses will not buy raw model output. Evals turn answers into something you can put in a contract.',
    requires: { verified_answer: 60 },
    unlocksBuildings: ['doc_ingest', 'chunker', 'embedder', 'pgvector', 'api_tier3', 'gpt_terra'],
    unlocksRecipes: ['parse_docs', 'chunk_docs', 'embed', 'rag_pg', 'cap_t3', 'a_terra', 'a_sonnet_rag'],
    reward: 12000,
  },

  // ===================== ACT II — THE PLATFORM ============================
  {
    id: 'ms_rag', act: 'Act II',
    name: 'Retrieval',
    blurb: 'Their documents, not the open web. Grounding is the cheapest quality upgrade in the stack and the reason enterprises pay more.',
    requires: { verified_answer: 220 },
    unlocksBuildings: ['search_api', 'pinecone', 'redis_cache', 'observability', 'grok', 'soc2_program', 'midmarket'],
    unlocksRecipes: ['web_search', 'chunk_web', 'rag_pine', 'cache_run', 'observe', 'a_grok', 'run_soc2', 'c_mid'],
    reward: 35000,
  },
  {
    id: 'ms_soc2', act: 'Act II',
    name: 'The Security Review',
    blurb: 'The median B2B sales cycle is 84 days and rising, and the delay is due diligence. Certification is not overhead — it is the sales motion.',
    requires: { soc2: 4 },
    unlocksBuildings: ['turbopuffer', 'deepseek_flash'],
    unlocksRecipes: ['rag_tpuf', 'd_dsflash'],
    reward: 80000,
  },
  {
    id: 'ms_frontier', act: 'Act II',
    name: 'Frontier Reasoning',
    blurb: 'Cheap models cannot plan. For anything multi-step you need a frontier model in the loop — and you will feel the price.',
    requires: { verified_answer: 600 },
    unlocksBuildings: ['gemini_pro', 'claude_opus', 'api_tier5', 'mcp_server', 'saas_notion', 'harness', 'iso_program', 'enterprise'],
    unlocksRecipes: ['r_gemini', 'r_opus', 'r_grok', 'cap_t5', 'mcp_tools', 'saas_actions', 'run_agent', 'run_iso', 'c_ent'],
    reward: 200000,
  },
  {
    id: 'ms_agents', act: 'Act II',
    name: 'Agents In Production',
    blurb: 'You now sell outcomes, not tokens. One agent run is a plan plus a dozen calls, and you eat the cost of every failed attempt.',
    requires: { agent_run: 60 },
    unlocksBuildings: ['gpt6', 'claude_fable', 'saas_stripe', 'multi_agent', 'agent_console', 'sales_agent', 'marketing_agent', 'coding_agent'],
    unlocksRecipes: ['r_gpt6', 'r_fable', 'money_actions', 'run_swarm', 'ops_console', 'sell_junior', 'market_junior', 'code_junior'],
    reward: 500000,
  },
  {
    id: 'ms_china', act: 'Act II',
    name: 'The Cheap Provider',
    blurb: 'DeepSeek V4 Pro is frontier-class at a tenth of the price. It is also stored in the PRC, banned by a dozen US states, and will cost you every contract with a low Exposure ceiling.',
    requires: { iso42001: 4 },
    unlocksBuildings: ['deepseek_pro', 'glm', 'kimi', 'batch_lane'],
    unlocksRecipes: ['a_deepseek', 'r_deepseek', 'a_glm', 'r_glm', 'a_kimi', 'r_kimi', 'cap_batch', 'c_ent_agents'],
    reward: 1200000,
  },

  // ===================== ACT III-A — OWN THE MODEL ========================
  {
    id: 'ms_weights', act: 'Act III · Lab',
    name: 'Own The Weights',
    blurb: 'Rent GPUs, pull open weights, tune them on your own data. Marginal cost per token goes to zero. Fixed cost per month does not.',
    requires: { agent_workflow: 40 },
    unlocksBuildings: ['weights_mirror', 'rented_h100', 'data_curation', 'finetune_job', 'vllm_server', 'fedramp_program', 'federal', 'sales_agent_sr', 'marketing_agent_sr', 'coding_agent_sr', 'support_agent', 'review_agent'],
    unlocksRecipes: ['get_weights', 'cap_h100', 'curate', 'lora', 'full_tune', 'serve_local', 'run_fedramp', 'c_fed', 'sell_senior', 'market_senior', 'code_senior', 'support_run', 'review_run'],
    reward: 3000000,
  },
  {
    id: 'ms_sovereign', act: 'Act III · Lab',
    name: 'Sovereign Inference',
    blurb: 'Nothing leaves your perimeter. Health and finance will now talk to you — and they pay roughly 180x what a consumer does.',
    requires: { sovereign_answer: 200 },
    unlocksBuildings: ['hipaa_program', 'regulated', 'airgap_deploy', 'rented_b200'],
    unlocksRecipes: ['run_hipaa', 'c_reg', 'serve_airgap', 'cap_b200', 'verify_sov'],
    reward: 9000000,
  },
  {
    id: 'ms_cleared', act: 'Act III · Lab',
    name: 'Cleared',
    blurb: 'IL5, CMMC, FedRAMP. The Department of Defense took 98.9% of $91.8B in federal AI award value this year.',
    requires: { hipaa_baa: 4, sovereign_answer: 800 },
    unlocksBuildings: [],
    unlocksRecipes: [],
    reward: 30000000,
  },

  // ===================== ACT III-B — OWN THE SILICON ======================
  {
    id: 'ms_upstream', act: 'Act III · Fab',
    name: 'Going Upstream',
    blurb: 'You are the largest line item in someone else\'s revenue. Start at the bottom: sand, ingots, wafers, memory.',
    requires: { fedramp: 4 },
    unlocksBuildings: ['poly_supply', 'wafer_slicer', 'hbm_stacker', 'die_test'],
    unlocksRecipes: ['mine_poly', 'slice', 'stack_hbm', 'dice'],
    reward: 80000000,
  },
  {
    id: 'ms_fab', act: 'Act III · Fab',
    name: 'The Chokepoint',
    blurb: 'One company on earth makes EUV scanners, and one process packages the result. Own both and you own the supply of intelligence.',
    requires: { sovereign_answer: 3000 },
    unlocksBuildings: ['euv_litho', 'cowos_pack', 'rack_integrator', 'colo_rack', 'hyperscaler'],
    unlocksRecipes: ['litho', 'package', 'build_rack', 'cap_colo', 'c_hw_chips', 'c_hw_racks'],
    reward: 400000000,
  },
  {
    id: 'ms_vertical', act: 'Act III · Fab',
    name: 'Vertical Integration',
    blurb: 'Your chips, your racks, your building, your power. Servers are 60% of datacenter TCO — and now you are your own supplier.',
    requires: { accelerator: 400 },
    unlocksBuildings: ['datacenter', 'pretrain_rig'],
    unlocksRecipes: ['cap_dc', 'pretrain'],
    reward: 2000000000,
  },
  {
    id: 'ms_lab', act: 'Act III · Fab',
    name: 'Frontier Lab',
    blurb: 'Everyone else rents intelligence from someone. You make it, on hardware you built, in a building you own.',
    requires: { gpu_rack: 12 },
    unlocksBuildings: ['api_platform'],
    unlocksRecipes: ['c_api'],
    reward: 8000000000,
  },
  {
    id: 'ms_takeoff', act: 'Endgame',
    name: 'Takeoff',
    blurb: 'Three frontier models trained end to end on a stack you own from polysilicon upward. There is nobody left to buy from.',
    requires: { frontier_model: 3 },
    unlocksBuildings: [],
    unlocksRecipes: [],
    reward: 50000000000,
  },

  // ===================== HOME LAB — the parallel track ====================
  {
    id: 'hl_desk', track: 'homelab', act: 'Home Lab',
    name: 'Weights On Your Desk',
    blurb: 'A used 3090 and a quantized model. The per-token cost is zero and it will stay zero — what you bought instead is a fixed cost that never stops, and a card whose replacement price is already climbing.',
    requires: { draft_answer: 150 },
    unlocksBuildings: ['mac_mini', 'qwen_local', 'sme_pilot'],
    unlocksRecipes: ['run_mac_mini', 'l_qwen', 'c_sme_pilot'],
    reward: 6000,
  },
  {
    id: 'hl_box', track: 'homelab', act: 'Home Lab',
    name: 'The Box In The Corner',
    blurb: 'A ten-person firm with client confidentiality cannot put anything through an API and cannot negotiate a BAA. They can buy a box. Now build them a cheaper one out of parts.',
    requires: { onprem_answer: 200 },
    unlocksBuildings: ['parts_shop', 'psu_shelf', 'bench_build', 'byo_bay', 'framework_pc', 'dgx_spark', 'sme_fleet', 'eval_gate'],
    unlocksRecipes: ['buy_parts', 'buy_psu_b', 'buy_psu_g', 'assemble', 'byo_3090_b', 'byo_3090_g', 'buy_4090', 'byo_4090_b', 'byo_4090_g', 'run_framework', 'run_spark', 'c_sme_fleet', 'verify_onprem'],
    reward: 60000,
  },
  {
    id: 'hl_service', track: 'homelab', act: 'Home Lab',
    name: "Somebody Else's Server",
    blurb: 'You are not selling answers any more. Every box you have sold is a box you now maintain — and a blown power supply is no longer an inconvenience, it is a contract falling over.',
    requires: { onprem_answer: 900 },
    unlocksBuildings: ['mac_studio_512', 'mac_studio_256', 'gptoss_local', 'qdrant_local'],
    unlocksRecipes: ['buy_5090', 'buy_psu_t', 'byo_5090_g', 'byo_5090_t', 'run_studio512', 'run_studio256', 'l_gptoss', 'l_sovereign', 'rag_qdrant'],
    reward: 450000,
  },
  {
    id: 'hl_rack', track: 'homelab', act: 'Home Lab',
    name: 'The Rack In The Basement',
    blurb: 'Four decommissioned A100s at the best dollars-per-kTPM in the game. It is also the end of the road: you cannot scale a basement to a federal contract, and rented capacity never inflates.',
    requires: { onprem_answer: 2400 },
    unlocksBuildings: ['dgx_station', 'homelab_rack', 'ds_local', 'sme_msp'],
    unlocksRecipes: ['buy_6000', 'byo_6000_g', 'byo_6000_t', 'run_station', 'run_hl_rack', 'l_deepseek', 'c_sme_msp'],
    reward: 2400000,
  },

  // ===================== AI SLOP — the other parallel track ===============
  {
    id: 'sl_free', track: 'slop', act: 'AI Slop',
    name: 'Content Is Free',
    blurb: 'You have spent real money generating text and images, posted all of it, and been paid exactly nothing. That was the lesson. The reward for this milestone is nothing, too.',
    requires: { slop_text: 80, slop_image: 30 },
    unlocksBuildings: ['video_gen', 'content_mill'],
    unlocksRecipes: ['s_video', 'c_mill'],
    reward: 0,
  },
  {
    id: 'sl_paid', track: 'slop', act: 'AI Slop',
    name: 'Somebody Pays For This',
    blurb: 'A content mill pays well per piece and will never start on its own — that is your finger on the button, forever. The alternative is to build the pipeline you have been avoiding.',
    requires: { slop_image: 200 },
    unlocksBuildings: ['packager', 'pseo_platform', 'legal_desk'],
    unlocksRecipes: ['s_pack', 'c_pseo', 's_legal'],
    reward: 45000,
  },
  {
    id: 'sl_ablated', track: 'slop', act: 'AI Slop',
    name: 'Ablated',
    blurb: 'Refusal is one direction in activation space. Remove it and the model stops saying no — to you, and to everyone else. This needs weights you own, which means it needs a home lab.',
    requires: { content_pack: 150 },
    unlocksBuildings: ['ablit_rig', 'nsfw_studio', 'adult_platform'],
    unlocksRecipes: ['s_ablit', 's_nsfw', 'c_adult'],
    reward: 400000,
  },
  {
    id: 'sl_machine', track: 'slop', act: 'AI Slop',
    name: 'The Slop Machine',
    blurb: 'It pays like a regulated contract with none of the paperwork, and nine points of Exposure means the regulated contracts will not take your call. You chose one business over the other.',
    requires: { nsfw_content: 400 },
    unlocksBuildings: [],
    unlocksRecipes: [],
    reward: 6000000,
  },
];
