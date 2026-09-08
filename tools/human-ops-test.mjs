/**
 * Headless exercise of Human Ops, in the shape of the Agentic Ops and ESG
 * check scripts: bundle the engine, drive it directly, assert behaviour.
 *
 * Two things here matter more than the rest. The first section asserts the
 * desk works with EVERY addon switched off — that is the entire reason it
 * exists, because the base game has contract terms and therefore needs an
 * answer to them that does not cost $8,000 and an Act II unlock. The last
 * asserts the ESG link is real: the desk is payroll, payroll shows up on the
 * Social pillar, and a labour dispute stops it where an agent carries on.
 *
 *   node tools/human-ops-test.mjs      (or: npm run check:ops)
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { pathToFileURL } from 'node:url';
const tmp=mkdtempSync(join(tmpdir(),'ops-'));const e=join(tmp,'e.ts'),o=join(tmp,'g.mjs');
writeFileSync(e,`export * as data from ${JSON.stringify(join(process.cwd(),'src/data/index.ts'))};\n`+
 `export * as factory from ${JSON.stringify(join(process.cwd(),'src/engine/factory.ts'))};\n`+
 `export * as simulate from ${JSON.stringify(join(process.cwd(),'src/engine/simulate.ts'))};\n`);
await build({entryPoints:[e],bundle:true,format:'esm',platform:'node',outfile:o,logLevel:'error'});
const {data:D,factory:F,simulate:S}=await import(pathToFileURL(o).href);
rmSync(tmp,{recursive:true,force:true});
let fails=0; const ok=(l,c,e='')=>{console.log(`${c?'  ok  ':'FAIL '} ${l}${e?' — '+e:''}`); if(!c)fails++;};

function world(addons={}) {
  const s=F.createInitialState();
  s.addons={...s.addons, homelab:false, slop:false, agentic:false, esg:false, ventureCapital:false, ...addons};
  s.credits=200_000;
  for(const b of ['human_ops','smb_pilot']) if(!s.unlockedBuildings.includes(b)) s.unlockedBuildings.push(b);
  for(const r of ['human_renew','c_smb']) if(!s.unlockedRecipes.includes(r)) s.unlockedRecipes.push(r);
  return s;
}
const run=(s,secs)=>{const all=[];for(let i=0;i<secs/0.5;i++){const ev=S.advance(s,0.5); all.push(...ev.opsRenewed);} return all;};

// 1. every addon OFF — this is the point of the node
{
  const s=world();
  const c=F.placeMachine(s,'smb_pilot',0,0); F.setRecipe(s,c.id,'c_smb');
  const d=F.placeMachine(s,'human_ops',300,0); F.setRecipe(s,d.id,'human_renew');
  ok('desk places with every addon off', d.ok, d.ok?'':d.reason);
  s.machines[c.id].termEndsAt=s.elapsed;                     // freeze it
  const ev=run(s,200);
  ok('it wins the contract back', ev.length>=1, ev[0]?`${ev[0].buildingName} for $${ev[0].cost}`:'none');
  ok('and the contract is live again', !F.isExpired(s,s.machines[c.id]));
}
// 2. slower than an agent: nothing lands before the cycle completes
{
  const s=world();
  const c=F.placeMachine(s,'smb_pilot',0,0); F.setRecipe(s,c.id,'c_smb');
  const d=F.placeMachine(s,'human_ops',300,0); F.setRecipe(s,d.id,'human_renew');
  s.machines[c.id].termEndsAt=s.elapsed;
  const early=run(s,60);
  ok('nothing renewed inside the 90s cycle', early.length===0, `${early.length}`);
  const later=run(s,60);
  ok('renewed once the cycle finishes', later.length>=1);
}
// 3. one at a time
{
  const s=world();
  const ids=[];
  for(let i=0;i<3;i++){const c=F.placeMachine(s,'smb_pilot',i*100,0); F.setRecipe(s,c.id,'c_smb'); s.machines[c.id].termEndsAt=s.elapsed; ids.push(c.id);}
  const d=F.placeMachine(s,'human_ops',600,0); F.setRecipe(s,d.id,'human_renew');
  const ev=run(s,100);
  ok('handles one account per cycle', ev.length===1, `${ev.length} in 100s`);
}
// 4. will not overdraw
{
  const s=world();
  const c=F.placeMachine(s,'smb_pilot',0,0); F.setRecipe(s,c.id,'c_smb');
  const d=F.placeMachine(s,'human_ops',300,0); F.setRecipe(s,d.id,'human_renew');
  s.machines[c.id].termEndsAt=s.elapsed; s.credits=1;
  const ev=run(s,200);
  // Rent still bills and can take the account negative — that is the engine,
  // not the desk. What matters is that it did not BUY a renewal it could not
  // pay for, and that the contract is therefore still frozen.
  ok('declines when it cannot afford the fee', ev.length===0, `${ev.length} renewals, credits ${s.credits.toFixed(0)}`);
  ok('and leaves the contract frozen', F.isExpired(s, s.machines[c.id]));
}
// 5. ESG: laborLoad is metered, and a dispute stops it
{
  const s=world({esg:true});
  const d=F.placeMachine(s,'human_ops',300,0); F.setRecipe(s,d.id,'human_renew');
  run(s,5);
  ok('the desk raises the ESG Social pillar', s.esg.social>0, `social ${s.esg.social.toFixed(1)}`);
  s.esg.disputeFreeze=30;
  run(s,2);
  ok('a labour dispute stops the desk', s.status[d.id]==='disputed', s.status[d.id]);
}
// 6. unlocked early
{
  const ms=D.MILESTONE_BY_BUILDING['human_ops'];
  ok('unlocks on the first milestone', ms?.id==='ms_users', ms?.name);
}
console.log(`\n${fails} failure(s)`); process.exit(fails?1:0);
