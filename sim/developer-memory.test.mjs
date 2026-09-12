import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {emptyProgress,advanceProgress,reconcileDraft} from './developer-memory.mjs';
import {digest,validateCandidate} from './developer-policy.mjs';
const candidate={summary:'A useful foundation',files:[{path:'src/app/example.js',before:digest('old'),content:'new'}]};
test('retains useful drafts across rejected attempts and advances only after publication',()=>{
 let p=advanceProgress(emptyProgress(),{validated:true,retain:true,candidate,reason:'continue'});
 assert.deepEqual(p.draft,candidate);assert.equal(p.stage,0);assert.equal(p.history[0].candidate,undefined);
 p=advanceProgress(p,{validated:false,retain:true,candidate:{bad:true},reason:'syntax failed'});
 assert.deepEqual(p.draft,candidate);assert.equal(p.history.at(-1).reason,'syntax failed');
 p=advanceProgress(p,{published:true});assert.equal(p.draft,null);assert.equal(p.stage,1);
});
test('reconciles against file contents rather than discarding work on unrelated main commits',async()=>{
 const root=await mkdtemp(join(tmpdir(),'world-reconcile-'));
 try{
  await mkdir(join(root,'src/app'),{recursive:true});await writeFile(join(root,'src/app/example.js'),'old');
  assert.deepEqual(await reconcileDraft(candidate,root),candidate);
  await writeFile(join(root,'src/app/example.js'),'another edit');assert.equal(await reconcileDraft(candidate,root),null);
  await writeFile(join(root,'src/app/example.js'),'new');assert.equal(await reconcileDraft(candidate,root),null);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('simulation extensions are bounded while runner, tests, transport and memory stay protected',()=>{
 for(const path of ['sim/life.mjs','sim/citizens.mjs','sim/systems/bakery.mjs'])assert.doesNotThrow(()=>validateCandidate({...candidate,files:[{...candidate.files[0],path}]}));
 for(const path of ['sim/tick.mjs','sim/developer-memory.mjs','sim/bakery-milestone.test.mjs','sim/systems/../../tick.mjs','DEVELOPMENT_PLAN.json'])assert.throws(()=>validateCandidate({...candidate,files:[{...candidate.files[0],path}]}));
});
test('durable JSON branch survives separate processes without changing main',async()=>{
 const root=await mkdtemp(join(tmpdir(),'world-memory-'));
 const moduleURL=new URL('./developer-memory.mjs',import.meta.url).href;
 const run=code=>execFileSync(process.execPath,['--input-type=module','-e',`import {loadProgress,saveProgress,emptyProgress} from ${JSON.stringify(moduleURL)};${code}`],{cwd:root,encoding:'utf8'});
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 try{
  git('init','-b','main');git('config','user.name','test');git('config','user.email','test@example.invalid');
  await writeFile(join(root,'README'),'base');git('add','README');git('commit','-m','base');
  execFileSync('git',['init','--bare',join(root,'remote.git')],{stdio:'ignore'});git('remote','add','origin',join(root,'remote.git'));git('push','origin','main');
  const base=git('rev-parse','HEAD');
  run('const p=emptyProgress();p.history.push({reason:"remember failure"});saveProgress(p);');
  assert.equal(JSON.parse(run('console.log(JSON.stringify(await loadProgress()));')).history[0].reason,'remember failure');
  run('const p=await loadProgress();p.stage=1;saveProgress(p);');
  assert.equal(JSON.parse(run('console.log(JSON.stringify(await loadProgress()));')).stage,1);
  assert.equal(git('rev-parse','HEAD'),base);assert.equal(git('rev-parse','origin/main'),base);
  assert.equal(git('ls-tree','--name-only','FETCH_HEAD'),'progress.json');
 }finally{await rm(root,{recursive:true,force:true});}
});
