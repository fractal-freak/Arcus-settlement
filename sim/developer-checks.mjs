/** Fixed commands and failure evidence; generated code cannot select commands. */
import {spawnSync} from 'node:child_process';
import {readdirSync,writeFileSync,mkdirSync} from 'node:fs';
const out='.local/api-development';mkdirSync(out,{recursive:true});
const tests=readdirSync('sim').filter(p=>p.endsWith('.test.mjs')).map(p=>'sim/'+p);
for(const [command,args] of [[process.execPath,['--test',...tests]],[process.execPath,['sim/verify.mjs']],['npm',['run','build']]]){
 const r=spawnSync(command,args,{encoding:'utf8',maxBuffer:4*1024*1024,timeout:180000});
 const output=(r.stdout||'')+(r.stderr||'');process.stdout.write(output);
 if(r.status!==0){writeFileSync(out+'/validation.json',JSON.stringify({passed:false,command:args.join(' '),reason:(String(r.error||'')+output).slice(-12000)}));process.exit(1);}
}
writeFileSync(out+'/validation.json',JSON.stringify({passed:true,reason:'All fixed logic tests, rulebook and build checks passed.'}));
