/**
 * VENDORS ---------------------------------------------------------------
 * Rate limits are per-provider, per-account. An OpenAI Tier 5 buys you nothing
 * on Anthropic, so every model node draws from its own vendor's pool.
 *
 * `shared` is the exception: hardware you rent or own genuinely is fungible
 * across your own workloads, so it backs self-hosting and every non-model node.
 */
export type Vendor =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'xai'
  | 'mistral'
  | 'deepseek'
  | 'alibaba'
  | 'zhipu'
  | 'moonshot'
  | 'minimax';

/** The pool a node draws from: a vendor's rate limit, or your own hardware. */
export type Pool = Vendor | 'shared';

export const SHARED: Pool = 'shared';

export const VENDORS: Record<Vendor, { name: string; short: string; color: string }> = {
  openai:    { name: 'OpenAI',    short: 'OAI', color: '#10a37f' },
  anthropic: { name: 'Anthropic', short: 'ANT', color: '#d97757' },
  google:    { name: 'Google',    short: 'GOO', color: '#4285f4' },
  xai:       { name: 'xAI',       short: 'XAI', color: '#888888' },
  mistral:   { name: 'Mistral',   short: 'MIS', color: '#fa5210' },
  deepseek:  { name: 'DeepSeek',  short: 'DS',  color: '#4d6bfe' },
  alibaba:   { name: 'Alibaba',   short: 'QWN', color: '#615ced' },
  zhipu:     { name: 'Zhipu',     short: 'GLM', color: '#2f6ee0' },
  moonshot:  { name: 'Moonshot',  short: 'KIM', color: '#1f4fd8' },
  minimax:   { name: 'MiniMax',   short: 'MMX', color: '#3d5fd0' },
};

export const ALL_VENDORS = Object.keys(VENDORS) as Vendor[];

export const poolName = (p: Pool): string =>
  p === 'shared' ? 'Own hardware' : VENDORS[p].name;

export const poolColor = (p: Pool): string =>
  p === 'shared' ? '#76b900' : VENDORS[p].color;
