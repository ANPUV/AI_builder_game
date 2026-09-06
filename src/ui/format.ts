import { BUILDING_BY_ID, item, type Recipe } from '../data';

/** Money and throughput formatting. The game spans seven orders of magnitude. */
export function money(n: number): string {
  const sign = n < 0 ? '-' : '';
  const v = Math.abs(n);
  if (v >= 1e12) return `${sign}$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${sign}$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${sign}$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e4) return `${sign}$${Math.round(v / 1e3)}k`;
  if (v >= 100) return `${sign}$${Math.round(v).toLocaleString()}`;
  if (v >= 1) return `${sign}$${v.toFixed(2)}`;
  if (v === 0) return '$0';
  return `${sign}$${v.toFixed(3)}`;
}

/** Throughput, given in thousands of tokens per minute. */
export function tpm(ktpm: number): string {
  if (ktpm >= 1e6) return `${(ktpm / 1e6).toFixed(2)}B`;
  if (ktpm >= 1e3) return `${(ktpm / 1e3).toFixed(1)}M`;
  return `${Math.round(ktpm)}k`;
}

/**
 * One-line "what this recipe does". Capacity recipes have no inputs or outputs
 * — their whole point is the throughput their chassis supplies — and contracts
 * emit money rather than an item, so both need special-casing or they read as
 * "nothing → nothing".
 */
export function recipeFlow(r: Recipe): string {
  const b = BUILDING_BY_ID[r.buildingId];
  const ins = r.inputs.map((i) => `${i.qty} ${item(i.itemId).name}`).join(' + ');
  const outs = r.outputs.map((o) => `${o.qty} ${item(o.itemId).name}`).join(' + ');
  // Catalysts are held, not spent, so they read as a requirement rather than
  // as part of the flow.
  const cat = (r.catalysts ?? [])
    .map((c) => `${c.qty} ${item(c.itemId).name}`)
    .join(' + ');
  const needs = cat ? ` (needs ${cat})` : '';

  if (b?.kind === 'capacity') {
    return `supplies +${tpm(r.computeSupply ?? b.computeSupply)} TPM${ins ? `, burns ${ins}` : ''}`;
  }
  if (r.payout !== undefined) return `${ins || 'nothing'} → ${money(r.payout)}${needs}`;
  return `${ins || 'nothing'} → ${outs || 'nothing'}${needs}`;
}
