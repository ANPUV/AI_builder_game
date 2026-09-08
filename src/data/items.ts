/**
 * ITEMS -----------------------------------------------------------------
 * Everything that can flow along a link.
 *
 * UNIT CONVENTION: one unit of any `data` item stands for 100 real requests
 * at roughly 10k input / 2k output tokens. Every dollar figure in the game is
 * therefore the published price of 100 such calls. Real per-request costs are
 * fractions of a cent and read as noise on screen; this scaling keeps the
 * numbers legible while preserving every ratio between providers exactly.
 *
 * `value` is a REFERENCE PRICE ONLY, shown in the inspector. All income comes
 * from contract payouts, so there is no exploit in routing an expensive item
 * somewhere generic.
 */
export type ItemForm =
  | 'demand' | 'data' | 'model' | 'silicon' | 'paper' | 'hardware' | 'slop' | 'energy';

export interface Item {
  id: string;
  name: string;
  /** Short glyph drawn on nodes and in lists. */
  icon: string;
  form: ItemForm;
  /** Reference price per unit in dollars. Display only. */
  value: number;
  /** Hex colour used for this item's links and port dots. */
  color: string;
  /** What this actually is, and the real-world figure behind it. */
  note: string;
  /**
   * How hard this item's price tracks the hardware price index. 0 (the default)
   * means it never moves — a provider's per-token price is not set by the DRAM
   * spot market. 1.0 is DRAM itself, by definition: mid-2024 to September 2026
   * took a 32GB DDR5 kit from about $95 to about $400.
   *
   *   price = base * (1 + priceElasticity * (priceIndex - 1))
   */
  priceElasticity?: number;
}

