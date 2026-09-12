import test from 'node:test';import assert from 'node:assert/strict';
import {requestCompletion} from './developer-api.mjs';
test('temporary 503 recovers within one run on the same provider',async()=>{
 let calls=0;const delays=[];
 const answer=await requestCompletion({model:'gemini-3.6-flash'},{key:'mock',sleep:async ms=>delays.push(ms),fetchImpl:async url=>{assert.match(url,/generativelanguage.googleapis.com/);return ++calls<3?{status:503,ok:false}:{ok:true,json:async()=>({ok:true})};}});
 assert.equal(answer.ok,true);assert.equal(calls,3);assert.deepEqual(delays,[5000,15000]);
});
test('authentication errors stop immediately and repeated failures are bounded',async()=>{
 let n=0;await assert.rejects(requestCompletion({}, {key:'mock',sleep:async()=>{},fetchImpl:async()=>{n++;return {ok:false,status:401};}}),/not a transient/);assert.equal(n,1);
 n=0;await assert.rejects(requestCompletion({}, {key:'mock',sleep:async()=>{},fetchImpl:async()=>{n++;return {ok:false,status:503};}}),/3 attempts exhausted/);assert.equal(n,3);
});
