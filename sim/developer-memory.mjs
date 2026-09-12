/** Trusted durable development memory. The progress branch stores JSON, never executable runner code. */
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {validateCandidate,digest} from './developer-policy.mjs';
const ref='refs/heads/codex/world-progress';
const git=(args,input)=>execFileSync('git',args,{encoding:'utf8',input,stdio:['pipe','pipe','pipe']}).trim();
export const emptyProgress=()=>({version:1,stage:0,history:[],draft:null});
export async function reconcileDraft(draft,root='.') {
 if(!draft)return null;
 validateCandidate(draft);
 let pending=[];
 for(const f of draft.files){
  let current;try{current=await readFile(root+'/'+f.path,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
  if(current===f.content)continue;
  if((current===undefined?'new':digest(current))!==f.before)return null;
  pending.push(f);
 }
 return pending.length?{...draft,files:pending}:null;
}
export async function loadProgress(){
 const exists=git(['ls-remote','--heads','origin',ref]);
 if(!exists)return emptyProgress();
 git(['fetch','--no-tags','origin',ref]);
 const p=JSON.parse(git(['show','FETCH_HEAD:progress.json']));
 if(p.version!==1||!Number.isInteger(p.stage)||p.stage<0||!Array.isArray(p.history))throw Error('Invalid development memory');
 if(p.draft)validateCandidate(p.draft);
 p.history=p.history.slice(-40);
 return p;
}
export function advanceProgress(p,event){
 const {candidate,...record}=event;
 const next={...p,history:[...p.history,record].slice(-40)};
 if(event.published){next.draft=null;next.stage=p.stage+(event.stageComplete===true?1:0);}
 else if(event.validated&&event.retain&&event.candidate?.files.length)next.draft=validateCandidate(event.candidate);
 // Failed experiments never erase the last validated draft.
 return next;
}
export function saveProgress(p){
 const remote=git(['ls-remote','--heads','origin',ref]);
 let parent;
 if(remote){git(['fetch','--no-tags','origin',ref]);parent=git(['rev-parse','FETCH_HEAD']);}
 git(['config','user.name','the settlement']);git(['config','user.email','settlement@users.noreply.github.com']);
 const blob=git(['hash-object','-w','--stdin'],JSON.stringify(p,null,2));
 const tree=git(['mktree'],`100644 blob ${blob}\tprogress.json\n`);
 const commit=git(['commit-tree',tree,...(parent?['-p',parent]:[]),'-m','Remember world development progress']);
 git(['push','origin',`${commit}:${ref}`]);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const out='.local/api-development';await mkdir(out,{recursive:true});
 if(process.argv[2]==='load'){
  const p=await loadProgress();const previous=p.draft;p.draft=await reconcileDraft(p.draft);
  if(previous&&!p.draft)p.history.push({outcome:'draft-reconciled',reason:'Draft already published or its source changed; reassess current source.'});
  await writeFile(out+'/progress.json',JSON.stringify(p));
 }else if(process.argv[2]==='save'){
  const p=await loadProgress();
  const read=async name=>{try{return JSON.parse(await readFile(out+'/'+name+'.json','utf8'));}catch{return null;}};
  const candidate=await read('candidate'),review=await read('review'),publication=await read('publication'),validation=await read('validation'),attemptError=await read('attempt-error');
  const event={at:new Date().toISOString(),run:process.env.GITHUB_RUN_ID,stage:p.stage,
   outcome:process.env.DEVELOPMENT_RESULT||'unknown',validated:process.env.VALIDATION_RESULT==='success',
   retain:review?.retain===true,published:publication?.published===true,stageComplete:publication?.stageComplete===true,
   summary:String(candidate?.summary||'No candidate produced').slice(0,1000),
   reason:String(review?.reason||publication?.reason||attemptError?.reason||(validation?.passed===false?validation.reason:null)||'Attempt failed before review; inspect this run before repeating.').slice(0,2000),
   next:String(review?.next||'Continue the current milestone; address the last failure.').slice(0,1000)};
  saveProgress(advanceProgress(p,{...event,candidate:candidate?validateCandidate(candidate):undefined}));
  console.log('Development memory saved:',event.reason);
 }else throw Error('Unknown memory mode');
}
