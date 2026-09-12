import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {digest} from './developer-policy.mjs';

test('publisher requires approval and exact tested revision, then pushes only candidate and journal',async()=>{
 const root=await mkdtemp(join(tmpdir(),'world-publish-'));
 const repo=join(root,'repo'),remote=join(root,'remote.git');
 const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 try{
  await mkdir(repo);execFileSync('git',['init','--bare',remote],{stdio:'ignore'});
  git('init','-b','main');git('config','user.name','test');git('config','user.email','test@example.invalid');
  await mkdir(join(repo,'src/app'),{recursive:true});await mkdir(join(repo,'sim'));
  await writeFile(join(repo,'src/app/example.js'),'old');await writeFile(join(repo,'DEVELOPMENT_LOG.md'),'Journal\n');
  for(const f of ['developer-publish.mjs','developer-policy.mjs'])await copyFile(new URL(f,import.meta.url),join(repo,'sim',f));
  git('add','.');git('commit','-m','base');git('remote','add','origin',remote);git('push','origin','main');
  const base=git('rev-parse','HEAD');
  const out=join(repo,'.local/api-development');await mkdir(out,{recursive:true});
  await writeFile(join(out,'candidate.json'),JSON.stringify({summary:'Better composition',files:[{path:'src/app/example.js',before:digest('old'),content:'new'}]}));
  const run=sha=>execFileSync(process.execPath,['sim/developer-publish.mjs'],{cwd:repo,env:{...process.env,EXPECTED_SHA:sha},encoding:'utf8',stdio:['ignore','pipe','pipe']});
  await writeFile(join(out,'review.json'),'{"approved":false}');run(base);
  assert.equal(git('rev-parse','HEAD'),base);
  await writeFile(join(out,'review.json'),'{"approved":true}');run('0'.repeat(40));
  assert.equal(await readFile(join(repo,'src/app/example.js'),'utf8'),'old');
  run(base);
  assert.equal(git('rev-parse','HEAD'),git('rev-parse','origin/main'));
  assert.deepEqual(git('diff','--name-only',base,'HEAD').split('\n'),['DEVELOPMENT_LOG.md','src/app/example.js']);
  assert.equal(await readFile(join(repo,'src/app/example.js'),'utf8'),'new');
 }finally{await rm(root,{recursive:true,force:true});}
});
