import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {digest,validateCandidate,applyCandidate,applyTextEdits} from './developer-policy.mjs';
const candidate=(path='src/app/example.js')=>({summary:'A visible improvement',files:[{path,before:digest('old'),content:'new'}]});
test('API development cannot modify workflow, tests, memory, credentials or escape source',()=>{
 for(const p of ['.github/workflows/a.yml','sim/shoot.mjs','state/settlement.json','.env','src/../sim/shoot.mjs','src/app/x.js/../../a.js'])assert.throws(()=>validateCandidate(candidate(p)));
 assert.throws(()=>validateCandidate({...candidate(),files:[...candidate().files,...candidate().files]}));
});
test('preimages are checked atomically and symlinks refused',async()=>{
 const root=await mkdtemp(join(tmpdir(),'world-developer-'));
 try{
  await mkdir(join(root,'src/app'),{recursive:true});await writeFile(join(root,'src/app/example.js'),'old');
  const c=candidate();c.files.push({path:'src/app/other.js',before:digest('missing'),content:'x'});
  await assert.rejects(applyCandidate(c,root));assert.equal(await readFile(join(root,'src/app/example.js'),'utf8'),'old');
  await applyCandidate(candidate(),root);assert.equal(await readFile(join(root,'src/app/example.js'),'utf8'),'new');
  await symlink(join(root,'src/app/example.js'),join(root,'src/app/link.js'));
  await assert.rejects(applyCandidate({summary:'x',files:[{path:'src/app/link.js',before:digest('new'),content:'bad'}]},root));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('compact edits refuse ambiguous and missing targets and preserve surrounding source',()=>{
 assert.equal(applyTextEdits('before\nold\nafter',[{find:'old',replace:'new'}]),'before\nnew\nafter');
 assert.throws(()=>applyTextEdits('old old',[{find:'old',replace:'new'}]));
 assert.throws(()=>applyTextEdits('old',[{find:'missing',replace:'new'}]));
});
