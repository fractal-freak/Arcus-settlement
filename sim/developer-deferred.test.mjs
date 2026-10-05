import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

for (const status of [503, 429, 401]) test(`review handles provider ${status} without approving or publishing`, async () => {
  const root=await mkdtemp(join(tmpdir(),'world-deferred-'));
  try {
    const out=join(root,'.local/api-development');
    await mkdir(out,{recursive:true});
    await writeFile(join(root,'DEVELOPMENT_PLAN.json'),JSON.stringify({stages:[{id:'test'}]}));
    await writeFile(join(out,'progress.json'),JSON.stringify({stage:0,history:[]}));
    await writeFile(join(out,'candidate.json'),JSON.stringify({summary:'test',files:[{path:'src/test.js',before:'new',content:'export const x=1;'}]}));
    for(const name of ['before','before-village','before-gatehouse','after','after-village','after-gatehouse'])await writeFile(join(out,name+'.png'),'test');
    const mock=join(root,'mock.mjs');
    await writeFile(mock,`globalThis.fetch=async()=>({ok:false,status:${status}}); globalThis.setTimeout=(fn)=>{queueMicrotask(fn); return 0;};`);
    const output=join(root,'output'),summary=join(root,'summary');
    const result=spawnSync(process.execPath,['--import',mock,fileURLToPath(new URL('./developer.mjs',import.meta.url)),'review'],{
      cwd:root,encoding:'utf8',env:{...process.env,CRITIC_KEY:'mock',FREE_API_CONFIRMED:'true',GITHUB_OUTPUT:output,GITHUB_STEP_SUMMARY:summary},timeout:10000,
    });
    assert.equal(result.status,status===401?1:0,result.stderr);
    await assert.rejects(readFile(join(out,'review.json')), {code:'ENOENT'});
    const error=JSON.parse(await readFile(join(out,'attempt-error.json')));
    assert.match(error.reason,new RegExp(String(status)));
    if(status===401)await assert.rejects(readFile(output),{code:'ENOENT'});
    else assert.equal(await readFile(output,'utf8'),'deferred=true\n');
  } finally {await rm(root,{recursive:true,force:true});}
});
