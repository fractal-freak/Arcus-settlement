/** A private source yields one aggregate count. Subscriber records never enter the world. */
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const snapshotPath=()=>process.env.SUBSCRIBER_STATE || resolve(ROOT,'state/subscribers.json');
let attempted=0, pending=null;
export function validateCount(value) {
  if(!value || !Number.isSafeInteger(value.count) || value.count<0)throw new Error('Subscriber feed must contain a non-negative integer count');
  return value.count;
}
export function subscriberSnapshot() {
  try {
    const value=JSON.parse(readFileSync(snapshotPath(),'utf8'));validateCount(value);
    if(!Number.isFinite(value.checkedAt))return null;
    return {source:'subscribers',count:value.count,checkedAt:value.checkedAt};
  }catch{return null;}
}
function sourceURL() {
  if(process.env.SUBSCRIBER_COUNT_URL)return process.env.SUBSCRIBER_COUNT_URL;
  try{return JSON.parse(readFileSync(resolve(ROOT,'.local/subscribers.json'),'utf8')).url || null;}catch{return null;}
}
export function refreshSubscribers({force=false}={}) {
  if(pending)return pending;
  if(!force && Date.now()-attempted<60_000)return Promise.resolve(subscriberSnapshot());
  const url=sourceURL();if(!url)return Promise.resolve(subscriberSnapshot());
  attempted=Date.now();
  pending=(async()=>{
    try {
      const parsed=new URL(url);if(parsed.protocol!=='https:')throw new Error('Subscriber source must use HTTPS');
      const response=await fetch(parsed,{signal:AbortSignal.timeout(12_000),headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error(`Subscriber source returned ${response.status}`);
      const count=validateCount(await response.json());
      const output={count,checkedAt:Date.now()};
      const path=snapshotPath();mkdirSync(dirname(path),{recursive:true});
      writeFileSync(`${path}.tmp`,JSON.stringify(output));renameSync(`${path}.tmp`,path);
      return subscriberSnapshot();
    }catch {
      // An outage is not an unsubscribe event. Keep the last confirmed roll.
      console.warn('Subscriber count unavailable; keeping the last confirmed population.');
      return subscriberSnapshot();
    }finally{pending=null;}
  })();
  return pending;
}

/** Existing citizens retain identity and history; reductions mark departures. */
export function reconcileResidents(state,count,makeCitizen,onEvent) {
  validateCount({count});
  let changed=false;
  const active=state.citizens.filter(c=>c.residency!=='departed');
  while(active.length>count) {
    const c=active.pop();c.residency='departed';c.departedAt=state.tick;changed=true;
    onEvent('departure',`${c.name} left the kingdom.`,c.seed);
  }
  let nextSeed=state.citizens.reduce((n,c)=>Math.max(n,c.seed),0)+1;
  while(active.length<count) {
    const c=makeCitizen(nextSeed++);
    c.residency='resident';c.kingdom='first-kingdom';c.birthSource='subscriber';
    state.citizens.push(c);active.push(c);changed=true;
    onEvent('birth',`${c.name} was born in the kingdom.`,c.seed);
  }
  return changed;
}