export const ITEMS: Item[] = [
  // --- demand: what arrives at your door ---------------------------------
  { id: 'user_request',     name: 'User Request',      icon: '◌', form: 'demand',   value: 0,         color: '#6b7f9e', note: 'Someone typed something into your product. Worthless until answered.' },
  { id: 'support_ticket',   name: 'Support Ticket',    icon: '✉', form: 'demand',   value: 0,         color: '#7d8ba3', note: 'Inbound work with an SLA attached. Higher value, less forgiving.' },
  { id: 'document',         name: 'Customer Document', icon: '▤', form: 'demand',   value: 0,         color: '#8a7f6b', note: 'The private corpus. This is what makes RAG worth building.' },
  { id: 'web_page',         name: 'Web Page',          icon: '⌘', form: 'demand',   value: 0.05,      color: '#5f8a7a', note: 'Fetched by a search API. Exa $7/1k, Tavily $8/1k, Brave $5/1k.' },

  // --- data: the answer pipeline -----------------------------------------
  { id: 'draft_answer',     name: 'Draft Answer',      icon: '○', form: 'data',     value: 0.8,       color: '#8f9bb3', note: 'Ungraded output from a cheap model. Needs a judge before you can ship it.' },
  { id: 'answer',           name: 'Answer',            icon: '●', form: 'data',     value: 3,         color: '#4aa3d8', note: 'Ship-quality output: a mid-tier model, or a cheap model plus an LLM judge.' },
  { id: 'reasoning_answer', name: 'Reasoning Answer',  icon: '◉', form: 'data',     value: 26,        color: '#9a5fd8', note: 'Long-horizon planning from a frontier model. The only thing agents can plan with.' },
  { id: 'verified_answer',  name: 'Verified Answer',   icon: '✓', form: 'data',     value: 8,         color: '#35c9c0', note: 'Passed evals and guardrails. What a paying business will actually accept.' },
  { id: 'sovereign_answer', name: 'Sovereign Answer',  icon: '⛨', form: 'data',     value: 22,        color: '#4ce07a', note: 'Produced on hardware you control. Never left your perimeter. Defence and health buy only this.' },
  { id: 'chunk',            name: 'Chunk',             icon: '▪', form: 'data',     value: 0.1,       color: '#7a6b9e', note: 'A document split for embedding. Chunking strategy is most of RAG quality.' },
  { id: 'embedding',        name: 'Embedding',         icon: '⌗', form: 'data',     value: 0.25,      color: '#c957a8', note: 'text-embedding-3-small is $0.02/1M tokens. Storing them is what costs you.' },
  { id: 'grounded_prompt',  name: 'Grounded Prompt',   icon: '⌬', form: 'data',     value: 1.4,       color: '#3d8fc4', note: 'Request + retrieved context. Grounding is why enterprises pay more than consumers.' },
  { id: 'tool_result',      name: 'Tool Result',       icon: '⚙', form: 'data',     value: 1.1,       color: '#c49a3d', note: 'A real action in a real system, via MCP. This is where agents stop being demos.' },
  { id: 'agent_run',        name: 'Agent Run',         icon: '✦', form: 'data',     value: 90,        color: '#e08a3c', note: 'One task completed end to end. Costs many model calls; sells for one outcome.' },
  { id: 'agent_workflow',   name: 'Agent Workflow',    icon: '✧', form: 'data',     value: 420,       color: '#f26d3d', note: 'Multi-agent: planner, workers, critic. Quality up, token burn up faster.' },

  // --- paper: what auditors want -----------------------------------------
  { id: 'soc2',             name: 'SOC 2 Type II',     icon: '⛊', form: 'paper',    value: 0,         color: '#a8a05b', note: 'Real cost $15k-50k plus a 3-12 month observation window you cannot buy past.' },
  { id: 'iso42001',         name: 'ISO 42001',         icon: '⌸', form: 'paper',    value: 0,         color: '#b0904a', note: 'The only AI-management certificate you can hand a procurement officer. 40-60% cheaper if you hold ISO 27001.' },
  { id: 'hipaa_baa',        name: 'HIPAA BAA',         icon: '✚', form: 'paper',    value: 0,         color: '#c46f6f', note: 'Azure OpenAI includes one by default. DeepSeek offers none — its policy excludes health data.' },
  { id: 'fedramp',          name: 'FedRAMP Cert',      icon: '★', form: 'paper',    value: 0,         color: '#6f8fc4', note: 'Legacy path: $250k-2M and 12-18 months. The 20x fast lane cut agency review to ~5 weeks.' },

  // --- data: the answer pipeline -----------------------------------------
  { id: 'training_tokens',  name: 'Training Tokens',   icon: '⁂', form: 'data',     value: 0.9,       color: '#4ce0c8', note: 'Chinchilla says ~20 tokens per parameter. Modern frontier runs go far past that to cut serving cost.' },

  // --- model: weights you control ----------------------------------------
  { id: 'open_weights',     name: 'Open Weights',      icon: '⬡', form: 'model',    value: 0,         color: '#8a8f9e', note: 'Llama, Qwen, DeepSeek, Mistral Large 3. Free to download. Expensive to serve.' },
  { id: 'lora_adapter',     name: 'LoRA Adapter',      icon: '⟐', form: 'model',    value: 120,       color: '#7ce04c', note: 'Megabytes, not gigabytes. A 7B LoRA on 10M tokens costs about $5. Hot-swappable.' },
  { id: 'tuned_model',      name: 'Tuned Model',       icon: '❖', form: 'model',    value: 900,       color: '#4ce07a', note: 'Your domain, your weights. Fine-tuning is cheap; serving what you tuned is where the money goes.' },
  { id: 'frontier_model',   name: 'Frontier Model',    icon: '✵', form: 'model',    value: 90_000,    color: '#ffd24a', note: 'Grok-3 cost ~$218M. GPT-5-class runs are estimated $1.5-3B. Training cost is doubling every ~8 months.' },

  // --- silicon: where compute comes from ---------------------------------
  { id: 'polysilicon',      name: 'Polysilicon',       icon: '◆', form: 'silicon',  value: 3,         color: '#9e8a6b', note: 'The cheapest thing in the entire supply chain, and the start of all of it.' },
  { id: 'blank_wafer',      name: 'Blank Wafer',       icon: '▬', form: 'silicon',  value: 45,        color: '#d8b04a', note: '300mm of polished silicon. Everything expensive happens to it later.' },
  { id: 'patterned_wafer',  name: 'Patterned Wafer',   icon: '▭', form: 'silicon',  value: 30_000,    color: '#e0d13c', note: 'TSMC N2 runs about $30,000 a wafer. N5 is ~$18.5k. The node is the price.' },
  { id: 'logic_die',        name: 'Logic Die',         icon: '◫', form: 'silicon',  value: 850,       color: '#e08a3c', note: 'Under 13% of a GPU bill of materials. The compute die is NOT what makes GPUs expensive.' },
  { id: 'hbm_stack',        name: 'HBM4 Stack',        icon: '▥', form: 'silicon',  value: 550,       color: '#f26d3d', note: '30-64% of accelerator BOM. SK hynix holds ~58% share and 2026 supply is sold out.' },
  { id: 'accelerator',      name: 'Packaged GPU',      icon: '▤', form: 'silicon',  value: 40_000,    color: '#ff6d3d', note: 'CoWoS packaging, not lithography, is the real supply ceiling. Booking window: 52-78 weeks.' },
  { id: 'gpu_rack',         name: 'NVL72 Rack',        icon: '⛁', form: 'silicon',  value: 3_000_000, color: '#ffd24a', note: '72 GPUs, ~120kW, about $3M. Roughly $25,000 of capex per kW of rack load.' },

  // --- hardware: components you buy and assemble (Home Lab) ---------------
  { id: 'cpu_mobo',    name: 'CPU + Motherboard', icon: '▦', form: 'hardware', value: 480,   color: '#8a94a8', priceElasticity: 0.03,  note: 'A Ryzen 7 was about $310 in mid-2024 and is roughly that now. Logic silicon never joined the shortage.' },
  { id: 'ram_kit',     name: '32GB DDR5-6000',    icon: '▥', form: 'hardware', value: 95,    color: '#c9603d', priceElasticity: 1.00,  note: 'The reference component: about $95 in mid-2024, $375 minimum by 2026. Micron discontinued its consumer Crucial line entirely.' },
  { id: 'nvme',        name: '2TB NVMe',          icon: '▤', form: 'hardware', value: 120,   color: '#b0704a', priceElasticity: 0.70,  note: 'Consumer NAND fell from 45% of the market in 2024 to 32% in 2026. A 2TB drive went $175 to $379 in four months.' },
  { id: 'chassis',     name: 'Case & Cooling',    icon: '▢', form: 'hardware', value: 160,   color: '#6b7280', priceElasticity: 0.028, note: 'Copper and tin, not memory. Up 6-10% and no further.' },
  { id: 'bare_rig',    name: 'Bare Rig',          icon: '▣', form: 'hardware', value: 855,   color: '#9aa4b8', priceElasticity: 0,     note: 'Everything but a graphics card and a power supply. Inert until you decide those two.' },

  { id: 'psu_budget',  name: 'No-Name 850W PSU',  icon: '⚡', form: 'hardware', value: 45,    color: '#a04040', priceElasticity: 0.025, note: 'No ATX 3.1 excursion rating. ATX 3.1 asks a supply to survive 200% excursions; a modern GPU spikes past twice its rating for microseconds.' },
  { id: 'psu_gold',    name: '1000W 80+ Gold',    icon: '⚡', form: 'hardware', value: 150,   color: '#c9a13d', priceElasticity: 0.025, note: 'ATX 3.1, about 90% efficient at half load. The cheapest insurance in the entire build.' },
  { id: 'psu_titanium',name: '1600W 80+ Titanium',icon: '⚡', form: 'hardware', value: 450,   color: '#d8d8e0', priceElasticity: 0.025, note: 'About 94% at half load, so it pays part of itself back in power. Nothing it protects has ever melted.' },

  { id: 'gpu_3090',    name: 'Used RTX 3090',     icon: '◨', form: 'hardware', value: 700,   color: '#5b8f4a', priceElasticity: 0.22,  note: '24GB, launched Sept 2020 at $1,499. About $700 used in 2024 and $1,000-1,400 now — it went UP. Still the best VRAM per dollar you can buy.' },
  { id: 'gpu_4090',    name: 'Used RTX 4090',     icon: '◧', form: 'hardware', value: 1580,  color: '#6fa83d', priceElasticity: 0.10,  note: '24GB, launched Oct 2022 at $1,599. Over $2,000 used in 2026: the newer card costs more and holds no more.' },
  { id: 'gpu_5090',    name: 'RTX 5090',          icon: '◩', form: 'hardware', value: 2000,  color: '#76b900', priceElasticity: 0.39,  note: '32GB GDDR7, 575W, $1,999 MSRP in Jan 2025 and about $4,500 on the street now. Faster, and it still will not hold a 70B.' },
  { id: 'gpu_6000',    name: 'RTX PRO 6000',      icon: '◪', form: 'hardware', value: 8565,  color: '#8fd400', priceElasticity: 0.27,  note: '96GB GDDR7. Launched March 2025 at $8,565, hit $13,250 in June 2026 and $16,000 in August. The first card that holds a 120B alone.' },

  // --- model: weights small enough to run at home -------------------------
  { id: 'local_weights',name:'Quantized GGUF',    icon: '⬢', form: 'model',    value: 0,     color: '#f5b942', note: 'Q4_K_M lands near 4.8 bits per weight: a 70B drops from 140GB to about 40GB and loses a few points of benchmark. This is what makes local inference possible at all.' },

  // --- data: output from hardware you own ---------------------------------
  { id: 'onprem_answer',name:'On-Prem Answer',    icon: '◈', form: 'data',     value: 11,    color: '#3fc46a', note: 'Generated on a box in the customer\'s own building. Never crossed a network they do not own — which is the entire product.' },

  // --- slop: content that is cheap to make and hard to sell ---------------
  { id: 'slop_prompt', name: 'Prompt',            icon: '❝', form: 'slop',     value: 0.1,   color: '#8a7f9e', note: 'The cheapest part of the job, and the part everyone mistakes for the whole job.' },
  { id: 'slop_text',   name: 'Generated Text',    icon: '≡', form: 'slop',     value: 0.4,   color: '#9e8fa8', note: 'Roughly 57% of sentences on the open web are already machine-translated. The slop is not coming; it arrived.' },
  { id: 'slop_image',  name: 'Generated Image',   icon: '▩', form: 'slop',     value: 1.2,   color: '#c47fd0', note: 'About $0.04 an image at standard quality. Four cents is less than the cost of deciding whether you wanted it.' },
  { id: 'slop_video',  name: 'Generated Video',   icon: '▶', form: 'slop',     value: 22,    color: '#d0607f', note: 'Roughly $0.75 per second of generated video at launch pricing. One minute is $45.' },
  { id: 'content_pack',name: 'Content Pack',      icon: '❑', form: 'slop',     value: 60,    color: '#c98a3d', note: 'Text, images and video assembled into something a buyer will actually take delivery of.' },
  { id: 'nsfw_content',name: 'Adult Content',     icon: '◉', form: 'slop',     value: 140,   color: '#b03d5f', note: 'Pays like a regulated contract with none of the paperwork, and every incentive in the payment stack is pointed at you.' },
  { id: 'abliterated_model',name:'Abliterated Model',icon:'⊘',form:'model',    value: 2400,  color: '#a03d6f', note: 'Refusal behaviour in an aligned model is mediated by a single direction in activation space. Ablate it and the refusals stop. Published research, no retraining required.' },
  { id: 'dmca_notice', name: 'Takedown Notice',   icon: '⚖', form: 'paper',    value: 0,     color: '#c4603d', note: 'One AI lab settled a training-data class action for $1.5B over roughly 500,000 works — about $3,000 each. This is one of those.' },

  // --- ESG addon: the footprint, and the paperwork about it ----------------
  { id: 'waste_heat',    name: 'Waste Heat',       icon: '♨', form: 'energy', value: 4,  color: '#e0704a', note: 'Very nearly all the electricity a rack draws leaves it again as heat. The only question is whether anybody catches it.' },
  { id: 'annotated_data',name: 'Annotated Data',   icon: '☗', form: 'data',   value: 14, color: '#7ac96b', note: 'Labelled by people who were paid properly for it. Cleaner than a crawl and far more expensive.' },
  { id: 'carbon_credit', name: 'Carbon Credit',    icon: '❋', form: 'paper',  value: 0,  color: '#4ca86b', note: 'A tonne somebody else did not emit, on a registry you did not audit. Priced anywhere from three dollars to fifty, for reasons with little to do with tonnes.' },
  { id: 'esg_report',    name: 'ESG Disclosure',   icon: '⌑', form: 'paper',  value: 0,  color: '#5f9e7a', note: 'What a procurement officer asks for in place of asking what you actually run. CSRD and ISSB both want one; neither of them checks the meter.' },
];
