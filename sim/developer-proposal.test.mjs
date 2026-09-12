import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {digest} from './developer-policy.mjs';
test('proposal continues a retained draft and adds new modules against original preimages',async()=>{
 const root=await mkdtemp(join(tmpdir(),'world-proposal-'));
 try{
  await mkdir(join(root,'sim'));await mkdir(join(root,'src/app'),{recursive:true});await mkdir(join(root,'.local/api-development'),{recursive:true});
  for(const f of ['developer.mjs','developer-policy.mjs','developer-api.mjs'])await copyFile(new URL(f,import.meta.url),join(root,'sim',f));
  await writeFile(join(root,'src/app/example.js'),'original');
  await writeFile(join(root,'DEVELOPMENT_PLAN.json'),JSON.stringify({stages:[{id:'test',track:'simulation'}]}));
  await writeFile(join(root,'.local/api-development/progress.json'),JSON.stringify({stage:0,history:[{reason:'continue useful foundation'}],draft:{summary:'foundation',files:[{path:'src/app/example.js',before:digest('original'),content:'retained'}]}}));
  for(const f of ['before.png','before-village.png','before-gatehouse.png'])await writeFile(join(root,'.local/api-development',f),'mock image');
  await writeFile(join(root,'fake-api.mjs'),`globalThis.fetch=async(url,init)=>{const text=JSON.parse(init.body).messages[0].content[0].text;if(!text.includes('continue useful foundation'))throw Error('Missing durable feedback');const value=text.includes('Respond {"paths"')?{paths:['src/app/example.js']}:{summary:'extend draft',files:[{path:'src/app/example.js',edits:[{find:'retained',replace:'continued'}]},{path:'sim/systems/bakery.mjs',content:'export const bakery = true;'}]};return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(value)}}]})};};`);
  execFileSync(process.execPath,['--import','./fake-api.mjs','sim/developer.mjs','propose'],{cwd:root,env:{...process.env,FREE_API_CONFIRMED:'true',CRITIC_KEY:'mock-only'},stdio:'pipe'});
  const c=JSON.parse(await readFile(join(root,'.local/api-development/candidate.json')));
  assert.equal(c.files[0].before,digest('original'));assert.equal(c.files[0].content,'continued');
  assert.equal(c.files[1].before,'new');assert.equal(c.stage,'test');
 }finally{await rm(root,{recursive:true,force:true});}
});
