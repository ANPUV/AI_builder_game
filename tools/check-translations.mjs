/**
 * Translation guard — every number in an English description must survive.
 *
 *   node tools/check-translations.mjs      (or: npm run check:i18n)
 *
 * The content layer is the one place where a translation can do real damage.
 * Node descriptions carry sourced figures — DeepSeek's $1.32/$3.96 per 1M,
 * ASML's $380M scanner, SK hynix's ~58% HBM share — and a restated price is a
 * wrong price. This extracts every numeric core from the English and asserts it
 * appears in the translation, comparing both sides with the same normalisation
 * so "10x" -> "10 lần" and "273 GB/s" -> "273 GB/s" do not raise false alarms.
 *
 * Exits non-zero on a miss, so it can gate a release.
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const tmp = mkdtempSync(join(tmpdir(),'fig-'));
const e = join(tmp,'e.ts'), o = join(tmp,'g.mjs');
writeFileSync(e, `export * as data from ${JSON.stringify(join(root,'src/data/index.ts'))};\n`
  + `export * as vi from ${JSON.stringify(join(root,'src/i18n/content.vi.ts'))};\n`);
await build({entryPoints:[e],bundle:true,format:'esm',platform:'node',outfile:o,logLevel:'warning'});
const {data:D, vi:V} = await import(pathToFileURL(o).href);
rmSync(tmp,{recursive:true,force:true});

// Money, percentages, sizes, rates, plain numbers - anything numeric.
/**
 * Compare NUMERIC CORES, not surface forms. "10x" legitimately becomes
 * "10 lần" and "/GB-mo" becomes "/GB-tháng"; the thing that must not change is
 * the number itself. Both sides get the same normalisation so spacing
 * differences ("273 GB/s" vs "273GB/s") cannot produce a false alarm.
 */
const CORE = /\$?\d[\d.,]*\s*(?:[kKMBT]|%)?/g;
const squash = (s) => s.replace(/\s+/g, '');
const norm = (s) =>
  (s.match(CORE) || [])
    .map((t) => squash(t).replace(/[.,]$/, ''))
    .filter((t) => t.length > 0);

let missing = 0, checked = 0, translated = 0;
for (const b of D.BUILDINGS) {
  const t = V.VI_BUILDINGS[b.id];
  if (!t?.description) continue;
  translated++;
  const want = norm(b.description);
  const haystack = squash(t.description);
  for (const fig of want) {
    checked++;
    if (!haystack.includes(fig)) {
      missing++;
      console.log(`MISSING  ${b.id}: "${fig}"`);
      console.log(`   en: ${b.description}`);
      console.log(`   vi: ${t.description}\n`);
    }
  }
}
const names = D.BUILDINGS.filter(b=>V.VI_BUILDINGS[b.id]?.name).length;
console.log(`buildings: ${names}/${D.BUILDINGS.length} names, ${translated}/${D.BUILDINGS.length} descriptions`);
console.log(`items: ${D.ITEMS.filter(i=>V.VI_ITEMS[i.id]?.name).length}/${D.ITEMS.length} names`);
console.log(`figures checked: ${checked}, missing: ${missing}`);
process.exit(missing ? 1 : 0);
