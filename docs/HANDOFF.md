# Session handoff — reference card

**6 September 2026** · written when the user moved machines. Facts below were true at
~14:45; this repo is edited by several sessions at once, so verify before relying on any
number.

## What exists now

A **player reference card**, published as an artifact:

> https://claude.ai/code/artifact/e282ee23-43cd-40f6-bd06-a26f7c86d29f
> — "AIfor.study Field Guide"

It is **generated, never hand-edited**:

```bash
npm run card        # tools/build-reference-card.mjs -> docs/reference-card.html
```

The generator esbuild-bundles `src/data/index.ts`, imports the real objects, and derives
every figure on the page — prices, exposure ceilings, $/output-unit, rent per 1M TPM,
unlock gating. Change content or balance, re-run, republish. It also runs
`validateContent()` and stamps any problems onto the card's masthead.

**Republishing:** pass that URL as `url` to the Artifact tool. Publishing without it
creates a second artifact instead of updating this one.

## Standing arrangement with the user

> "update the card if game update"

So: after a content or balance change, regenerate and republish to the same URL.

## What the card does not cover yet

The card was designed against a 69-node game. Since then the content roughly doubled
(**53 items / 103 buildings / 135 recipes**) and two mechanics landed that the card's prose
does not describe:

1. **Per-vendor compute pools** (`src/data/vendors.ts`). Model nodes draw on their own
   provider's rate limit; everything you run yourself draws on a `shared` pool fed only by
   owned and rented hardware. The card's Compute panel still says "every node draws it;
   only Capacity nodes supply it", which is now misleading. Also new: `vendorScoped`,
   `servesNodes` (a free tier covers exactly one node), `BALANCE.ownServersKtpm`.
2. **The Home Lab and AI Slop addons** (`docs/ADDONS-SPEC.md`) — two optional side branches
   off the main Act I-III spine. Home Lab adds an early owned-hardware tier (Gaming PC,
   Mac Mini, Framework, DGX Spark, Mac Studio) with new `priceElasticity` and
   `withdrawnAtIndex` fields.

**Open decision the user has not answered:** should the generator be extended to explain
vendor pools? It is a generator change, not a regeneration, and other sessions were
editing the generator and the engine at the time.

## Two findings raised and not acted on

- `validateContent()` warns that `pretrain` needs 3,000 `training_tokens` against
  `BALANCE.bufferPerItem` of 400. The engine raises the cap for it; worth deciding whether
  the exception or a smaller recipe is wanted.
- **Capacity supply scales with the clock slider at no cost.** Supply is
  `computeSupply * clock`, capacity nodes have zero draw, and rent does not scale — so a
  Rented H100 at clock 2.5 yields 60M TPM for the same $15,100/mo. Probably unintended.

## Repo warnings

- **No git.** An overwrite is unrecoverable. Read before you replace.
- **Other sessions edit between turns.** Check `ls -lT` mtimes against expectations.
- Claude's saved memory about this project is **machine-local**
  (`~/.claude/projects/-Users-vupham-AI-builder-game/memory/`) and does not travel. The
  artifact URL above is the thing worth carrying.
